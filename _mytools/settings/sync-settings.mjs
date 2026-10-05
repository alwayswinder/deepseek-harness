// Portable settings: move what this machine's DSH writes for itself into the
// checked-in files beside this script, and back into a machine that pulls them.
//
// Two artifacts travel this way, each with its own file and its own apply step:
//
//   pet-settings.yml  the `little-icon` section of a profile patch
//                     (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`), which
//                     the pet's settings page writes and which never enters git.
//                     Merge is per field and rewrites one row of that patch.
//   keybindings.json  the Desktop's shortcut document
//                     (`<userData>/keybindings.json`, the directory the launcher
//                     pins to `$DSH_HOME/desktop/electron-user-data`), which the
//                     Electron main process owns and rewrites whole.
//
// Usage:
//   node _mytools/settings/sync-settings.mjs export [--profile desktop] [--only pet|keybindings]
//   node _mytools/settings/sync-settings.mjs apply  [--profile desktop] [--force] [--quiet] [--only pet|keybindings]
//   node _mytools/settings/sync-settings.mjs status [--profile desktop] [--only pet|keybindings]
//
// `--dsh-home <path>` points the script at another harness home, which is how
// the export/apply pair is exercised without touching this machine's settings.
// `--only` narrows a run to one artifact, which is what the two automatic
// callers do: the host half exports the pet when its settings change, and the
// shortcut document when the Desktop rewrites it.
//
// `apply` writes a machine's file only when the checked-in one changed since
// that machine last applied it, so a value edited here survives until the file
// changes again; `--force` applies regardless. The profile patch is written
// through the same YAML document the app itself edits, which keeps its comments
// and its `!!js` tags. Window position and run-time state (`position.json`,
// `state.json`) stay per machine and are not part of any of these files.
//
// Exit codes: 0 = done, 1 = nothing was done because something is wrong.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

/** Repository root, derived from this script's own location (`_mytools/settings`). */
const repositoryRoot = resolve(import.meta.dirname, '..', '..')

/** The checked-in pet settings this script reads and writes. */
const settingsFile = join(import.meta.dirname, 'pet-settings.yml')

/** The checked-in Desktop shortcut document this script reads and writes. */
const keybindingsFile = join(import.meta.dirname, 'keybindings.json')

/**
 * The `schemaVersion`s the product's own parser accepts. A document outside
 * them is left alone by the app, so carrying one between machines would only
 * spread a file no machine can read.
 */
const KEYBINDINGS_VERSIONS = [1, 2]

/**
 * The `yaml` package the profile patch is parsed and written with, loaded from
 * the package that already depends on it: the app's own config editor. Reusing
 * one library keeps the file this script rewrites byte-compatible with what the
 * settings page writes, comments and `!!js` tags included.
 * @returns the `yaml` module.
 */
function loadYaml() {
  const from = join(repositoryRoot, 'packages', 'boot', 'config-editor', 'package.json')
  try {
    return createRequire(from)('yaml')
  } catch (error) {
    throw new Error(`could not load "yaml" through ${from}: ${error.message}; is this checkout installed?`)
  }
}

const YAML = loadYaml()

/** Profile patch entry id of the pet plugin, as its `cordis.patch.yml` inserts it. */
const ENTRY_ID = 'little-icon'

/** Package name the pet is registered under, used to check a profile really loads it. */
const PACKAGE_NAME = 'dsh-little-icon'

/** Tag the harness uses for `!!js` expression scalars inside a profile patch. */
const JS_TAG = 'tag:yaml.org,2002:js'

/** Format version of `pet-settings.yml`, bumped when its own layout changes. */
const FORMAT_VERSION = 1

/** Header written above `pet-settings.yml`, kept identical on every export. */
const FILE_HEADER = [
  '# 桌宠便携设置：little-icon 段的一份可移植副本，跟着 git 走。',
  '#',
  '# 本机 → 仓库：双击 save-settings.bat，把本机 profile 的设置抄到这里，',
  '#   然后自己 git add / commit / push。',
  '# 仓库 → 本机：启动 DSH 前由 build\\start-desktop.bat 自动合并；只有这份文件',
  '#   变了才会覆盖本机设置，本机自己改过的值会保留到文件下次更新。',
  '# 手改这份文件同样有效：config 段就是设置页里的字段，没写到的字段用插件默认值。',
  '',
  '',
].join('\n')

