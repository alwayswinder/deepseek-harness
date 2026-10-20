// 一次性诊断脚本：连到正在运行的 host 的 inspector，读取 agentPresets 名单
// （模式选择器看到的就是它）。与 _mytools/Mode/dsh-3dsmax/tools/probe-presets.mjs 同源，
// 放在本包是为了本模式可以独立自检，不必依赖另一个模式包。
//
// 用法: node tools/probe-presets.mjs [inspectorPort]   （默认 9230）
//
// desktop host 自带 --inspect=127.0.0.1:9230；模式选择器只显示 broken 为空的 preset，
// 所以"模式不见了"时先看这里的 broken 字段。
const port = process.argv[2] ?? '9230'
const listRes = await fetch(`http://127.0.0.1:${port}/json/list`)
const [target] = await listRes.json()
if (target === undefined) {
  console.error('no inspector target')
  process.exit(3)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const call = (method, params) => new Promise((resolve, reject) => {
  const messageId = ++id
  pending.set(messageId, { resolve, reject })
  ws.send(JSON.stringify({ id: messageId, method, params }))
})
const evaluate = async (expression, returnByValue = true) => {
  const result = await call('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue, includeCommandLineAPI: true,
  })
  if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails, null, 2))
  return result.result
}

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id === undefined) return
  const entry = pending.get(msg.id)
  if (entry === undefined) return
  pending.delete(msg.id)
  if (msg.error !== undefined) entry.reject(new Error(JSON.stringify(msg.error)))
  else entry.resolve(msg.result)
})
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})
await call('Runtime.enable', {})

// 在宿主进程里解析它自己的 cordis：argv[1] 是宿主的入口，从那里解析才拿到与宿主
// 同一个模块实例，Context.prototype 才不会认错对象。不写死任何本机路径。
const proto = await evaluate(
  "require('node:module').createRequire(process.argv[1])('@deepseek-ai/cordis').Context.prototype",
  false,
)
const objects = await call('Runtime.queryObjects', { prototypeObjectId: proto.objectId })
const count = await call('Runtime.callFunctionOn', {
  objectId: objects.objects.objectId,
  functionDeclaration: 'function () { return this.length }',
  returnByValue: true,
})
console.log('live contexts:', JSON.stringify(count.result))
const described = await call('Runtime.callFunctionOn', {
  objectId: objects.objects.objectId,
  functionDeclaration: `async function () {
    const rows = []
    for (const ctx of this) {
      const root = ctx.root
      const impls = Object.values(root.reflect?.store ?? {}).map(impl => impl.name + ':' + impl.fiber.state)
      const presets = root.reflect?.get?.('agentPresets', false)
      let roster = null
      if (presets !== undefined && presets !== null) {
        try { roster = (await presets.list()).map(row => ({ id: row.id, order: row.order, broken: row.broken ?? null })) }
        catch (thrown) { roster = 'ERR ' + String(thrown) }
      }
      rows.push({ isRoot: root === ctx, implCount: impls.length, nonActive: impls.filter(e => !e.endsWith(':2')), roster })
    }
    return rows
  }`,
  awaitPromise: true,
  returnByValue: true,
})
console.log(JSON.stringify(described, null, 2))
ws.close()
