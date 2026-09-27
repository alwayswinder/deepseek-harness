// Pre-build health check for this working copy.
//
// It runs before anything destructive (before `pnpm run clean`, before the
// Electron instance is stopped) and answers the question the build itself only
// answers with an unrelated stack trace: does this checkout still describe a
// repository that this machine can build? The checks are the ones an upstream
// merge breaks most often, each with the fix named:
//
//   - the Node / pnpm the machine runs against the root package.json engines
//   - every TypeScript project reference against what is on disk (an upstream
//     package that was renamed or deleted leaves references behind, and `tsc -b`
//     then fails somewhere else entirely)
//   - packages that exist but no compiler face aggregates
//   - the peer links the out-of-tree plugins import from their own directory
//
// Usage:
//   node _mytools/build/preflight.mjs [--mode web|desktop|quick|repair] [--json]
//
// `--root <path>` checks another checkout instead of this script's own
// repository; it exists so the checks themselves can be exercised against a
// deliberately broken tree.
//
// Exit codes: 0 = clear to build, 2 = a blocking problem, 1 = the check itself
// failed to run.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** @param {string} argv - process argv tail. @returns parsed options. */
function parseArgs(argv) {
  const options = { mode: 'desktop', json: false, root: resolve(import.meta.dirname, '..', '..') }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') options.json = true
    else if (arg === '--mode') { options.mode = argv[index + 1] ?? options.mode; index += 1 }
    else if (arg === '--root') { options.root = resolve(argv[index + 1] ?? options.root); index += 1 }
  }
  return options
}

const options = parseArgs(process.argv.slice(2))
const repositoryRoot = options.root

/** Whether a path is a directory. @param path - absolute path. @returns the answer. */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    // Missing, or replaced by a file: either way not a directory.
    return false
  }
}

/** Read a file as text. @param path - absolute path. @returns contents, or undefined. */
function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    // The caller reports absence itself, with the path that is missing.
    return undefined
  }
}

/**
 * Parse a JSON file that may carry comments and a trailing comma, the way
 * TypeScript's own config reader accepts them. Strings are honoured, so a `//`
 * inside a path is not mistaken for a comment.
 * @param text - file contents.
 * @returns the parsed value.
 */
function parseJsonc(text) {
  let out = ''
  let inString = false
  let quote = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (inString) {
      out += char
      if (char === '\\') { out += next ?? ''; index += 1; continue }
      if (char === quote) inString = false
      continue
    }
    if (char === '"' || char === "'") { inString = true; quote = char; out += char; continue }
    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      out += '\n'
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 1
      continue
    }
    out += char
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

const findings = []
/**
 * Record one finding.
 * @param level - `error` blocks the build, `warn` is reported and skipped.
 * @param title - one line naming the problem.
 * @param detail - the evidence and the fix.
 */
function report(level, title, detail) {
  findings.push({ level, title, detail })
}

// ---- the machine ------------------------------------------------------------

/** Split an engines range into its `||` clauses. @param range - the declared range. @returns clauses. */
function rangeClauses(range) {
  return range.split('||').map(clause => clause.trim()).filter(clause => clause !== '')
}

/** The numeric parts of a version. @param version - a semver string. @returns its numbers. */
function versionParts(version) {
  return version.replace(/^v/u, '').split('-')[0].split('.').map(part => Number.parseInt(part, 10))
}

/**
 * Whether a version satisfies one simple clause (`^1.2`, `>=22.19`, `24.x`, `*`).
 * @param version - the running version.
 * @param clause - one engines clause.
 * @returns `true`, `false`, or `undefined` when the clause is not understood.
 */
