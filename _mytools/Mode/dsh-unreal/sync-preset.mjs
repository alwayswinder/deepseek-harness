// 从上游 standard preset 生成本包的 cordis.patch.yml。
//
// Agent Preset 没有继承机制，所以本模式的 `plugins` 清单是
// `packages/bundle/web-app/presets/standard.patch.yml` 的副本，外加本模式唯一的改动
// （skill-filesystem 的 customSkillDirs）。Unreal 的 MCP 服务不再放进 preset：
// 它注册在每个 profile 的 cordis.patch.yml，所有会话都直接带工具。上游会持续改动
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

const header = `# dsh-mode-unreal —— Unreal Engine 技能模式（本地覆盖层，不属于上游仓库）
#
# 本文件由 sync-preset.mjs 生成：plugins 清单复制自上游
# packages/bundle/web-app/presets/standard.patch.yml，再加上本模式唯一的改动
# （skill-filesystem 的 customSkillDirs）。
# preset 没有继承机制，上游改 standard 后重跑：
#
#   node _mytools/Mode/dsh-unreal/sync-preset.mjs
#
# 上游删掉某个 config 键（例如 tool-subagent 的 toolFilter）会让整个 preset
# 挂载失败；挂载失败的 preset 不会出现在模式选择器里（选择器只列能组出会话的
# preset），只在「设置 → Agent 预设」里带错误标记显示。
#
# Unreal MCP 不在这个 preset 里：它注册在 profile 的 cordis.patch.yml，
# 每个会话都带 mcp__unreal__* 工具，不再需要先选本模式。`.split('\n')

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
  '        description: Unreal Engine 技能模式：编辑器 MCP 的路由与安全边界等专用技能；MCP 工具已全局加载。')
lines.splice(lines.indexOf("            name: '@deepseek-ai/dsh-skill-filesystem'") + 1, 0,
  '            config:',
  '              customSkillDirs:',
  `                - ${skillDirsExpression}`)

const content = [...header, ...lines, ''].join('\n')

/** 只在作为脚本运行时才读写输出文件（`--check` 与生成共用同一份 content）。 */
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
