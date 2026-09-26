/**
 * Keyless smoke test for the little-icon plugin: drives the host half's state
 * machine with fake `agents`/`jobs` services, checks that every state has its
 * animation frames, and (on Windows) runs `pet/pet.ps1 -SelfTest` so a broken
 * pet script fails here instead of at the next DSH start.
 *
 * Run: node tests/smoke.mjs           static checks and the pet script self test
 *      node tests/smoke.mjs --pet     also apply() the host half against a
 *                                     temporary DSH_HOME: it spawns a real pet
 *                                     window for a few seconds and asserts the
 *                                     disposer ends that process
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { internals, apply } = await import('../index.js')
const { sampleState, createTimeline, sampleWork, shouldTuck, STATES, ACTIVITY_PATH, COMMANDS_PATH } = internals

const root = fileURLToPath(new URL('..', import.meta.url))

// ---- busy predicate ---------------------------------------------------------

/** @param {object} options - which services exist and what they report. */
function fakeContext({ running = false, queued = false, jobs = [] } = {}) {
  const services = {
    agents: {
      list: () => [{
        id: 'agent-1',
        status: running ? 'running' : 'idle',
        inbox: { nextTurn: queued ? [{}] : [], nextStep: [] },
      }],
    },
    jobs: { list: () => jobs },
  }
  return { get: (name) => services[name] }
}

const noWaiting = new Set()
assert.deepEqual(sampleWork(fakeContext(), noWaiting), { busy: false, waiting: false })
assert.equal(sampleWork(fakeContext({ running: true }), noWaiting).busy, true, 'a running agent is work')
assert.equal(sampleWork(fakeContext({ queued: true }), noWaiting).busy, true, 'queued work is work')
assert.equal(sampleWork(fakeContext({ jobs: [{ status: 'running' }] }), noWaiting).busy, true, 'a running job is work')
assert.equal(sampleWork(fakeContext({ jobs: [{ status: 'stopping' }] }), noWaiting).busy, true, 'a stopping job is work')
assert.equal(sampleWork(fakeContext({ jobs: [{ status: 'completed' }] }), noWaiting).busy, false)
assert.equal(sampleWork({ get: () => undefined }, noWaiting).busy, false, 'a profile without agents or jobs is never busy')
// An agent waiting for the user is not working: the loop is blocked on the person,
// so a question on screen — or input queued behind it — must not read as work.
const askedWork = sampleWork(fakeContext({ running: true }), new Set(['agent-1']))
assert.equal(askedWork.busy, false, 'an agent waiting for the user is not work')
assert.equal(askedWork.waiting, true, 'and it is reported as waiting, which the pet shows as surprise')
assert.equal(sampleWork(fakeContext({ queued: true }), new Set(['agent-1'])).busy, false,
  'input queued while an agent waits for the user is not work either')
assert.equal(sampleWork(fakeContext({ running: true }), new Set(['another-agent'])).busy, true,
  'a different agent keeps working while one waits')
assert.equal(sampleWork(fakeContext({ running: true }), new Set(['another-agent'])).waiting, false,
  'a question for one agent is not reported for another')
assert.equal(sampleWork(fakeContext({ running: true, jobs: [{ status: 'running' }] }), new Set(['agent-1'])).busy, true,
  'a background job still counts while an agent waits')

const DEFAULTS = {
  size: 160,
  idleOpacity: 0.45,
  frameMs: 600,
  happyMs: 3000,
  boredEverySeconds: 60,
  boredMs: 5000,
  sleepAfterSeconds: 600,
  topmost: true,
  clickAction: 'toggle',
  autoHide: true,
  autoHideSeconds: 0,
}

const start = 1_000_000

/** Work in flight, nobody waiting on the person. */
const working = { busy: true, waiting: false }
/** The model blocked on an answer: the pet asks for the decision instead. */
const waiting = { busy: false, waiting: true }
/** Nothing under way. */
const quietWork = { busy: false, waiting: false }

// One run reads as work, surprise while it waits for the person, joy when it ends,
// then idle — then boredom now and then, and sleep once nothing has happened for
// the configured stretch.
let timeline = createTimeline(start)
const quiet = (now) => sampleState(quietWork, start, timeline, DEFAULTS, now)

assert.equal(quiet(start), 'idle', 'a fresh pet idles')
assert.equal(sampleState(working, start, timeline, DEFAULTS, start + 100), 'working',
  'a task starts working directly, with no startle first')
// A question parks the run on the person, and the surprise lasts as long as the
// question is unanswered — the whole point of the expression.
const asked = start + 5000
assert.equal(sampleState(waiting, start, timeline, DEFAULTS, asked), 'alert', 'waiting for the answer startles')
assert.equal(sampleState(waiting, start, timeline, DEFAULTS, asked + DEFAULTS.happyMs), 'alert',
  'the startle does not time out while the question stands')
