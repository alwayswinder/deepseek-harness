/**
 * Keyless smoke test for the temp-space browser half.
 *
 * Loads the built bundle exactly as the DSH client does — through
 * `window.__ModuleLoader__.load` — applies it against a fake client context, and
 * renders the panel through a miniature React that keeps state and runs effects.
 * The real renderer hides a crashed entry behind an empty `<div data-slot-error>`,
 * which reaches a person as a blank column with no explanation, so the failure
 * this catches — a panel that registers, paints once, and throws when the data
 * arrives — is invisible in the running application.
 *
 * Run: node tests/client-smoke.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// ---- the browser surface the bundle touches --------------------------------

let loadedRecord = null
/** Window listeners a drag installs, so a drag can be driven from here. */
const windowListeners = new Map()
globalThis.window = {
  __ModuleLoader__: { load: (record) => { loadedRecord = record } },
  addEventListener: (name, handler) => {
    const set = windowListeners.get(name) ?? new Set()
    set.add(handler)
    windowListeners.set(name, set)
  },
  removeEventListener: (name, handler) => { windowListeners.get(name)?.delete(handler) },
  open: () => {},
  // The desktop shell is where these differ from a browser: `window.prompt` is
  // not implemented there and throws on the call, and this panel keeps every
  // dialog out of its controls. Making both throw here is what turns "a click
  // that does nothing" into a failing test.
  confirm: () => { throw new Error('confirm() is not available in this shell') },
  prompt: () => { throw new Error('prompt() is and will not be supported') },
}
globalThis.document = {
  visibilityState: 'visible',
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '' }),
  head: { appendChild() {} },
  addEventListener: () => {},
  removeEventListener: () => {},
}

/** Answers each route the way the host does, so a render meets real fields. */
function hostFetch(answers = {}) {
  return (url) => {
    const address = String(url)
    const body = address.includes('/state') ? (answers.state ?? { ok: true, revision: 1, items: [], files: [], usage: { usedBytes: 0, maxTotalBytes: 104857600, maxFileBytes: 10485760 } })
      : address.includes('/git') ? (answers.git ?? { ok: true, branch: 'main', detached: false, changes: 0, commit: null, relation: 'up-to-date', ahead: 0, behind: 0, upstream: 'origin/main' })
        : (answers.blob ?? { ok: true, name: 'shot.png', bytes: 12 })
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
  }
}
globalThis.fetch = hostFetch()

// ---- a miniature React that keeps state and runs effects -------------------

/**
 * The React the bundle captures at load time. The bundle binds `React` once, so
 * the object it receives must live as long as the module and forward each call to
 * whichever render is in progress.
 */
let activeReact = undefined
const reactFacade = Object.fromEntries(
  ['createElement', 'useState', 'useRef', 'useEffect', 'useMemo', 'useCallback']
    .map(name => [name, (...args) => activeReact[name](...args)]),
)

/** The debounce the panel writes the canvas with, so a test can outwait it. */
const SAVE_DEBOUNCE_MS = 500

/** Listeners a component registers on the canvas element itself. */
const elementListeners = new Map()

/**
 * What a ref receives. React fills a ref with the DOM element; this harness has
 * no DOM, so it fills it with what the panel asks an element for: the box a
 * pointer is measured against, where it is scrolled to, and the one listener it
 * registers on the element rather than through React.
 */
const refElement = {
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 1200, bottom: 800 }),
  scrollLeft: 0,
  scrollTop: 0,
  clientWidth: 1200,
  clientHeight: 700,
  addEventListener: (name, handler) => {
    const set = elementListeners.get(name) ?? new Set()
    set.add(handler)
    elementListeners.set(name, set)
  },
  removeEventListener: (name, handler) => { elementListeners.get(name)?.delete(handler) },
}

/**
 * Build one render harness for a component.
 * @param component - the function component to render.
 * @param props - the props it is rendered with.
 * @returns the rendered tree, the effects that ran, and a way to re-render.
 */
