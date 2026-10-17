// Health check for the declarative presets in the composed Web profile.
//
// Current DSH releases declare presets as `preset-*` plugin rows; the legacy
// $DSH_HOME/.agent-presets directory is no longer loaded. This script asks the
// built local CLI for the same composed profile that Web starts, then verifies
// that every package named inside each preset resolves through that profile's
// runtime resolution — the table `dsh` installs for module loading, which also
// covers plugins owned by a bundle's own node_modules.
//
// Rows carrying a literal `disabled: true` never load, so their packages are
// not required to resolve. Rows disabled by a `!!js` expression have no static
// value here and are still checked.
//
// Usage: node _mytools/build/check-presets.mjs
// Exit code 1 means at least one preset names an unavailable package.
// Exit code 2 means the check could not run.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '..', '..')
const cli = join(repositoryRoot, 'apps', 'cli', 'lib', 'bin.js')
if (!existsSync(cli)) {
  console.error(`built DSH CLI is missing at ${cli}; run _mytools/build/build.bat first`)
  process.exit(2)
}

const configured = process.env.DSH_HOME?.trim()
const rawHome = configured ? configured : join(process.env.USERPROFILE ?? '', '.dsh')
const dshHome = resolve(rawHome.startsWith('~') ? join(process.env.USERPROFILE ?? '', rawHome.slice(1)) : rawHome)
const profileDir = join(dshHome, 'profiles', 'web')
const installAnchor = join(repositoryRoot, 'apps', 'cli', 'package.json')
// Fallback for names the runtime resolution does not list, and for a checkout
// whose built app-boot is unavailable.
const resolvers = [createRequire(join(profileDir, 'cordis.yml')), createRequire(installAnchor)]

/** Count the leading spaces of a YAML line. */
function indentOf(line) {
  return line.length - line.trimStart().length
}

/** Split a bare specifier into its package name, keeping a scope together. */
function packageNameOf(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/**
 * Read the runtime resolution the CLI installs for the Web profile.
 * @returns package name → package directory, or `undefined` when the built
 * app-boot library cannot provide it.
 */
async function loadRuntimePackages() {
  const library = join(repositoryRoot, 'packages', 'boot', 'app-boot', 'lib', 'index.js')
  if (!existsSync(library)) return undefined
  try {
    const { loadProfile, createRuntimeResolution } = await import(pathToFileURL(library).href)
    const profile = loadProfile('dsh', 'web', installAnchor, dshHome)
    const resolution = await createRuntimeResolution({ installAnchor, home: dshHome, profile })
    return new Map(resolution.entries.map(entry => [entry.name, entry.packageDir]))
  } catch (error) {
    console.error(`could not read the Web profile runtime resolution: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

/** Whether a plugin specifier resolves from one package directory. */
function resolvesFrom(packageDir, specifier) {
  try {
    createRequire(join(packageDir, 'package.json')).resolve(specifier)
    return true
  } catch {
    return false
  }
}

let composed
try {
  composed = execFileSync(process.execPath, [cli, '--profile', 'web', '--dump-config'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
  })
} catch (error) {
  console.error(`could not compose the Web profile: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}

const runtimePackages = await loadRuntimePackages()
if (runtimePackages === undefined) {
  console.error('the Web profile runtime resolution is unavailable')
  process.exit(2)
}

const lines = composed.split(/\r?\n/u)
const presets = []
let current
let inPlugins = false
let rowDashIndent
for (const [index, line] of lines.entries()) {
  const topLevel = /^- id:\s+(.+)$/u.exec(line)
  if (topLevel !== null) {
    current = topLevel[1].startsWith('preset-')
      ? { id: topLevel[1].slice('preset-'.length), packages: new Map() }
      : undefined
    inPlugins = false
    rowDashIndent = undefined
    if (current !== undefined) presets.push(current)
    continue
  }
  if (current === undefined) continue
  // A preset row's own `name` is a display label, not a package. Only child plugin
  // rows nested under `plugins:` name resolvable packages.
  if (/^\s+plugins:\s*$/u.test(line)) {
    inPlugins = true
    continue
  }
  if (!inPlugins) continue
  const row = /^(\s*)- id:\s+/u.exec(line)
  if (row !== null) {
    rowDashIndent = row[1].length
    continue
  }
  const named = /^(\s+)name:\s+['"]?([^'"]+)['"]?\s*$/u.exec(line)
  if (named === null || named[2].startsWith('cordis:')) continue
  // A plugin row's `name` sits two columns past its `- id:` dash; deeper
  // `name` keys belong to a config value, not to a loadable row.
  if (rowDashIndent === undefined || named[1].length !== rowDashIndent + 2) continue
  let disabled = false
  for (let next = index + 1; next < lines.length; next++) {
    const property = lines[next]
    if (property.trim() === '') continue
    const indent = indentOf(property)
    if (indent < named[1].length) break
    if (indent !== named[1].length) continue
    const flag = /^\s*disabled:\s*(\S.*)$/u.exec(property)
    if (flag === null) continue
    disabled = /^(true|yes|on)$/iu.test(flag[1].trim())
    break
  }
  const name = named[2]
  // One row may repeat a package with a different flag; an enabled row still
  // requires the package to resolve.
  current.packages.set(name, (current.packages.get(name) ?? true) && disabled)
}

if (presets.length === 0) {
  console.error('the composed Web profile declares no preset-* rows')
  process.exit(1)
}

/** Whether a plugin row names a package the composed profile can load. */
function available(specifier) {
  const packageName = packageNameOf(specifier)
  const packageDir = runtimePackages.get(packageName)
  // The row may name the resolved package itself; runtime resolution already
  // selected it, so only subpaths need export validation.
  if (packageDir !== undefined && specifier === packageName) return true
  if (packageDir !== undefined) return resolvesFrom(packageDir, specifier)
  return resolvers.some(resolver => {
    try {
      resolver.resolve(specifier)
      return true
    } catch {
      // A row may come from the built profile or from the local CLI bundle.
      return false
    }
  })
}

let broken = 0
for (const preset of presets) {
  const missing = []
  let skipped = 0
  for (const [name, disabled] of preset.packages) {
    if (disabled) {
      skipped += 1
      continue
    }
    if (!available(name)) missing.push(name)
  }
  if (missing.length > 0) broken += 1
  const suffix = skipped === 0 ? '' : ` (${skipped} disabled)`
  console.log(`${preset.id}: ${missing.length === 0 ? `ok${suffix}` : `unavailable: ${missing.join(', ')}`}`)
}
process.exit(broken === 0 ? 0 : 1)
