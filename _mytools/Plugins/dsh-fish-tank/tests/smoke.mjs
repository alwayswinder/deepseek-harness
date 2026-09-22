/**
 * Keyless smoke test for the fish-tank plugin: loads client.js through a
 * stub module loader, checks the plugin shape and its `shell.overlay`
 * registration, then drives the canvas engine headlessly with fake
 * canvas/rAF/localStorage and asserts movement, feeding, bubbles, fleeing,
 * and persistence. The host half is imported directly and its background
 * route is exercised against a fake response.
 *
 * Run: node tests/smoke.mjs  (from the plugin directory)
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// ---- browser stubs ----------------------------------------------------------

// A callable that returns itself for any call and any property access, so
// every 2D-context method (and gradient objects) works without a canvas.
const anyFn = new Proxy(function anyFn() {}, {
  get: () => anyFn,
  apply: () => anyFn,
})

function fakeCanvas() {
  return { width: 300, height: 150, style: {}, getContext: () => anyFn }
}

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => { storage.set(key, String(value)) },
  removeItem: (key) => { storage.delete(key) },
}

globalThis.document = {
  createElement: () => fakeCanvas(),
  getElementById: () => null,
  head: { appendChild() {} },
}

let rafCallback = null
globalThis.requestAnimationFrame = (cb) => { rafCallback = cb; return 1 }
globalThis.cancelAnimationFrame = () => { rafCallback = null }
const flushFrame = (ts) => {
  const cb = rafCallback
  rafCallback = null
  if (cb !== null) cb(ts)
}

let loadedRecord = null
globalThis.window = {
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
  __ModuleLoader__: { load: (record) => { loadedRecord = record } },
}

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol.for('react.fragment'),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: (init) => ({ current: init }),
}

// ---- client bundle ----------------------------------------------------------

const require = createRequire(import.meta.url)
require(fileURLToPath(new URL('../client.js', import.meta.url)))

assert.ok(loadedRecord !== null, 'client.js must register through __ModuleLoader__')
assert.equal(loadedRecord.id, '@local/dsh-fish-tank')

const plugin = loadedRecord.factory((name) => {
  if (name === 'react') return reactStub
  throw new Error('unexpected require: ' + name)
})

assert.equal(plugin.name, 'fish-tank-client')
assert.deepEqual(plugin.inject, ['slots', 'locale'])
assert.equal(typeof plugin.apply, 'function')

// ---- plugin apply: locale dictionary + shell.overlay registration ----------

const localeDicts = {}
let overlayRegistration = null
const fakeCtx = {
  effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  locale: {
    register: (ns, dicts) => { localeDicts[ns] = dicts; return () => {} },
    bind: (ns) => (key) => ns + '.' + key,
  },
  slots: {
    inject: (name, setup) => { setup(); return () => {} },
    register: (options, component) => { overlayRegistration = { options, component }; return () => {} },
  },
}
plugin.apply(fakeCtx)

assert.ok(localeDicts.fishTank !== undefined, 'locale dictionary registered')
assert.equal(localeDicts.fishTank.zh.feed, '投喂')
assert.equal(localeDicts.fishTank.en.feed, 'Feed')
assert.ok(overlayRegistration !== null, 'shell.overlay contribution registered')
assert.equal(overlayRegistration.options.name, 'shell.overlay')
assert.equal(overlayRegistration.options.id, 'fish-tank')
assert.equal(overlayRegistration.options.locale, 'fishTank')
assert.equal(typeof overlayRegistration.component, 'function')

// ---- engine: movement -------------------------------------------------------

const { createEngine } = plugin.__internals
const statuses = []
const engine = createEngine({ canvas: fakeCanvas(), onStatus: (s) => statuses.push(s) })
engine.resize(800, 600, 1)
engine.start()

assert.equal(engine.stats().fish, 5, 'default population is five fish')
const before = engine.snapshot()
assert.equal(before.length, 5)
for (const f of before) assert.equal(f.state, 'wander')

for (let i = 1; i <= 60; i += 1) flushFrame(i * 16.7)
const after = engine.snapshot()
assert.ok(
  after.some((f, idx) => Math.abs(f.x - before[idx].x) > 2 || Math.abs(f.y - before[idx].y) > 2),
  'fish wander within one second',
)

// ---- engine: feeding (pellets spawned on each fish are certain prey) --------

const fedBefore = engine.stats().fed
for (const f of after) engine.feed(f.x, f.y)
assert.equal(engine.stats().pellets, 30, 'five feeds scatter 30 pellets')

let maxParticles = 0
for (let i = 61; i <= 420; i += 1) {
  flushFrame(i * 16.7)
  maxParticles = Math.max(maxParticles, engine.stats().particles)
}
assert.ok(engine.stats().fed > fedBefore, 'fish track and eat nearby pellets')
assert.ok(maxParticles > 0, 'eating spawns crumb particles')

// ---- engine: bubbles --------------------------------------------------------

engine.blow(400, 500)
assert.ok(engine.stats().bubbles >= 16, 'blowing spawns a bubble burst')
for (let i = 421; i <= 1200; i += 1) {
  flushFrame(i * 16.7)
  maxParticles = Math.max(maxParticles, engine.stats().particles)
}
assert.ok(engine.stats().bubbles < 30, 'blown bubbles pop at the surface')
assert.ok(maxParticles > 0, 'pops spawn ring particles')

// ---- engine: startle --------------------------------------------------------

const snap = engine.snapshot()
engine.poke(snap[0].x, snap[0].y)
assert.ok(engine.snapshot().some((f) => f.state === 'flee'), 'a poke on a fish startles it')

// ---- engine: persistence ----------------------------------------------------

const fedNow = engine.stats().fed
engine.dispose()
const raw = storage.get('dsh.fish-tank.v1')
assert.ok(raw !== undefined, 'dispose persists the tank')
const saved = JSON.parse(raw)
assert.equal(saved.v, 1)
assert.equal(saved.fish.length, 5)
assert.equal(saved.fed, fedNow)

const engine2 = createEngine({ canvas: fakeCanvas() })
engine2.resize(800, 600, 1)
engine2.start()
flushFrame(16)
assert.equal(engine2.stats().fish, 5, 'tank restores its fish')
assert.equal(engine2.stats().fed, fedNow, 'tank restores the fed counter')
engine2.dispose()

assert.ok(statuses.some((s) => s.fish === 5), 'status snapshots reach the callback')

// ---- host half: background route --------------------------------------------

const host = await import(new URL('../index.js', import.meta.url).href)
assert.equal(host.name, 'fish-tank')
assert.equal(host.ROUTE_PATH, '/api/fish-tank/background')

let injected = null
const fakeHostCtx = {
  inject: (deps, fn) => { injected = { deps, fn } },
}
host.apply(fakeHostCtx)
assert.ok(injected !== null, 'host half injects the webServer carrier')
assert.deepEqual(injected.deps, ['webServer'])

const registrations = []
injected.fn({
  effect(fn) { fn(); return () => {} },
  webServer: { register: (route) => { registrations.push(route); return () => {} } },
})
assert.equal(registrations.length, 1)
const route = registrations[0]
assert.equal(route.kind, 'exact')
assert.equal(route.path, host.ROUTE_PATH)

let written = null
const res = {
  headersSent: false,
  writeHead(status, headers) { written = { status, headers } },
  end(body) { written.body = body },
}
await route.handler({}, res)
assert.equal(written.status, 200)
assert.equal(written.headers['Content-Type'], 'image/jpeg')
const imageSize = (await stat(fileURLToPath(new URL('../bg.jpg', import.meta.url)))).size
assert.equal(written.body.length, imageSize, 'route serves the packaged bg.jpg bytes')

console.log('fish-tank smoke: all assertions passed')