function mount(component, props) {
  const state = []
  const refs = []
  const cleanups = []
  const rendered = []
  const declared = []
  let cursor = 0
  let pending = false

  const react = {
    createElement: (type, own, ...children) => {
      const node = { type, props: own ?? {}, children }
      const ref = node.props.ref
      if (ref !== undefined && typeof ref === 'object') ref.current = refElement
      return node
    },
    useState: (initial) => {
      const slot = cursor++
      if (!(slot in state)) state[slot] = initial
      return [state[slot], (next) => {
        state[slot] = typeof next === 'function' ? next(state[slot]) : next
        pending = true
      }]
    },
    useRef: (initial) => {
      const slot = cursor++
      if (!(slot in refs)) refs[slot] = { current: initial }
      return refs[slot]
    },
    /**
     * Effects are kept per slot and declared for this render. One with no
     * dependencies runs once, as React runs it; one with dependencies runs when
     * they change, which is how the panel applies the scroll a zoom asked for.
     */
    useEffect: (effect, deps) => {
      const slot = cursor++
      const previous = refs[slot]
      const changed = deps === undefined
        || previous?.deps === undefined
        || previous.deps.length !== deps.length
        || deps.some((value, index) => !Object.is(value, previous.deps[index]))
      refs[slot] = { ...previous, ran: previous?.ran === true, deps }
      if (changed) declared.push({ slot, effect })
    },
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
  }

  /**
   * Run the effects one render body declared, in declaration order — the way
   * React does, after the body rather than at the call site. The difference is
   * the whole point: a render body that prepares something an effect reads has
   * to have finished by then.
   */
  const drain = () => {
    for (const { slot, effect } of declared.splice(0)) {
      const previous = refs[slot]
      if (typeof previous?.cleanup === 'function') previous.cleanup()
      const cleanup = effect()
      refs[slot] = { ...previous, ran: true, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
    }
  }

  const draw = () => {
    cursor = 0
    pending = false
    activeReact = react
    const tree = component(props)
    rendered.push(tree)
    drain()
    return tree
  }

  return {
    react,
    /**
     * Render, let the effects' promises land, and render again — the sequence a
     * mounted panel goes through against a host that answers asynchronously.
     */
    async settle(rounds = 8) {
      let tree = draw()
      for (let round = 0; round < rounds; round += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 0) })
        if (!pending) break
        tree = draw()
      }
      return tree
    },
    /** Run every cleanup the mounted effects returned, as an unmount does. */
    unmount() {
      for (const slot of refs) {
        if (typeof slot?.cleanup === 'function') slot.cleanup()
      }
      cleanups.length = 0
    },
    rendered,
  }
}

// ---- load the bundle the way the client does -------------------------------

await import(pathToFileURL(join(root, 'client', 'client.js')).href)
assert.ok(loadedRecord !== null, 'client.js did not register a factory with __ModuleLoader__')
const packageName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
assert.equal(loadedRecord.id, packageName, 'the loader id must equal the package name')

const plugin = loadedRecord.factory((specifier) => {
  if (specifier === 'react') return reactFacade
  throw new Error(`client/client.js required an unexpected module: ${specifier}`)
})
assert.equal(typeof plugin.apply, 'function', 'the browser half exports apply')
assert.deepEqual([...plugin.inject].sort(), ['layout', 'locale', 'slots'],
  'the browser half declares the services it reaches for')

// ---- a client context that records what the plugin registers ---------------

const registrations = []
const dictionaries = new Map()
const provided = new Map()
const selected = []
const panelInfo = { getSnapshot: () => ({ activePanelId: selected.at(-1) ?? null }) }
const ctx = {
  effect: (factory) => { factory() },
  get: () => undefined,
  inject: (names, callback) => { callback(ctx) },
  locale: {
    register: (ns, dictionary) => { dictionaries.set(ns, dictionary) },
    bind: (ns) => (key, params) => {
      const text = dictionaries.get(ns)?.zh?.[key]
      assert.ok(typeof text === 'string', `the panel asked for missing copy: ${key}`)
      return params === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name) => String(params[name]))
    },
  },
  slots: {
    inject: (_key, callback) => { callback() },
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
  layout: { selectPanel: (id) => { selected.push(id) }, panelInfo },
  reflect: { provide: (name, value) => { provided.set(name, value); return () => {} } },
}

plugin.apply(ctx)

// Both dictionaries carry the same keys: a key present in one and missing from
// the other is copy that disappears for half the readers.
const dictionariesOfPlugin = dictionaries.get('temp-space')
assert.deepEqual(Object.keys(dictionariesOfPlugin.zh).sort(), Object.keys(dictionariesOfPlugin.en).sort(),
  'the two dictionaries carry the same keys')

const main = registrations.find(entry => entry.options.name === 'main')
const panellist = registrations.find(entry => entry.options.name === 'sidebar.panellist')
assert.ok(main !== undefined, 'the canvas panel is registered')
assert.ok(panellist !== undefined, 'the sidebar row that selects it is registered')
assert.equal(main.options.key, 'temp-space', 'the panel is keyed by the id the sidebar row selects')
assert.equal(panellist.options.id, 'temp-space', 'the row addresses the same panel')
assert.equal(panellist.options.label(), '临时空间', 'the row is titled from the dictionary')

