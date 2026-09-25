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
const { sampleState, createTimeline, isBusy, STATES, ACTIVITY_PATH } = internals

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

assert.equal(isBusy(fakeContext()), false)
assert.equal(isBusy(fakeContext({ running: true })), true, 'a running agent is work')
assert.equal(isBusy(fakeContext({ queued: true })), true, 'queued work is work')
assert.equal(isBusy(fakeContext({ jobs: [{ status: 'running' }] })), true, 'a running job is work')
assert.equal(isBusy(fakeContext({ jobs: [{ status: 'stopping' }] })), true, 'a stopping job is work')
assert.equal(isBusy(fakeContext({ jobs: [{ status: 'completed' }] })), false)
assert.equal(isBusy({ get: () => undefined }), false, 'a profile without agents or jobs is never busy')

const DEFAULTS = {
  size: 160,
  idleOpacity: 0.45,
  frameMs: 600,
  alertMs: 1500,
  happyMs: 3000,
  boredEverySeconds: 60,
  boredMs: 5000,
  sleepAfterSeconds: 600,
  topmost: true,
  clickAction: 'toggle',
}

const start = 1_000_000

// One task reads as startle, work, joy, idle — then boredom now and then, and
// sleep once nothing has happened for the configured stretch.
let timeline = createTimeline(start)
const quiet = (now) => sampleState(false, start, timeline, DEFAULTS, now)

assert.equal(quiet(start), 'idle', 'a fresh pet idles')
const alertStart = start + 100
assert.equal(sampleState(true, start, timeline, DEFAULTS, alertStart), 'alert', 'a task starts with the startle frames')
assert.equal(sampleState(true, start, timeline, DEFAULTS, alertStart + DEFAULTS.alertMs - 1), 'alert')
assert.equal(sampleState(true, start, timeline, DEFAULTS, alertStart + DEFAULTS.alertMs), 'working')
const busyEnd = start + 10_000
assert.equal(sampleState(false, start, timeline, DEFAULTS, busyEnd), 'happy', 'work ends happy')
assert.equal(quiet(busyEnd + DEFAULTS.happyMs - 1), 'happy')
assert.equal(quiet(busyEnd + DEFAULTS.happyMs), 'idle')

// Boredom follows the idle agent rather than the mouse: moving the pointer while
// nothing runs must not postpone it.
const boredAt = busyEnd + DEFAULTS.boredEverySeconds * 1000
assert.equal(quiet(boredAt - 1), 'idle')
const wiggle = busyEnd + 30_000
assert.equal(sampleState(false, wiggle, timeline, DEFAULTS, wiggle), 'idle')
assert.equal(sampleState(false, wiggle, timeline, DEFAULTS, boredAt), 'bored', 'activity while idle must not postpone boredom')
assert.equal(sampleState(false, wiggle, timeline, DEFAULTS, boredAt + DEFAULTS.boredMs), 'idle')

// Sleep follows activity instead, on the timer the caller puts in force.
const asleep = wiggle + DEFAULTS.sleepAfterSeconds * 1000
assert.equal(sampleState(false, wiggle, timeline, DEFAULTS, asleep), 'sleep')
assert.equal(sampleState(false, asleep, timeline, DEFAULTS, asleep + 500), 'idle', 'activity wakes the pet')
assert.equal(sampleState(false, asleep + 500, timeline, DEFAULTS, asleep + 500 + DEFAULTS.boredEverySeconds * 1000 - 1),
  'idle', 'waking restarts the boredom clock rather than showing boredom at once')
// Tucked away the host passes the much shorter timer, and the same rule applies.
const tucked = { ...DEFAULTS, sleepAfterSeconds: 20 }
assert.equal(sampleState(false, asleep + 500, timeline, tucked, asleep + 500 + 19_000), 'idle')
assert.equal(sampleState(false, asleep + 500, timeline, tucked, asleep + 500 + 20_000), 'sleep')

// Movement of the pet itself is activity too, and a task starting startles again.
const moved = asleep + 500 + 20_000
assert.equal(sampleState(false, moved, timeline, DEFAULTS, moved + 200), 'idle')
assert.equal(sampleState(true, moved, timeline, DEFAULTS, moved + 1000), 'alert')

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
clientPlugin.apply({
  effect: (factory) => { factory() },
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

// Controls start from the accepted Host section, not from the defaults.
const stored = flatten(render({ size: 240, translucent: false, clickAction: 'minimize' }))
const storedSlider = stored.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 96)
assert.equal(storedSlider.props.value, 240, 'the card must show the stored size')
assert.equal(stored.find(node => node.type === 'select').props.value, 'minimize', 'the card must show the stored click action')

// A switch writes at once; a drag merges into one write. Both reach the form
// with the revision it was read at.
face.write({ translucent: false }, true)
assert.deepEqual(form.writes[0], { ops: [{ op: 'set', path: ['translucent'], value: false }], revision: 7 })
face.write({ size: 200 }, false)
face.write({ size: 208 }, false)
await new Promise((resolve) => setTimeout(resolve, 400))
assert.equal(form.writes.length, 2, 'a slider drag must merge into one write')
assert.deepEqual(form.writes[1].ops, [{ op: 'set', path: ['size'], value: 208 }])

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
    alertMs: ref(1000),
    happyMs: ref(500),
    boredEverySeconds: ref(30),
    boredMs: ref(1000),
    // Short enough that the sleep-and-wake cycle fits in a test, long enough
    // that the write-rate window below stays inside one steady state.
    sleepAfterSeconds: ref(6),
    sleepWhenHiddenSeconds: ref(2),
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
    // The custom card owns the fields, so the schema-derived automatic page must
    // be switched off or the row would show both.
    assert.deepEqual(autoFormOff, [false], 'apply() did not disable the automatic settings page')
    // The page reports input here; without it the pet could only see agents and
    // jobs, and it would sleep while the person is using DSH.
    assert.deepEqual(routes.map((route) => `${route.kind} ${route.path}`), [`exact ${ACTIVITY_PATH}`])

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

    // The pet reports whether DSH is on screen; tucked away, the much shorter
    // timer applies, and showing DSH again counts as activity and wakes it.
    // (The test's pet has no window to control, so it writes no report itself.)
    const windowPath = join(home, 'little-icon', 'window.json')
    writeFileSync(windowPath, '{"dshVisible":false}\n', 'utf8')
    const untilTucked = Date.now() + 6000
    while (readState() !== 'sleep' && Date.now() < untilTucked) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(readState(), 'sleep', 'a tucked DSH should put the pet to sleep on the short timer')
    writeFileSync(windowPath, '{"dshVisible":true}\n', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    assert.equal(readState(), 'idle', 'showing DSH again should wake the pet')

    // A task starting must play the startle frames before working, and ending it
    // must play happy before settling back to idle.
    agents.running = true
    const untilAlert = Date.now() + 3000
    while (readState() !== 'alert' && Date.now() < untilAlert) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'alert', 'a task start should play the startle frames')
    await new Promise((resolve) => setTimeout(resolve, 1500))
    assert.equal(readState(), 'working', 'the pet should keep working after the startle')
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

    // Disposal kills the process so DSH never leaves an orphan pet behind.
    for (const disposer of disposers.splice(0)) disposer()
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
