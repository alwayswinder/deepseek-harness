/**
 * Keyless smoke test for the holdings-management browser half.
 *
 * `client.js` is a classic script: it registers a factory through
 * `window.__ModuleLoader__.load`, so this test provides that global, evaluates
 * the file, builds the plugin with a React stub whose hooks actually re-render,
 * and then drives the rendered page against a stubbed fetch. It asserts what a
 * person sees and what the page sends: the loaded rows, live totals, an edited
 * quantity, an added and a deleted row, and the save request.
 *
 * Run: node tests/positions-ui.smoke.mjs  (from the plugin directory)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ---- minimal hook runtime ---------------------------------------------------

let hooks = []
let cursor = 0
let pendingEffects = []
let stateMoved = false

function useState(initial) {
  const at = cursor++
  if (!(at in hooks)) hooks[at] = typeof initial === 'function' ? initial() : initial
  const set = (next) => {
    const value = typeof next === 'function' ? next(hooks[at]) : next
    if (Object.is(value, hooks[at])) return
    hooks[at] = value
    stateMoved = true
  }
  return [hooks[at], set]
}

function useEffect(fn, deps) {
  const at = cursor++
  const previous = hooks[at]
  const changed = previous === undefined || deps === undefined
    || deps.length !== previous.deps.length || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))
  if (!changed) return
  hooks[at] = { deps, cleanup: previous?.cleanup }
  pendingEffects.push({ at, fn })
}

function useMemo(fn, deps) {
  const at = cursor++
  const previous = hooks[at]
  if (previous !== undefined && deps !== undefined && deps.length === previous.deps.length
    && deps.every((dep, index) => Object.is(dep, previous.deps[index]))) return previous.value
  const value = fn()
  hooks[at] = { deps, value }
  return value
}

function useCallback(fn, deps) {
  return useMemo(() => fn, deps)
}

const reactStub = {
  // React's own contract: children arrive both as an argument list and on
  // props, which is how the page's own components read them.
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props ?? {}), children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children },
    children,
  }),
  Fragment: 'fragment',
  useState,
  useEffect,
  useMemo,
  useCallback,
}

// ---- tree helpers -----------------------------------------------------------

/**
 * Render one function component the way React would, on a scratch hook runtime
 * so the page's own hooks are untouched. The walkers below need this to see
 * through components such as the page's own button.
 */
function instantiate(node) {
  const saved = { hooks, cursor, pendingEffects, stateMoved }
  hooks = []
  cursor = 0
  pendingEffects = []
  stateMoved = false
  try {
    return node.type(node.props)
  } finally {
    hooks = saved.hooks
    cursor = saved.cursor
    pendingEffects = saved.pendingEffects
    stateMoved = saved.stateMoved
  }
}

/** Every string inside one rendered node, concatenated. */
function textOf(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node !== 'object') return ''
  if (typeof node.type === 'function') return textOf(instantiate(node))
  if (Array.isArray(node.children)) return node.children.map(textOf).join('')
  return ''
}

/** Every element in the tree matching `predicate`, in render order. */
function findAll(node, predicate, found = []) {
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, found)
    return found
  }
  if (typeof node.type === 'function') {
    findAll(instantiate(node), predicate, found)
    return found
  }
  if (predicate(node)) found.push(node)
  for (const child of node.children ?? []) findAll(child, predicate, found)
  return found
}

/** Every button whose text is exactly `label`, in row order. */
function buttons(label) {
  return findAll(tree, node => node.type === 'button' && textOf(node).trim() === label)
}

/** The one button whose text is exactly `label`. */
function button(label) {
  const matches = buttons(label)
  assert.equal(matches.length, 1, `expected exactly one "${label}" button, found ${String(matches.length)}`)
  return matches[0]
}

/** The input the page labelled `label` (its aria-label names the column and row). */
function input(label) {
  const matches = findAll(tree, node => node.type === 'input' && node.props['aria-label'] === label)
  assert.equal(matches.length, 1, `expected exactly one input labelled "${label}", found ${String(matches.length)}`)
  return matches[0]
}

/** Type into one input the way the browser does. */
function type(label, value) {
  input(label).props.onChange({ currentTarget: { value } })
}

/** Every input value in render order: the editable columns are inputs, not text. */
function values() {
  return findAll(tree, node => node.type === 'input'
    && node.props['aria-label'] !== '持仓文件路径'
    && node.props['aria-label'] !== '总资产')
    .map(node => node.props.value)
}

/** Press the `row`-th button carrying `label` (row controls repeat once per holding). */
function pressRow(label, row) {
  const matches = buttons(label)
  assert.ok(row < matches.length, `expected a "${label}" button at row ${String(row)}`)
  matches[row].props.onClick()
}

