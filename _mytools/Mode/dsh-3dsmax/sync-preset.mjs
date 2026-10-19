// Regenerate this package's cordis.patch.yml from the upstream standard preset.
//
// An Agent Preset has no inheritance, so this mode's `plugins` list is a copy of
// `packages/bundle/web-app/presets/standard.patch.yml` plus the two 3ds Max
// additions (skill directory, MCP server). Upstream periodically changes that
// list — a removed config key makes the whole preset fail to mount, and a broken
// preset disappears from the mode picker (the pickers choose the next session's
// composition, so they list only presets that can compose one).
//
// Usage:
//   node _mytools/Mode/dsh-3dsmax/sync-preset.mjs          # rewrite the file
//   node _mytools/Mode/dsh-3dsmax/sync-preset.mjs --check  # exit 1 when stale
//
// Exit 2 means upstream no longer has the lines this generator transforms.

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const here = import.meta.dirname
const repositoryRoot = resolve(here, '..', '..', '..')
const upstreamPath = join(repositoryRoot, 'packages', 'bundle', 'web-app', 'presets', 'standard.patch.yml')
const outputPath = join(here, 'cordis.patch.yml')

/** Fail with a message naming the line this generator expected upstream to keep. */
function expect(condition, description) {
  if (!condition) {
    console.error(`sync-preset: upstream standard preset no longer provides ${description}`)
    console.error(`sync-preset: read ${upstreamPath} and update this generator`)
    process.exit(2)
  }
}

/** The plugin's own skill directory, resolved from the profile that installs this package. */
const skillDirsExpression = "!!js process.getBuiltinModule('node:path').join("
  + "process.getBuiltinModule('node:path').dirname("
  + "process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@local/dsh-mode-3dsmax/package.json')), 'skills')"

/** The 3ds Max MCP server row appended after the copied standard rows. */
const mcpRow = `          - id: mcp-3dsmax
            name: '@deepseek-ai/dsh-mcp-client'
            config:
              serverName: 3dsmax
              transport: stdio
              command: uv
              args:
                - run
                - --directory
                - !!js process.env.DSH_3DSMAX_MCP_DIR || process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@local/dsh-mode-3dsmax/package.json')), 'upstream', '3dsmax-mcp')
                - 3dsmax-mcp
              failOnStartupError: false`.split('\n')

const header = `# dsh-mode-3dsmax —— 3ds Max MCP 编辑模式（本地覆盖层，不属于上游仓库）
#
# 本文件由 sync-preset.mjs 生成：plugins 清单复制自上游
# packages/bundle/web-app/presets/standard.patch.yml，再追加本模式的两处改动
# （skill-filesystem 的 customSkillDirs、末尾的 mcp-3dsmax 行）。
# preset 没有继承机制，上游改 standard 后重跑：
#
#   node _mytools/Mode/dsh-3dsmax/sync-preset.mjs
#
# 上游删掉某个 config 键（例如 tool-subagent 的 toolFilter）会让整个 preset
# 挂载失败；挂载失败的 preset 不会出现在模式选择器里（选择器只列能组出会话的
# preset），只在「设置 → Agent 预设」里带错误标记显示。
#
# 该 presets 的 plugins 是"子插件清单"：MCP 与技能都只在这个模式的作用域内注册，
# 其它模式（standard / ptc）不受影响，因此不为它们付 token。`.split('\n')

const upstreamLines = readFileSync(upstreamPath, 'utf8').split(/\r?\n/)
while (upstreamLines.length > 0 && upstreamLines.at(-1).trim() === '') upstreamLines.pop()
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
  if (line === '    - id: preset-standard') return '    - id: preset-3dsmax'
  if (line === '        id: standard') return '        id: 3dsmax'
  if (line === '        order: 1') return '        order: 5'
  return line
})
lines.splice(lines.indexOf('        id: 3dsmax') + 1, 0,
  '        name: 3ds Max',
  '        description: 3ds Max MCP 编辑模式：内置 3dsmax-mcp 工具与 3ds Max 专用技能（控制器迁移、实时场景操控）。')
lines.splice(lines.indexOf("            name: '@deepseek-ai/dsh-skill-filesystem'") + 1, 0,
  '            config:',
  '              customSkillDirs:',
  `                - ${skillDirsExpression}`)

const content = [...header, ...lines, ...mcpRow, ''].join('\n')
const current = readFileSync(outputPath, 'utf8')
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
