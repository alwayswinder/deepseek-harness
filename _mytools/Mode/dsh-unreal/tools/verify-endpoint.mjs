// 用 mcp-client 依赖的同一个 MCP SDK（@modelcontextprotocol/client）与同一组 connect 选项
// 直连 UE 端点，回答"模式里为什么没有工具"这类问题：
//   - 连不上  → 编辑器没开 / 端口不对 / 地址被改过
//   - 连上但 tools 不是 3 个 → 编辑器关了 bEnableToolSearch（全原生暴露，token 会爆）
//   - 连上且 3 个，但 call_tool 报 Unknown tool → 传了全名而不是短名
//
// 用法: node _mytools\Mode\dsh-unreal\tools\verify-endpoint.mjs [url]
// 退出码: 0 正常；1 连不上或握手失败。

import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const here = import.meta.dirname
// tools → dsh-unreal → Mode → _mytools → 仓库根
const repositoryRoot = resolve(here, '..', '..', '..', '..')
// 从仓库里 mcp-client 的清单解析 —— 拿到的就是宿主实际加载的那份 SDK，不是另装一个版本。
const require = createRequire(join(repositoryRoot, 'packages', 'mcp', 'mcp-client', 'package.json'))
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client')

const url = new URL(process.argv[2] ?? process.env.DSH_UNREAL_MCP_URL ?? 'http://127.0.0.1:8000/mcp')
console.log(`endpoint: ${url.href}`)

// 与 packages/mcp/mcp-client/src/connection.ts 的构造方式保持一致。
const client = new Client(
  { name: 'dsh-mode-unreal-verify', version: '0.0.1' },
  { capabilities: {}, versionNegotiation: { mode: 'auto' } },
)
const transport = new StreamableHTTPClientTransport(url)

try {
  await client.connect(transport)
}
catch (error) {
  console.error(`connect failed: ${error instanceof Error ? error.message : String(error)}`)
  console.error('检查：编辑器是否在运行、项目设置里的 ServerPortNumber / ServerUrlPath、DSH_UNREAL_MCP_URL')
  process.exit(1)
}

console.log(`protocol: ${transport.protocolVersion ?? '(unknown)'}`)
const tools = await client.listTools()
const names = tools.tools.map(tool => tool.name)
console.log(`tools (${names.length}): ${names.join(', ')}`)
if (names.length > 3) {
  console.warn('note: 工具多于 3 个 —— 编辑器关掉了 bEnableToolSearch，全部 toolset 工具被原生注册，token 开销会大一个数量级')
}

const level = await client.callTool({
  name: 'call_tool',
  arguments: {
    toolset_name: 'editor_toolset.toolsets.scene.SceneTools',
    tool_name: 'get_current_level',
    arguments: {},
  },
})
console.log(`smoke call get_current_level: ${JSON.stringify(level.structuredContent ?? level.content)}`)

await client.close()
