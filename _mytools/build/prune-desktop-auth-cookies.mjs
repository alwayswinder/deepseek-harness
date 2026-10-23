#!/usr/bin/env node
/**
 * Remove stale DSH browser-auth cookies from a Desktop Chromium profile.
 *
 * Every Desktop start mints one host-scoped `dsh-auth-<authority hash>` cookie
 * with a 30-day life (one per random loopback port). Chromium sends every one of
 * them to 127.0.0.1, so the Cookie request header grows by about 228 bytes per
 * start and eventually passes Node's 16 KiB header limit; the Host then answers
 * 431, `connectDesktopWelcome` sees a non-2xx response and Desktop reports
 * "desktop welcome: Web authentication failed". Those cookies are single-use:
 * each start mints a fresh one, so every cookie already on disk is dead and can
 * be removed before the next launch.
 *
 * The script refuses to touch a profile that is in use (Desktop running), backs
 * up the cookie database first, and never blocks a launch: every non-fatal
 * outcome exits 0 after printing why it skipped.
 *
 * Usage: node prune-desktop-auth-cookies.mjs <electron-user-data-dir>
 */
import { copyFileSync, existsSync, openSync, closeSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'

const COOKIE_PREFIX = 'dsh-auth-'
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]']
const KEEP_BACKUPS = 5
const BACKUP_PATTERN = /^Cookies\.bak-dsh-auth-\d{8}-\d{6}$/u
const REEXEC_FLAG = 'DSH_COOKIE_PRUNE_REEXEC'

/** Print one operator-facing line; the launcher forwards stdio to its log. */
function say(message) {
  process.stdout.write(`[desktop] cookie cleanup: ${message}\n`)
}

function skip(message, code = 0) {
  say(message)
  process.exit(code)
}

/** Locate the Chromium cookie database inside one Electron user-data directory. */
function cookiePath(userData) {
  for (const candidate of [join(userData, 'Network', 'Cookies'), join(userData, 'Cookies')]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** True when another process holds the profile; Chromium denies all writes then. */
function lockedByAnotherProcess(path) {
  try {
    closeSync(openSync(path, 'r+'))
    return false
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES') return true
    throw error
  }
}

async function loadSqlite() {
  try {
    return await import('node:sqlite')
  } catch (error) {
    // Node 22 needs --experimental-sqlite; retry once through a flagged child.
    if (process.env[REEXEC_FLAG] !== '1') {
      const { spawnSync } = await import('node:child_process')
      const retry = spawnSync(process.execPath, ['--experimental-sqlite', ...process.argv.slice(1)], {
        stdio: 'inherit',
        env: { ...process.env, [REEXEC_FLAG]: '1' },
      })
      if (retry.status === 0) process.exit(0)
    }
    return { unavailable: error instanceof Error ? error.message : String(error) }
  }
}

/** Report how many stale cookies exist and how much request header they occupy. */
function measure(db) {
  const placeholders = LOOPBACK_HOSTS.map(() => '?').join(', ')
  return db.prepare(`SELECT count(*) AS rows, coalesce(sum(length(name) + 1 + coalesce(length(value), 0) + 2), 0) AS bytes
                       FROM cookies WHERE name LIKE ? AND host_key IN (${placeholders})`)
    .get(`${COOKIE_PREFIX}%`, ...LOOPBACK_HOSTS)
}

/** Read the current state without writing: absence of a table, no stale rows, or the measured rows. */
function inspect(sqlite, path) {
  const db = new sqlite.DatabaseSync(path)
  try {
    const tables = db.prepare("SELECT count(*) AS present FROM sqlite_master WHERE type = 'table' AND name = 'cookies'").get()
    if (tables.present !== 1) return { reason: 'schema' }
    const before = measure(db)
    return before.rows === 0 ? { reason: 'empty' } : { before }
  } finally {
    db.close()
  }
}

/** Drop backups this script made beyond the newest {@link KEEP_BACKUPS}. */
function pruneOwnBackups(directory) {
  const own = readdirSync(directory)
    .filter(name => BACKUP_PATTERN.test(name))
    .map(name => ({ name, time: statSync(join(directory, name)).mtimeMs }))
    .sort((left, right) => right.time - left.time)
  for (const stale of own.slice(KEEP_BACKUPS)) unlinkSync(join(directory, stale.name))
}

function stamp(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

async function main() {
  const userData = process.argv[2]
  if (userData === undefined || userData === '') {
    say('missing the Electron user-data directory argument.')
    process.exit(1)
  }
  const path = cookiePath(userData)
  if (path === undefined) skip(`no Chromium cookie database under ${userData}; nothing to do.`)
  if (lockedByAnotherProcess(path)) skip('Desktop is running; skipped.')

  const sqlite = await loadSqlite()
  if (!('DatabaseSync' in sqlite)) {
    skip(`node:sqlite is unavailable (${sqlite.unavailable}); skipped.`)
  }

  // Opening runs any hot-journal recovery, so the backup below is consistent.
  const state = inspect(sqlite, path)
  if (state.reason === 'schema') skip('the cookie database has no cookies table; skipped.')
  if (state.reason === 'empty') skip('no stale dsh-auth cookies; nothing to do.')
  const before = state.before

  const directory = join(path, '..')
  const backup = join(directory, `Cookies.bak-dsh-auth-${stamp(new Date())}`)
  copyFileSync(path, backup)
  pruneOwnBackups(directory)

  const db = new sqlite.DatabaseSync(path)
  let removed
  try {
    const placeholders = LOOPBACK_HOSTS.map(() => '?').join(', ')
    db.exec('BEGIN IMMEDIATE')
    try {
      removed = db.prepare(`DELETE FROM cookies WHERE name LIKE ? AND host_key IN (${placeholders})`)
        .run(`${COOKIE_PREFIX}%`, ...LOOPBACK_HOSTS).changes
      db.exec('COMMIT')
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* the transaction already ended */ }
      throw error
    }
    const check = db.prepare('PRAGMA quick_check').get()
    const verdict = Object.values(check)[0]
    if (verdict !== 'ok') throw new Error(`cookie database check after cleanup reported ${String(verdict)}`)
  } finally {
    db.close()
  }

  say(`removed ${removed} stale dsh-auth cookie(s); request Cookie header ${before.bytes} -> 0 bytes.`)
  say(`backup kept at ${backup}`)
}

await main().catch((error) => {
  say(`failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
