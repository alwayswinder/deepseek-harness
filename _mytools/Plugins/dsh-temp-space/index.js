/**
 * DSH Temp Space — host half.
 *
 * One canvas that holds notes, pictures and arbitrary files, anchored wherever
 * they were dropped. The bytes live as ordinary files in a directory of their
 * own — `$DSH_HOME/temp-space` unless configured otherwise — and that directory
 * is a Git clone, so the space moves between machines by pull and push instead
 * of by any service of this plugin's.
 *
 * The page has no filesystem and no process, so every fact here is served on a
 * same-origin route: the canvas state (positions, notes, and the file each item
 * names), the bytes themselves, and the Git operations. The state is one
 * `index.json` in the same directory, written through a temporary file so a
 * reader never sees half of it, and guarded by a revision so the second of two
 * writers is told rather than silently overwriting the first. Quotas are
 * enforced here rather than in the page because this is where the bytes land.
 *
 * The space directory is the person's own Git repository, so nothing here
 * merges, rebases or resolves conflicts: pull is fast-forward only and push is
 * refused while the branch is behind, which leaves every conflict to the person
 * and a terminal.
 */

import { execFile } from 'node:child_process'
import {
  createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import z from '@deepseek-ai/schemastery'

export const name = 'temp-space'

/** Same-origin prefix every route of this plugin is served under. */
const ROUTE_PREFIX = '/api/temp-space'

/** The canvas state: read for a load, replaced for a save. */
const STATE_PATH = `${ROUTE_PREFIX}/state`

/** The stored bytes: read one back, write one, delete one. */
const BLOB_PATH = `${ROUTE_PREFIX}/blob`

/** Git status, and the four operations the page may ask for. */
const GIT_PATH = `${ROUTE_PREFIX}/git`

/** The state file's own format version, so a later layout can be recognized. */
const STATE_VERSION = 1

/** Most characters a file name may keep after sanitization. */
const MAX_NAME_LENGTH = 120

/** Hard ceiling on one request body, checked while the body is read. */
const BODY_READ_LIMIT = 64 * 1024 * 1024

/** Ceiling on the JSON canvas state, which is also a request body. */
const STATE_BODY_LIMIT = 8 * 1024 * 1024

/** Longest note kept for one text item. */
const MAX_TEXT_LENGTH = 200_000

/** Longest title kept for one item. */
const MAX_TITLE_LENGTH = 200

/** Most items one canvas may hold. */
const MAX_ITEMS = 2000

/** Output cap for one Git command. */
const GIT_MAX_BUFFER = 8 * 1024 * 1024

/** Default deadline for one Git command, including a network one. */
const GIT_TIMEOUT_MS = 60_000

/** The Git executable every operation runs. */
const GIT_EXECUTABLE = 'git'

// Windows refuses to replace a file another process holds open, and the page
// may be reading the state while a save replaces it. Retry briefly rather than
// failing a save the person already made.
const REPLACE_ATTEMPTS = 5
const REPLACE_RETRY_MS = 15

/** Extensions the blob route answers with a type, so a browser can render them inline. */
const CONTENT_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.avif', 'image/avif'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.log', 'text/plain; charset=utf-8'],
  ['.yaml', 'text/yaml; charset=utf-8'],
  ['.yml', 'text/yaml; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
])

/** Windows device names a file may not be called, with or without an extension. */
const WINDOWS_DEVICE_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
])

export const Config = z.object({
  /** The space directory; empty means `$DSH_HOME/temp-space`. */
  dataDir: z.string().default(''),
  /** Remote a push and a fetch name, as it is configured in the space repository. */
  gitRemote: z.string().default('origin'),
  /** Most bytes one stored file may have. */
  maxFileBytes: z.number().step(1).min(1024).default(10 * 1024 * 1024),
  /** Most bytes every stored file may have together. */
  maxTotalBytes: z.number().step(1).min(1024).default(100 * 1024 * 1024),
  /** Prefix of the commit message this plugin writes when it commits. */
  commitPrefix: z.string().default('临时空间'),
  /** Deadline for one Git command, including a network one. */
  gitTimeoutMs: z.number().step(1000).min(5000).max(600_000).default(GIT_TIMEOUT_MS),
})

