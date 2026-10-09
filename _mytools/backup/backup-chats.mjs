/**
 * Back up this machine's DSH and Codex conversation records into one dated
 * snapshot directory.
 *
 * Called once at startup by `backup-chats.bat` (from `build\start-desktop.bat`,
 * `build\start-dsh.bat`, and the pet's restart shim `settings\sync-pet-settings.mjs`).
 * The copy is incremental inside the day's snapshot: files that are missing or
 * newer at the source are copied, everything else is left alone, and a file the
 * running app holds open is skipped and retried on the next startup rather than
 * failing the backup. Nothing at the source is ever deleted.
 *
 * Destination defaults to `D:\AI\备份`; `DSH_BACKUP_DIR` overrides it, and a
 * machine without that drive falls back to `<user>\dsh-home-backups` so the
 * script stays correct on a machine that has no D:. `DSH_BACKUP_KEEP` sets how
 * many day snapshots are retained (default 14, `0` keeps every snapshot); only
 * directories inside the destination that carry this script's own manifest are
 * ever removed.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join, parse, resolve, sep } from 'node:path'

/** First line of every snapshot manifest; the only snapshots this script may remove. */
const MANIFEST_MAGIC = '# dsh-chat-backup v1'

/** Default destination: the drive the working copy's user asked for. */
const DEFAULT_DEST = 'D:\\AI\\备份'

/** Default number of day snapshots kept; `0` keeps all of them. */
const DEFAULT_KEEP = 14

/**
 * Resolve the harness home the way the harness does: a blank or whitespace-only
 * `DSH_HOME` counts as unset, a leading `~` expands to the user directory, and the
 * result is absolute.
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
 * The backup destination, with the fallback a machine without the configured
 * drive needs.
 * @param requested - the configured destination.
 * @returns the destination actually used, and why it differs, if it does.
 */
function resolveDestination(requested) {
  const root = parse(resolve(requested)).root
  if (existsSync(root)) return { dir: resolve(requested), note: '' }
  const fallback = join(homedir(), 'dsh-home-backups')
  return { dir: fallback, note: `${requested} is not on this machine; using ${fallback}` }
}

/** One conversation source mirrored into the snapshot. */
const SOURCES = [
  { id: 'dsh-sessions', home: 'dsh', source: ['sessions'], snapshot: ['dsh', 'sessions'], kind: 'tree' },
  { id: 'dsh-storages', home: 'dsh', source: ['storages'], snapshot: ['dsh', 'storages'], kind: 'tree' },
  { id: 'codex-sessions', home: 'codex', source: ['sessions'], snapshot: ['codex', 'sessions'], kind: 'tree' },
  { id: 'codex-history', home: 'codex', source: ['history.jsonl'], snapshot: ['codex', 'history.jsonl'], kind: 'file' },
]

/**
 * Resolve every source to its absolute path on this machine.
 * @param dshHome - absolute harness home.
 * @returns the sources with absolute paths and existence.
 */
function resolveSources(dshHome) {
  const homes = { dsh: dshHome, codex: join(homedir(), '.codex') }
  return SOURCES.map(source => {
    const path = join(homes[source.home], ...source.source)
    const relative = source.snapshot.join(sep)
    return { ...source, relative, path, present: existsSync(path) }
  })
}

/**
 * Whether a source file needs copying into the snapshot: absent, differently
 * sized, or newer at the source. A one-second tolerance keeps a file copied with
 * preserved timestamps from being copied again for clock granularity alone.
 * @param sourcePath - absolute source file.
 * @param targetPath - absolute snapshot file.
 * @returns whether to copy.
 */
function needsCopy(sourcePath, targetPath) {
  let target
  try { target = statSync(targetPath) } catch { return true }
  let source
  try { source = statSync(sourcePath) } catch { return false }
  return source.size !== target.size || source.mtimeMs > target.mtimeMs + 999
}

/**
 * Copy one source tree into the snapshot, incrementally.
 * @param source - the resolved source.
 * @param targetRoot - absolute directory of this source inside the snapshot.
 * @returns per-file counts.
 */
