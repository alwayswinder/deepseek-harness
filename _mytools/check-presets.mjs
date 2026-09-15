// Health check for the presets under $DSH_HOME/.agent-presets.
//
// An upstream merge renames or removes harness packages, and a preset copied
// from an older shipped preset keeps naming the old rows. This runs the
// installed discovery code against the profile the Web host loads, so the
// verdict matches the roster card in the Web UI; exit code 1 means at least one
// preset is broken.
//
// Usage: node _mytools/check-presets.mjs [--all]
//   --all  also scan the presets shipped inside @deepseek-ai/dsh-agent-presets
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const all = process.argv.includes('--all')
// Blank means unset; a leading ~ expands, matching the harness's own resolution.
const configured = process.env.DSH_HOME?.trim()
const rawHome = configured ? configured : join(process.env.USERPROFILE ?? '', '.dsh')
const home = resolve(rawHome.startsWith('~') ? join(process.env.USERPROFILE ?? '', rawHome.slice(1)) : rawHome)

const discovery = join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'lib', 'index.js')
if (!existsSync(discovery)) {
  console.error(`agent-presets is not installed at ${discovery}; set DSH_HOME to the home the host runs with`)
  process.exit(2)
}

const { scanRoot, SHIPPED_PRESET_ROOT } = await import(pathToFileURL(discovery).href)
// The base a row's package name resolves from: the profile the host loads.
const harnessBase = pathToFileURL(join(home, 'profiles', 'web', 'cordis.yml')).href

const roots = [{ path: join(home, '.agent-presets'), label: 'user' }]
// SHIPPED_PRESET_ROOT is already a filesystem path.
if (all) roots.push({ path: SHIPPED_PRESET_ROOT, label: 'shipped' })

let broken = 0
for (const root of roots) {
  for (const preset of await scanRoot({ path: root.path, trust: 'user' }, harnessBase)) {
    if (preset.broken !== undefined) broken += 1
    console.log(`${root.label}/${preset.id}: ${preset.broken ?? 'ok'}`)
  }
}
process.exit(broken === 0 ? 0 : 1)