// The service the desktop pet's menu calls, and the panel id it selects.
const service = provided.get('tempSpace')
assert.ok(service !== undefined, 'the panel service is provided for the pet menu')
service.open()
assert.deepEqual(selected, ['temp-space'], 'opening the service selects this panel')
assert.equal(service.isOpen(), true, 'the service reports the panel it selected')
service.close()
assert.deepEqual(selected, ['temp-space', null], 'closing returns the main column to the conversation')

// ---- the panel itself ------------------------------------------------------

const face = main.options.inject()
assert.deepEqual(Object.keys(face).sort(),
  ['gitAction', 'gitStatus', 'load', 'removeBlob', 'save', 't', 'upload'].sort(),
  'the panel is given the routes and the copy it renders with')

/** Every string in one rendered tree, so copy and structure are asserted together. */
function texts(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(texts)
  return [...texts(node.props?.children), ...texts(node.children)]
}

/** Every element in one rendered tree, so a handler can be found and called. */
function elements(node) {
  if (node === null || node === undefined || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(elements)
  return [node, ...elements(node.props?.children), ...elements(node.children)]
}

/** Render the panel with the answers a route set gives, and return its tree. */
async function paint(answers) {
  globalThis.fetch = hostFetch(answers)
  return mount(main.component, { ...face }).settle()
}

// A fresh space: the header, the quota, and the empty state.
const empty = await paint({})
const emptyText = texts(empty)
for (const label of ['临时空间', '+ 文字', '保存', '拉取', '刷新']) {
  assert.ok(emptyText.includes(label), `a fresh panel draws ${label}`)
}
assert.ok(emptyText.includes('0 B / 100.0 MB'), 'a fresh panel draws the quota it was given')
assert.ok(emptyText.includes('把文件拖到这里就会存进去；也可以点「+ 文字」写一条便签。'),
  'a fresh panel says how to put something in it')
// The opening view is aimed at the cards, so anything pinned to the scroller's
// own corner would be scrolled out of sight: this belongs to the column.
const emptyScroller = elements(empty).find(node => node.props?.style?.cursor === 'default'
  && typeof node.props?.onPointerDown === 'function')
assert.equal(elements(emptyScroller).some(node => texts(node).includes('把文件拖到这里就会存进去；也可以点「+ 文字」写一条便签。')), false,
  'the empty state is outside the scroller rather than pinned inside it')
assert.ok(emptyText.includes('分支 main · 与远端一致 · 没有未提交的改动'), 'a fresh panel draws the Git line')

// A space with a note, a picture, a generic file, and a file that is gone: this
// is the render every branch of an item card takes.
const items = [
  { id: 'note', kind: 'text', text: '记得改端口', x: 10, y: 20, w: 260, h: 168, z: 1 },
  { id: 'shot', kind: 'file', file: 'shot.png', x: 300, y: 20, w: 240, h: 200, z: 2 },
  { id: 'doc', kind: 'file', file: 'notes.md', x: 600, y: 20, w: 240, h: 84, z: 3 },
  { id: 'gone', kind: 'file', file: 'gone.txt', x: 300, y: 260, w: 240, h: 84, z: 4 },
]
const loaded = await paint({
  state: {
    ok: true,
    revision: 4,
    items,
    files: [{ name: 'shot.png', bytes: 2048 }, { name: 'notes.md', bytes: 64 }],
    usage: { usedBytes: 2112, maxTotalBytes: 104857600, maxFileBytes: 10485760 },
  },
  git: { ok: true, branch: 'main', detached: false, changes: 2, commit: null, relation: 'diverged', ahead: 1, behind: 3, upstream: 'origin/main' },
})
const loadedText = texts(loaded)
assert.ok(loadedText.includes('2.1 KB / 100.0 MB'), 'the quota follows what is stored')
assert.ok(loadedText.includes('分支 main · 已分叉：1 领先 / 3 落后 · 2 个未提交改动'),
  'a diverged branch is named with both counts')
assert.ok(loadedText.some(text => text.includes('文件不在了')),
  'an item whose file is gone says so instead of drawing a broken picture')
assert.equal(elements(loaded).filter(node => node.type === 'img').length, 1,
  'exactly the stored picture is drawn as an image')
const noteArea = elements(loaded).find(node => node.type === 'textarea')
assert.equal(elements(loaded).filter(node => node.type === 'textarea').length, 1,
  'exactly the note is editable')
assert.equal(noteArea.props.value, '记得改端口', 'the note carries the text that was stored with it')
// A note holds pasted keys, paths and code, so the browser's spell checker has no
// business drawing under any of it.
assert.equal(noteArea.props.spellCheck, false, 'a note is not spell checked')
const picture = elements(loaded).find(node => node.type === 'img')
assert.equal(picture.props.src, '/api/temp-space/blob?name=shot.png', 'the picture is read from the blob route')

// Every Git relation the host reports has copy of its own; none may render blank.
for (const [relation, expected] of [
  ['up-to-date', '与远端一致'],
  ['ahead', '领先 2'],
  ['behind', '落后 5'],
  ['diverged', '已分叉：2 领先 / 5 落后'],
  ['no-upstream', '没有上游分支'],
]) {
  const tree = await paint({
    git: { ok: true, branch: 'main', detached: false, changes: 0, commit: null, relation, ahead: 2, behind: 5, upstream: '' },
  })
  assert.ok(texts(tree).some(text => text.includes(expected)), `${relation} is named: ${expected}`)
}
const detached = await paint({ git: { ok: true, branch: '', detached: true, changes: 0, commit: null, relation: 'no-upstream', ahead: 0, behind: 0, upstream: '' } })
assert.ok(texts(detached).includes('游离 HEAD'), 'a detached head is named rather than left blank')
const noRepo = await paint({ state: { ok: false, reason: 'no-dir', dir: 'C:\\Users\\me\\.dsh\\temp-space' } })
assert.ok(texts(noRepo).some(text => text.includes('C:\\Users\\me\\.dsh\\temp-space')),
  'a space that is not there names the directory to clone into')

// The ways in: a note, a dropped file, and a delete. A save is debounced, so the
// panel is expected to hold an edit rather than write on the keystroke.
const harness = mount(main.component, { ...face })
let tree = await harness.settle()
const before = globalThis.fetch
const writes = []
globalThis.fetch = (url, init) => {
  const address = String(url)
  writes.push({ url: address, method: init?.method ?? 'GET', body: init?.body })
  const answer = address.includes('/blob') && (init?.method ?? 'GET') === 'POST'
    ? { ok: true, name: 'shot.png', bytes: 2048 }
    : { ok: true, revision: 2, items: [] }
  return Promise.resolve({ ok: true, json: () => Promise.resolve(answer) })
}
const noteButton = elements(tree).find(node => node.type === 'button' && texts(node).includes('+ 文字'))
assert.ok(noteButton !== undefined, 'the note button is a real button')
noteButton.props.onClick()
tree = await harness.settle()
assert.ok(texts(tree).some(text => text.includes('临时空间')), 'a note still renders its panel after being added')
assert.equal(elements(tree).filter(node => node.type === 'textarea').length, 1, 'the new note is editable')
assert.equal(writes.length, 0, 'an edit is debounced rather than written on the keystroke')

const dropZone = elements(tree).find(node => typeof node.props?.onDrop === 'function')
assert.ok(dropZone !== undefined, 'the canvas accepts a drop')
dropZone.props.onDrop({ preventDefault: () => {}, dataTransfer: { files: [{ name: 'shot.png' }] } })
await new Promise((resolve) => { setTimeout(resolve, 0) })
tree = await harness.settle()
assert.ok(writes.some(entry => entry.method === 'POST' && entry.url.includes('name=shot.png')),
  'a dropped file is uploaded under its own name')
globalThis.fetch = before

// ---- the controls, which may not fail quietly -------------------------------

// The same answers as the loaded canvas, so every control acts on real items.
globalThis.fetch = hostFetch({
  state: {
    ok: true,
    revision: 4,
    items,
    files: [{ name: 'shot.png', bytes: 2048 }, { name: 'notes.md', bytes: 64 }],
    usage: { usedBytes: 2112, maxTotalBytes: 104857600, maxFileBytes: 10485760 },
  },
  git: { ok: true, branch: 'main', detached: false, changes: 3, commit: null, relation: 'up-to-date', ahead: 0, behind: 0, upstream: 'origin/main' },
})
const control = mount(main.component, { ...face })
let panel = await control.settle()

// A drag may not capture the pointer: capture delivers the following click to
// the capture target, so every control inside the header — the title and the
// remove button — would never see one. The drag therefore listens on the window
// and only moves the card once the press has travelled.
// The canvas itself takes a press too (that is what pans it), so a card's handle
// is picked out by what it is: the one press target that carries a grab cursor.
const handlesOf = (tree) => elements(tree).filter(node => typeof node.props?.onPointerDown === 'function'
  && node.props?.style?.cursor === 'grab')
assert.equal(handlesOf(panel).length, items.length, 'every card has one drag handle')
assert.equal(elements(panel).filter(node => node.type === 'button' && texts(node).includes('×')).length,
  items.length, 'every card offers a remove control of its own')
assert.equal(windowListeners.size, 0, 'nothing listens on the window until a press starts')

const calls = []
const live = globalThis.fetch
globalThis.fetch = (url, init) => {
  calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body })
  return live(url, init)
}