/**
 * Resolve `$DSH_HOME` the way the harness does: blank means unset, a leading
 * `~` expands to the user directory, and the result is absolute.
 * @returns absolute harness user directory.
 */
function resolveDshHome() {
  const raw = process.env.DSH_HOME
  const value = raw === undefined ? '' : raw.trim()
  if (value === '') return join(homedir(), '.dsh')
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return resolve(value)
}

/** Block without yielding, so no two attempts at one replacement interleave. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Replace one path with another, retrying while a reader holds the target.
 * @param from - the staged file.
 * @param to - the path to publish it at.
 */
function replaceWithRetry(from, to) {
  let last
  for (let attempt = 0; attempt < REPLACE_ATTEMPTS; attempt += 1) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      last = error
      sleepSync(REPLACE_RETRY_MS)
    }
  }
  throw last
}

/**
 * Write one JSON document through a temporary file, so no reader sees a partial one.
 * @param path - file to replace.
 * @param value - the document to serialize.
 */
function writeJsonAtomic(path, value) {
  const staged = `${path}.tmp`
  writeFileSync(staged, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  replaceWithRetry(staged, path)
}

/**
 * Read one JSON document, or nothing when it is absent or unreadable.
 * @param path - file to read.
 * @returns the parsed document, or undefined.
 */
function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // Absent and corrupt are the same answer here: the caller writes a fresh state.
    return undefined
  }
}

/**
 * Read one request body into memory, bounded while it arrives.
 * @param req - the request stream.
 * @param limit - most bytes to accept.
 * @returns the bytes, or undefined when the body exceeded the limit.
 */
function readBodyBytes(req, limit) {
  return new Promise((done) => {
    const chunks = []
    let size = 0
    let over = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        // The refusal is the caller's to send, so the body is drained rather
        // than the socket destroyed: a destroyed request takes the response
        // that says why with it.
        over = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { done(over ? undefined : Buffer.concat(chunks)) })
    req.on('error', () => { done(undefined) })
  })
}

/**
 * Read one JSON request body, bounded before it is parsed.
 * @param req - the request stream.
 * @param limit - most bytes to accept.
 * @returns the parsed body, or undefined when it was absent, oversized, or not JSON.
 */
async function readJsonBody(req, limit) {
  const bytes = await readBodyBytes(req, limit)
  if (bytes === undefined) return undefined
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    // A body that is not JSON is a request this route cannot answer.
    return undefined
  }
}

/**
 * Answer one request as JSON.
 * @param res - the response.
 * @param payload - the body to serialize.
 * @param status - HTTP status, 200 unless the caller says otherwise.
 */
function sendJson(res, payload, status = 200) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * Refuse one request the connection does not trust, exactly as the harness's own
 * routes do. The page is same-origin, so its cookie and Host pass; a request
 * from anywhere else is answered here and never reaches a handler.
 * @param ctx - host context, for the connection service.
 * @param req - the request.
 * @param res - the response.
 * @returns whether the request may proceed.
 */
function admit(ctx, req, res) {
  const connection = ctx.get('connection')
  const rejection = connection === undefined ? undefined : connection.requestRejection(req)
  if (rejection === undefined) return true
  res.writeHead(rejection)
  res.end()
  return false
}

/**
 * Turn one name into something a directory on this machine can hold: no path
 * separators, no traversal, no control characters, no Windows device name, and
 * a bounded length. The extension is what the blob route serves the file as, so
 * it is kept where it can be.
 * @param raw - the name the page asked for.
 * @returns a safe name, never empty.
 */