function copyTree(source, targetRoot) {
  const counts = { files: 0, copied: 0, skipped: 0, locked: [] }
  const walk = (fromDir, toDir) => {
    let entries
    try { entries = readdirSync(fromDir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const from = join(fromDir, entry.name)
      const to = join(toDir, entry.name)
      if (entry.isDirectory()) { walk(from, to); continue }
      counts.files++
      if (!entry.isFile()) { counts.skipped++; continue }
      try {
        if (!needsCopy(from, to)) continue
        mkdirSync(toDir, { recursive: true })
        cpSync(from, to, { preserveTimestamps: true, force: true })
        counts.copied++
      } catch (error) {
        counts.skipped++
        if (counts.locked.length < 5) counts.locked.push(`${entry.name} (${error.code ?? error.message})`)
      }
    }
  }
  walk(source.path, targetRoot)
  return counts
}

/**
 * Copy one single-file source.
 * @param source - the resolved source.
 * @param targetPath - absolute file path inside the snapshot.
 * @returns per-file counts.
 */
function copyFile(source, targetPath) {
  const counts = { files: 1, copied: 0, skipped: 0, locked: [] }
  try {
    if (!needsCopy(source.path, targetPath)) return counts
    mkdirSync(join(targetPath, '..'), { recursive: true })
    cpSync(source.path, targetPath, { preserveTimestamps: true, force: true })
    counts.copied++
  } catch (error) {
    counts.skipped++
    counts.locked.push(`${source.id} (${error.code ?? error.message})`)
  }
  return counts
}

/**
 * Remove day snapshots beyond the retention limit. Only a directory directly
 * under the destination whose manifest carries {@link MANIFEST_MAGIC} is
 * eligible; anything else is reported and left in place.
 * @param dest - absolute destination directory.
 * @param keep - how many snapshots to keep; `0` disables removal.
 * @returns the removed directory names and the ones refused.
 */
function pruneSnapshots(dest, keep) {
  const removed = []
  const refused = []
  if (keep <= 0) return { removed, refused }
  let names
  try { names = readdirSync(dest, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)).map(entry => entry.name) } catch { return { removed, refused } }
  for (const name of names.sort().reverse().slice(keep)) {
    const dir = join(dest, name)
    try {
      const manifest = statSync(join(dir, 'manifest.txt'))
      if (!manifest.isFile()) { refused.push(name); continue }
      const head = readFileSync(join(dir, 'manifest.txt'), 'utf8').split(/\r?\n/, 1)[0]
      if (head !== MANIFEST_MAGIC) { refused.push(name); continue }
      rmSync(dir, { recursive: true, force: true })
      removed.push(name)
    } catch {
      refused.push(name)
    }
  }
  return { removed, refused }
}

/**
 * Run one backup pass: copy every source into today's snapshot, write the
 * manifest, append one log line, and prune snapshots past the retention limit.
 * @param options - `dest`, `keep`, and `quiet` overrides for this run.
 * @returns the summary line this run printed.
 */
export async function runBackup(options = {}) {
  const dshHome = resolveDshHome()
  const requestedDest = options.dest ?? (process.env.DSH_BACKUP_DIR?.trim() || DEFAULT_DEST)
  const { dir: dest, note } = resolveDestination(requestedDest)
  const keep = options.keep ?? Number.parseInt(process.env.DSH_BACKUP_KEEP?.trim() || String(DEFAULT_KEEP), 10)
  const day = new Date().toISOString().slice(0, 10)
  const snapshot = join(dest, day)
  mkdirSync(snapshot, { recursive: true })

  const sources = resolveSources(dshHome)
  const total = { files: 0, copied: 0, skipped: 0 }
  const details = []
  for (const source of sources) {
    if (!source.present) { details.push(`${source.id}=absent`); continue }
    const counts = source.kind === 'tree'
      ? copyTree(source, join(snapshot, ...source.relative.split(sep)))
      : copyFile(source, join(snapshot, ...source.relative.split(sep)))
    total.files += counts.files
    total.copied += counts.copied
    total.skipped += counts.skipped
    details.push(`${source.id}=${counts.copied}/${counts.files}${counts.skipped === 0 ? '' : ` (${counts.skipped} skipped: ${counts.locked.join('; ')})`}`)
  }

  const stamp = new Date().toISOString()
  writeFileSync(join(snapshot, 'manifest.txt'), [
    MANIFEST_MAGIC,
    `host: ${hostname()}`,
    `time: ${stamp}`,
    `dshHome: ${dshHome}`,
    `sources: ${details.join(' | ')}`,
    `totals: files=${total.files} copied=${total.copied} skipped=${total.skipped}`,
    'notes: conversation records only; credentials and settings files are not copied',
    '',
  ].join('\n'))

  const pruned = pruneSnapshots(dest, Number.isFinite(keep) ? keep : DEFAULT_KEEP)
  const summary = `[backup] ${day} files=${total.files} copied=${total.copied} skipped=${total.skipped} -> ${snapshot}`
    + (pruned.removed.length === 0 ? '' : ` removed=${pruned.removed.join(',')}`)
    + (pruned.refused.length === 0 ? '' : ` kept=${pruned.refused.join(',')}`)
    + (note === '' ? '' : ` (${note})`)
  appendFileSync(join(dest, '_backup.log'), `${summary} ${details.join(' | ')}\n`)
  console.log(summary)
  for (const detail of details) if (detail.includes('skipped')) console.log(`[backup]   ${detail}`)
  return summary
}

if (import.meta.main) {
  try {
    await runBackup()
  } catch (error) {
    console.error(`[backup] FAILED: ${error?.message ?? error}`)
    process.exitCode = 1
  }
}