/**
 * The cards of one rendered tree, in the order they are drawn.
 *
 * Keyed on the stacking order a card carries: the layer the cards sit in is also
 * absolutely positioned and also has a left, so `position` alone would count the
 * layer itself as the first card.
 */
const cardsOf = (tree) => elements(tree).filter(node => node.props?.style?.zIndex !== undefined)

/** The cards of the tree the controls section works on. */
const cards = () => cardsOf(panel)

/**
 * Press one card's header and move the pointer by an amount, as a pointer does.
 * @param tree - the rendered tree to take the card from.
 * @param index - which card to press.
 * @param dx - horizontal travel.
 * @param dy - vertical travel.
 */
function pressCard(tree, index, dx, dy) {
  const handle = elements(cardsOf(tree)[index]).find(node => typeof node.props?.onPointerDown === 'function')
  handle.props.onPointerDown({ button: 0, clientX: 100, clientY: 100 })
  for (const move of [...(windowListeners.get('pointermove') ?? [])]) {
    move({ clientX: 100 + dx, clientY: 100 + dy })
  }
  for (const up of [...(windowListeners.get('pointerup') ?? [])]) up({})
}

const startX = cards()[1].props.style.left
pressCard(panel, 1, 2, 2)
panel = await control.settle()
assert.equal(cards()[1].props.style.left, startX, 'a press that has not travelled is not a drag')
assert.equal(windowListeners.get('pointermove').size, 0, 'a press that was not a drag still releases its listeners')

