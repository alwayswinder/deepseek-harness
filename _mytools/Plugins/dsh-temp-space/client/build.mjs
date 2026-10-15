/**
 * Bundle the browser half: client/index.jsx -> client/client.js.
 *
 * The DSH client loads a plugin's browser half as a CommonJS factory registered
 * on `window.__ModuleLoader__.load`, with React supplied by the client module
 * system rather than by this bundle. esbuild is therefore told to treat React as
 * external and to use the classic JSX transform, and the wrapper below binds
 * React inside the factory: esbuild's classic transform emits bare
 * `React.createElement` calls, so without that binding every component would
 * fail at render time with "React is not defined".
 *
 * No dependency is installed for the build: this repository already carries
 * esbuild in its pnpm store, and a PATH esbuild is accepted when there is one.
 * Run: node client/build.mjs
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const repositoryRoot = resolve(packageRoot, '..', '..', '..')
const entry = join(here, 'index.jsx')
const staged = join(here, '.bundle.cjs')
const output = join(here, 'client.js')

/** The module id the DSH client registers this bundle under: its package name. */
const loaderId = '@local/dsh-temp-space'

/**
 * Find an esbuild CLI: this checkout's pnpm store first, then the PATH.
 * @returns absolute path of a runnable esbuild script, or undefined.
 */
function findEsbuild() {
  const hoisted = join(repositoryRoot, 'node_modules', 'esbuild', 'bin', 'esbuild')
  if (existsSync(hoisted)) return hoisted
  const store = join(repositoryRoot, 'node_modules', '.pnpm')
  let best
  let bestVersion = ''
  try {
    for (const name of readdirSync(store)) {
      const match = /^esbuild@(\d+\.\d+\.\d+)$/u.exec(name)
      if (match === null) continue
      const candidate = join(store, name, 'node_modules', 'esbuild', 'bin', 'esbuild')
      if (!existsSync(candidate)) continue
      // Prefer the newest store entry, so the build follows the checkout's own.
      const [major, minor, patch] = match[1].split('.').map(Number)
      const [bmajor, bminor, bpatch] = (bestVersion === '' ? '0.0.0' : bestVersion).split('.').map(Number)
      if (major > bmajor || (major === bmajor && (minor > bminor || (minor === bminor && patch >= bpatch)))) {
        best = candidate
        bestVersion = match[1]
      }
    }
  } catch {
    // A checkout without a pnpm store falls through to the PATH.
  }
  return best
}

const esbuild = findEsbuild()
if (esbuild === undefined) {
  throw new Error('temp-space: no esbuild found in this checkout\'s node_modules or on PATH')
}

execFileSync(process.execPath, [
  esbuild,
  entry,
  '--bundle',
  '--format=cjs',
  '--platform=browser',
  '--target=chrome100',
  '--jsx=transform',
  '--external:react',
  '--external:react/jsx-runtime',
  '--log-level=warning',
  `--outfile=${staged}`,
], { stdio: 'inherit' })

const bundled = readFileSync(staged, 'utf8')
rmSync(staged)

const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(loaderId)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
${bundled}
    return module.exports;
  }
});
`

writeFileSync(output, wrapped, 'utf8')
console.log(`temp-space: wrote ${output} (${bundled.length} bytes of bundle)`)