/**
 * The harness home, resolved the way the harness resolves it: blank or
 * whitespace-only `DSH_HOME` counts as unset and falls back to `~/.dsh`, a
 * leading `~` expands to the user directory, and the result is absolute.
 * @returns absolute harness home.
 */
function resolveDshHome() {
  const raw = process.env.DSH_HOME
  const value = raw === undefined ? '' : raw.trim()
  if (value === '') return join(homedir(), '.dsh')
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return resolve(value)
}

/**
 * Where this harness home keeps the Desktop's shortcut document. The launcher
 * pins Electron's userData to a directory under the home (`--user-data-dir`,
 * build/start-desktop.bat); the development launcher can point it elsewhere and
 * says so in the environment, which wins here for the same reason it wins there.
 * @param dshHome - resolved harness home.
 * @returns absolute path of `keybindings.json`.
 */
function keybindingsPath(dshHome) {
  const configured = process.env.DSH_DESKTOP_USER_DATA_DIR
  const directory = configured !== undefined && configured.trim() !== ''
    ? resolve(configured.trim())
    : join(dshHome, 'desktop', 'electron-user-data')
  return join(directory, 'keybindings.json')
}

/** @param {string[]} argv - process argv tail. @returns parsed options. */
function parseArgs(argv) {
  const options = { mode: argv[0] ?? 'status', profile: 'desktop', force: false, quiet: false, only: 'all', dshHome: undefined }
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile') { options.profile = argv[index + 1] ?? options.profile; index += 1 }
    else if (arg === '--only') { options.only = argv[index + 1] ?? options.only; index += 1 }
    else if (arg === '--dsh-home') { options.dshHome = argv[index + 1]; index += 1 }
    else if (arg === '--force') options.force = true
    else if (arg === '--quiet') options.quiet = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!['all', 'pet', 'keybindings'].includes(options.only)) {
    throw new Error(`unknown --only value "${options.only}"; expected pet or keybindings`)
  }
  if (!['export', 'apply', 'status'].includes(options.mode)) {
    throw new Error(`unknown mode "${options.mode}"; expected export, apply, or status`)
  }
  if (options.dshHome !== undefined && options.dshHome.trim() !== '') {
    process.env.DSH_HOME = options.dshHome
  }
  return options
}

/**
 * Read a file as text.
 * @param {string} path - absolute path.
 * @returns contents, or undefined when the file is absent.
 */
function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * Write a file through a temporary neighbour so a reader never sees a partial
 * document. The profile patch is read by the app at boot and by this script at
 * the next export, and both would otherwise be able to catch half a file.
 * @param {string} path - absolute destination.
 * @param {string} text - complete contents.
 */
