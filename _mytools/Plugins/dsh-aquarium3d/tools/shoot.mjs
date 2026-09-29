/**
 * Headless screenshot driver for the aquarium plugin (development tool).
 *
 * Starts its own headless Chrome, opens a URL, optionally runs a sequence of
 * in-page steps, then writes a PNG and prints every console error and page
 * exception seen on the way. This is the feedback loop for scene work: the
 * plugin's client half runs in the real DSH shell, so what it captures is what
 * the user sees.
 *
 * Usage:
 *   node tools/shoot.mjs --url <url> --out <png> [--wait 9000] [--width 1600]
 *        [--height 1000] [--step "<expression>" ...] [--step-wait 1200]
 *
 * Chrome runs on the real GPU unless --software is passed.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Chrome executables to try, in order. */
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]

/**
 * Parse `--flag value` pairs plus repeatable `--step` values.
 * @param argv - process arguments after the script name.
 * @returns parsed options.
 */
function parseArgs(argv) {
  const options = { wait: 9000, width: 1600, height: 1000, stepWait: 1400, steps: [], software: false, port: 9411 }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--software') { options.software = true; continue }
    const value = argv[++i]
    if (value === undefined) throw new Error(`missing value for ${flag}`)
    if (flag === '--url') options.url = value
    else if (flag === '--out') options.out = value
    else if (flag === '--wait') options.wait = Number(value)
    else if (flag === '--width') options.width = Number(value)
    else if (flag === '--height') options.height = Number(value)
    else if (flag === '--step-wait') options.stepWait = Number(value)
    else if (flag === '--port') options.port = Number(value)
    else if (flag === '--step') options.steps.push(value)
    else throw new Error(`unknown flag ${flag}`)
  }
  if (options.url === undefined) throw new Error('--url is required')
  if (options.out === undefined) throw new Error('--out is required')
  return options
}

/** Pick the first installed Chrome-family executable. */
function findChrome() {
  for (const candidate of CHROME_CANDIDATES) if (existsSync(candidate)) return candidate
  throw new Error('no Chrome executable found')
}

/**
 * Wait until the DevTools endpoint answers.
 * @param port - the remote debugging port.
 * @returns the list of debuggable targets.
 */
async function waitForTargets(port) {
  const deadline = Date.now() + 30000
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      if (targets.some(target => target.type === 'page')) return targets
    } catch {
      // Not listening yet; keep polling until the deadline.
    }
    if (Date.now() > deadline) throw new Error('Chrome did not expose a page target in 30s')
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

/** Open a websocket to one target and expose `send` plus collected diagnostics. */
async function attach(websocketUrl) {
  const ws = new WebSocket(websocketUrl)
  let nextId = 0
  const pending = new Map()
  const consoleErrors = []
  const exceptions = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.consoleAPICalled' && (message.params.type === 'error' || message.params.type === 'warning')) {
      const text = message.params.args.map(arg => arg.value ?? arg.description ?? arg.type).join(' ')
      consoleErrors.push(`[${message.params.type}] ${text}`)
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      exceptions.push(details.exception?.description ?? details.text)
    }
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
    }
  })
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { ws, send, consoleErrors, exceptions }
}

const options = parseArgs(process.argv.slice(2))
const chrome = findChrome()
const userDataDir = mkdtempSync(join(tmpdir(), 'aq-shoot-'))
const flags = [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  `--user-data-dir=${userDataDir}`,
  `--window-size=${options.width},${options.height}`,
  '--hide-scrollbars',
  `--remote-debugging-port=${options.port}`,
  'about:blank',
]
if (options.software) flags.push('--enable-unsafe-swiftshader', '--use-angle=swiftshader')
const child = spawn(chrome, flags, { stdio: 'ignore', windowsHide: true })

try {
  const targets = await waitForTargets(options.port)
  const target = targets.find(entry => entry.type === 'page')
  const { ws, send, consoleErrors, exceptions } = await attach(target.webSocketDebuggerUrl)
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: options.url })
  await new Promise(resolve => setTimeout(resolve, options.wait))
  for (const step of options.steps) {
    const result = await send('Runtime.evaluate', { expression: step, awaitPromise: true, returnByValue: true })
    console.log(`step ok: ${step} -> ${JSON.stringify(result.result?.value ?? null)}`)
    await new Promise(resolve => setTimeout(resolve, options.stepWait))
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(options.out, Buffer.from(shot.data, 'base64'))
  console.log(`screenshot: ${options.out}`)
  const renderer = await send('Runtime.evaluate', {
    expression: `(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2');
      const d = g && g.getExtension('WEBGL_debug_renderer_info');
      return g ? String(g.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : g.RENDERER)) : 'no webgl2'; })()`,
    returnByValue: true,
  })
  console.log(`renderer: ${renderer.result.value}`)
  const brief = (text) => (text.length > 420 ? `${text.slice(0, 420)}…` : text)
  if (consoleErrors.length > 0) console.log(`console (${consoleErrors.length}):\n  ${consoleErrors.slice(0, 8).map(brief).join('\n  ')}`)
  if (exceptions.length > 0) console.log(`exceptions (${exceptions.length}):\n  ${exceptions.slice(0, 5).map(brief).join('\n  ')}`)
  ws.close()
} finally {
  child.kill()
}