function press(label) {
  button(label).props.onClick()
}

// ---- browser environment ----------------------------------------------------

const loaded = []
globalThis.window = { __ModuleLoader__: { load: (record) => { loaded.push(record) } } }

/** Let the stubbed fetch promises settle. */
const flush = () => new Promise(resolve => { setTimeout(resolve, 0) })

// ---- stubbed host route -----------------------------------------------------

const FIXTURE = {
  file: 'D:/plugin/positions.json',
  file_source: 'config',
  file_default: 'C:/Users/me/.dsh/ths-holdings/positions.json',
  exported_at: '2026-05-01T15:00:00+08:00',
  export_date: '2026-05-01',
  updated_at: '2026-05-02T09:30:00+08:00',
  cookie_configured: false,
  skipped: 0,
  quotes_error: '',
  total_assets: 500000,
  holdings_value: 102700,
  cash: 397300,
  cash_pct: 79.46,
  positions: [
    {
      code: '600941', name: '中国移动', qty: 400, cost: 87.291,
      price: 88, prev_close: 87, market_value: 35200, cost_value: 34916.4,
      pnl: 283.6, pnl_pct: 0.81, day_pnl: 400, day_pnl_pct: 1.15,
    },
    {
      code: '601668', name: '中国建筑', qty: 15000, cost: 4.478,
      price: 4.5, prev_close: 4.4, market_value: 67500, cost_value: 67170,
      pnl: 330, pnl_pct: 0.49, day_pnl: 1500, day_pnl_pct: 2.27,
    },
  ],
}

const requests = []

/** The file the stubbed host serves, so a chosen location changes what a reload reads. */
let activeFile = FIXTURE.file
let activeSource = FIXTURE.file_source
/** The total assets the stubbed host remembers; null means the setting is unset. */
let activeAssets = FIXTURE.total_assets

/** Price one saved row the way the host's quote feed would. */
function priced(row) {
  const known = FIXTURE.positions.find(candidate => candidate.code === row.code)
  return known === undefined
    ? { ...row, market_value: undefined }
    : { ...known, ...row }
}

