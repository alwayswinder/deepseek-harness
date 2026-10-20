// 用 `@deepseek-ai/dsh-mcp-client` 自己的 Config schema 校验本模式的 MCP 行。
//
// 为什么值得单独校验：Agent Preset 里任何一个 config 键不被插件接受，整个 preset
// 就挂载失败 —— 而挂载失败的 preset 只是从模式选择器里消失，日志里没有明显线索。
// `check-presets.mjs` 只验包能不能解析，验不了 config 键；这里补上那一半。
//
// 用法: node _mytools\Mode\dsh-unreal\tools\check-config.mjs
// exit 1 表示 MCP 行不被当前 mcp-client 接受（此时去改 sync-preset.mjs 的 mcpConfig）。

import { mcpConfig } from '../sync-preset.mjs'
import { Config } from '@deepseek-ai/dsh-mcp-client'

/** 把 `{ $js: '…' }` 求值成它在 Loader 里会得到的值；其余字段原样保留。 */
function resolveExpressions(value) {
  if (typeof value === 'object' && value !== null && '$js' in value) {
    // 表达式只允许读 process.env —— 与 Loader 里能拿到的东西一致，够用且不隐瞒。
    return Function('process', `return (${value.$js})`)(process)
  }
  return value
}

const candidate = Object.fromEntries(
  Object.entries(mcpConfig).map(([key, value]) => [key, resolveExpressions(value)]),
)

// Config 是 cordis 的 Schemastery schema（可调用对象），不是 zod：调用即校验 + 补默认值，
// 不合法时抛错 —— 与插件 apply() 拿到的校验时机一致。
let parsed
try {
  parsed = Config(candidate)
}
catch (error) {
  console.error('check-config: the mcp-unreal row is rejected by @deepseek-ai/dsh-mcp-client')
  console.error(`check-config: ${error instanceof Error ? error.message : String(error)}`)
  console.error('check-config: fix mcpConfig in sync-preset.mjs, then regenerate cordis.patch.yml')
  process.exit(1)
}

const { reconnect: _reconnect, ...effective } = parsed
console.log('check-config: ok')
console.log(`check-config: ${JSON.stringify(effective)}`)
