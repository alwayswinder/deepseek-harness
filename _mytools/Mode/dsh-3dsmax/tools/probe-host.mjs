// 一次性诊断脚本：连到 desktop host 主进程的 Node inspector，评估一段表达式并打印结果。
// 用法: node tools/probe-host.mjs "<expression>"
// 端口固定走 9230（desktop host 的 --inspect 端口）。
const expression = process.argv[2]
if (expression === undefined) {
  console.error('usage: node probe-host.mjs "<expression>"')
  process.exit(2)
}

const listRes = await fetch('http://127.0.0.1:9230/json/list')
const targets = await listRes.json()
const target = targets[0]
if (target === undefined) {
  console.error('no inspector target')
  process.exit(3)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()

const send = (method, params) => new Promise((resolve, reject) => {
  const messageId = ++id
  pending.set(messageId, { resolve, reject })
  ws.send(JSON.stringify({ id: messageId, method, params }))
})

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

await send('Runtime.enable', {})
const result = await send('Runtime.evaluate', {
  expression,
  awaitPromise: true,
  returnByValue: true,
  includeCommandLineAPI: true,
})

if (result.exceptionDetails !== undefined) {
  console.error('EXCEPTION:', JSON.stringify(result.exceptionDetails, null, 2))
} else {
  console.log(JSON.stringify(result.result, null, 2))
}
ws.close()