function writeAtomic(path, text) {
  const temporary = `${path}.tmp-${process.pid}`
  try {
    writeFileSync(temporary, text, { mode: 0o600 })
    renameSync(temporary, path)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

/**
 * Parse a profile patch into an editable YAML document, with `!!js` expressions
 * resolved to the strings the settings page shows.
 * @param {string} text - patch document.
 * @param {string} path - path the text came from, for error messages.
 * @returns parsed document.
 */
function parsePatch(text, path) {
  const document = YAML.parseDocument(text, { customTags: [{ tag: JS_TAG, resolve: (value) => value }] })
  if (document.errors.length > 0) throw new Error(`${path}: ${document.errors[0].message}`)
  if (!YAML.isSeq(document.contents)) throw new Error(`${path}: the profile patch must be a YAML sequence`)
  return document
}

/**
 * Index of the pet's row in a patch document: the last id-targeted row, since
 * a later row overrides an earlier one. Rows that insert entries are not
 * configuration and are skipped, matching the app's own editor.
 * @param {import('yaml').Document} document - parsed patch.
 * @returns row index, or -1 when the profile carries no pet settings.
 */
function findEntryIndex(document) {
  const items = document.contents.items
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (!YAML.isMap(item) || item.has('insert')) continue
    if (document.getIn([index, 'id']) === ENTRY_ID) return index
  }
  return -1
}

/**
 * Read one path out of a patch document as plain data. `getIn` answers with a
 * node for every collection, and the rest of this script compares and writes
 * settings as plain values.
 * @param {import('yaml').Document} document - parsed patch.
 * @param {readonly (string | number)[]} path - path inside the document.
 * @returns the plain value, or undefined when the path is absent.
 */
function valueIn(document, path) {
  const node = document.getIn(path, true)
  if (node === undefined) return undefined
  return typeof node?.toJS === 'function' ? node.toJS(document) : node
}

/**
 * Whether a node subtree contains a `!!js` expression.
 * @param {unknown} node - YAML node, or a plain value.
 * @returns the answer.
 */
function containsJsTag(node) {
  if (node === null || typeof node !== 'object') return false
  if (YAML.isScalar(node)) return node.tag === JS_TAG
  if (YAML.isSeq(node)) return node.items.some(containsJsTag)
  if (YAML.isMap(node)) return node.items.some(pair => containsJsTag(pair.key) || containsJsTag(pair.value))
  return false
}

/**
 * Render one value for a difference line.
 * @param {unknown} value - value to show.
 * @returns short single-line text.
 */
function show(value) {
  if (value === undefined) return '<无>'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text === undefined ? '<无>' : text
}

/**
 * List the fields where two setting objects differ, deepest path first.
 * @param {unknown} current - value in place now.
 * @param {unknown} next - value the portable file carries.
 * @param {string} path - dotted path of the pair, for the message.
 * @param {string[]} lines - accumulator.
 * @returns the accumulator.
 */
function differences(current, next, path, lines = []) {
  const bothPlain = current !== null && next !== null && typeof current === 'object' && typeof next === 'object'
    && !Array.isArray(current) && !Array.isArray(next)
  if (bothPlain) {
    for (const key of new Set([...Object.keys(current), ...Object.keys(next)])) {
      differences(current[key], next[key], path === '' ? key : `${path}.${key}`, lines)
    }
    return lines
  }
  if (!isDeepStrictEqual(current, next)) lines.push(`${path}: ${show(current)} → ${show(next)}`)
  return lines
}

/**
 * Whether a profile is composed with the pet plugin at all. A settings row for
 * a plugin the profile never loads would sit in the patch doing nothing, so a
 * patch without that registration is reported instead of written.
 * @param {string} profileDir - profile directory under the harness home.
 * @returns the answer.
 */
function profileLoadsPet(profileDir) {
  const text = readText(join(profileDir, 'package.json'))
  return text !== undefined && text.includes(PACKAGE_NAME)
}

/**
 * Read the record of what each machine has already applied, keyed by artifact
 * (`pet`, then a profile name; `keybindings`). A record written before the
 * shortcut document joined this tool is read as the pet section it was.
 * @param {string} statePath - state file path.
 * @returns the record, empty when the file is absent or unreadable.
 */
function readState(statePath) {
  const text = readText(statePath)
  if (text === undefined) return legacyState(statePath)
  try {
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object') return {}
    return Object.hasOwn(parsed, 'pet') || Object.hasOwn(parsed, 'keybindings') ? parsed : { pet: parsed }
  } catch {
    // A state file this script cannot read only costs one redundant apply.
    return {}
  }
}

/**
 * Read the record this tool kept before it carried a second artifact: a flat
 * map of profile name to applied pet file.
 * @param {string} statePath - current state file path.
 * @returns the record in the current layout.
 */
function legacyState(statePath) {
  const text = readText(join(dirname(statePath), '..', 'little-icon', 'pet-settings-sync.json'))
  if (text === undefined) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' ? { pet: parsed } : {}
  } catch {
    // Unreadable legacy state costs one redundant apply, the same as an unreadable current one.
    return {}
  }
}

/**
 * Record one artifact as applied.
 * @param {string} statePath - state file path.
 * @param {string} section - artifact name (`pet` or `keybindings`).
 * @param {string | undefined} key - profile name for the pet artifact, undefined for whole-home artifacts.
 * @param {{hash: string, appliedAt: string}} entry - what was applied.
 */