function satisfiesClause(version, clause) {
  const actual = versionParts(version)
  const wildcard = clause.match(/^([\^~]|>=|>|<=|<|=)?\s*v?(\d+)(?:\.(\d+|\*|x))?(?:\.(\d+|\*|x))?/u)
  if (wildcard === null) return clause === '*' ? true : undefined
  const [, operator = '', major, minor, patch] = wildcard
  const wanted = [Number.parseInt(major, 10), minor === undefined || minor === '*' || minor === 'x' ? undefined : Number.parseInt(minor, 10), patch === undefined || patch === '*' || patch === 'x' ? undefined : Number.parseInt(patch, 10)]
  const compare = (left, right) => left === right ? 0 : left < right ? -1 : 1
  const atLeast = (index) => {
    for (let position = 0; position <= index; position += 1) {
      if (wanted[position] === undefined) return true
      const order = compare(actual[position] ?? 0, wanted[position])
      if (order !== 0) return order > 0
    }
    return true
  }
  if (wanted[0] === undefined) return true
  switch (operator) {
    case '>=': return atLeast(2)
    case '>': return !atLeast(2)
    case '<': return compare(actual[0] ?? 0, wanted[0]) < 0
    case '<=': return compare(actual[0] ?? 0, wanted[0]) <= 0
    case '~': return actual[0] === wanted[0] && atLeast(1)
    case '^':
      // A caret below 1.0 pins the minor, which is how this repository declares
      // Node engines; anything else keeps the usual major-level meaning.
      return wanted[0] === 0 ? actual[0] === 0 && actual[1] === wanted[1] && atLeast(2) : actual[0] === wanted[0] && atLeast(1)
    default: return wanted[1] === undefined ? actual[0] === wanted[0] : atLeast(2) && actual[0] === wanted[0]
  }
}

/**
 * Whether a version satisfies an engines range, treating an unparsable clause as
 * unknown rather than as a failure: this check exists to explain a build that
 * would otherwise fail somewhere else, never to invent a refusal.
 * @param version - the running version.
 * @param range - the declared range.
 * @returns `true`, `false`, or `undefined` when nothing could be decided.
 */
function satisfies(version, range) {
  let decided
  for (const clause of rangeClauses(range)) {
    const result = satisfiesClause(version, clause)
    if (result === true) return true
    if (result === undefined) decided = undefined
    else if (decided !== undefined) decided = false
  }
  return decided
}

const rootManifest = JSON.parse(readText(join(repositoryRoot, 'package.json')) ?? '{}')
const engines = rootManifest.engines ?? {}
if (typeof engines.node === 'string') {
  const verdict = satisfies(process.versions.node, engines.node)
  if (verdict === false) {
    report('error', `Node ${process.versions.node} is outside the required range ${engines.node}`,
      'The build runs TypeScript and Vite through this Node. Install a supported Node (nvm-windows or the installer), then run this build again.')
  } else if (verdict === undefined) {
    report('warn', `Node ${process.versions.node}: engines.node "${engines.node}" was not understood`,
      'Ignoring the check rather than guessing; Node version problems surface as build errors if they exist.')
  }
}
if (typeof rootManifest.packageManager === 'string') {
  findings.push({ level: 'info', title: `declared package manager: ${rootManifest.packageManager}`, detail: '' })
}

// ---- the repository the build describes -------------------------------------

/** Project reference paths reachable from one config, in declaration order. */
function referencePaths(configPath, seen) {
  const text = readText(configPath)
  if (text === undefined) return undefined
  let parsed
  try {
    parsed = parseJsonc(text)
  } catch (error) {
    report('warn', `unreadable TypeScript config: ${configPath.slice(repositoryRoot.length + 1)}`,
      `${error instanceof Error ? error.message : String(error)}`)
    return []
  }
  const found = []
  for (const reference of parsed.references ?? []) {
    if (typeof reference?.path !== 'string') continue
    const target = resolve(join(configPath, '..'), reference.path)
    if (seen.has(target)) continue
    seen.add(target)
    found.push(target)
  }
  return found
}

const faceConfigs = ['tsconfig.host.json', 'tsconfig.client.json', 'tsconfig.json']
  .map(name => join(repositoryRoot, name))
  .filter(path => existsSync(path))
