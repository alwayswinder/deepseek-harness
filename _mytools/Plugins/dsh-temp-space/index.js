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
 * names), the bytes themselves, the Git operations, showing one stored file in
 * the system file manager, and putting stored files or text on the clipboard —
 * neither of the last two is something a page can do itself. The stored bytes are
 * already on disk on every machine that pulled them, so that is the only way to
 * reach them — nothing is downloaded. The state is one
 * `index.json` in the same directory, written through a temporary file so a
 * reader never sees half of it, and guarded by a revision so the second of two
 * writers is told rather than silently overwriting the first. Quotas are
 * enforced here rather than in the page because this is where the bytes land.
 *
 * The space directory is the person's own Git repository, so nothing here
 * merges, rebases or resolves conflicts: pull is fast-forward only and push is
 * refused while the branch is behind, which leaves every conflict to the person
 * and a terminal. Discarding is the way back from a canvas changed by mistake:
 * the index and the working tree return to the last commit and the files nothing
 * has committed yet are removed with them, so the space ends with nothing to
 * commit and the remote is untouched.
 */

import { execFile, spawn } from 'node:child_process'
import {
  createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import z from '@deepseek-ai/schemastery'

export const name = 'temp-space'

/** Same-origin prefix every route of this plugin is served under. */
const ROUTE_PREFIX = '/api/temp-space'

/** The canvas state: read for a load, replaced for a save. */
const STATE_PATH = `${ROUTE_PREFIX}/state`

/** The stored bytes: read one back, write one, delete one. */
const BLOB_PATH = `${ROUTE_PREFIX}/blob`

/** Git status, and the three operations the page may ask for. */
const GIT_PATH = `${ROUTE_PREFIX}/git`

/** The local space directory itself: read it, adopt one, or pull a new one into a path. */
const SPACE_PATH = `${ROUTE_PREFIX}/space`

/** Show one stored file in the system file manager, which the page cannot reach. */
const REVEAL_PATH = `${ROUTE_PREFIX}/reveal`

/** Put stored files or text on the system clipboard, which the page cannot write. */
const CLIPBOARD_PATH = `${ROUTE_PREFIX}/clipboard`

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

/**
 * The machine-local file that remembers the path the page chose. It lives in the
 * harness home rather than in the space, because the whole point of choosing one
 * is that the space is not where the configuration says it is yet.
 */
const LOCATION_FILE = 'temp-space.location.json'

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
  /**
   * Remote URL a space is cloned from when this machine has none yet. The page
   * may set it as well; a URL set there is remembered in `LOCATION_FILE`.
   */
  repoUrl: z.string().default(''),
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

/**
 * Turn a page-typed path into an absolute one, or nothing when it is not one.
 *
 * `~` and `~/` expand the way the harness home does, because a path copied from
 * a terminal may use them. Anything else that is not already absolute is
 * refused rather than resolved against a process directory the person cannot
 * see.
 * @param raw - the path as typed or picked.
 * @returns the normalized absolute path, or undefined.
 */
function absolutePath(raw) {
  const value = String(raw ?? '').trim()
  if (value === '') return undefined
  let expanded = value
  if (value === '~') expanded = homedir()
  else if (value.startsWith('~/') || value.startsWith('~\\')) expanded = join(homedir(), value.slice(2))
  if (!isAbsolute(expanded)) return undefined
  return resolve(expanded)
}

/**
 * What one candidate space directory is, without changing anything.
 * @param dir - the directory to inspect.
 * @returns whether it exists, is a directory, is a Git repository, and is empty.
 */
function spaceFacts(dir) {
  let exists = false
  let directory = false
  try {
    directory = statSync(dir).isDirectory()
    exists = true
  } catch {
    // A path that cannot be read is treated as absent; the caller reports that.
  }
  let repo = false
  let empty = false
  if (directory) {
    repo = existsSync(join(dir, '.git'))
    if (!repo) {
      try {
        empty = readdirSync(dir).length === 0
      } catch {
        // A directory that cannot be listed is not a safe clone target either.
        empty = false
      }
    }
  }
  return { exists, directory, repo, empty }
}

/**
 * The two paths every route derives from a space directory.
 * @param dir - the active space directory.
 * @returns the stored-bytes directory and the canvas state file.
 */
function pathsOf(dir) {
  return { filesDir: join(dir, 'files'), statePath: join(dir, 'index.json') }
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
 * Encode one Windows path as the target Explorer can receive intact.
 *
 * Explorer parses its own command line and splits fields at commas and equals
 * signs, so a raw path loses everything after the first separator and the shell
 * opens a different target without reporting it; both separators are escaped.
 * Percent-encoded non-ASCII is not escaped: Explorer rejects it and opens the
 * user's Documents folder instead, so those escapes are decoded back.
 * @param windowsPath - absolute path of a stored file.
 * @returns the file address Explorer accepts, for a `/select,` reveal.
 */
function explorerTarget(windowsPath) {
  const href = pathToFileURL(windowsPath, { windows: true }).href
  return href
    .replace(/(?:%[89A-F][0-9A-F])+/gi, escaped => decodeURIComponent(escaped))
    .replaceAll(',', '%2C')
    .replaceAll('=', '%3D')
}

/**
 * The command that shows one file in the system file manager.
 *
 * Windows selects the file inside a folder window and macOS reveals it in
 * Finder. A Linux desktop has no portable "select this file", so the directory
 * is opened instead — the part every file manager there agrees on.
 * @param target - absolute path of a stored file.
 * @param platform - the platform choosing the command.
 * @returns the executable to start and its arguments.
 */
function revealCommand(target, platform) {
  if (platform === 'win32') return { command: 'explorer.exe', args: ['/select,', explorerTarget(target)] }
  if (platform === 'darwin') return { command: 'open', args: ['-R', target] }
  return { command: 'xdg-open', args: [dirname(target)] }
}

/**
 * Show one stored file in the system file manager.
 *
 * The command is started detached rather than awaited: Explorer hands the
 * request to the desktop process already running and then exits 1, so waiting
 * for an exit would report a failure for a window that did open. The answer
 * here is only whether the file manager could be started at all.
 * @param target - absolute path of a stored file.
 * @returns whether it started, and what went wrong when it did not.
 */
function revealFile(target) {
  const { command, args } = revealCommand(target, process.platform)
  return new Promise((done) => {
    let answered = false
    const answer = (result) => {
      if (answered) return
      answered = true
      done(result)
    }
    let child
    try {
      child = spawn(command, args, { detached: true, stdio: 'ignore' })
    } catch (error) {
      answer({ ok: false, reason: 'failed', message: String(error) })
      return
    }
    child.on('error', (error) => { answer({ ok: false, reason: 'failed', message: String(error) }) })
    child.on('spawn', () => {
      // Nothing waits for the window, and this process must not outlive the
      // request that asked for it.
      child.unref()
      answer({ ok: true })
    })
  })
}

/**
 * Quote one path so PowerShell reads it as a single literal string.
 * @param value - the path to quote.
 * @returns the quoted literal.
 */
function powerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

/**
 * The command that puts stored files or text on the system clipboard.
 *
 * A page can read the clipboard but cannot write a file list to it, so the host
 * does: `Set-Clipboard -LiteralPath` publishes the stored files as a file drop
 * list, which is what makes them pasteable in Explorer and in other applications.
 * Text travels on standard input, where no character has to survive a command
 * line. A platform with no command here is reported as unsupported rather than
 * guessed at.
 * @param payload - the absolute paths to publish, or the text to copy.
 * @param platform - the platform choosing the command.
 * @returns the executable, its arguments, and the text for its input, or undefined.
 */
function clipboardCommand(payload, platform) {
  const files = payload.files ?? []
  const text = payload.text ?? ''
  if (platform === 'win32') {
    if (files.length > 0) {
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command',
          `Set-Clipboard -LiteralPath ${files.map(powerShellLiteral).join(', ')}`],
      }
    }
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', '$input | Set-Clipboard'],
      stdin: text,
    }
  }
  if (platform === 'darwin') {
    if (files.length > 0) {
      const list = files.map(file => `(POSIX file ${JSON.stringify(file)})`).join(', ')
      return { command: 'osascript', args: ['-e', `set the clipboard to {${list}}`] }
    }
    return { command: 'pbcopy', args: [], stdin: text }
  }
  return undefined
}