globalThis.fetch = (url, init) => {
  requests.push({ url, init })
  if (String(url).endsWith('/assets')) {
    const body = JSON.parse(String(init.body))
    activeAssets = body.totalAssets
    return Promise.resolve(new Response(JSON.stringify({ ok: true, total_assets: activeAssets }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
  }
  if (String(url).endsWith('/location')) {
    const body = JSON.parse(String(init.body))
    if (body.positionsFile === 'relative.json') {
      return Promise.resolve(new Response(JSON.stringify({
        ok: false,
        message: '请填写绝对路径（以盘符或 / 开头）：relative.json',
      }), { status: 400, headers: { 'content-type': 'application/json' } }))
    }
    if (body.positionsFile === '') {
      activeFile = FIXTURE.file
      activeSource = 'config'
    } else {
      activeFile = body.positionsFile
      activeSource = 'machine'
    }
    return Promise.resolve(new Response(JSON.stringify({
      ok: true, file: activeFile, file_source: activeSource, file_default: FIXTURE.file_default,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
  }
  const view = { ...FIXTURE, file: activeFile, file_source: activeSource, total_assets: activeAssets }
  const body = init === undefined || init.body === undefined ? undefined : JSON.parse(String(init.body))
  const payload = init === undefined
    ? view
    : { ok: true, errors: [], view: { ...view, positions: body.positions.map(priced) } }
  return Promise.resolve(new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
}

// ---- client bundle ----------------------------------------------------------

// A classic script, not a module: evaluate it with the global it expects.
const source = readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
new Function('window', source)(globalThis.window)

assert.equal(loaded.length, 1, 'client.js must register exactly one factory')
assert.equal(loaded[0].id, 'dsh-ths-holdings', 'the bundle id is the package name')

const plugin = loaded[0].factory((name) => {
  if (name === 'react') return reactStub
  throw new Error('unexpected require: ' + name)
})

assert.equal(plugin.name, 'ths-holdings-client')
assert.deepEqual(plugin.inject, ['slots'])
assert.equal(typeof plugin.apply, 'function')

// ---- registration -----------------------------------------------------------

/** What the shell's directory picker answers; the page turns it into a file path. */
const picked = { value: undefined }

let registration = null
const fakeCtx = {
  get(name) {
    if (name !== 'uiWorkspace') return undefined
    return { pickDirectory: async () => picked.value }
  },
  slots: {
    inject(name, setup) {
      assert.equal(name, 'plugins.bundle.config')
      setup()
      return () => {}
    },
    register(options, component) {
      registration = { options, component }
      return () => {}
    },
  },
}

plugin.apply(fakeCtx)
assert.ok(registration !== null, 'apply must register the bundle configuration')
assert.deepEqual(
  { name: registration.options.name, key: registration.options.key },
  { name: 'plugins.bundle.config', key: 'dsh-ths-holdings' },
)
assert.equal(typeof registration.options.inject, 'function', 'the page receives the shell picker through the slot')

// The Plugins page asks a list row for the summary view and the open bundle for
// the page view; only the latter may touch the host.
const PositionsManager = registration.component
assert.equal(textOf(PositionsManager({ view: 'summary' })), '改成本 / 数量、增删持仓，含实时市值与盈亏')
assert.equal(requests.length, 0, 'the summary view reads nothing')

let tree = null

/** Render, run the effects, and keep rendering while the stubbed host still moves state. */
async function draw() {
  for (let pass = 0; pass < 12; pass++) {
    cursor = 0
    pendingEffects = []
    stateMoved = false
    tree = PositionsManager({ view: 'page', ...registration.options.inject() })
    for (const effect of pendingEffects) {
      if (typeof effect.fn !== 'function') continue
      const current = hooks[effect.at]
      if (typeof current.cleanup === 'function') current.cleanup()
      const cleanup = effect.fn()
      hooks[effect.at] = { ...current, cleanup }
    }
    // Let the stubbed fetch settle before deciding whether another pass is due.
    await flush()
    if (!stateMoved) break
  }
  return tree
}

await draw()
assert.equal(requests.length, 1, 'the page reads the holdings once on mount')
assert.equal(requests[0].url, '/api/stock-pnl/positions')

// The loaded table: both rows, their prices, and the live totals.
const loadedText = textOf(tree)
assert.ok(loadedText.includes('持仓管理'), 'the section names itself')
assert.ok(loadedText.includes('D:/plugin/positions.json'), 'the page shows which file it edits')
assert.ok(loadedText.includes('当前来源：插件配置'), 'the page says the path came from the plugin configuration')
assert.equal(input('持仓文件路径').props.value, 'D:/plugin/positions.json', 'the location field starts at the active file')
assert.deepEqual(values(), ['600941', '中国移动', '400', '87.291', '601668', '中国建筑', '15000', '4.478'],
  'both holdings render their editable fields')
assert.ok(loadedText.includes('¥102,700.00'), 'the totals price the loaded quantities')
assert.ok(loadedText.includes('累计 +¥613.60 (+0.60%)'), 'the cumulative P&L uses the position costs')
assert.ok(loadedText.includes('今日 +¥1,900.00 (+1.88%)'), 'the day P&L uses the previous closes')
assert.ok(!loadedText.includes('有未保存的修改'), 'a freshly loaded page is not dirty')
assert.equal(button('保存').props.disabled, true, 'nothing to save yet')

// ---- editing a quantity -----------------------------------------------------

type('数量 第 1 行', '500')
await draw()
assert.ok(textOf(tree).includes('¥111,500.00'), 'the totals follow the edited quantity')
assert.ok(textOf(tree).includes('有未保存的修改'), 'the page reports unsaved edits')
assert.equal(button('保存').props.disabled, false, 'the save control opens once the list changed')

// The reload control offers to discard instead.
assert.ok(findAll(tree, node => node.type === 'button').some(node => textOf(node).trim() === '放弃修改'))

// ---- adding and deleting rows ----------------------------------------------

press('添加一行')
await draw()
assert.equal(
  findAll(tree, node => node.type === 'input'
    && node.props['aria-label'] !== '持仓文件路径'
    && node.props['aria-label'] !== '总资产').length,
  12,
  'a third row adds four inputs',
)

type('代码 第 3 行', '000895')
type('名称 第 3 行', '双汇发展')
type('数量 第 3 行', '1700')
type('成本 第 3 行', '23.664')
await draw()

pressRow('删除', 1)
await draw()
assert.deepEqual(values(), ['600941', '中国移动', '500', '87.291', '000895', '双汇发展', '1700', '23.664'],
  'the deleted row leaves the table and the others keep their edits')

pressRow('删除', 1)
await draw()
assert.deepEqual(values(), ['600941', '中国移动', '500', '87.291'], 'the added row can be deleted again')

// ---- saving -----------------------------------------------------------------

press('保存')
await draw()
assert.equal(requests.length, 2, 'saving posts once')
const posted = JSON.parse(String(requests[1].init.body))
assert.equal(requests[1].init.method, 'POST')
assert.equal(requests[1].init.headers['content-type'], 'application/json')
assert.deepEqual(posted, { positions: [{ code: '600941', name: '中国移动', qty: 500, cost: 87.291 }] })

const savedText = textOf(tree)
assert.ok(savedText.includes('已保存'), 'the page confirms the save')
assert.ok(!savedText.includes('有未保存的修改'), 'the saved list is the new baseline')
assert.equal(button('保存').props.disabled, true, 'nothing left to save')

// ---- switching the holdings file from the settings row -----------------------

// The shell picker fills the field with the snapshot name inside the directory.
picked.value = 'D:\\private-repo'
press('选择目录…')
await draw()
assert.equal(input('持仓文件路径').props.value, 'D:\\private-repo\\positions.json',
  'a picked directory becomes the snapshot path inside it')

press('保存位置')
await draw()
const locationRequest = requests.find(request => String(request.url) === '/api/stock-pnl/positions/location')
assert.ok(locationRequest !== undefined, 'saving the location posts to the location route')
assert.equal(locationRequest.init.method, 'POST')
assert.equal(locationRequest.init.headers['content-type'], 'application/json')
assert.deepEqual(JSON.parse(String(locationRequest.init.body)), { positionsFile: 'D:\\private-repo\\positions.json' })
const switchedText = textOf(tree)
assert.ok(switchedText.includes('已切换到 D:\\private-repo\\positions.json'), 'the page confirms the switch')
assert.ok(switchedText.includes('当前来源：本机设置'), 'the page reports that this machine chose the path')
assert.equal(input('持仓文件路径').props.value, 'D:\\private-repo\\positions.json', 'the reloaded view keeps the chosen path')
assert.ok(findAll(tree, node => node.type === 'button').some(node => textOf(node).trim() === '恢复默认'),
  'a machine-chosen path can be reset')

// A refused path keeps the dialog open with the host's explanation.
type('持仓文件路径', 'relative.json')
await draw()
press('保存位置')
await draw()
assert.ok(textOf(tree).includes('请填写绝对路径'), 'a refused location reports why')

// Resetting forgets the machine choice and returns to the configured path.
type('持仓文件路径', 'D:\\private-repo\\positions.json')
await draw()
press('恢复默认')
await draw()
const resetText = textOf(tree)
assert.ok(resetText.includes('当前来源：插件配置'), 'resetting falls back to the plugin configuration')
assert.equal(input('持仓文件路径').props.value, 'D:/plugin/positions.json', 'the configured file is shown again')
assert.ok(!findAll(tree, node => node.type === 'button').some(node => textOf(node).trim() === '恢复默认'),
  'the reset control is gone when the configuration is in force')

// ---- total assets and available cash ----------------------------------------

assert.equal(input('总资产').props.value, '500000', 'the stored total assets fill their field')
assert.ok(textOf(tree).includes('可用资金 ¥397,300.00 (+79.46%)'),
  'available cash is the total minus the priced holdings')
assert.equal(button('保存总资产').props.disabled, true, 'an unchanged total has nothing to save')

type('总资产', '1000000')
await draw()
press('保存总资产')
await draw()
const assetsRequest = requests.find(request => String(request.url) === '/api/stock-pnl/positions/assets')
assert.ok(assetsRequest !== undefined, 'saving the total posts to the assets route')
assert.equal(assetsRequest.init.method, 'POST')
assert.deepEqual(JSON.parse(String(assetsRequest.init.body)), { totalAssets: 1000000 })
const assetsText = textOf(tree)
assert.ok(assetsText.includes('已保存总资产'), 'the page confirms the total was stored')
assert.ok(assetsText.includes('可用资金 ¥897,300.00 (+89.73%)'), 'the page recounts cash from the new total')

// ---- a rejected save marks the offending row ---------------------------------

globalThis.fetch = (url, init) => {
  requests.push({ url, init })
  return Promise.resolve(new Response(JSON.stringify({
    ok: false,
    errors: [{ index: 0, field: 'qty', message: '数量必须是大于 0 的数字' }],
  }), { status: 400, headers: { 'content-type': 'application/json' } }))
}
type('数量 第 1 行', '0')
await draw()
press('保存')
await draw()
const rejectedText = textOf(tree)
assert.ok(rejectedText.includes('第 1 行 qty：数量必须是大于 0 的数字'), 'the rejected field is named with its row')
assert.ok(textOf(button('保存')).includes('保存'), 'the save control comes back after a rejection')

console.log('dsh-ths-holdings page smoke: all assertions passed')