assert.equal(sampleState(working, start, timeline, DEFAULTS, asked + 6000), 'working',
  'the answer puts the pet straight back to work')
const busyEnd = start + 40_000
assert.equal(sampleState(quietWork, start, timeline, DEFAULTS, busyEnd), 'happy', 'work ends happy')
assert.equal(quiet(busyEnd + DEFAULTS.happyMs - 1), 'happy')
assert.equal(quiet(busyEnd + DEFAULTS.happyMs), 'idle')

// Boredom follows the idle agent rather than the mouse: moving the pointer while
// nothing runs must not postpone it.
const boredAt = busyEnd + DEFAULTS.boredEverySeconds * 1000
assert.equal(quiet(boredAt - 1), 'idle')
const wiggle = busyEnd + 30_000
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, wiggle), 'idle')
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, boredAt), 'bored', 'activity while idle must not postpone boredom')
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, boredAt + DEFAULTS.boredMs), 'idle')

// Sleep follows activity instead, on the timer the caller puts in force.
const asleep = wiggle + DEFAULTS.sleepAfterSeconds * 1000
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, asleep), 'sleep')
assert.equal(sampleState(quietWork, asleep, timeline, DEFAULTS, asleep + 500), 'idle', 'activity wakes the pet')
assert.equal(sampleState(quietWork, asleep + 500, timeline, DEFAULTS, asleep + 500 + DEFAULTS.boredEverySeconds * 1000 - 1),
  'idle', 'waking restarts the boredom clock rather than showing boredom at once')
// Tucked away the host passes the much shorter timer, and the same rule applies.
const tucked = { ...DEFAULTS, sleepAfterSeconds: 20 }
assert.equal(sampleState(quietWork, asleep + 500, timeline, tucked, asleep + 500 + 19_000), 'idle')
assert.equal(sampleState(quietWork, asleep + 500, timeline, tucked, asleep + 500 + 20_000), 'sleep')

// Movement of the pet itself is activity too, and a run starting again works at once.
const moved = asleep + 500 + 20_000
assert.equal(sampleState(quietWork, moved, timeline, DEFAULTS, moved + 200), 'idle')
assert.equal(sampleState(working, moved, timeline, DEFAULTS, moved + 1000), 'working')

// Tucking DSH away follows what is in front rather than the activity clock: DSH
// itself in front is never tucked away, and another application in front is what
// asks for the tuck after the configured stretch — zero by default, so it lands on
// the next sample. Only the pet can hide a window, so the decision stays a fact.
const behindAt = moved + 200
const behind = { visible: true, foreground: false, behindSince: behindAt }
const inFront = { visible: true, foreground: true, behindSince: undefined }
assert.equal(shouldTuck(inFront, DEFAULTS, behindAt + 3_600_000), false,
  'DSH in front is never tucked away, however long nothing is touched')
assert.equal(shouldTuck(behind, DEFAULTS, behindAt), true, 'with no delay it goes on the sample it went behind')
assert.equal(shouldTuck({ visible: false, foreground: false, behindSince: behindAt }, DEFAULTS, behindAt + 1000), false,
  'a hidden DSH has nothing to tuck')
assert.equal(shouldTuck({ visible: true, foreground: false, behindSince: undefined }, DEFAULTS, behindAt + 1000), false,
  'a window that never went behind has no tuck clock')
assert.equal(shouldTuck(behind, { ...DEFAULTS, autoHide: false }, behindAt + 60_000), false,
  'the switch turns the tuck off')
assert.equal(shouldTuck(behind, { ...DEFAULTS, autoHideSeconds: 30 }, behindAt + 29_999), false)
assert.equal(shouldTuck(behind, { ...DEFAULTS, autoHideSeconds: 30 }, behindAt + 30_000), true,
  'a configured stretch counts from going behind, not from the last input')

// Every state the host can publish has frames on disk, and the generator's
// frames.json agrees with the files: the art decides the count per state (the
// working sheet holds six figures, the others four), and the pet probes it.
const frameCounts = JSON.parse(readFileSync(join(root, 'assets', 'frames.json'), 'utf8'))
assert.deepEqual(Object.keys(frameCounts).sort(), [...STATES].sort())
for (const state of STATES) {
  const count = frameCounts[state]
  assert.ok(Number.isInteger(count) && count >= 2, `frames.json has no frame count for ${state}`)
  for (let frame = 1; frame <= count; frame += 1) {
    const file = join(root, 'assets', state, `${frame}.png`)
    assert.ok(existsSync(file), `missing pet frame ${file}`)
  }
  assert.ok(!existsSync(join(root, 'assets', state, `${count + 1}.png`)),
    `${state} has more frames on disk than frames.json records`)
}
assert.ok(existsSync(join(root, 'assets', 'tray.ico')), 'missing pet/assets/tray.ico')
assert.ok(existsSync(join(root, 'pet', 'pet.ps1')), 'missing pet/pet.ps1')