function writeState(statePath, section, key, entry) {
  const state = readState(statePath)
  state[section] = key === undefined ? { ...entry } : { ...(state[section] ?? {}), [key]: entry }
  mkdirSync(dirname(statePath), { recursive: true })
  writeAtomic(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

/**
 * Load `pet-settings.yml`, validating the parts every mode depends on.
 * @param {string} path - settings file path.
 * @returns file text and parsed contents.
 */
function loadSettings(path) {
  const text = readText(path)
  if (text === undefined) throw new Error(`${path} does not exist; run "export" on the machine whose pet is right`)
  const parsed = YAML.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path}: expected a mapping with a "config" section`)
  }
  if (parsed.version !== FORMAT_VERSION) {
    throw new Error(`${path}: format version ${show(parsed.version)} is not the supported ${FORMAT_VERSION}`)
  }
  if (parsed.config === null || typeof parsed.config !== 'object' || Array.isArray(parsed.config)) {
    throw new Error(`${path}: "config" must be a mapping of setting name to value`)
  }
  return { text, parsed }
}

/**
 * Copy the profile patch's pet row into `pet-settings.yml`.
 * @param {object} options - parsed CLI options.
 * @param {string} patchPath - profile patch path.
 * @param {string} statePath - state file path.
 * @returns process exit code.
 */
function exportSettings(options, patchPath, statePath) {
  const document = parsePatch(readText(patchPath) ?? '[]\n', patchPath)
  const index = findEntryIndex(document)
  if (index < 0) throw new Error(`${patchPath}: no "${ENTRY_ID}" section; enable the pet in this profile first`)
  const node = document.getIn([index, 'config'], true)
  if (containsJsTag(node)) {
    throw new Error(`${patchPath}: the "${ENTRY_ID}" section holds a !!js expression, which this file cannot carry`)
  }
  const config = valueIn(document, [index, 'config']) ?? {}
  const name = document.getIn([index, 'name'])
  const next = {
    version: FORMAT_VERSION,
    exportedFrom: options.profile,
    exportedAt: new Date().toISOString(),
    ...(typeof name === 'string' && name !== '' ? { name } : {}),
    config,
  }
  const previous = readText(settingsFile)
  let previousParsed
  if (previous !== undefined) {
    try {
      previousParsed = YAML.parse(previous)
    } catch {
      // An unparsable file is replaced; the export is the authority.
      previousParsed = undefined
    }
  }
  const unchanged = previousParsed !== undefined && isDeepStrictEqual({ ...previousParsed, exportedAt: 0 }, { ...next, exportedAt: 0 })
  if (unchanged) {
    // Keep the stored timestamp: re-exporting the same pet must not dirty the file.
    next.exportedAt = previousParsed.exportedAt
  }
  const text = `${FILE_HEADER}${YAML.stringify(next, { lineWidth: 0 })}`
  const wrote = text !== previous
  if (wrote) writeAtomic(settingsFile, text)
  writeState(statePath, 'pet', options.profile, { hash: hashOf(text), appliedAt: next.exportedAt })
  if (options.quiet) return 0
  const lines = !wrote
    ? [`桌宠设置没有变化：${settingsFile}`]
    : unchanged
      // The settings match and only this tool's own header was stale.
      ? [`已更新 ${settingsFile} 的表头，桌宠设置本身没有变化。`]
      : [`已写入 ${settingsFile}（来自 profile ${options.profile}）`]
  if (previousParsed !== undefined && !unchanged) {
    const changed = differences(previousParsed.config ?? {}, config, '')
    if (changed.length > 0) lines.push('改动：', ...changed.map(line => `  ${line}`))
  } else if (previousParsed === undefined) {
    lines.push(`字段：${Object.keys(config).join(', ')}`)
  }
  lines.push('提交推送后，另一台机器下次启动 DSH 时自动应用。')
  console.log(lines.join('\n'))
  return 0
}

/**
 * Merge `pet-settings.yml` into a profile patch, unless that profile already
 * applied this exact file.
 * @param {object} options - parsed CLI options.
 * @param {string} patchPath - profile patch path.
 * @param {string} statePath - state file path.
 * @param {string} profileDir - profile directory.
 * @returns process exit code.
 */
function applySettings(options, patchPath, statePath, profileDir) {
  if (!options.force && !profileLoadsPet(profileDir)) {
    console.error(`[settings] profile "${options.profile}" does not load ${PACKAGE_NAME}; nothing to apply.`)
    return 1
  }
  const { text: settingsText, parsed } = loadSettings(settingsFile)
  const hash = hashOf(settingsText)
  const state = readState(statePath)
  const patchText = readText(patchPath) ?? '[]\n'
  const document = parsePatch(patchText, patchPath)
  const index = findEntryIndex(document)
  const record = state.pet?.[options.profile]
  if (!options.force && record !== undefined && record.hash === hash && index >= 0) {
    if (!options.quiet) console.log(`[settings] 已应用过这份桌宠设置，本机设置保持不变（要强制覆盖加 --force）`)
    return 0
  }
  const current = index < 0 ? undefined : valueIn(document, [index, 'config'])
  const changed = differences(current ?? {}, parsed.config, '')
  if (index < 0) {
    document.add(document.createNode({
      id: ENTRY_ID,
      name: typeof parsed.name === 'string' && parsed.name !== '' ? parsed.name : `@local/${PACKAGE_NAME}`,
      config: parsed.config,
    }))
  } else {
    document.setIn([index, 'config'], document.createNode(parsed.config))
  }
  document.contents.flow = false
  const text = String(document)
  // Re-read what was produced before it replaces the patch: a document that no
  // longer carries these settings would break the next boot instead.
  const verifyDocument = parsePatch(text, patchPath)
  const verifyIndex = findEntryIndex(verifyDocument)
  if (verifyIndex < 0 || !isDeepStrictEqual(valueIn(verifyDocument, [verifyIndex, 'config']), parsed.config)) {
    throw new Error(`${patchPath}: refusing to write a patch that does not carry these settings back`)
  }
  if (text !== patchText) writeAtomic(patchPath, text)
  writeState(statePath, 'pet', options.profile, { hash, appliedAt: new Date().toISOString() })
  if (options.quiet) return 0
  if (text === patchText) {
    console.log('[settings] 本机桌宠设置与这份文件一致，没有改动。')
    return 0
  }
  console.log(`[settings] 已把 ${settingsFile} 合并进 ${patchPath}`)
  if (changed.length > 0) console.log(['改动：', ...changed.map(line => `  ${line}`)].join('\n'))
  console.log('重启 DSH 后桌宠按新设置显示。')
  return 0
}

/**
 * Report what an apply would change, without writing anything.
 * @param {object} options - parsed CLI options.
 * @param {string} patchPath - profile patch path.
 * @param {string} statePath - state file path.
 * @returns process exit code.
 */
function statusSettings(options, patchPath, statePath) {
  const { text: settingsText, parsed } = loadSettings(settingsFile)
  const hash = hashOf(settingsText)
  const record = readState(statePath).pet?.[options.profile]
  const patchText = readText(patchPath)
  const document = patchText === undefined ? undefined : parsePatch(patchText, patchPath)
  const index = document === undefined ? -1 : findEntryIndex(document)
  const current = index < 0 ? {} : valueIn(document, [index, 'config']) ?? {}
  const changed = differences(current, parsed.config, '')
  const applied = record !== undefined && record.hash === hash
  const state = record === undefined
    ? '本机从未应用过这份文件'
    : !applied ? '文件已更新，下次启动会应用'
      : index < 0 ? '应用过，但本机 patch 里现在没有桌宠段，下次启动会重建'
        : changed.length === 0 ? `已应用，本机设置与文件一致（${record.appliedAt}）`
          : `已应用过这份文件；本机改过的值保留到文件下次更新（${record.appliedAt}）`
  console.log(`设置文件：${settingsFile}（导出自 ${parsed.exportedFrom}，${parsed.exportedAt}）`)
  console.log(`本机 patch：${patchPath}${patchText === undefined ? '（还不存在）' : ''}`)
  console.log(`应用状态：${state}`)
  if (patchText === undefined) {
    console.log('本机还没有 profile patch；启动一次 DSH 或直接 apply 会新建。')
    return 0
  }
  if (index < 0) console.log(`本机 patch 里没有 "${ENTRY_ID}" 段。`)
  else if (changed.length === 0) console.log('本机设置与文件完全一致。')
  else console.log(['差异（本机 → 文件）：', ...changed.map(line => `  ${line}`)].join('\n'))
  return 0
}

/**
 * Hash one file's exact text, so a rewrite that changes only whitespace still
 * counts as a change.
 * @param {string} text - file contents.
 * @returns hex sha256.
 */
function hashOf(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Validate the Desktop's shortcut document. The app refuses a document it
 * cannot read and leaves the file as it found it, so carrying a broken one
 * between machines would only spread a file that disables shortcut editing
 * there; the accepted shape is the one the product's own parser takes.
 * @param {string} text - file contents.
 * @param {string} path - where the text came from, for messages.
 * @returns the document, its keys in file order.
 */
function parseKeybindings(text, path) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`${path}: not JSON (${error.message})`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path}: expected an object with "schemaVersion" and "profiles"`)
  }
  const profiles = parsed.profiles
  if (!KEYBINDINGS_VERSIONS.includes(parsed.schemaVersion)
    || profiles === null || typeof profiles !== 'object' || Array.isArray(profiles)
    || Object.keys(parsed).some(key => key !== 'schemaVersion' && key !== 'profiles')) {
    throw new Error(`${path}: not a shortcut document this product accepts (schemaVersion ${show(parsed.schemaVersion)})`)
  }
  return parsed
}

