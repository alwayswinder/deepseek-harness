// Health check for the declarative presets in the composed Web profile.
//
// Current DSH releases declare presets as `preset-*` plugin rows; the legacy
// $DSH_HOME/.agent-presets directory is no longer loaded. This script asks the
// built local CLI for the same composed profile that Web starts, then verifies
// that every package named inside each preset resolves from that profile.
//
// Usage: node _mytools/build/check-presets.mjs
// Exit code 1 means at least one preset names an unavailable package.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..', '..')
const cli = join(repositoryRoot, 'apps', 'cli', 'lib', 'bin.js')
if (!existsSync(cli)) {
  console.error(`built DSH CLI is missing at ${cli}; run _mytools/build.bat first`)
  process.exit(2)
}

const configured = process.env.DSH_HOME?.trim()
const rawHome = configured ? configured : join(process.env.USERPROFILE ?? '', '.dsh')
const dshHome = resolve(rawHome.startsWith('~') ? join(process.env.USERPROFILE ?? '', rawHome.slice(1)) : rawHome)
const profileBase = join(dshHome, 'profiles', 'web', 'cordis.yml')
const resolvers = [createRequire(profileBase), createRequire(join(repositoryRoot, 'apps', 'cli', 'package.json'))]

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

const presets = []
let current
for (const line of composed.split(/\r?\n/u)) {
  const topLevel = /^- id:\s+(.+)$/u.exec(line)
  if (topLevel !== null) {
    current = topLevel[1].startsWith('preset-')
      ? { id: topLevel[1].slice('preset-'.length), packages: new Set() }
      : undefined
    if (current !== undefined) presets.push(current)
    continue
  }
  if (current === undefined) continue
  const named = /^\s+name:\s+['"]?([^'"]+)['"]?\s*$/u.exec(line)
  if (named === null || named[1].startsWith('cordis:')) continue
  current.packages.add(named[1])
}

if (presets.length === 0) {
  console.error('the composed Web profile declares no preset-* rows')
  process.exit(1)
}

let broken = 0
for (const preset of presets) {
  const missing = []
  for (const name of preset.packages) {
    let resolved = false
    for (const resolver of resolvers) {
      try {
        resolver.resolve(name)
        resolved = true
        break
      } catch {
        // A row may come from the built profile or from the local CLI bundle.
      }
    }
    if (!resolved) missing.push(name)
  }
  if (missing.length > 0) broken += 1
  console.log(`${preset.id}: ${missing.length === 0 ? 'ok' : `unavailable: ${missing.join(', ')}`}`)
}
process.exit(broken === 0 ? 0 : 1)