// The pet script stays ASCII: Windows PowerShell 5.1 decodes a .ps1 without a
// BOM as ANSI, and the mojibake that follows can swallow quotes. Localized tray
// text therefore lives in labels.json.
const petSource = readFileSync(join(root, 'pet', 'pet.ps1'), 'utf8')
const firstNonAscii = [...petSource].findIndex((character) => character.codePointAt(0) > 127)
assert.equal(firstNonAscii, -1, `pet/pet.ps1 must stay ASCII; found ${JSON.stringify(petSource.slice(firstNonAscii, firstNonAscii + 20))}`)

const labels = JSON.parse(readFileSync(join(root, 'pet', 'labels.json'), 'utf8'))
assert.equal(labels.ToggleShown, '收起 DSH')
for (const key of ['TrayTip', 'ToggleShown', 'ToggleHidden', 'Reset', 'Quit']) {
  assert.ok(typeof labels[key] === 'string' && labels[key].length > 0, `labels.json is missing ${key}`)
}

// ---- pet script -------------------------------------------------------------

if (process.platform === 'win32') {
  // The self test exits before it touches these; a temp directory keeps a stray
  // failure from dropping state files into the repository.
  const probeDir = mkdtempSync(join(tmpdir(), 'little-icon-selftest-'))
  const selfTest = spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
    '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'pet', 'pet.ps1'),
    '-AssetDir', join(root, 'assets'),
    '-StateFile', join(probeDir, 'state.json'),
    '-PositionFile', join(probeDir, 'position.json'),
    '-SelfTest',
  ], { encoding: 'utf8' })
  rmSync(probeDir, { recursive: true, force: true })
  assert.equal(selfTest.status, 0, `pet.ps1 -SelfTest failed: ${selfTest.stderr}`)
  // The self test counts frames by probing the directories, so its output is the
  // pet's own view; it must agree with what the generator recorded.
  for (const state of STATES) assert.match(selfTest.stdout, new RegExp(`${state}=${frameCounts[state]}`))
  // The self test prints the labels it loaded from labels.json, so this proves
  // Windows PowerShell read that UTF-8 file as UTF-8.
  assert.match(selfTest.stdout, /收起 DSH/)
} else {
  console.log('skipping pet.ps1 -SelfTest: the pet window is Windows-only')
}

// ---- browser half -----------------------------------------------------------

/** Fake `window.__ModuleLoader__` plus the browser surface the activity ping uses. */
let loadedRecord = null
const windowListeners = new Map()
const documentListeners = new Map()
const pings = []
globalThis.window = {
  __ModuleLoader__: { load: (record) => { loadedRecord = record } },
  addEventListener: (name, handler) => { windowListeners.set(name, handler) },
  removeEventListener: (name) => { windowListeners.delete(name) },
}
globalThis.document = {
  visibilityState: 'visible',
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '' }),
  head: { appendChild() {} },
  addEventListener: (name, handler) => { documentListeners.set(name, handler) },
  removeEventListener: (name) => { documentListeners.delete(name) },
}
globalThis.fetch = (url, init) => {
  pings.push({ url, method: init?.method })
  return Promise.resolve({ ok: true })
}
/** Event streams the page opens; the test dispatches the Host's frames itself. */
const eventSources = []
globalThis.EventSource = class {
  constructor(url) {
    this.url = url
    this.closed = false
    eventSources.push(this)
  }

  close() { this.closed = true }
}
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
}
const requireStub = (specifier) => {
  if (specifier === 'react') return reactStub
  if (specifier === '@deepseek-ai/dsh-client-store') {
    return { createSnapshotStore: (initial) => {
      let state = initial
      return { getSnapshot: () => state, set: (next) => { state = next }, subscribe: () => () => {} }
    } }
  }
  throw new Error(`client.js required an unexpected module: ${specifier}`)
}

await import(pathToFileURL(join(root, 'client.js')).href)
assert.ok(loadedRecord !== null, 'client.js did not register a factory with __ModuleLoader__')
const packageName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
assert.equal(loadedRecord.id, packageName, 'the loader id must equal the package name')

const clientPlugin = loadedRecord.factory(requireStub)
assert.equal(typeof clientPlugin.apply, 'function')