/**
 * Render a document the way the app writes it, so a round trip through this
 * tool stays byte-identical to what the Electron main process would write.
 * @param {object} document - validated document.
 * @returns file text.
 */
function renderKeybindings(document) {
  return `${JSON.stringify(document, null, 2)}\n`
}

/**
 * Name what a shortcut document carries, for a status line.
 * @param {object} document - validated document.
 * @returns one line of text.
 */
function describeKeybindings(document) {
  const profiles = Object.entries(document.profiles)
    .map(([name, overrides]) => `${name}：${Object.keys(overrides ?? {}).length} 条覆盖`)
  return `schemaVersion ${document.schemaVersion}，${profiles.length === 0 ? '没有覆盖' : profiles.join('、')}`
}

/**
 * Copy the Desktop's own shortcut document into `keybindings.json`.
 * @param {object} options - parsed CLI options.
 * @param {string} localPath - the Desktop's document.
 * @param {string} statePath - state file path.
 * @returns process exit code.
 */
function exportKeybindings(options, localPath, statePath) {
  const text = readText(localPath)
  if (text === undefined) {
    throw new Error(`${localPath} does not exist; the Desktop writes it when a shortcut is changed`)
  }
  const document = parseKeybindings(text, localPath)
  const rendered = renderKeybindings(document)
  const previous = readText(keybindingsFile)
  if (rendered !== previous) writeAtomic(keybindingsFile, rendered)
  writeState(statePath, 'keybindings', undefined, { hash: hashOf(rendered), appliedAt: new Date().toISOString() })
  if (options.quiet) return 0
  console.log(rendered === previous
    ? `快捷键设置没有变化：${keybindingsFile}`
    : `已写入 ${keybindingsFile}（来自 ${localPath}）`)
  console.log(`内容：${describeKeybindings(document)}`)
  console.log('提交推送后，另一台机器下次启动 DSH 时自动应用。')
  return 0
}

