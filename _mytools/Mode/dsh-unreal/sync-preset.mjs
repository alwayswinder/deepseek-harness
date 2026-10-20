// 从上游 standard preset 生成本包的 cordis.patch.yml。
//
// Agent Preset 没有继承机制，所以本模式的 `plugins` 清单是
// `packages/bundle/web-app/presets/standard.patch.yml` 的副本，外加 UE 的两处改动
// （skill-filesystem 的 customSkillDirs、末尾的 mcp-unreal 行）。上游会持续改动
// 那份清单 —— 删掉一个 config 键就会让整个 preset 挂载失败，而挂载失败的 preset
// 会从模式选择器里消失（选择器只列能组出会话的 preset）。
//
// 用法：
//   node _mytools/Mode/dsh-unreal/sync-preset.mjs          # 重写文件
//   node _mytools/Mode/dsh-unreal/sync-preset.mjs --check  # 落后时 exit 1
//
// exit 2 表示上游已经没有本生成器要改的那几行了。

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = import.meta.dirname
const repositoryRoot = resolve(here, '..', '..', '..')
const upstreamPath = join(repositoryRoot, 'packages', 'bundle', 'web-app', 'presets', 'standard.patch.yml')
const outputPath = join(here, 'cordis.patch.yml')

/** 失败时报出本生成器期望上游保留的那一行。 */
function expect(condition, description) {
  if (!condition) {
    console.error(`sync-preset: upstream standard preset no longer provides ${description}`)
    console.error(`sync-preset: read ${upstreamPath} and update this generator`)
    process.exit(2)
  }
}

/** 本插件自己的技能目录，从安装它的 profile 解析，不写死盘符。 */
const skillDirsExpression = "!!js process.getBuiltinModule('node:path').join("
  + "process.getBuiltinModule('node:path').dirname("
  + "process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@local/dsh-mode-unreal/package.json')), 'skills')"

/**
 * MCP 行的配置，写成 JS 对象而不是硬编码的 YAML 文本：tools/check-config.mjs 用
 * 同一份对象去跑 `@deepseek-ai/dsh-mcp-client` 的 Config schema，这样"某个键改名了"
 * 会在装机前炸出来，而不是等整个 preset 挂载失败、模式从选择器里消失。
 *
 * 为什么用 streamable-http 直连而不是 stdio 拉起 Node 桥：UE 5.8 的
 * ModelContextProtocol 插件自带 HTTP MCP 服务（默认 :8000/mcp），少一个进程、少一份
 * 要维护的桥，也不受 Windows 沙箱完整性标签影响（那是 3ds Max 模式的主要坑）。
 * URL 可用 DSH_UNREAL_MCP_URL 覆盖（改了项目设置里的端口，或同时开两个编辑器时）。
 * toolCallTimeoutMs 放到 120s：PIE 启停、关卡加载、ProgrammaticToolset 脚本都可能
 * 超过默认的 60s。
 */
export const mcpConfig = {
  serverName: 'unreal',
  transport: 'streamable-http',
  url: { $js: "process.env.DSH_UNREAL_MCP_URL || 'http://127.0.0.1:8000/mcp'" },
  toolCallTimeoutMs: 120000,
  failOnStartupError: false,
}

/** `!!js` 表达式用双引号包住（表达式里只用单引号）；其余标量不安全时才加引号。 */
function renderScalar(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object' && value !== null && '$js' in value) return `!!js "${value.$js}"`
  const text = String(value)
  return /^[A-Za-z0-9_\-/.]+$/.test(text) ? text : `'${text}'`
}

const mcpRow = [
  '          - id: mcp-unreal',
  "            name: '@deepseek-ai/dsh-mcp-client'",
  '            config:',
  ...Object.entries(mcpConfig).map(([key, value]) => `              ${key}: ${renderScalar(value)}`),
]