/**
 * Run one clipboard command and wait for it.
 *
 * Starting a file manager is deliberately not awaited; this one is, because its
 * exit code is the answer: a clipboard that did not take the text has to be
 * reported rather than assumed.
 * @param payload - the absolute paths to publish, or the text to copy.
 * @param platform - the platform choosing the command.
 * @returns whether the clipboard took it, and what went wrong when it did not.
 */
function putOnClipboard(payload, platform) {
  const command = clipboardCommand(payload, platform)
  if (command === undefined) {
    return Promise.resolve({ ok: false, reason: 'unsupported', message: `no clipboard command for ${platform}` })
  }
  return new Promise((done) => {
    let answered = false
    const answer = (result) => {
      if (answered) return
      answered = true
      done(result)
    }
    let child
    try {
      child = spawn(command.command, command.args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
    } catch (error) {
      answer({ ok: false, reason: 'failed', message: String(error) })
      return
    }
    let stderr = ''
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', (error) => { answer({ ok: false, reason: 'failed', message: String(error) }) })
    child.on('close', (code) => {
      if (code === 0) {
        answer({ ok: true })
        return
      }
      const reported = stderr.trim()
      answer({
        ok: false,
        reason: 'failed',
        message: reported === '' ? `${command.command} exited ${code}` : reported,
      })
    })
    child.stdin?.end(command.stdin ?? '')
  })
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
 * Read the URL one remote is configured with.
 * @param dir - a Git repository.
 * @param remote - the remote name.
 * @param timeoutMs - command deadline.
 * @returns the URL, or an empty string when it is not configured.
 */
async function remoteUrlOf(dir, remote, timeoutMs) {
  const configured = await execGit(dir, ['remote', 'get-url', remote], timeoutMs)
  return configured.ok ? configured.stdout.trim() : ''
}

/**
 * Clone a space repository into a directory this machine does not hold yet.
 *
 * The target must be absent or an empty directory: an existing repository is
 * adopted instead, and anything else is refused rather than written into. The
 * remote is created under the configured name, so the rest of this plugin does
 * not have to care how the repository arrived.
 * @param dir - the target directory.
 * @param url - the remote URL to clone.
 * @param remote - the remote name the clone should use.
 * @param timeoutMs - command deadline.
 * @returns whether it cloned, and why it did not.
 */
async function cloneSpace(dir, url, remote, timeoutMs) {
  const facts = spaceFacts(dir)
  if (facts.repo) {
    return { ok: false, reason: 'already-a-repo', dir, message: `${dir} is already a Git repository` }
  }
  if (facts.exists && !facts.directory) {
    return { ok: false, reason: 'not-a-directory', dir, message: `${dir} is not a directory` }
  }
  if (facts.exists && !facts.empty) {
    return { ok: false, reason: 'dir-not-empty', dir, message: `${dir} is not empty` }
  }
  const parent = dirname(dir)
  if (!existsSync(parent)) {
    return { ok: false, reason: 'no-parent', dir, message: `${parent} does not exist` }
  }
  const cloned = await execGit(parent, ['clone', '--origin', remote, '--', url, dir], timeoutMs)
  if (!cloned.ok) {
    return {
      ok: false,
      reason: cloned.missing ? 'no-git' : cloned.timedOut ? 'timed-out' : 'clone-failed',
      dir,
      message: cloned.message,
    }
  }
  return { ok: true, dir }
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
 * There are three, and they are the three the page offers: saving (commit
 * whatever the canvas wrote, then upload it), pulling, and discarding every
 * local change. Saving is one action rather than two because a commit that was
 * never uploaded is not what "saved" means when the space lives on more than one
 * machine — and because two round trips leave a window where the page has
 * committed and the person has looked away.
 *
 * A push is attempted only when there is something to push, and never when the
 * branch is behind: the remote would refuse it anyway, and saying so before the
 * attempt keeps the reason out of Git's own transport wording.
 *
 * Discarding throws local work away irreversibly, so it is one action too: the
 * index and the working tree are reset to HEAD and the untracked files go with
 * them, because a file nothing has committed yet is a local change like any
 * other and would otherwise leave the space with something to commit. Nothing
 * here reaches the network, so what a discard ends at is always the last commit
 * this machine already had. An initial repository has no commit to reset to,
 * where `reset --hard HEAD` fails and emptying the index is the same thing: the
 * clean below leaves the working tree holding exactly what HEAD holds.
 * @param dir - the space directory.
 * @param action - `save`, `pull`, or `discard`.
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
  if (action === 'discard') {
    const before = await execGit(dir, ['status', '--porcelain=v1'], timeoutMs)
    const discarded = before.ok ? before.stdout.split('\n').filter(line => line.trim() !== '').length : 0
    const head = await execGit(dir, ['rev-parse', '--verify', '--quiet', 'HEAD'], timeoutMs)
    const reset = await execGit(dir, head.ok ? ['reset', '--hard', 'HEAD'] : ['reset'], timeoutMs)
    if (!reset.ok) return { ok: false, reason: 'failed', message: reset.message }
    const cleaned = await execGit(dir, ['clean', '-fd'], timeoutMs)
    if (!cleaned.ok) return { ok: false, reason: 'failed', message: cleaned.message }
    const status = await readGitStatus(dir, timeoutMs)
    return status.ok ? { ...status, acted: 'discard', discarded } : status
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
  const home = resolveDshHome()
  const configured = typeof config?.dataDir === 'string' ? config.dataDir.trim() : ''
  const configuredDir = configured === '' ? join(home, 'temp-space') : resolve(configured)
  const configuredUrl = typeof config?.repoUrl === 'string' ? config.repoUrl.trim() : ''
  const locationPath = join(home, LOCATION_FILE)
  const saved = readJsonFile(locationPath)
  const savedDir = saved !== null && typeof saved === 'object' && typeof saved.dataDir === 'string'
    ? absolutePath(saved.dataDir)
    : undefined
  const savedUrl = saved !== null && typeof saved === 'object' && typeof saved.repoUrl === 'string'
    ? saved.repoUrl.trim()
    : ''
  /**
   * The space directory in force. The page may switch it without a restart, so
   * every route reads it instead of the configuration value captured at boot.
   * A path chosen on this machine wins over the profile's `dataDir`.
   */
  let activeDir = savedDir ?? configuredDir
  let projectUrl = savedUrl !== '' ? savedUrl : configuredUrl
  const remote = (typeof config?.gitRemote === 'string' && config.gitRemote.trim() !== '') ? config.gitRemote.trim() : 'origin'
  const maxFileBytes = config?.maxFileBytes ?? 10 * 1024 * 1024
  const maxTotalBytes = config?.maxTotalBytes ?? 100 * 1024 * 1024
  const commitPrefix = typeof config?.commitPrefix === 'string' ? config.commitPrefix : '临时空间'
  const gitTimeoutMs = config?.gitTimeoutMs ?? GIT_TIMEOUT_MS
  const gitOptions = { remote, commitPrefix, timeoutMs: gitTimeoutMs }

  /**
   * Remember what the page chose, so the next start finds the space even when the
   * profile's configuration still names a different directory. The file holds no
   * path when the configured one is in force, which is what keeps a machine that
   * never used the setting indistinguishable from one that reset it.
   * @returns whether the file was written.
   */
  const persistLocation = () => {
    const dataDir = activeDir === configuredDir ? '' : activeDir
    const repoUrl = projectUrl === configuredUrl ? '' : projectUrl
    try {
      if (dataDir === '' && repoUrl === '') rmSync(locationPath, { force: true })
      else writeJsonAtomic(locationPath, { dataDir, repoUrl })
      return true
    } catch (error) {
      ctx.logger.warn('temp-space: saving the chosen path failed: %s', String(error))
      return false
    }
  }

  /** The space as every route sees it: created on demand, never on a read that fails. */
  const ensureSpace = (dir = activeDir) => {
    if (!existsSync(dir)) {
      return { ok: false, reason: 'no-dir', dir, message: `space directory ${dir} does not exist` }
    }
    if (!existsSync(join(dir, '.git'))) {
      return { ok: false, reason: 'not-a-repo', dir, message: `${dir} is not a Git repository` }
    }
    mkdirSync(join(dir, 'files'), { recursive: true })
    return { ok: true }
  }

  /** Read the stored state, filling in a first one for a space that has none. */
  const readState = (statePath) => {
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
        const dir = activeDir
        const { filesDir, statePath } = pathsOf(dir)
        if (req.method === 'GET') {
          const space = ensureSpace(dir)
          if (!space.ok) { sendJson(res, space, 409); return }
          const state = readState(statePath)
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
          const space = ensureSpace(dir)
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
            const current = readState(statePath)
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
      path: SPACE_PATH,
      handler: (req, res) => {
        if (!admit(ctx, req, res)) return
        if (req.method === 'GET') {
          void (async () => {
            // One snapshot per request: a path switch landing mid-read must not
            // produce facts from one directory and an origin from another.
            const dir = activeDir
            const facts = spaceFacts(dir)
            const origin = facts.repo ? await remoteUrlOf(dir, remote, gitTimeoutMs) : ''
            // A machine whose configured space still exists can offer its origin
            // as the URL to clone from, which is what lets a fresh path on the
            // same machine pull without anyone pasting the address again.
            let configuredOrigin = ''
            if (projectUrl === '' && origin === '' && configuredDir !== dir) {
              const configuredFacts = spaceFacts(configuredDir)
              if (configuredFacts.repo) configuredOrigin = await remoteUrlOf(configuredDir, remote, gitTimeoutMs)
            }
            sendJson(res, {
              ok: true,
              dir,
              configuredDir,
              override: dir !== configuredDir,
              exists: facts.exists,
              isDirectory: facts.directory,
              isRepo: facts.repo,
              empty: facts.empty,
              repoUrl: projectUrl !== '' ? projectUrl : (origin !== '' ? origin : configuredOrigin),
              savedRepoUrl: projectUrl,
              origin,
              remote,
            })
          })()
          return
        }
        if (req.method === 'POST') {
          void (async () => {
            const body = await readJsonBody(req, STATE_BODY_LIMIT)
            const action = typeof body?.action === 'string' ? body.action : ''
            if (action === 'reset') {
              activeDir = configuredDir
              projectUrl = configuredUrl
              persistLocation()
              const facts = spaceFacts(activeDir)
              sendJson(res, {
                ok: true,
                mode: 'reset',
                dir: activeDir,
                configuredDir,
                override: false,
                ...facts,
              })
              return
            }
            const requested = absolutePath(typeof body?.dir === 'string' ? body.dir : '')
            if (requested === undefined) {
              sendJson(res, { ok: false, reason: 'invalid-path', message: 'the path must be absolute' }, 400)
              return
            }
            const url = typeof body?.repoUrl === 'string' ? body.repoUrl.trim() : ''
            if (action === 'use') {
              const facts = spaceFacts(requested)
              if (!facts.exists) {
                sendJson(res, { ok: false, reason: 'no-dir', dir: requested, message: `${requested} does not exist` }, 409)
                return
              }
              if (!facts.directory) {
                sendJson(res, { ok: false, reason: 'not-a-directory', dir: requested, message: `${requested} is not a directory` }, 409)
                return
              }
              if (!facts.repo) {
                sendJson(res, { ok: false, reason: 'not-a-repo', dir: requested, message: `${requested} is not a Git repository` }, 409)
                return
              }
              // Read it before adopting it: a `.git` entry that Git itself cannot
              // use must not become the remembered path.
              const status = await readGitStatus(requested, gitTimeoutMs)
              if (!status.ok) { sendJson(res, status, 409); return }
              activeDir = requested
              if (url !== '') projectUrl = url
              else if (projectUrl === '') projectUrl = await remoteUrlOf(requested, remote, gitTimeoutMs)
              const persisted = persistLocation()
              sendJson(res, { ...status, mode: 'adopted', dir: requested, persisted })
              return
            }
            if (action === 'pull') {
              const facts = spaceFacts(requested)
              if (facts.repo) {
                // An existing repository is adopted first, then pulled: a failed
                // pull leaves the person with a usable space and one clear line
                // saying the network half did not happen.
                const before = await readGitStatus(requested, gitTimeoutMs)
                if (!before.ok) { sendJson(res, before, 409); return }
                activeDir = requested
                if (url !== '') projectUrl = url
                else if (projectUrl === '') projectUrl = await remoteUrlOf(requested, remote, gitTimeoutMs)
                const persisted = persistLocation()
                const pulled = await runGitAction(requested, 'pull', gitOptions)
                if (pulled.ok) {
                  sendJson(res, { ...pulled, mode: 'pulled', dir: requested, persisted })
                  return
                }
                const status = await readGitStatus(requested, gitTimeoutMs)
                sendJson(res, {
                  ...(status.ok ? status : {}),
                  ...pulled,
                  ok: false,
                  mode: 'pulled',
                  dir: requested,
                  connected: true,
                  persisted,
                }, 409)
                return
              }
              const cloneUrl = url !== '' ? url : projectUrl
              if (cloneUrl === '') {
                sendJson(res, {
                  ok: false,
                  reason: 'no-repo-url',
                  dir: requested,
                  message: 'no remote URL is known for this space',
                }, 400)
                return
              }
              const cloned = await cloneSpace(requested, cloneUrl, remote, gitTimeoutMs)
              if (!cloned.ok) { sendJson(res, cloned, 409); return }
              activeDir = requested
              projectUrl = cloneUrl
              const persisted = persistLocation()
              const status = await readGitStatus(requested, gitTimeoutMs)
              if (!status.ok) { sendJson(res, status, 409); return }
              sendJson(res, { ...status, mode: 'cloned', dir: requested, persisted })
              return
            }
            sendJson(res, { ok: false, reason: 'unknown-action' }, 400)
          })()
          return
        }
        res.writeHead(405, { allow: 'GET, POST' })
        res.end()
      },
    }), `temp-space: GET/POST ${SPACE_PATH}`)

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: BLOB_PATH,
      handler: (req, res) => {
        if (!admit(ctx, req, res)) return
        const dir = activeDir
        const { filesDir } = pathsOf(dir)
        const query = new URL(req.url ?? '', 'http://localhost').searchParams
        const requested = sanitizeName(query.get('name') ?? '')
        const target = join(filesDir, requested)
        if (req.method === 'GET' || req.method === 'HEAD') {
          const space = ensureSpace(dir)
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
          const space = ensureSpace(dir)
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
          const space = ensureSpace(dir)
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
        const dir = activeDir
        const space = ensureSpace(dir)
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

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: REVEAL_PATH,
      handler: (req, res) => {
        if (!admit(ctx, req, res)) return
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' })
          res.end()
          return
        }
        const space = ensureSpace(activeDir)
        if (!space.ok) { sendJson(res, space, 409); return }
        const dir = activeDir
        const { filesDir } = pathsOf(dir)
        void (async () => {
          const body = await readJsonBody(req, STATE_BODY_LIMIT)
          const requested = sanitizeName(typeof body?.name === 'string' ? body.name : '')
          const target = join(filesDir, requested)
          let stored = false
          try {
            stored = statSync(target).isFile()
          } catch {
            // A name that is not on disk is exactly what this answers, and a
            // file removed since the listing lands in the same refusal.
            stored = false
          }
          if (!stored) {
            sendJson(res, { ok: false, reason: 'no-such-file', name: requested }, 404)
            return
          }
          const revealed = await revealFile(target)
          sendJson(res, revealed.ok ? { ok: true, name: requested } : revealed, revealed.ok ? 200 : 500)
        })()
      },
    }), `temp-space: POST ${REVEAL_PATH}`)

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: CLIPBOARD_PATH,
      handler: (req, res) => {
        if (!admit(ctx, req, res)) return
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' })
          res.end()
          return
        }
        const space = ensureSpace(activeDir)
        if (!space.ok) { sendJson(res, space, 409); return }
        const dir = activeDir
        const { filesDir } = pathsOf(dir)
        void (async () => {
          const body = await readJsonBody(req, STATE_BODY_LIMIT)
          const text = typeof body?.text === 'string' ? body.text : undefined
          const requested = Array.isArray(body?.names) ? body.names : []
          if (text === undefined && requested.length === 0) {
            sendJson(res, { ok: false, reason: 'invalid-body' }, 400)
            return
          }
          const files = []
          for (const raw of requested) {
            const name = sanitizeName(typeof raw === 'string' ? raw : '')
            const target = join(filesDir, name)
            let stored = false
            try {
              stored = statSync(target).isFile()
            } catch {
              // A name that is not on disk is exactly what this answers, and a
              // file removed since the listing lands in the same refusal.
              stored = false
            }
            if (!stored) {
              sendJson(res, { ok: false, reason: 'no-such-file', name }, 404)
              return
            }
            files.push(target)
          }
          const copied = await putOnClipboard({ files, text: text ?? '' }, process.platform)
          const status = copied.ok ? 200 : copied.reason === 'unsupported' ? 501 : 500
          sendJson(res, copied.ok ? { ok: true, files: files.length, text: text !== undefined } : copied, status)
        })()
      },
    }), `temp-space: POST ${CLIPBOARD_PATH}`)
  })
}

export const internals = {
  ROUTE_PREFIX,
  STATE_PATH,
  BLOB_PATH,
  GIT_PATH,
  SPACE_PATH,
  REVEAL_PATH,
  CLIPBOARD_PATH,
  LOCATION_FILE,
  STATE_VERSION,
  MAX_NAME_LENGTH,
  MAX_ITEMS,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  WINDOWS_DEVICE_NAMES,
  CONTENT_TYPES,
  resolveDshHome,
  absolutePath,
  spaceFacts,
  pathsOf,
  sanitizeName,
  uniqueName,
  listStoredFiles,
  contentTypeOf,
  validateItems,
  readBodyBytes,
  readJsonBody,
  writeJsonAtomic,
  explorerTarget,
  revealCommand,
  powerShellLiteral,
  clipboardCommand,
  execGit,
  remoteUrlOf,
  cloneSpace,
  readGitStatus,
  runGitAction,
}