/**
 * Write `keybindings.json` back over the Desktop's document, unless this
 * machine already applied this exact file.
 * @param {object} options - parsed CLI options.
 * @param {string} localPath - the Desktop's document.
 * @param {string} statePath - state file path.
 * @returns process exit code.
 */
function applyKeybindings(options, localPath, statePath) {
  const text = readText(keybindingsFile)
  if (text === undefined) {
    throw new Error(`${keybindingsFile} does not exist; run "export" on the machine whose shortcuts are right`)
  }
  const document = parseKeybindings(text, keybindingsFile)
  const rendered = renderKeybindings(document)
  const hash = hashOf(rendered)
  const record = readState(statePath).keybindings
  const current = readText(localPath)
  if (!options.force && record !== undefined && record.hash === hash && current !== undefined) {
    if (!options.quiet) console.log('[settings] 已应用过这份快捷键设置，本机设置保持不变（要强制覆盖加 --force）')
    return 0
  }
  let currentDocument
  if (current !== undefined) {
    try {
      currentDocument = parseKeybindings(current, localPath)
    } catch {
      // A document the product cannot read is replaced by the checked-in one rather than kept.
      currentDocument = undefined
    }
  }
  const changed = differences(currentDocument?.profiles ?? {}, document.profiles, 'profiles')
  if (rendered !== current) {
    mkdirSync(dirname(localPath), { recursive: true })
    writeAtomic(localPath, rendered)
  }
  writeState(statePath, 'keybindings', undefined, { hash, appliedAt: new Date().toISOString() })
  if (options.quiet) return 0
  if (rendered === current) {
    console.log('[settings] 本机快捷键与这份文件一致，没有改动。')
    return 0
  }
  console.log(`[settings] 已把 ${keybindingsFile} 写入 ${localPath}`)
  if (changed.length > 0) console.log(['改动：', ...changed.map(line => `  ${line}`)].join('\n'))
  console.log('重启 DSH 后新键位生效。')
  return 0
}