pressCard(panel, 1, 60, 30)
panel = await control.settle()
assert.equal(cards()[1].props.style.left, startX + 60, 'a travelled press moves the card')
assert.equal(windowListeners.get('pointermove').size, 0, 'a drag releases its window listeners')
await new Promise((resolve) => { setTimeout(resolve, SAVE_DEBOUNCE_MS + 60) })
assert.ok(calls.some(entry => entry.method === 'PUT' && String(entry.body).includes(`"x":${startX + 60}`)),
  'the canvas the drag changed is written back')

// Removing a note edits the canvas only: there are no bytes behind it, so no
// file route is reached. It asks first, and the first press can be taken back.
const removeButtons = () => elements(panel).filter(node => node.type === 'button' && texts(node).includes('×'))
removeButtons()[0].props.onClick()
panel = await control.settle()
assert.ok(texts(panel).some(text => text.includes('再点一次')), 'the first press says what a second one does')
assert.equal(calls.some(entry => entry.method === 'DELETE'), false, 'the first press reaches no route at all')
const cancel = elements(panel).find(node => node.type === 'button' && texts(node).includes('取消'))
assert.ok(cancel !== undefined, 'the confirmation can be taken back')
cancel.props.onClick()
panel = await control.settle()
assert.equal(elements(panel).filter(node => node.type === 'button' && texts(node).includes('确定删除')).length, 0,
  'cancelling puts the card back')
assert.equal(elements(panel).filter(node => node.type === 'textarea').length, 1, 'the note is still there')

removeButtons()[0].props.onClick()
panel = await control.settle()
elements(panel).find(node => node.type === 'button' && texts(node).includes('确定删除')).props.onClick()
panel = await control.settle()
assert.equal(elements(panel).filter(node => node.type === 'textarea').length, 0, 'the note is gone from the canvas')
assert.equal(calls.some(entry => entry.method === 'DELETE'), false, 'a note has no bytes to delete')

// A stored file does go: the same two presses, and the second reaches the route.
removeButtons()[0].props.onClick()
panel = await control.settle()
elements(panel).find(node => node.type === 'button' && texts(node).includes('确定删除')).props.onClick()
panel = await control.settle()
assert.ok(calls.some(entry => entry.method === 'DELETE' && entry.url.includes('name=shot.png')),
  'the second press deletes the file behind the card')