if (faceConfigs.length === 0) {
  report('error', 'no tsconfig.host.json, tsconfig.client.json, or tsconfig.json at the repository root',
    'The build describes its packages through these configs. The checkout looks incomplete.')
}
const reachable = new Set()
const missing = new Set()
const queue = [...faceConfigs]
while (queue.length > 0) {
  const configPath = queue.shift()
  const references = referencePaths(configPath, reachable)
  if (references === undefined) continue
  for (const target of references) {
    // A reference names either a project directory or one of its face configs
    // (`packages/<group>/<pkg>/tsconfig.host.json`), so both spellings are
    // normal and only a path that exists as neither is a problem.
    if (!existsSync(target)) { missing.add(target); continue }
    const directory = isDirectory(target) ? target : dirname(target)
    if (isDirectory(directory)) reachable.add(directory)
    if (!isDirectory(target)) continue
    const nested = join(target, 'tsconfig.json')
    if (existsSync(nested)) queue.push(nested)
    else if (!existsSync(join(target, 'package.json'))) {
      report('warn', `project reference without a package or a tsconfig: ${target.slice(repositoryRoot.length + 1)}`,
        'The referenced directory exists but holds neither; the compiler will fail when it reads it.')
    }
  }
}
for (const target of missing) {
  report('error', `project reference points at a missing path: ${target.slice(repositoryRoot.length + 1)}`,
    'An upstream merge renamed or removed this package while a tsconfig still references it. Fix the referencing config (or re-merge the package); every later compiler error is a symptom of this one.')
}

// Packages on disk that no compiler face can reach would silently never build.
const packageDirectories = []
for (const group of readdirSync(join(repositoryRoot, 'packages'), { withFileTypes: true })) {
  if (!group.isDirectory()) continue
  const groupPath = join(repositoryRoot, 'packages', group.name)
  for (const entry of readdirSync(groupPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const packagePath = join(groupPath, entry.name)
    if (existsSync(join(packagePath, 'package.json'))) packageDirectories.push(packagePath)
  }
}
const unreferenced = packageDirectories.filter(path => !reachable.has(path))
if (unreferenced.length > 0) {
  const names = unreferenced.map(path => path.slice(repositoryRoot.length + 1)).sort()
  report('warn', `${names.length} package director${names.length === 1 ? 'y' : 'ies'} reachable from no compiler face`,
    `${names.slice(0, 8).join(', ')}${names.length > 8 ? ', ...' : ''} - expected right after an upstream merge that added a package and before its aggregate entry.`)
}

// ---- the out-of-tree plugins ------------------------------------------------

const pluginPeerLinks = ['schemastery', 'dsh-credentials'].map(name => join(repositoryRoot, '_mytools', 'Plugins', 'node_modules', '@deepseek-ai', name))
const missingPeerLinks = pluginPeerLinks.filter(path => !existsSync(path))
if (missingPeerLinks.length > 0) {
  report('warn', `${missingPeerLinks.length} out-of-tree plugin peer link(s) missing`,
    'build\\ensure-plugin-modules.bat recreates them; the build runs it before anything else.')
}

// ---- report -----------------------------------------------------------------

const errors = findings.filter(finding => finding.level === 'error')
const warnings = findings.filter(finding => finding.level === 'warn')

if (options.json) {
  process.stdout.write(`${JSON.stringify({ mode: options.mode, ok: errors.length === 0, errors, warnings }, null, 2)}\n`)
} else {
  for (const finding of findings) {
    if (finding.level === 'info') continue
    console.log(`[preflight] ${finding.level === 'error' ? 'ERROR' : 'warning'}: ${finding.title}`)
    if (finding.detail !== '') console.log(`[preflight]   ${finding.detail}`)
  }
}

if (errors.length > 0) {
  if (!options.json) {
    console.log('')
    console.log(`[preflight] ${errors.length} blocking problem(s). Fixing these by hand is usually faster than`)
    console.log('[preflight] reading the compiler output they cause; build.bat repair is the blunt fallback.')
  }
  process.exit(2)
}
if (!options.json) {
  console.log(warnings.length === 0
    ? '[preflight] No problems found.'
    : `[preflight] ${warnings.length} warning(s); continuing.`)
}
