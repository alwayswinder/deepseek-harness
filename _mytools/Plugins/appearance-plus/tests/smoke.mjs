/**
 * Keyless smoke test for the appearance bundle's browser half: loads client.js
 * through a stub module loader, then drives the idle clock, the lock-image probe,
 * and the configuration form with fake DOM, clock, and image stubs. The lock
 * screen shares two page colour variables with the Desktop window caption, so
 * the assertions pin the rule that made primary text disappear: the caption may
 * only be cleared while a loaded lock image is the layer on screen.
 *
 * Run: node tests/smoke.mjs  (from the plugin directory)
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// ---- fake clock -------------------------------------------------------------

let now = 0
let nextTimerId = 1
const timers = new Map()

globalThis.setTimeout = (fn, ms = 0) => {
  const id = nextTimerId++
  timers.set(id, { at: now + ms, fn, every: null })
  return id
}
globalThis.setInterval = (fn, ms) => {
  const id = nextTimerId++
  timers.set(id, { at: now + ms, fn, every: ms })
  return id
}
globalThis.clearTimeout = (id) => { timers.delete(id) }
globalThis.clearInterval = (id) => { timers.delete(id) }
Date.now = () => now

/** Run every timer due within the next `ms`, earliest first. */
function advance(ms) {
  const target = now + ms
  for (;;) {
    let due = null
    let dueId = null
    for (const [id, timer] of timers) {
      if (timer.at > target) continue
      if (due === null || timer.at < due.at) { due = timer; dueId = id }
    }
    if (due === null) break
    now = due.at
    if (due.every === null) timers.delete(dueId)
    else due.at = now + due.every
    due.fn()
  }
  now = target
}

// ---- browser stubs ----------------------------------------------------------

const bodyAttributes = new Set()
const bodyStyle = new Map()

function fakeElement(tag) {
  return {
    tagName: tag,
    dataset: {},
    textContent: '',
    disabled: false,
    remove() {},
    append() {},
    addEventListener() {},
  }
}

globalThis.document = {
  body: {
    setAttribute: (name) => { bodyAttributes.add(name) },
    removeAttribute: (name) => { bodyAttributes.delete(name) },
    style: {
      setProperty: (name, value) => { bodyStyle.set(name, value) },
      removeProperty: (name) => { bodyStyle.delete(name) },
    },
  },
  head: {
    append: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  createElement: (tag) => fakeElement(tag),
  getElementById: () => null,
}

// Every surface token resolves, so the layer derives its sheet on the first read
// instead of retrying while the stub theme stays dark.
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#123456' })

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => { storage.set(key, String(value)) },
  removeItem: (key) => { storage.delete(key) },
}

/** The probed lock images, in the order the layer requested them. */
const probes = []
globalThis.Image = class FakeImage {
  constructor() {
    this.src = ''
    this.onload = null
    this.onerror = null
    probes.push(this)
  }
}

const listeners = new Map()
globalThis.window = {
  addEventListener: (type, fn) => {
    const set = listeners.get(type) ?? new Set()
    set.add(fn)
    listeners.set(type, set)
  },
  removeEventListener: (type, fn) => { listeners.get(type)?.delete(fn) },
  __ModuleLoader__: { load: (record) => { loadedRecord = record } },
}
globalThis.location = { protocol: 'dsh-app:' }

/** Dispatch a window event the way the idle clock's listeners see one. */
function dispatch(type) {
  for (const fn of listeners.get(type) ?? []) fn({ stopPropagation() {}, preventDefault() {} })
}

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol.for('react.fragment'),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: (init) => ({ current: init }),
}

const storeStub = {
  createSnapshotStore: (initial) => {
    let value = initial
    return { getSnapshot: () => value, set: (next) => { value = next }, subscribe: () => () => {} }
  },
}

// ---- client bundle ----------------------------------------------------------

let loadedRecord = null
const require = createRequire(import.meta.url)
require(fileURLToPath(new URL('../client.js', import.meta.url)))

assert.ok(loadedRecord !== null, 'client.js must register through __ModuleLoader__')
assert.equal(loadedRecord.id, '@local/dsh-appearance-plus')

const plugin = loadedRecord.factory((name) => {
  if (name === 'react') return reactStub
  if (name === '@deepseek-ai/dsh-client-store') return storeStub
  throw new Error('unexpected require: ' + name)
})

assert.equal(plugin.name, 'appearance-plus-client')
assert.deepEqual(plugin.inject, ['slots', 'configForms', 'theme', 'locale'])
assert.equal(typeof plugin.apply, 'function')

// ---- settings form ----------------------------------------------------------