// A card is titled with its file name until someone renames it, and a renamed
// card still says which file it holds.
const titles = () => elements(panel).filter(node => typeof node.props?.onDoubleClick === 'function')
assert.equal(titles().length, items.length - 2, 'every card carries exactly one editable title')
assert.ok(texts(panel).includes('notes.md'), 'an untouched card is titled with its file name')
titles()[0].props.onDoubleClick()
panel = await control.settle()
const field = elements(panel).find(node => node.type === 'input')
assert.ok(field !== undefined, 'double-clicking a title opens a field')
assert.equal(field.props.spellCheck, false, 'a title is not spell checked either')
field.props.onChange({ target: { value: '端口备忘' } })
// A browser re-renders between two events, so the handler that follows sees the
// state the first one set; this harness renders only when it is asked to.
panel = await control.settle()
elements(panel).find(node => node.type === 'input').props.onKeyDown({ key: 'Enter' })
panel = await control.settle()
assert.ok(texts(panel).includes('端口备忘'), 'the title the person typed is what the card draws')
assert.ok(texts(panel).includes('notes.md · 64 B'), 'a renamed card still says which file it holds')
await new Promise((resolve) => { setTimeout(resolve, SAVE_DEBOUNCE_MS + 60) })
assert.ok(calls.some(entry => entry.method === 'PUT' && String(entry.body).includes('端口备忘')),
  'the new title is written back with the canvas')

// Every header control reaches its route and says what it is doing. The notice
// is the whole feedback surface: a control that runs without moving it is
// indistinguishable from a control that is dead.
const press = async (label) => {
  const found = elements(panel).find(node => node.type === 'button' && texts(node).includes(label))
  assert.ok(found !== undefined, `the ${label} control is a real button`)
  found.props.onClick()
  panel = await control.settle()
  return texts(panel)
}
assert.ok((await press('刷新')).includes('已刷新'), 'a refresh says so')
assert.ok((await press('保存')).some(text => text.includes('已提交并上传') || text.includes('没有需要保存的改动')),
  'saving reports which half it reached')
assert.ok(calls.some(entry => entry.method === 'POST' && String(entry.body).includes('"action":"save"')),
  'the save control reaches the Git route with one action, not two')
assert.ok((await press('拉取')).some(text => text.includes('已拉取')), 'a pull says so')

// A save that committed but could not upload says exactly that, rather than
// reporting one undifferentiated failure.
globalThis.fetch = (url, init) => {
  calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body })
  if (String(url).includes('/git')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      ok: false, reason: 'push-failed', committed: true, message: 'fatal: could not read from remote',
    }) })
  }
  return live(url, init)
}
assert.ok((await press('保存')).some(text => text.includes('已提交到本机，但上传失败：fatal: could not read from remote')),
  'a half-completed save names the half that failed')

// ---- zoom -------------------------------------------------------------------

/** The layer the cards are drawn in, whatever the zoom: the one that is scaled. */
const scaledLayer = (tree) => elements(tree).find(node => typeof node.props?.style?.transform === 'string')
const zoomPercent = (tree) => elements(tree)
  .map(node => texts(node).find(text => /^\d+%$/u.test(text)))
  .find(text => text !== undefined)

/** One wheel notch over the canvas, at a point of its viewport. */
function wheel(deltaY, clientX = 400, clientY = 300) {
  const listeners = [...(elementListeners.get('wheel') ?? [])]
  assert.equal(listeners.length, 1, 'the canvas registers exactly one wheel listener')
  listeners[0]({ deltaY, clientX, clientY, preventDefault: () => {} })
}

// The panels mounted above are still mounted, and each registers its own wheel
// listener on the element it drew; this one starts from a clean element.
elementListeners.clear()
const zooming = mount(main.component, { ...face })
let view = await zooming.settle()
assert.equal(elementListeners.get('wheel').size, 1, 'a mounted panel registers exactly one wheel listener')
assert.equal(zoomPercent(view), '100%', 'the canvas opens at its natural scale')
assert.equal(scaledLayer(view).props.style.transform, 'scale(1)', 'and draws unscaled')

/** The canvas column itself: the scrollable box the layer sits in. */
const canvasNode = elements(view).find(node => node.props?.style?.cursor === 'default'
  && typeof node.props?.onPointerDown === 'function')

// Centring is an auto margin on the layer inside a flex column, not
// `justify-content: center`: the latter puts the top-left corner of a plane
// larger than the column out of reach, which a canvas zoomed in always is.
const centredLayer = elements(view).find(node => node.props?.style?.margin === 'auto')
assert.ok(centredLayer !== undefined, 'the plane centres itself with an auto margin')
assert.equal(canvasNode.props.style.display, 'flex', 'inside a flex box, which is what makes that margin work')
assert.equal(centredLayer.props.style.width, 4000 + 60 * 2, 'the plane is one fixed size plus its margin')
assert.equal(centredLayer.props.style.height, 3000 + 60 * 2, 'and so is its height')
assert.equal(scaledLayer(view).props.style.left, 60 + 2000, 'content (0,0) sits at the middle of the plane')
assert.equal(scaledLayer(view).props.style.top, 60 + 1500, 'vertically too')

