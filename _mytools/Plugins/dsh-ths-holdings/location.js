/**
 * Where the holdings snapshot lives.
 *
 * Real positions are personal data, so the package never names a path inside
 * itself: the default is a directory under the harness home, and a path chosen
 * on the plugin's own page is remembered for this machine in
 * `$DSH_HOME/ths-holdings.location.json`. That file is deliberately outside the
 * package: the point of choosing a path is that the holdings may live in a
 * private checkout while the package stays public.
 *
 * Resolution order is: the path chosen on this machine, then the profile's
 * `positionsFile` configuration, then the default under the harness home.
 * @module dsh-ths-holdings/location
 */

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** The machine-local file under `$DSH_HOME` that remembers the chosen path. */
export const LOCATION_FILE = 'ths-holdings.location.json'

/** The snapshot file name inside the default directory. */
export const SNAPSHOT_NAME = 'positions.json'

/** The directory under `$DSH_HOME` that holds the snapshot when nothing else is chosen. */
const DEFAULT_DIRECTORY = 'ths-holdings'

/**
 * Resolve `$DSH_HOME` the way the harness does: blank means unset, a leading
 * `~` expands to the user directory, and the result is absolute.
 * @param {object} [env] - the environment to read (tests pass one in).
 * @returns {string} the absolute harness user directory.
 */
export function resolveDshHome(env = process.env) {
  const raw = env.DSH_HOME
  const value = raw === undefined ? '' : raw.trim()
  if (value === '') return join(homedir(), '.dsh')
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return resolve(value)
}

/**
 * The snapshot path used when neither this machine nor the profile names one.
 * @param {string} home - the harness user directory.
 * @returns {string} the absolute default path.
 */
export function defaultPositionsFile(home) {
  return join(home, DEFAULT_DIRECTORY, SNAPSHOT_NAME)
}

/**
 * Expand a leading `~` and trim, the way a path typed into a terminal may look.
 * @param {unknown} raw - the path as typed or stored.
 * @returns {string} the expanded value, or an empty string.
 */
export function expandUserPath(raw) {
  const value = String(raw ?? '').trim()
  if (value === '') return ''
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return value
}

/**
 * Turn a configured or stored path into an absolute one.
 *
 * A relative value is resolved against the harness home rather than a process
 * directory the person cannot see. An empty value means "not configured".
 * @param {unknown} raw - the value from configuration or the location file.
 * @param {string} home - the harness user directory.
 * @returns {string | undefined} the absolute path, or undefined when empty.
 */
export function absolutePositionsPath(raw, home) {
  const expanded = expandUserPath(raw)
  if (expanded === '') return undefined
  return isAbsolute(expanded) ? resolve(expanded) : resolve(home, expanded)
}

/**
 * Read the path this machine chose, if the stored value is usable.
 * @param {string} locationPath - the location file under the harness home.
 * @param {string} home - the harness user directory, for a hand-edited relative value.
 * @returns {string | undefined} the absolute path, or undefined when absent or unreadable.
 */
export function readStoredPositionsFile(locationPath, home) {
  let raw
  try {
    raw = readFileSync(locationPath, 'utf8')
  } catch {
    return undefined
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const stored = parsed.positionsFile
  if (typeof stored !== 'string') return undefined
  return absolutePositionsPath(stored, home)
}

/**
 * The holdings file in force: the machine's choice, else the profile's
 * configuration, else the default.
 * @param {object} input - the harness home, configured path, and location file.
 * @param {string} input.home - the harness user directory.
 * @param {string} input.configured - the profile's `positionsFile` value.
 * @param {string} input.locationPath - the location file under the harness home.
 * @returns {{file: string, source: 'machine' | 'config' | 'default'}} the path and why it is used.
 */
export function resolvePositionsLocation(input) {
  const stored = readStoredPositionsFile(input.locationPath, input.home)
  if (stored !== undefined) return { file: stored, source: 'machine' }
  const configured = absolutePositionsPath(input.configured, input.home)
  if (configured !== undefined) return { file: configured, source: 'config' }
  return { file: defaultPositionsFile(input.home), source: 'default' }
}

/**
 * Check one path the page sent before it is stored.
 *
 * The path itself may be new, but its directory must exist: a typo would
 * otherwise silently create a new directory and the page would look empty with
 * no hint that the holdings are somewhere else.
 * @param {unknown} raw - the path as typed or picked.
 * @returns {{ok: true, file: string} | {ok: false, message: string}} the absolute path, or why it was refused.
 */
export function inspectPositionsChoice(raw) {
  const expanded = expandUserPath(raw)
  if (expanded === '') return { ok: false, message: '请填写持仓文件的绝对路径' }
  if (!isAbsolute(expanded)) {
    return { ok: false, message: `请填写绝对路径（以盘符或 / 开头）：${expanded}` }
  }
  const file = resolve(expanded)
  let entry
  try {
    entry = statSync(file)
  } catch {
    entry = undefined
  }
  if (entry !== undefined && entry.isDirectory()) {
    return { ok: false, message: `${file} 是目录，请指向一个 JSON 文件（例如该目录下的 ${SNAPSHOT_NAME}）` }
  }
  const parent = dirname(file)
  let parentEntry
  try {
    parentEntry = statSync(parent)
  } catch {
    parentEntry = undefined
  }
  if (parentEntry === undefined || !parentEntry.isDirectory()) {
    return { ok: false, message: `所在目录不存在：${parent}` }
  }
  return { ok: true, file }
}

/**
 * Remember one chosen path for this machine.
 * @param {string} locationPath - the location file under the harness home.
 * @param {string} file - the absolute snapshot path.
 * @returns {void}
 */
export function writePositionsLocation(locationPath, file) {
  mkdirSync(dirname(locationPath), { recursive: true })
  const temporary = `${locationPath}.${String(process.pid)}.tmp`
  writeFileSync(temporary, `${JSON.stringify({ positionsFile: file }, null, 2)}\n`, 'utf8')
  renameSync(temporary, locationPath)
}

/**
 * Forget this machine's choice, returning to the configured or default path.
 * An absent file is already the reset state.
 * @param {string} locationPath - the location file under the harness home.
 * @returns {void}
 */
export function clearPositionsLocation(locationPath) {
  rmSync(locationPath, { force: true })
}