/** Stand-in for the settings form the Host serves for this row. */
const formListeners = new Set()
const form = {
  snapshot: { status: 'ready', writable: true, revision: 7, value: {} },
  writes: [],
  getSnapshot() { return this.snapshot },
  subscribe(listener) { formListeners.add(listener); return () => formListeners.delete(listener) },
  mutate(ops, revision) { this.writes.push({ ops, revision }); return Promise.resolve(true) },
  /** Accept a new Host section, exactly as an accepted write does. */
  accept(value) {
    this.snapshot = { ...this.snapshot, value }
    for (const listener of formListeners) listener()
  },
}
const registrations = []
const dictionaries = new Map()
const clientDisposers = []
/** The two optional services the menu commands reach for, plus the calls they make. */
const openedTabs = []
const clientServices = {
  sidebarRight: { openTab: (kind, options) => { openedTabs.push({ kind, options }) } },
  sidebarRightTabs: { get: (kind) => (kind === 'browser' ? { id: 'browser' } : undefined) },
}
clientPlugin.apply({
  effect: (factory) => { clientDisposers.push(factory()) },
  get: (name) => clientServices[name],
  locale: { register: (ns, dict) => { dictionaries.set(ns, dict) } },
  configForms: { get: () => form },
  slots: {
    inject: (_key, callback) => callback(),
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
})
assert.equal(registrations.length, 1, 'the browser half must register exactly one card')
const [registration] = registrations
// The card belongs on the bundle's own page: the Plugins list is where a person
// looks, and the row page behind it is one click too deep.
assert.equal(registration.options.name, 'plugins.bundle.config')
assert.equal(registration.options.key, packageName)

// Input reports itself to the Host so the pet can tell "nobody is there" from
// "no task is running"; it is throttled, so a mouse move is not a request.
assert.deepEqual([...windowListeners.keys()].sort(), ['keydown', 'pointerdown', 'pointermove', 'wheel'])
assert.equal(documentListeners.has('visibilitychange'), true)
assert.deepEqual(pings[0], { url: ACTIVITY_PATH, method: 'POST' }, 'the page reports activity when it loads')
windowListeners.get('pointermove')()
assert.equal(pings.length, 1, 'activity pings must be throttled')

// The pet's menu is drawn by another process, so its commands arrive here on a
// Host-held event stream and this half performs them: "chat" opens the DeepSeek
// chat site in DSH's own Browser tab, never in the system browser.
assert.equal(eventSources.length, 1, 'the page must listen for menu commands')
assert.equal(eventSources[0].url, COMMANDS_PATH)
const [commands] = eventSources
const warned = []
const realWarn = console.warn
console.warn = (...args) => { warned.push(args.join(' ')) }
try {
  commands.onmessage({ data: '{"command":"chat"}' })
  assert.equal(openedTabs.length, 1, 'the chat command must open one tab')
  assert.deepEqual(openedTabs[0], { kind: 'browser', options: { params: { url: 'https://chat.deepseek.com' } } })
  // Unknown or malformed frames are ignored rather than thrown at the user.
  commands.onmessage({ data: '{"command":"nonsense"}' })
  commands.onmessage({ data: 'not json' })
  assert.equal(openedTabs.length, 1, 'only known commands open anything')
  // A Web profile may leave the Browser tab disabled and a build without the right
  // Sidebar provides no service at all: the command must then do nothing instead
  // of failing at the click, and the card must still have been registered.
  clientServices.sidebarRightTabs.get = () => undefined
  commands.onmessage({ data: '{"command":"chat"}' })
  assert.equal(openedTabs.length, 1, 'without a Browser tab type nothing may open')
  clientServices.sidebarRightTabs.get = (kind) => (kind === 'browser' ? { id: 'browser' } : undefined)
  clientServices.sidebarRight = undefined
  commands.onmessage({ data: '{"command":"chat"}' })
  assert.equal(openedTabs.length, 1, 'without the Sidebar service nothing may open')
} finally {
  console.warn = realWarn
  clientServices.sidebarRight = { openTab: (kind, options) => { openedTabs.push({ kind, options }) } }
}
assert.equal(warned.length, 3, `a command that cannot run must say so: ${warned.join(' | ')}`)

const dictionary = dictionaries.get('little-icon')
assert.ok(dictionary?.zh !== undefined && dictionary?.en !== undefined, 'missing locale dictionaries')
assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary.zh).sort(),
  'the English and Chinese dictionaries must cover the same keys')

/** Translate through the Chinese dictionary, failing on a key the page asks for but nobody wrote. */
const t = (key, params) => {
  const text = dictionary.zh[key]
  assert.ok(typeof text === 'string', `the page asked for missing copy: ${key}`)
  return params === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name) => String(params[name]))
}

/**
 * Every element in a rendered stub tree. Controls travel as props (`control`),
 * so props are walked too rather than only children.
 */
const flatten = (node, found = []) => {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, found)
    return found
  }
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (node.type !== undefined) found.push(node)
  for (const value of Object.values(node.props ?? {})) flatten(value, found)
  flatten(node.children, found)
  return found
}

const face = registration.options.inject()
/** The framework binds `use<Name>` hooks from the inject face's hooks compartment. */
const usePetSettings = (selector) => selector(face.hooks.petSettings.getSnapshot())
const render = (value) => {
  form.accept(value)
  return registration.component({ t, view: 'page', usePetSettings, write: face.write })
}