// The plane is drawn, so its edge is visible and a card can be seen to be on it.
const plane = elements(view).find(node => node.props?.style?.width === 4000
  && node.props?.style?.position === 'absolute')
assert.ok(plane !== undefined, 'the plane itself is drawn')
assert.equal(plane.props.style.left, -2000, 'spanning the negative half of content coordinates')
assert.equal(plane.props.style.height, 3000, 'and the whole height')

// The view opens aimed at what is on the canvas. The test cards span
// (10,20)-(840,344), so their middle is (425,182), and at the natural scale that
// content point lands at 60 + 2000 + 425 — half a column left of it is the scroll.
assert.equal(refElement.scrollLeft, 1885, 'opening the panel looks at the middle of the cards')
assert.equal(refElement.scrollTop, 1392, 'vertically too')

// The user asked for exactly this: from the normal scale, one step down is half.
const zoomOut = elements(view).find(node => node.type === 'button' && texts(node).includes('−'))
const zoomIn = elements(view).find(node => node.type === 'button' && texts(node).includes('+'))
zoomOut.props.onClick()
view = await zooming.settle()
assert.equal(zoomPercent(view), '50%', 'the normal scale reaches half in one step')
assert.equal(scaledLayer(view).props.style.transform, 'scale(0.5)', 'and the layer is drawn at that scale')
zoomOut.props.onClick()
view = await zooming.settle()
assert.equal(zoomPercent(view), '25%', 'the minus control walks further down')
zoomIn.props.onClick()
view = await zooming.settle()
assert.equal(zoomPercent(view), '50%', 'the plus control walks back up')

// A wheel notch scales about the pointer: the content under it must stay under
// it, which is the scroll offset the zoom asks for. This runs at the natural
// scale, where the canvas is larger than its column — a canvas that fits has no
// scroll range at all, since centring fills it.
zoomIn.props.onClick()
view = await zooming.settle()
assert.equal(zoomPercent(view), '100%', 'back to the natural scale for the anchor check')
refElement.scrollLeft = 20
refElement.scrollTop = 20
wheel(-1, 600, 400)
view = await zooming.settle()
assert.equal(zoomPercent(view), '110%', 'a wheel notch scales by one factor, not one rung')
// The content point under (600, 400) is (−1440, −1140): the plane's middle sits
// at 60 + 2000, so a click near the column's own middle is left of the origin. At
// 110% that point sits at 2260 − 1440 * 1.1 = 676, so the scroll that keeps it
// under the pointer is 76.
// A scroll offset is a real number, so it is compared with the tolerance the
// multiplication actually leaves behind.
assert.ok(Math.abs(refElement.scrollLeft - 76) < 0.001, 'the point under the pointer keeps its place')
assert.ok(Math.abs(refElement.scrollTop - 56) < 0.001, 'vertically too')

// The first wheel listener works from a ref rather than from the render that
// made it, so it keeps working after the component has re-rendered many times.
refElement.scrollLeft = 0
refElement.scrollTop = 0
for (let notch = 0; notch < 30; notch += 1) wheel(1, 10, 10)
view = await zooming.settle()
assert.equal(zoomPercent(view), '25%', 'zooming out stops at the smallest scale')
for (let notch = 0; notch < 60; notch += 1) wheel(-1, 10, 10)
view = await zooming.settle()
assert.equal(zoomPercent(view), '300%', 'zooming in stops at the largest scale')

// The readout is also the way back: one click, whatever the zoom.
elements(view).find(node => node.type === 'button' && texts(node).includes('300%')).props.onClick()
view = await zooming.settle()
assert.equal(zoomPercent(view), '100%', 'the readout returns the canvas to its natural scale')

// Dragging is measured in content coordinates, so a card follows the pointer at
// any zoom rather than running away from it. Two wheel notches leave the scale at
// 83%, and the minus control snaps it to half, where 60 pixels of pointer travel
// is 120 pixels of canvas.
wheel(1, 10, 10)
wheel(1, 10, 10)
view = await zooming.settle()
assert.equal(zoomPercent(view), '83%', 'the wheel scales smoothly between the rungs')
elements(view).find(node => node.type === 'button' && texts(node).includes('−')).props.onClick()
view = await zooming.settle()
assert.equal(zoomPercent(view), '50%', 'a control snaps back onto a rung')
const beforeDrag = cardsOf(view)[1].props.style.left
pressCard(view, 1, 60, 0)
view = await zooming.settle()
assert.equal(cardsOf(view)[1].props.style.left, beforeDrag + 120,
  'a card follows the pointer at half scale, where the pointer moves half as far in canvas terms')