let snapshot = {
  status: 'ready',
  writable: true,
  revision: 1,
  value: {
    preset: 'warm-paper', backgroundUrl: '', backgroundOpacity: 0.72, backgroundBlur: 0,
    backgroundFit: 'cover', surfaceOpacity: 0.62,
    lockUrl: '', lockEnabled: true, lockSeconds: 3, lockFit: 'cover',
  },
}
const formSubscribers = new Set()
const form = {
  getSnapshot: () => snapshot,
  subscribe: (fn) => { formSubscribers.add(fn); return () => formSubscribers.delete(fn) },
  mutate: async (ops) => {
    const value = { ...snapshot.value }
    for (const op of ops) value[op.path[0]] = op.value
    snapshot = { ...snapshot, value, revision: snapshot.revision + 1 }
    for (const fn of formSubscribers) fn()
  },
}

/** Save one field the way the configuration page does. */
async function setField(field, value) {
  await form.mutate([{ op: 'set', path: [field], value }])
}

const fakeCtx = {
  effect(fn) {
    const dispose = fn()
    return () => { if (typeof dispose === 'function') dispose() }
  },
  on: () => () => {},
  inject: () => () => {},
  configForms: { get: () => form },
  theme: { overrideTokens: () => () => {}, getTheme: () => ({ preference: 'light' }), setTheme: () => {} },
  locale: { register: () => () => {}, bind: (ns) => (key) => ns + '.' + key },
  slots: { inject: (name, setup) => { setup(); return () => {} }, register: () => () => {} },
}

plugin.apply(fakeCtx)

const COVER_ATTR = 'data-dsh-appearance-cover'
const CAPTION_ATTR = 'data-dsh-appearance-caption'
const CAPTION_STATE_VAR = '--dsh-appearance-caption'

// ---- no lock image: the idle clock has nothing to cover the window with -----

advance(20_000)
assert.equal(bodyAttributes.has(COVER_ATTR), false, 'without a lock image no lock layer is raised')
assert.equal(bodyAttributes.has(CAPTION_ATTR), false, 'without a lock layer the caption keeps its colours')
assert.equal(bodyStyle.has(CAPTION_STATE_VAR), false, 'the caption signal is never written')

// ---- a pending lock image still leaves the interface readable ---------------

await setField('lockUrl', 'https://example.invalid/lock.png')
assert.equal(probes.length, 1, 'the lock image is probed before the layer counts as on screen')
assert.equal(probes[0].src, 'https://example.invalid/lock.png')

advance(5_000)
assert.equal(bodyAttributes.has(COVER_ATTR), false, 'an unloaded image does not cover the window')
assert.equal(bodyAttributes.has(CAPTION_ATTR), false, 'an unloaded image leaves the caption alone')

// ---- the image arrives: the layer covers, then the caption follows ----------

probes[0].onload()
assert.equal(bodyAttributes.has(COVER_ATTR), true, 'the loaded image raises the lock layer')
assert.equal(bodyAttributes.has(CAPTION_ATTR), false, 'the caption waits for the fade-in to finish')

advance(2_600)
assert.equal(bodyAttributes.has(CAPTION_ATTR), true, 'the caption is cleared once the lock layer has faded in')
assert.equal(bodyStyle.get(CAPTION_STATE_VAR), '1', 'the shell is told to re-read the caption colours')

// ---- activity returns the interface ----------------------------------------

dispatch('pointerdown')
assert.equal(bodyAttributes.has(CAPTION_ATTR), false, 'activity restores the caption colours')
assert.equal(bodyAttributes.has(COVER_ATTR), false, 'activity drops the lock layer')

// ---- a lock image that never loads never blanks the interface ---------------

await setField('lockUrl', 'https://example.invalid/broken.png')
assert.equal(probes.length, 2, 'the new address is probed')
advance(20_000)
assert.equal(bodyAttributes.has(COVER_ATTR), false, 'a pending image does not cover the window')

probes[1].onerror()
advance(20_000)
assert.equal(bodyAttributes.has(COVER_ATTR), false, 'a failed image never covers the window')
assert.equal(bodyAttributes.has(CAPTION_ATTR), false, 'a failed image never clears the caption')

// ---- disabling the lock drops the layer and restores the caption ------------

await setField('lockUrl', 'https://example.invalid/lock.png')
probes[2].onload()
advance(10_000)
assert.equal(bodyAttributes.has(CAPTION_ATTR), true, 'an idle window with a lock image clears the caption')

await setField('lockEnabled', false)
assert.equal(bodyAttributes.has(COVER_ATTR), false, 'disabling the lock drops the layer')
assert.equal(bodyAttributes.has(CAPTION_ATTR), false, 'disabling the lock restores the caption colours')

// ---- the settings page never locks the interface ---------------------------

await setField('lockEnabled', true)
advance(10_000)
assert.equal(bodyAttributes.has(CAPTION_ATTR), true, 'the lock returns once the page is closed again')

console.log('appearance-plus smoke: all assertions passed')