const summary = registration.component({ t, view: 'summary' })
assert.equal(summary.type, 'span')
assert.deepEqual(summary.children, [t('summary')], 'the summary view returns the one-liner')

const elements = flatten(render(undefined))
const sizeSlider = elements.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 96)
assert.ok(sizeSlider !== undefined, 'the size slider is missing')
assert.equal(sizeSlider.props.max, 320)
assert.equal(sizeSlider.props.value, 160, 'the size slider must start from the schema default')
const translucent = elements.find(node => node.type === 'input' && node.props.type === 'checkbox' && node.props.checked === true)
assert.ok(translucent !== undefined, 'the translucency switch is missing')
const opacitySlider = elements.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 0.15)
assert.ok(opacitySlider !== undefined, 'the translucency degree slider is missing')
assert.notEqual(opacitySlider.props.disabled, true, 'the degree slider is enabled while translucency is on')

// With translucency off the degree slider follows.
const offElements = flatten(render({ translucent: false }))
const offSlider = offElements.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 0.15)
assert.equal(offSlider.props.disabled, true, 'the degree slider must be disabled while translucency is off')

// The auto-tuck switch starts on, and its delay is editable only while it is.
const tuckRow = elements.find(node => node.props?.label === t('autoHide'))
assert.ok(tuckRow !== undefined, 'the auto-tuck switch is missing')
assert.equal(tuckRow.props.control.props.checked, true, 'the auto-tuck switch is on by default')
const tuckSecondsRow = elements.find(node => node.props?.label === t('autoHideSeconds'))
assert.ok(tuckSecondsRow !== undefined, 'the auto-tuck delay is missing')
assert.equal(tuckSecondsRow.props.control.props.value, 0, 'DSH is tucked away as soon as it goes behind by default')
const noTuck = flatten(render({ autoHide: false }))
assert.equal(noTuck.find(node => node.props?.label === t('autoHideSeconds')).props.disabled, true,
  'the auto-tuck delay must be disabled while the switch is off')

// Controls start from the accepted Host section, not from the defaults.
const stored = flatten(render({ size: 240, translucent: false, clickAction: 'minimize', autoHideSeconds: 90 }))
const storedSlider = stored.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 96)
assert.equal(storedSlider.props.value, 240, 'the card must show the stored size')
assert.equal(stored.find(node => node.type === 'select').props.value, 'minimize', 'the card must show the stored click action')
assert.equal(stored.find(node => node.props?.label === t('autoHideSeconds')).props.control.props.value, 90,
  'the card must show the stored auto-tuck delay')

// A switch writes at once; a drag merges into one write. Both reach the form
// with the revision it was read at.
face.write({ translucent: false }, true)
assert.deepEqual(form.writes[0], { ops: [{ op: 'set', path: ['translucent'], value: false }], revision: 7 })
face.write({ size: 200 }, false)
face.write({ size: 208 }, false)
await new Promise((resolve) => setTimeout(resolve, 400))
assert.equal(form.writes.length, 2, 'a slider drag must merge into one write')
assert.deepEqual(form.writes[1].ops, [{ op: 'set', path: ['size'], value: 208 }])

// Registrations are effects: disposing the plugin's contributions closes the
// stream it opened, so a reloaded page never leaves a listener on the Host.
for (const dispose of clientDisposers) { if (typeof dispose === 'function') dispose() }
assert.equal(commands.closed, true, 'disposal must close the command stream')

console.log('little-icon smoke: browser half ok')

// ---- host half, end to end (opt-in: it shows a real pet window) -------------