const header = `# dsh-mode-unreal —— Unreal Engine 5.8 MCP 编辑模式（本地覆盖层，不属于上游仓库）
#
# 本文件由 sync-preset.mjs 生成：plugins 清单复制自上游
# packages/bundle/web-app/presets/standard.patch.yml，再追加本模式的两处改动
# （skill-filesystem 的 customSkillDirs、末尾的 mcp-unreal 行）。
# preset 没有继承机制，上游改 standard 后重跑：
#
#   node _mytools/Mode/dsh-unreal/sync-preset.mjs
#
# 上游删掉某个 config 键（例如 tool-subagent 的 toolFilter）会让整个 preset
# 挂载失败；挂载失败的 preset 不会出现在模式选择器里（选择器只列能组出会话的
# preset），只在「设置 → Agent 预设」里带错误标记显示。
#
# 该 presets 的 plugins 是"子插件清单"：MCP 与技能都只在这个模式的作用域内注册，
# 其它模式（standard / ptc）不受影响，因此不为它们付 token。`.split('\n')

const upstreamLines = readFileSync(upstreamPath, 'utf8').split(/\r?\n/)
while (upstreamLines.length > 0 && upstreamLines.at(-1).trim() === '') upstreamLines.pop()
// 上游头部注释描述的是 standard 的语义（例如"编辑器里保存的改动按 id 覆盖这一行"），
// 对本模式不再成立，所以整段丢掉，用本文件自己的 header。
const upstreamBody = upstreamLines.filter(line => !line.startsWith('#'))

const presetRow = upstreamBody.indexOf('    - id: preset-standard')
expect(presetRow !== -1, 'the `preset-standard` row')
const idLine = upstreamBody.indexOf('        id: standard')
expect(idLine !== -1, 'the preset `id: standard` line')
const orderLine = upstreamBody.indexOf('        order: 1')
expect(orderLine !== -1, 'the preset `order: 1` line')
const skillRow = upstreamBody.indexOf('          - id: skill-filesystem')
expect(skillRow !== -1, 'the `skill-filesystem` row')
expect(upstreamBody[skillRow + 1] === "            name: '@deepseek-ai/dsh-skill-filesystem'",
  "the `skill-filesystem` row's package name")
expect(upstreamBody[skillRow + 2] !== '            config:',
  'the `skill-filesystem` row without a config block (this generator inserts one)')

const lines = upstreamBody.map(line => {
  if (line === '    - id: preset-standard') return '    - id: preset-unreal'
  if (line === '        id: standard') return '        id: unreal'
  if (line === '        order: 1') return '        order: 6'
  return line
})
lines.splice(lines.indexOf('        id: unreal') + 1, 0,
  '        name: Unreal Engine',
  '        description: Unreal Engine 5.8 MCP 编辑模式：内置编辑器 MCP 服务（关卡、蓝图、材质、日志、PIE）。')
lines.splice(lines.indexOf("            name: '@deepseek-ai/dsh-skill-filesystem'") + 1, 0,
  '            config:',
  '              customSkillDirs:',
  `                - ${skillDirsExpression}`)

const content = [...header, ...lines, ...mcpRow, ''].join('\n')

/**
 * 只在作为脚本运行时才读写输出文件：tools/check-config.mjs 会 import 本模块取
 * `mcpConfig`，那次 import 不能有副作用。
 */
function isMain() {
  const entry = process.argv[1]
  if (entry === undefined) return false
  return resolve(entry).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
}

if (isMain()) {
  // 首次运行（还没有输出文件）也算"落后"，不能直接 readFileSync 抛异常。
  const current = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : ''
  const stale = current !== content

  if (process.argv.includes('--check')) {
    if (stale) {
      console.error('sync-preset: cordis.patch.yml is stale; rerun without --check')
      process.exit(1)
    }
    console.log('sync-preset: cordis.patch.yml is up to date')
    process.exit(0)
  }

  if (!stale) {
    console.log('sync-preset: cordis.patch.yml is already up to date')
    process.exit(0)
  }
  writeFileSync(outputPath, content)
  console.log(`sync-preset: rewrote ${outputPath} from ${upstreamPath}`)
}
