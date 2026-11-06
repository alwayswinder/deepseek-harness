// 诊断「新会话里为什么没有 3D 软件工具」：读 profile 的 MCP 行、按 mcp-client 自己的
// Config schema 校验，再实际连一次并列出工具。
//
// 三个 MCP 服务现在注册在 profile 的 cordis.patch.yml（不再属于某个 Agent Preset），
// 所以这里的校验对象就是真正生效的那份配置，而不是某个生成器的中间产物。
//
// 用法：
//   node _mytools/build/probe-mcp.mjs                    # desktop profile，校验 + 连接
//   node _mytools/build/probe-mcp.mjs --profile web      # 另一个 profile
//   node _mytools/build/probe-mcp.mjs --no-connect       # 只校验配置，不连服务
//
// 退出码：0 全部正常；1 有配置被拒或服务连不上。

import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const here = import.meta.dirname
const repositoryRoot = resolve(here, '..', '..')
// yaml 只装在用到它的包里，从那个包解析，避免把仓库根当成"什么都有"的假前提。
const { parse: parseYaml } = createRequire(join(repositoryRoot, 'packages', 'boot', 'config-editor', 'package.json'))('yaml')
const profileName = process.argv.includes('--profile')
  ? process.argv[process.argv.indexOf('--profile') + 1]
  : 'desktop'
const connect = !process.argv.includes('--no-connect')

/** 解析 DSH_HOME：与启动脚本同一套规则（空值 → ~/.dsh，~ 展开，转绝对路径）。 */
function dshHome() {
  const raw = process.env.DSH_HOME
  const fallback = join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
  if (raw === undefined || raw.trim() === '') return fallback
  const expanded = raw.trim().startsWith('~') ? join(process.env.USERPROFILE ?? '', raw.trim().slice(1)) : raw.trim()
  return resolve(expanded)
}

const profileDir = join(dshHome(), 'profiles', profileName)
const patchPath = join(profileDir, 'cordis.patch.yml')
if (!existsSync(patchPath)) {
  console.error(`probe-mcp: 找不到 ${patchPath}`)
  process.exit(1)
}

/**
 * `!!js` 在这些配置文件里只用于读环境变量与拼路径，求值范围就是 Loader 能拿到的
 * process/baseUrl/ctx。这里按同样的入参求值，不额外扩大权限。
 */
const jsTag = {
  tag: 'tag:yaml.org,2002:js',
  resolve: value => ({ $js: String(value) }),
}

const requireRoot = createRequire(join(repositoryRoot, 'package.json'))
const requireMcp = createRequire(join(repositoryRoot, 'packages', 'mcp', 'mcp-client', 'package.json'))
const { Config } = requireRoot('@deepseek-ai/dsh-mcp-client')
const { Client, StreamableHTTPClientTransport } = requireMcp('@modelcontextprotocol/client')
const { StdioClientTransport } = requireMcp('@modelcontextprotocol/client/stdio')

const baseUrl = pathToFileURL(patchPath).href
const fakeCtx = { get: () => undefined }

/** 求值 `{ $js }` 占位，递归处理数组与对象。 */
function resolveExpressions(value) {
  if (Array.isArray(value)) return value.map(resolveExpressions)
  if (typeof value === 'object' && value !== null) {
    if ('$js' in value) return Function('process', 'baseUrl', 'ctx', `return (${value.$js})`)(process, baseUrl, fakeCtx)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveExpressions(item)]))
  }
  return value
}

const patch = parseYaml(readFileSync(patchPath, 'utf8'), { customTags: [jsTag] })
const rows = []
for (const entry of Array.isArray(patch) ? patch : []) {
  for (const row of entry?.insert ?? []) {
    if (row?.name === '@deepseek-ai/dsh-mcp-client') rows.push(row)
  }
}

if (rows.length === 0) {
  console.error(`probe-mcp: ${patchPath} 里没有 @deepseek-ai/dsh-mcp-client 条目`)
  process.exit(1)
}

let failed = false
for (const row of rows) {
  const label = `${profileName}/${row.id}`
  let config
  try {
    config = Config(resolveExpressions(row.config))
  }
  catch (error) {
    failed = true
    console.error(`[${label}] config 被 mcp-client 拒绝：${error instanceof Error ? error.message : String(error)}`)
    continue
  }
  console.log(`[${label}] config ok: ${config.transport} ${config.serverName}`)
  if (!connect) continue

  const client = new Client({ name: 'dsh-probe-mcp', version: '0.0.1' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } })
  const transport = config.transport === 'stdio'
    ? new StdioClientTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
    })
    : new StreamableHTTPClientTransport(new URL(config.url))
  const started = Date.now()
  try {
    await client.connect(transport)
    const tools = await client.listTools()
    const names = tools.tools.map(tool => tool.name)
    const bytes = Buffer.byteLength(JSON.stringify(tools.tools))
    console.log(`[${label}] 连接成功 ${Date.now() - started}ms：${names.length} 个工具，schema ${bytes} 字节`)
    console.log(`[${label}] ${names.slice(0, 10).join(', ')}${names.length > 10 ? ', …' : ''}`)
  }
  catch (error) {
    failed = true
    console.error(`[${label}] 连接失败：${error instanceof Error ? error.message : String(error)}`)
    console.error(`[${label}] 服务没启动时这不影响宿主启动（failOnStartupError: false），但会话里不会有该服务的工具`)
  }
  finally {
    try { await client.close() } catch {}
  }
}

if (failed) process.exit(1)
console.log('probe-mcp: 全部正常')