if (process.argv.includes('--pet')) {
  assert.equal(process.platform, 'win32', '--pet runs the Windows pet window')
  // Say it out loud: this run puts a real pet on the desktop for about half a
  // minute, in its own temporary home so it can coexist with a running pet.
  console.log('little-icon smoke --pet: showing a real pet window in the TOP-LEFT corner for about 25s')

  const home = mkdtempSync(join(tmpdir(), 'little-icon-smoke-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  // Park it in the top-left corner rather than the default bottom-right, where
  // the pet a person is actually using lives: a stray window is then obviously
  // this test's, not a second pet somebody's plugin started.
  mkdirSync(join(home, 'little-icon'), { recursive: true })
  writeFileSync(join(home, 'little-icon', 'position.json'), '{"x":0,"y":0}\n', 'utf8')
  // A menu command the pet wrote before this host started: the relay must treat
  // it as history rather than open a tab the user asked for in a past run.
  writeFileSync(join(home, 'little-icon', 'command.json'), '{"command":"chat","at":1}\n', 'utf8')
  const disposers = []
  const handlers = new Map()
  const logged = []
  const autoFormOff = []
  const routes = []
  /** What the fake `agents` service reports; the test flips it to start a task. */
  const agents = { running: false }
  const context = {
    get: (name) => (name === 'agents'
      ? { list: () => [{ id: 'agent-1', status: agents.running ? 'running' : 'idle', inbox: { nextTurn: [], nextStep: [] } }] }
      : undefined),
    logger: { info: (...args) => logged.push(args.join(' ')), warn: (...args) => logged.push(args.join(' ')) },
    on: (event, handler) => { handlers.set(event, handler); return () => handlers.delete(event) },
    effect: (factory) => { disposers.push(factory()) },
    // Cordis runs the callback once its services exist; the eager call here keeps
    // the injections in apply() exercised without a loader.
    inject: (_services, callback) => callback({
      effect: (factory) => { disposers.push(factory()) },
      // The real configure returns the disposer that drops the presentation.
      settings: { configure: (presentation) => { autoFormOff.push(presentation.auto); return () => {} } },
      webServer: { register: (route) => { routes.push(route); return () => {} } },
    }),
  }
  /** A config reference the test can also flip, as the loader does. */
  const ref = (value) => {
    const box = { value }
    return { get: () => box.value, set: (next) => { box.value = next } }
  }
  const config = {
    enabled: ref(true),
    size: ref(180),
    translucent: ref(true),
    idleOpacity: ref(0.5),
    frameMs: ref(500),
    pollMs: ref(300),
    happyMs: ref(500),
    boredEverySeconds: ref(30),
    boredMs: ref(1000),
    // Short enough that the sleep-and-wake cycle fits in a test, long enough
    // that the write-rate window below stays inside one steady state.
    sleepAfterSeconds: ref(6),
    sleepWhenHiddenSeconds: ref(2),
    // The plugin default: DSH is tucked away the moment another application is in
    // front, which is also what makes the assertion below deterministic.
    autoHide: ref(true),
    autoHideSeconds: ref(0),
    topmost: ref(true),
    clickAction: ref('toggle'),
  }

  const countPetProcesses = () => {
    const marker = join(home, 'little-icon', 'state.json')
    // The probe itself is a powershell.exe whose command line carries the marker,
    // so it must exclude its own process id.
    const query = `@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*${marker}*' }).Count`
    const probe = spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-Command', query], { encoding: 'utf8' })
    assert.equal(probe.status, 0, `pet process probe failed: ${probe.stderr}`)
    return Number(probe.stdout.trim())
  }

  /**
   * Measure the pet window in physical pixels from a DPI-aware process. Mixing
   * WPF's DIP geometry with WinForms' physical geometry puts the window off the
   * screen at any display scaling other than 100%, so the check is worth a probe.
   * @returns {{bounds: string, virtual: string, onScreen: boolean}} measurement.
   */
  const measurePetWindow = () => {
    const marker = join(home, 'little-icon', 'state.json')
    const script = join(home, 'measure.ps1')
    writeFileSync(script, `
param([string]$Marker)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace PetMeasure -Name Win32 -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(System.IntPtr ctx);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, System.IntPtr extra);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public delegate bool EnumProc(System.IntPtr h, System.IntPtr extra);
"@
[void][PetMeasure.Win32]::SetProcessDpiAwarenessContext([IntPtr](-4))
$pids = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like "*$Marker*" } | ForEach-Object { [int]$_.ProcessId })
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$found = @()
foreach ($target in $pids) {
  $script:t = $target
  $cb = [PetMeasure.Win32+EnumProc]{
    param([IntPtr]$h, [IntPtr]$x)
    $owner = 0
    [void][PetMeasure.Win32]::GetWindowThreadProcessId($h, [ref]$owner)
    if ($owner -eq $script:t -and [PetMeasure.Win32]::IsWindowVisible($h)) {
      $r = New-Object PetMeasure.Win32+RECT
      [void][PetMeasure.Win32]::GetWindowRect($h, [ref]$r)
      if (($r.Right - $r.Left) -gt 8 -and ($r.Bottom - $r.Top) -gt 8) {
        $onScreen = ($r.Left -ge $vs.Left) -and ($r.Top -ge $vs.Top) -and ($r.Right -le $vs.Right) -and ($r.Bottom -le $vs.Bottom)
        $script:found += "$onScreen $($r.Left),$($r.Top) $($r.Right - $r.Left)x$($r.Bottom - $r.Top)"
      }
    }
    return $true
  }
  [void][PetMeasure.Win32]::EnumWindows($cb, [IntPtr]::Zero)
}
"virtual=$($vs.Width)x$($vs.Height)"
$found
`, 'utf8')
    const probe = spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, marker], { encoding: 'utf8' })
    assert.equal(probe.status, 0, `window measurement failed: ${probe.stderr}`)
    const lines = probe.stdout.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    return { virtual: lines[0] ?? 'virtual=?', windows: lines.slice(1) }
  }

  try {
    apply(context, config)
    const statePath = join(home, 'little-icon', 'state.json')
    assert.ok(existsSync(statePath), 'apply() did not publish a state file')
    const first = JSON.parse(readFileSync(statePath, 'utf8'))
    assert.equal(first.state, 'idle')
    assert.equal(first.size, 180)
    assert.equal(first.clickAction, 'toggle')
    assert.equal(first.tuck, false, 'a freshly started host must not ask for a tuck')
    // The custom card owns the fields, so the schema-derived automatic page must
    // be switched off or the row would show both.
    assert.deepEqual(autoFormOff, [false], 'apply() did not disable the automatic settings page')
    // The page reports input here; without it the pet could only see agents and
    // jobs, and it would sleep while the person is using DSH. The second route is
    // the stream the pet's menu commands come back on.
    assert.deepEqual(routes.map((route) => `${route.kind} ${route.path}`),
      [`exact ${ACTIVITY_PATH}`, `exact ${COMMANDS_PATH}`])

    // The pet's right-click menu is drawn in another process, so the host relays
    // what it chooses: the page holds one stream open and receives a frame per
    // command. A command from before this host started is history, not a request.
    const commandsRoute = routes.find((route) => route.path === COMMANDS_PATH)
    const stream = {
      status: 0,
      headers: {},
      frames: [],
      writableEnded: false,
      destroyed: false,
      writeHead(code, headers) { this.status = code; this.headers = headers ?? {} },
      write(chunk) { this.frames.push(chunk) },
      end() { this.writableEnded = true },
      on() {},
    }
    commandsRoute.handler({ method: 'GET', on: () => {} }, stream)
    assert.equal(stream.status, 200, 'the command stream must open')
    assert.equal(stream.headers['content-type'], 'text/event-stream')
    assert.equal(stream.frames.length, 1, 'the stream opens with its comment frame')
    await new Promise((resolve) => setTimeout(resolve, 700))
    assert.equal(stream.frames.length, 1, 'a command from before this host started must not be replayed')
    writeFileSync(join(home, 'little-icon', 'command.json'),
      `${JSON.stringify({ command: 'chat', at: Date.now() })}\n`, 'utf8')
    const untilDelivered = Date.now() + 5000
    while (stream.frames.length < 2 && Date.now() < untilDelivered) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(stream.frames.length, 2, 'a menu command must reach the open stream')
    assert.match(stream.frames[1], /^data: \{"command":"chat"\}\n\n$/)

    // An unchanged state must not rewrite the file on every poll (300ms here):
    // only the 4s heartbeat refreshes it, so 2.5s of sampling sees at most one
    // write, where a per-poll writer would produce about eight. Measured before
    // the pet's own sleep lands, so the window holds one steady state.
    let previous = statSync(statePath).mtimeMs
    let writes = 0
    for (let sample = 0; sample < 50; sample += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      const current = statSync(statePath).mtimeMs
      if (current !== previous) {
        previous = current
        writes += 1
      }
    }
    assert.ok(writes <= 1, `the state file was rewritten ${writes} times in 2.5s without a state change`)

    // The pet process is started by apply(); give it a moment to appear.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    assert.equal(countPetProcesses(), 1, `expected exactly one pet process (close a running pet first); log: ${logged.join(' | ')}`)

    // The window must land inside the screen: WPF's Window.Left/Top are DIPs, so
    // mixing them with physical work-area pixels pushes the pet off-screen at any
    // scaling other than 100% and nothing would ever be visible.
    const measured = measurePetWindow()
    assert.equal(measured.windows.length, 1, `expected one visible pet window, got: ${measured.windows.join(' | ')}`)
    const [onScreen, position] = measured.windows[0].split(' ')
    assert.equal(onScreen.toLowerCase(), 'true', `the pet window is off-screen (${measured.windows[0]} on ${measured.virtual})`)
    // The test parks the pet in the top-left corner through its position file —
    // one more reason a stray window is recognisably this test's — and that also
    // proves a stored position is honored at startup.
    const [left, top] = position.split(',').map(Number)
    assert.ok(left < 300 && top < 300, `the pet should start in the top-left corner, found ${position}`)

    // No activity for sleepAfterSeconds (6s here) puts the pet to sleep, and one
    // activity ping brings it straight back to idle.
    const readState = () => JSON.parse(readFileSync(statePath, 'utf8')).state
    const untilAsleep = Date.now() + 12_000
    while (readState() !== 'sleep' && Date.now() < untilAsleep) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    assert.equal(readState(), 'sleep', 'a quiet pet should fall asleep')
    const accepted = { writeHead: (code) => { accepted.code = code }, end: () => {} }
    routes[0].handler({ method: 'POST' }, accepted)
    assert.equal(accepted.code, 204, 'the activity route answers 204')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    assert.equal(readState(), 'idle', 'activity should wake the pet')
    // Anything else on that route is refused.
    const refused = { writeHead: (code) => { refused.code = code }, end: () => {} }
    routes[0].handler({ method: 'GET' }, refused)
    assert.equal(refused.code, 405, 'the activity route only accepts POST')

    // The pet reports whether DSH is on screen and whether it is in front;
    // tucked away, the much shorter sleep timer applies, and showing DSH again
    // counts as activity and wakes it. (The test's pet has no window to control,
    // so it writes no report itself.)
    const windowPath = join(home, 'little-icon', 'window.json')
    writeFileSync(windowPath, '{"dshVisible":false,"dshForeground":false}\n', 'utf8')
    const untilTucked = Date.now() + 6000
    while (readState() !== 'sleep' && Date.now() < untilTucked) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(readState(), 'sleep', 'a tucked DSH should put the pet to sleep on the short timer')
    writeFileSync(windowPath, '{"dshVisible":true,"dshForeground":true}\n', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    assert.equal(readState(), 'idle', 'showing DSH again should wake the pet')

    // A task starts working directly — no startle first, surprise belongs to the
    // question below — and ending it must play happy before settling back to idle.
    agents.running = true
    const untilWorking = Date.now() + 3000
    while (readState() !== 'working' && Date.now() < untilWorking) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'working', 'a task start should go straight to working')
    // The auto-tuck follows what is in front: DSH in front is never tucked away,
    // and going behind an application is what asks for the tuck — with no delay,
    // on the next sample, and without sparing the running task.
    const readTuck = () => JSON.parse(readFileSync(statePath, 'utf8')).tuck
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(readTuck(), false, 'DSH in front must never be tucked away')
    writeFileSync(windowPath, '{"dshVisible":true,"dshForeground":false}\n', 'utf8')
    const untilTuck = Date.now() + 10_000
    while (readTuck() !== true && Date.now() < untilTuck) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(readTuck(), true, 'going behind another application must ask for the tuck')
    assert.equal(readState(), 'working', 'the tuck must not wait for the running task to finish')

    // A question the agent asks the user parks the run on the person, so while the
    // choice is unanswered the pet shows surprise, and the answer puts it back to
    // work. The waterfall the tool calls is what the host observes.
    const asked = handlers.get('user-questions/request')
    assert.equal(typeof asked, 'function', 'the host must observe the question waterfall')
    const answer = Promise.withResolvers()
    void asked({ agent: { id: 'agent-1' }, questions: [] }, () => answer.promise)
    const untilSurprised = Date.now() + 4000
    while (readState() !== 'alert' && Date.now() < untilSurprised) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'alert', 'an unanswered question must surprise the pet')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(readState(), 'alert', 'the surprise must stand as long as the question does')
    answer.resolve({ answers: [] })
    const untilResumed = Date.now() + 4000
    while (readState() !== 'working' && Date.now() < untilResumed) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'working', 'the answer puts the pet back to work')

    agents.running = false
    const untilHappy = Date.now() + 3000
    while (readState() !== 'happy' && Date.now() < untilHappy) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'happy', 'finishing a task should play the happy frames')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(readState(), 'idle', 'the pet should settle back to idle')

    // Disabling the pet ends its process; enabling it again starts a new one,
    // while an unrelated settings write never resurrects a pet the user quit.
    const volatileUpdate = handlers.get('loader/volatile-update')
    config.enabled.set(false)
    volatileUpdate()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    assert.equal(countPetProcesses(), 0, 'disabling the pet left its process running')
    config.size.set(200)
    volatileUpdate()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(countPetProcesses(), 0, 'a settings write restarted a disabled pet')
    config.enabled.set(true)
    volatileUpdate()
    await new Promise((resolve) => setTimeout(resolve, 2500))
    assert.equal(countPetProcesses(), 1, 'enabling the pet did not start it again')
    assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).size, 200)

    // The switch stops the request without touching anything else.
    config.autoHide.set(false)
    volatileUpdate()
    assert.equal(readTuck(), false, 'the auto-tuck switch must stop the request')
    config.autoHide.set(true)
    volatileUpdate()
    const untilBack = Date.now() + 10_000
    while (readTuck() !== true && Date.now() < untilBack) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(readTuck(), true, 'turning the switch back on must resume the request')

    // Disposal kills the process so DSH never leaves an orphan pet behind, and
    // ends the command stream so no page is left listening to a plugin that is gone.
    for (const disposer of disposers.splice(0)) disposer()
    assert.equal(stream.writableEnded, true, 'disposal must end the command stream')
    await new Promise((resolve) => setTimeout(resolve, 2500))
    assert.equal(countPetProcesses(), 0, 'disposal left a pet process running')
    const problems = logged.filter((line) => line.includes('pet:') || line.includes('missing'))
    assert.equal(problems.length, 0, `the pet reported a problem: ${problems.join(' | ')}`)
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
  console.log('little-icon smoke: pet lifecycle ok')
}

console.log('little-icon smoke: ok')