// A right press pans the view wherever it lands, a card included, and it never
// moves the card under it: the left button is the one that moves cards. The
// press is dispatched at both stops in bubble order, because this harness has no
// event bubbling of its own.
const stillBefore = cardsOf(view)[1].props.style.left
refElement.scrollLeft = 100
refElement.scrollTop = 50
const headerUnder = elements(cardsOf(view)[1]).find(node => typeof node.props?.onPointerDown === 'function')
headerUnder.props.onPointerDown({ button: 2, clientX: 300, clientY: 200 })
canvasNode.props.onPointerDown({ button: 2, clientX: 300, clientY: 200, target: headerUnder, currentTarget: canvasNode })
assert.ok(windowListeners.get('pointermove').size > 0, 'a right press starts a view drag')
for (const move of [...(windowListeners.get('pointermove') ?? [])]) move({ clientX: 340, clientY: 230 })
for (const up of [...(windowListeners.get('pointerup') ?? [])]) up({})
view = await zooming.settle()
assert.equal(refElement.scrollLeft, 60, 'a right press pans the view, cards and all')
assert.equal(refElement.scrollTop, 20, 'vertically too')
assert.equal(cardsOf(view)[1].props.style.left, stillBefore, 'and the card under the pointer does not move')
assert.equal(windowListeners.get('pointermove').size, 0, 'the view drag releases its listeners')

// The right button is a pan, so the shell's own menu must not open over it.
assert.ok(typeof canvasNode.props.onContextMenu === 'function', 'the canvas claims the context menu')
let prevented = false
canvasNode.props.onContextMenu({ preventDefault: () => { prevented = true } })
assert.ok(prevented, 'and refuses it, so a right drag is not interrupted')

// The drop hint appears while a file is dragged over it: it must stay out of the
// flex layout, or it would sit beside the layer and push the centring off.
canvasNode.props.onDragOver({ preventDefault: () => {} })
view = await zooming.settle()
// Matched on the element that draws the text itself: every ancestor contains it.
const hint = elements(view).find(node => (node.children ?? []).includes('松手即入库'))
assert.ok(hint !== undefined, 'dragging over the canvas shows the drop hint')
assert.equal(hint.props.style.position, 'absolute', 'and the hint is taken out of the layout')
assert.equal(elements(canvasNode).some(node => texts(node).includes('松手即入库')), false,
  'outside the scroller too, so the opening view cannot scroll it away')
canvasNode.props.onDragLeave()
view = await zooming.settle()
assert.equal(elements(view).some(node => texts(node).includes('松手即入库')), false,
  'and it goes away when the drag leaves')

// ---- the edges of the canvas ------------------------------------------------

// The canvas is one fixed plane. A card goes wherever it is put on it — left of
// and above the origin included — and the view does not move while that happens:
// a view that shifted under the card would be the canvas moving, not the card.
elementListeners.clear()
const edges = mount(main.component, { ...face })
let edgeView = await edges.settle()
const edgeHeader = elements(cardsOf(edgeView)[1]).find(node => typeof node.props?.onPointerDown === 'function')
assert.equal(cardsOf(edgeView)[1].props.style.left, 300, 'the card starts where the state puts it')
const restingView = { left: refElement.scrollLeft, top: refElement.scrollTop }
edgeHeader.props.onPointerDown({ button: 0, clientX: 300, clientY: 300 })
for (const move of [...(windowListeners.get('pointermove') ?? [])]) move({ clientX: -100, clientY: 200 })
edgeView = await edges.settle()
assert.equal(cardsOf(edgeView)[1].props.style.left, -100, 'a card can be dragged past the origin')
assert.equal(cardsOf(edgeView)[1].props.style.top, -80, 'above it too')
assert.equal(scaledLayer(edgeView).props.style.left, 60 + 2000, 'the plane does not move under it')
for (const up of [...(windowListeners.get('pointerup') ?? [])]) up({})
edgeView = await edges.settle()
assert.equal(cardsOf(edgeView)[1].props.style.left, -100, 'the card stays where it was let go')
assert.deepEqual({ left: refElement.scrollLeft, top: refElement.scrollTop }, restingView,
  'moving a card never moves the view')

// The plane is the one thing that does bound a card, at its own edge.
edgeHeader.props.onPointerDown({ button: 0, clientX: 300, clientY: 300 })
for (const move of [...(windowListeners.get('pointermove') ?? [])]) move({ clientX: -9000, clientY: 300 })
for (const up of [...(windowListeners.get('pointerup') ?? [])]) up({})
edgeView = await edges.settle()
assert.equal(cardsOf(edgeView)[1].props.style.left, -2000, 'a card is held at the far edge of the plane')

console.log('temp-space client smoke: ok')