/**
 * Report what a shortcut apply would change, without writing anything.
 * @param {string} statePath - state file path.
 * @param {string} localPath - the Desktop's document.
 * @returns process exit code.
 */
function statusKeybindings(statePath, localPath) {
  const text = readText(keybindingsFile)
  if (text === undefined) {
    console.log(`快捷键文件：${keybindingsFile}（还不存在；本机改过快捷键后 export 会生成）`)
    return 0
  }
  const document = parseKeybindings(text, keybindingsFile)
  const rendered = renderKeybindings(document)
  const record = readState(statePath).keybindings
  const current = readText(localPath)
  console.log(`快捷键文件：${keybindingsFile}（${describeKeybindings(document)}）`)
  console.log(`本机文件：${localPath}${current === undefined ? '（还不存在）' : ''}`)
  console.log(`应用状态：${record === undefined ? '本机从未应用过这份文件'
    : record.hash !== hashOf(rendered) ? '文件已更新，下次启动会应用'
      : current === undefined ? '应用过，但本机文件不在了，下次启动会重建'
        : `已应用（${record.appliedAt}）`}`)
  if (current === rendered) {
    console.log('本机快捷键与文件完全一致。')
    return 0
  }
  let currentDocument
  if (current !== undefined) {
    try {
      currentDocument = parseKeybindings(current, localPath)
    } catch (error) {
      console.log(`本机文件读不了，会被这份文件覆盖：${error.message}`)
      return 0
    }
  }
  const changed = differences(currentDocument?.profiles ?? {}, document.profiles, 'profiles')
  console.log(changed.length === 0
    ? '覆盖内容一致，只是文件写法不同。'
    : ['差异（本机 → 文件）：', ...changed.map(line => `  ${line}`)].join('\n'))
  return 0
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const dshHome = resolveDshHome()
  const statePath = join(dshHome, 'settings-sync', 'state.json')
  const localKeybindings = keybindingsPath(dshHome)
  const codes = []
  if (options.only !== 'keybindings') {
    const profileDir = join(dshHome, 'profiles', options.profile)
    if (!existsSync(profileDir)) {
      throw new Error(`profile "${options.profile}" not found at ${profileDir}; is DSH_HOME right?`)
    }
    const patchPath = join(profileDir, 'cordis.patch.yml')
    if (options.mode === 'export') codes.push(exportSettings(options, patchPath, statePath))
    else if (options.mode === 'apply') codes.push(applySettings(options, patchPath, statePath, profileDir))
    else codes.push(statusSettings(options, patchPath, statePath))
  }
  if (options.only !== 'pet') {
    if (options.mode === 'export') codes.push(exportKeybindings(options, localKeybindings, statePath))
    else if (options.mode === 'apply') codes.push(applyKeybindings(options, localKeybindings, statePath))
    else codes.push(statusKeybindings(statePath, localKeybindings))
  }
  return codes.every(code => code === 0) ? 0 : 1
}

try {
  process.exitCode = main()
} catch (error) {
  console.error(`[settings] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
