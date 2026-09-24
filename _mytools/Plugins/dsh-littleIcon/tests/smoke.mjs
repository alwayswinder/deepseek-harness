/** Keyless smoke test for the little-icon host routes and browser registration. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => { storage.set(key, String(value)) },
}
const elements = new Map()
globalThis.document = {
  head: { appendChild(element) { elements.set(element.id, element) } },
  createElement: () => ({ id: '', textContent: '', remove() {}, addEventListener() {} }),
  getElementById: (id) => elements.get(id) ?? null,
}
globalThis.window = {
  innerWidth: 900, innerHeight: 600,
  addEventListener() {}, removeEventListener() {},
  __ModuleLoader__: { load(record) { globalThis.loadedRecord = record } },
}

const require = createRequire(import.meta.url)
require(fileURLToPath(new URL('../client.js', import.meta.url)))
assert.equal(loadedRecord.id, '@local/dsh-little-icon')
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: (value) => ({ current: value }), useEffect() {},
}
const client = loadedRecord.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected browser module: ${name}`)
})
assert.equal(client.name, 'little-icon-client')
assert.deepEqual(client.inject, ['slots', 'locale'])
assert.equal(client.__internals.hasRunningSession({ byId: { one: { running: true } } }), true)
assert.equal(client.__internals.hasRunningSession({ byId: { one: { running: false } } }), false)
assert.deepEqual(client.__internals.clampPosition({ x: -1, y: 9999 }), { x: 8, y: 448 })

const locale = {}
const overlays = []
let sessionUpdate = null
const fakeCtx = {
  effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  locale: {
    register(namespace, dictionaries) { locale[namespace] = dictionaries; return () => {} },
    bind: (namespace) => (key) => locale[namespace].en[key],
  },
  slots: {
    inject(_name, setup) { return setup() },
    register(options, component) { overlays.push({ options, component }); return () => {} },
  },
  inject(deps, setup) {
    assert.deepEqual(deps, ['sessions'])
    const list = {
      getSnapshot: () => ({ byId: { one: { running: false } } }),
      subscribe(callback) { sessionUpdate = callback; return () => {} },
    }
    setup({ sessions: { list } })
  },
}
client.apply(fakeCtx)
assert.equal(locale.littleIcon.zh.working, '干活中')
assert.equal(overlays.length, 1)
assert.equal(overlays[0].options.name, 'shell.overlay')
assert.equal(overlays[0].options.id, 'little-icon')
sessionUpdate()

let now = 0
const controller = client.__internals.createPetController(() => now)
const seen = []
controller.subscribe((state) => seen.push(state))
controller.setBusy(true)
controller.setBusy(false)
assert.deepEqual(seen.slice(0, 2), ['working', 'happy'])
now = 61_000
controller.tick()
assert.equal(controller.getSnapshot(), 'sleeping')
controller.dispose()

const host = await import(new URL('../index.js', import.meta.url).href)
assert.equal(host.name, 'little-icon')
const registrations = []
let injected = null
host.apply({ inject(deps, fn) { injected = { deps, fn } } })
assert.deepEqual(injected.deps, ['webServer'])
injected.fn({
  effect(fn) { fn(); return () => {} },
  webServer: { register(route) { registrations.push(route); return () => {} } },
})
assert.equal(registrations.length, Object.keys(host.PET_ASSETS).length)
const route = registrations.find((candidate) => candidate.path.endsWith('/working.png'))
let response = null
await route.handler({}, {
  writeHead(status, headers) { response = { status, headers } },
  end(body) { response.body = body },
})
assert.equal(response.status, 200)
assert.equal(response.headers['Content-Type'], 'image/png')
const image = fileURLToPath(new URL('../IconImage/干活中.png', import.meta.url))
assert.equal(response.body.length, (await stat(image)).size)
console.log('little-icon smoke: all assertions passed')