function sanitizeName(raw) {
  const basename = String(raw ?? '').split(/[\\/]/).pop() ?? ''
  let cleaned = basename
    // eslint-disable-next-line no-control-regex -- a stored name may not carry control characters.
    .replace(/[\u0000-\u001f\u007f]/gu, '')
    .replace(/[<>:"|?*]/gu, '_')
    .trim()
    .replace(/^\.+/u, '')
    .replace(/[. ]+$/u, '')
  if (cleaned === '') cleaned = 'file'
  const dot = cleaned.lastIndexOf('.')
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned
  const extension = dot > 0 ? cleaned.slice(dot) : ''
  if (WINDOWS_DEVICE_NAMES.has(stem.toLowerCase())) cleaned = `${stem}_${extension}`
  if (cleaned.length > MAX_NAME_LENGTH) {
    const keep = MAX_NAME_LENGTH - extension.length
    cleaned = `${cleaned.slice(0, keep > 0 ? keep : MAX_NAME_LENGTH)}${keep > 0 ? extension : ''}`
  }
  return cleaned
}

/**
 * Name a new file so it does not replace an existing one.
 * @param filesDir - directory the file is stored in.
 * @param name - the sanitized requested name.
 * @returns a name no file in the directory currently uses.
 */
function uniqueName(filesDir, name) {
  if (!existsSync(join(filesDir, name))) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem} (${index})${extension}`
    if (!existsSync(join(filesDir, candidate))) return candidate
  }
  return `${stem}-${Date.now()}${extension}`
}

/**
 * Every file currently stored, with its size.
 * @param filesDir - the stored-bytes directory.
 * @returns one row per regular file.
 */
function listStoredFiles(filesDir) {
  let entries
  try {
    entries = readdirSync(filesDir, { withFileTypes: true })
  } catch {
    // A directory that does not exist yet holds no files.
    return []
  }
  const rows = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    try {
      rows.push({ name: entry.name, bytes: statSync(join(filesDir, entry.name)).size })
    } catch {
      // A file that disappeared between the listing and the stat is not stored.
    }
  }
  return rows
}

/** The content type one stored file is served as, by extension. */
function contentTypeOf(name) {
  return CONTENT_TYPES.get(extname(name).toLowerCase()) ?? 'application/octet-stream'
}

/**
 * Validate the canvas state the page sent.
 *
 * The list is a request body, so it is read rather than trusted: an item this
 * plugin cannot draw is refused with the whole save, which leaves the previous
 * state readable instead of half-replacing it.
 * @param raw - the parsed request body's `items`.
 * @returns normalized items, or undefined when the payload is not a state.
 */
function validateItems(raw) {
  if (!Array.isArray(raw)) return undefined
  if (raw.length > MAX_ITEMS) return undefined
  const items = []
  const seen = new Set()
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') return undefined
    const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : undefined
    if (id === undefined || seen.has(id)) return undefined
    seen.add(id)
    const kind = entry.kind
    if (kind !== 'text' && kind !== 'file') return undefined
    const numbers = {}
    for (const field of ['x', 'y', 'w', 'h', 'z']) {
      const value = entry[field]
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
      numbers[field] = value
    }
    const item = { id, kind, ...numbers }
    // A title is the person's own name for the card and is independent of the
    // file behind it, so it is optional in both directions: an item without one
    // is drawn under the file's name (or the note's placeholder).
    if (typeof entry.title === 'string' && entry.title.trim() !== '') {
      item.title = entry.title.slice(0, MAX_TITLE_LENGTH)
    }
    if (kind === 'text') {
      if (typeof entry.text !== 'string') return undefined
      item.text = entry.text.slice(0, MAX_TEXT_LENGTH)
    } else {
      if (typeof entry.file !== 'string' || entry.file === '') return undefined
      // The name is compared against its own sanitization: a stored item names
      // one file in this space's directory and nothing outside it.
      if (sanitizeName(entry.file) !== entry.file) return undefined
      item.file = entry.file
    }
    items.push(item)
  }
  return items
}

/**
 * Run one Git command in the space directory.
 *
 * Credentials are the person's own: this process has no terminal to answer a
 * prompt, so interactivity is refused explicitly and authentication trouble
 * comes back as the command's own message instead of an invisible child.
 * @param dir - the space directory.
 * @param args - Git arguments, without the executable.
 * @param timeoutMs - command deadline.
 * @returns whether it succeeded, its output, and why it did not.
 */
function execGit(dir, args, timeoutMs) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => (
    value !== undefined && !/(?:KEY|SECRET|TOKEN|PASSWORD)/iu.test(key)
  )))
  env.GIT_TERMINAL_PROMPT = '0'
  env.GCM_INTERACTIVE = 'Never'
  return new Promise((done) => {
    execFile(GIT_EXECUTABLE, args, {
      cwd: dir, timeout: timeoutMs, maxBuffer: GIT_MAX_BUFFER, windowsHide: true, encoding: 'utf8', env,
    }, (error, stdout, stderr) => {
      if (error === null) {
        done({ ok: true, stdout })
        return
      }
      const reported = (stderr ?? '').trim()
      done({
        ok: false,
        stdout: stdout ?? '',
        message: reported === '' ? error.message : reported,
        missing: error.code === 'ENOENT',
        timedOut: error.killed === true,
      })
    })
  })
}

/**
 * Read the space repository's own facts: its branch, whether the working tree
 * holds changes, and how its branch stands against its upstream.
 * @param dir - the space directory.
 * @param timeoutMs - deadline for each read.
 * @returns the status the page draws its Git bar from.
 */
async function readGitStatus(dir, timeoutMs) {
  const branch = await execGit(dir, ['branch', '--show-current'], timeoutMs)
  if (!branch.ok) return { ok: false, reason: branch.missing ? 'no-git' : 'not-a-repo', message: branch.message }
  const name = branch.stdout.trim()
  const porcelain = await execGit(dir, ['status', '--porcelain=v1'], timeoutMs)
  const changes = porcelain.ok ? porcelain.stdout.split('\n').filter(line => line.trim() !== '').length : 0
  const head = await execGit(dir, ['log', '-1', '--pretty=format:%h%x1f%s%x1f%cI'], timeoutMs)
  const [hash = '', subject = '', date = ''] = head.ok ? head.stdout.split('\u001f') : []
  const status = {
    ok: true,
    branch: name,
    detached: name === '',
    changes,
    commit: head.ok ? { hash, subject, date } : null,
    relation: 'no-upstream',
    ahead: 0,
    behind: 0,
    upstream: '',
  }
  const upstream = await execGit(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], timeoutMs)
  if (!upstream.ok) return status
  status.upstream = upstream.stdout.trim()
  const counts = await execGit(dir, ['rev-list', '--left-right', '--count', `HEAD...${status.upstream}`], timeoutMs)
  if (!counts.ok) return status
  const [aheadText, behindText] = counts.stdout.trim().split(/\s+/)
  const ahead = Number.parseInt(aheadText, 10)
  const behind = Number.parseInt(behindText, 10)
  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) return status
  status.ahead = ahead
  status.behind = behind
  status.relation = behind === 0 ? (ahead === 0 ? 'up-to-date' : 'ahead') : (ahead === 0 ? 'behind' : 'diverged')
  return status
}

/**
 * Perform one Git operation the page asked for.
 *
 * There are two, and they are the two the page offers: saving (commit whatever
 * the canvas wrote, then upload it) and pulling. Saving is one action rather
 * than two because a commit that was never uploaded is not what "saved" means
 * when the space lives on more than one machine — and because two round trips
 * leave a window where the page has committed and the person has looked away.
 *
 * A push is attempted only when there is something to push, and never when the
 * branch is behind: the remote would refuse it anyway, and saying so before the
 * attempt keeps the reason out of Git's own transport wording.
 * @param dir - the space directory.
 * @param action - `save` or `pull`.
 * @param options - the remote to push to, the commit prefix, and the deadline.
 * @returns the refreshed status, plus what the operation did.
 */
async function runGitAction(dir, action, options) {
  const { remote, commitPrefix, timeoutMs } = options
  if (action === 'pull') {
    const pulled = await execGit(dir, ['-c', 'merge.autoStash=false', 'pull', '--ff-only'], timeoutMs)
    if (!pulled.ok) return { ok: false, reason: pulled.timedOut ? 'timed-out' : 'failed', message: pulled.message }
    const pulledStatus = await readGitStatus(dir, timeoutMs)
    return pulledStatus.ok ? { ...pulledStatus, acted: 'pull' } : pulledStatus
  }
  if (action !== 'save') return { ok: false, reason: 'unknown-action' }

  const added = await execGit(dir, ['add', '-A'], timeoutMs)
  if (!added.ok) return { ok: false, reason: 'failed', message: added.message }
  const staged = await execGit(dir, ['status', '--porcelain=v1'], timeoutMs)
  const hasChanges = staged.ok && staged.stdout.trim() !== ''
  let committed = false
  let message = ''
  if (hasChanges) {
    message = `${commitPrefix}：${new Date().toISOString()}`
    const committedResult = await execGit(dir, ['commit', '-m', message], timeoutMs)
    if (!committedResult.ok) {
      // The staging is what already happened; the commit failed, so nothing is
      // uploaded and the message says why.
      return { ok: false, reason: 'commit-failed', message: committedResult.message }
    }
    committed = true
  }
  const status = await readGitStatus(dir, timeoutMs)
  if (!status.ok) return status
  if (status.detached === true) {
    return { ...status, ok: false, reason: 'detached-head', committed, message }
  }
  if (status.relation === 'behind' || status.relation === 'diverged') {
    // Uploading would be refused by the remote; committing locally already
    // happened, and the page reports both facts separately.
    return { ...status, ok: false, reason: 'behind', committed, message }
  }
  if (!committed && status.ahead === 0) {
    return { ...status, ok: true, committed: false, pushed: false, message: '' }
  }
  const pushed = await execGit(dir, ['push', remote, status.branch], timeoutMs)
  if (!pushed.ok) {
    return {
      ...status,
      ok: false,
      reason: pushed.timedOut ? 'timed-out' : 'push-failed',
      committed,
      message: pushed.message,
    }
  }
  const after = await readGitStatus(dir, timeoutMs)
  return { ...(after.ok ? after : status), ok: true, committed, pushed: true, message }
}

/**
 * Register this plugin's routes and serve the space.
 * @param ctx - host context of this plugin's fiber.
 * @param config - resolved plugin configuration.
 */
export function apply(ctx, config) {
  const configured = typeof config?.dataDir === 'string' ? config.dataDir.trim() : ''
  const dir = configured === '' ? join(resolveDshHome(), 'temp-space') : resolve(configured)
  const filesDir = join(dir, 'files')
  const statePath = join(dir, 'index.json')
  const remote = (typeof config?.gitRemote === 'string' && config.gitRemote.trim() !== '') ? config.gitRemote.trim() : 'origin'
  const maxFileBytes = config?.maxFileBytes ?? 10 * 1024 * 1024
  const maxTotalBytes = config?.maxTotalBytes ?? 100 * 1024 * 1024
  const commitPrefix = typeof config?.commitPrefix === 'string' ? config.commitPrefix : '临时空间'
  const gitTimeoutMs = config?.gitTimeoutMs ?? GIT_TIMEOUT_MS
  const gitOptions = { remote, commitPrefix, timeoutMs: gitTimeoutMs }

  /** The space as every route sees it: created on demand, never on a read that fails. */
  const ensureSpace = () => {
    if (!existsSync(dir)) {
      return { ok: false, reason: 'no-dir', dir, message: `space directory ${dir} does not exist` }
    }
    if (!existsSync(join(dir, '.git'))) {
      return { ok: false, reason: 'not-a-repo', dir, message: `${dir} is not a Git repository` }
    }
    mkdirSync(filesDir, { recursive: true })
    return { ok: true }
  }

  /** Read the stored state, filling in a first one for a space that has none. */
  const readState = () => {
    const stored = readJsonFile(statePath)
    if (stored === null || typeof stored !== 'object' || !Array.isArray(stored.items)) {
      return { version: STATE_VERSION, revision: 1, items: [] }
    }
    return {
      version: typeof stored.version === 'number' ? stored.version : STATE_VERSION,
      revision: Number.isInteger(stored.revision) ? stored.revision : 1,
      items: stored.items,
    }
  }

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: STATE_PATH,
      handler: (req, res) => {
        if (!admit(ctx, req, res)) return
        if (req.method === 'GET') {
          const space = ensureSpace()
          if (!space.ok) { sendJson(res, space, 409); return }
          const state = readState()
          const files = listStoredFiles(filesDir)
          const usedBytes = files.reduce((total, row) => total + row.bytes, 0)
          sendJson(res, {
            ok: true,
            version: state.version,
            revision: state.revision,
            items: state.items,
            files,
            usage: { usedBytes, maxTotalBytes, maxFileBytes },
            dataDir: dir,
          })
          return
        }
        if (req.method === 'PUT') {
          const space = ensureSpace()
          if (!space.ok) { sendJson(res, space, 409); return }
          void (async () => {
            const body = await readJsonBody(req, STATE_BODY_LIMIT)
            if (body === null || typeof body !== 'object') {
              sendJson(res, { ok: false, reason: 'invalid-body' }, 400)
              return
            }
            const items = validateItems(body.items)
            if (items === undefined) {
              sendJson(res, { ok: false, reason: 'invalid-items' }, 400)
              return
            }
            const revision = Number.isInteger(body.revision) ? body.revision : -1
            const current = readState()
            if (revision !== current.revision) {
              // Two writers, one canvas: the later one is told what it is looking
              // at rather than silently dropping the other's change.
              sendJson(res, { ok: false, reason: 'conflict', revision: current.revision, items: current.items }, 409)
              return
            }
            const next = { version: STATE_VERSION, revision: current.revision + 1, items }
            try {
              writeJsonAtomic(statePath, next)
            } catch (error) {
              ctx.logger.warn('temp-space: writing the canvas state failed: %s', String(error))
              sendJson(res, { ok: false, reason: 'write-failed', message: String(error) }, 500)
              return
            }
            sendJson(res, { ok: true, revision: next.revision, items: next.items })
          })()
          return
        }
        res.writeHead(405, { allow: 'GET, PUT' })
        res.end()
      },
    }), `temp-space: GET/PUT ${STATE_PATH}`)

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: BLOB_PATH,
      handler: (req, res) => {
        if (!admit(ctx, req, res)) return
        const query = new URL(req.url ?? '', 'http://localhost').searchParams
        const requested = sanitizeName(query.get('name') ?? '')
        const target = join(filesDir, requested)
        if (req.method === 'GET' || req.method === 'HEAD') {
          const space = ensureSpace()
          if (!space.ok) { sendJson(res, space, 409); return }
          let size
          try {
            const stats = statSync(target)
            if (!stats.isFile()) throw new Error('not a file')
            size = stats.size
          } catch {
            sendJson(res, { ok: false, reason: 'no-such-file', name: requested }, 404)
            return
          }
          res.writeHead(200, {
            'content-type': contentTypeOf(requested),
            'content-length': String(size),
            // Bytes change under a canvas that edits them, so no reader reuses a body.
            'cache-control': 'no-store',
            'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(requested)}`,
          })
          if (req.method === 'HEAD') { res.end(); return }
          const stream = createReadStream(target)
          stream.on('error', () => { res.destroy() })
          stream.pipe(res)
          return
        }
        if (req.method === 'POST') {
          const space = ensureSpace()
          if (!space.ok) { sendJson(res, space, 409); return }
          void (async () => {
            const bytes = await readBodyBytes(req, Math.min(BODY_READ_LIMIT, maxFileBytes))
            if (bytes === undefined) {
              sendJson(res, {
                ok: false,
                reason: 'file-too-large',
                message: `one file may hold at most ${maxFileBytes} bytes`,
                maxFileBytes,
              }, 413)
              return
            }
            const used = listStoredFiles(filesDir).reduce((total, row) => total + row.bytes, 0)
            if (used + bytes.length > maxTotalBytes) {
              sendJson(res, {
                ok: false,
                reason: 'space-full',
                message: `the space holds at most ${maxTotalBytes} bytes`,
                usedBytes: used,
                maxTotalBytes,
              }, 413)
              return
            }
            const name = uniqueName(filesDir, requested)
            try {
              writeFileSync(join(filesDir, name), bytes)
            } catch (error) {
              ctx.logger.warn('temp-space: storing a file failed: %s', String(error))
              sendJson(res, { ok: false, reason: 'write-failed', message: String(error) }, 500)
              return
            }
            sendJson(res, { ok: true, name, bytes: bytes.length, storedAs: name }, 201)
          })()
          return
        }
        if (req.method === 'DELETE') {
          const space = ensureSpace()
          if (!space.ok) { sendJson(res, space, 409); return }
          try {
            if (existsSync(target)) rmSync(target)
          } catch (error) {
            ctx.logger.warn('temp-space: deleting %s failed: %s', requested, String(error))
            sendJson(res, { ok: false, reason: 'delete-failed', message: String(error) }, 500)
            return
          }
          sendJson(res, { ok: true, name: requested })
          return
        }
        res.writeHead(405, { allow: 'GET, HEAD, POST, DELETE' })
        res.end()
      },
    }), `temp-space: GET/POST/DELETE ${BLOB_PATH}`)

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: GIT_PATH,
      handler: (req, res) => {
        if (!admit(ctx, req, res)) return
        const space = ensureSpace()
        if (!space.ok) { sendJson(res, space, 409); return }
        if (req.method === 'GET') {
          void readGitStatus(dir, gitTimeoutMs).then(
            status => { sendJson(res, status) },
            (error) => {
              ctx.logger.warn('temp-space: reading Git status failed: %s', String(error))
              sendJson(res, { ok: false, reason: 'failed', message: String(error) })
            })
          return
        }
        if (req.method === 'POST') {
          void (async () => {
            const body = await readJsonBody(req, STATE_BODY_LIMIT)
            const action = typeof body?.action === 'string' ? body.action : ''
            const result = await runGitAction(dir, action, gitOptions)
            sendJson(res, result, result.ok ? 200 : 409)
          })()
          return
        }
        res.writeHead(405, { allow: 'GET, POST' })
        res.end()
      },
    }), `temp-space: GET/POST ${GIT_PATH}`)
  })
}

export const internals = {
  ROUTE_PREFIX,
  STATE_PATH,
  BLOB_PATH,
  GIT_PATH,
  STATE_VERSION,
  MAX_NAME_LENGTH,
  MAX_ITEMS,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  WINDOWS_DEVICE_NAMES,
  CONTENT_TYPES,
  resolveDshHome,
  sanitizeName,
  uniqueName,
  listStoredFiles,
  contentTypeOf,
  validateItems,
  readBodyBytes,
  readJsonBody,
  writeJsonAtomic,
  execGit,
  readGitStatus,
  runGitAction,
}
