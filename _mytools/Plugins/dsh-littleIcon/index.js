/**
 * DSH Little Icon — host half.
 *
 * The pet is a separate process, not an overlay inside the DSH window: this half
 * samples the agent state and writes it to a state file, and `pet/pet.ps1`
 * (PowerShell + WPF) draws a frameless always-on-top window from it, handling
 * dragging, click-to-tuck the DSH window, and its own right-click menu. Because
 * the pet owns its window, it stays on the desktop while the DSH window is hidden.
 *
 * Either side can tuck DSH away: the pet on a click, and this half by asking for
 * one in the state file once DSH has been left untouched, still on screen, for
 * the configured stretch. Only the pet touches the window; the host owns the
 * activity clock, because the page reports its input to the host rather than to
 * the pet.
 *
 * Click-to-tuck needs Win32: the desktop shell exposes no window control to
 * plugins (no transparent/always-on-top window and no minimize/hide channel in
 * its preload),
 * and this half runs in the `ELECTRON_RUN_AS_NODE` child process, where Electron
 * APIs are unavailable. The pet therefore calls `ShowWindow` on the window owned
 * by this process's parent — the Electron main process.
 *
 * State and window position live under `$DSH_HOME/little-icon/`, so they stay
 * per machine and never sync with the repository.
 *
 * The menu's Git entry needs repository facts the page cannot read: this half
 * runs `git` itself and serves the result on same-origin routes, because the
 * browser half has no filesystem and no process to run. The directory is the one
 * the asking Session works in, so the page sends it with the request, and the
 * detail behind one row is a route of its own — one file's diff, or one
 * commit's files — because each asks a different question about a different
 * pair of Git objects. The history column is read a page at a time on a route of
 * its own as well, so the list can be walked past its first ten commits and
 * narrowed to one author.
 *
 * Opening that same directory in the file manager is the mirror image: the page
 * knows which directory it is and cannot open one, this half can open one and
 * does not know which. The page names it on a route of its own, and the failure
 * that follows comes back to the pet through the state file, because the pet is
 * where the click happened.
 */

import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

export const name = 'little-icon'

/** One animation directory per state, built by `tools/build-assets.py`. */
const STATES = ['idle', 'working', 'bored', 'sleep', 'happy', 'alert']

/**
 * Same-origin route the browser half pings on user activity. "The pet sleeps
 * because nobody is doing anything" needs an input signal, and the Host sees
 * only agents and jobs — pointer and keyboard activity has to arrive from the
 * page. The pet's own position file counts too, so dragging it also wakes it.
 */
const ACTIVITY_PATH = '/api/little-icon/activity'

/**
 * Same-origin route carrying the pet's menu commands to the page as Server-Sent
 * Events. The menu is drawn by the pet process and the page performs what it
 * chooses, so the Host relays: it owns the file both sides agree on, and it is
 * the only process that can serve the page.
 */
const COMMANDS_PATH = '/api/little-icon/commands'

/**
 * Same-origin route the page reads the workspace's Git state from. The Git page
 * lives in the page, which cannot spawn a process, so the Host runs the commands
 * and answers with JSON.
 */
const GIT_PATH = '/api/little-icon/git'

/**
 * Same-origin route the page reads one changed file's diff from. It is a route
 * of its own rather than a parameter of the listing: the listing answers with
 * every path at once, while a diff names one repository root and one path and
 * compares them against whichever side of the index holds the change.
 */
const GIT_DIFF_PATH = '/api/little-icon/git/diff'

/**
 * Same-origin route the page reads one commit's changed files from, for the
 * commit a row in the history column was double-clicked on. Like the diff route
 * it names one repository root and one thing inside it.
 */
const GIT_COMMIT_PATH = '/api/little-icon/git/commit'

/**
 * Same-origin route the page reads later pages of that history column from, and
 * the same column under an author filter. It is a route of its own because the
 * column asks the same question again and again: where the listing answers with
 * a repository's first page, this answers with one page of one author's history.
 */
const GIT_COMMITS_PATH = '/api/little-icon/git/commits'

/** Same-origin POST route that refreshes and compares the configured upstream. */
const GIT_REMOTE_PATH = '/api/little-icon/git/remote'

/** Same-origin POST route that fast-forwards the current branch from its upstream. */
const GIT_PULL_PATH = '/api/little-icon/git/pull'

/**
 * Same-origin route that opens the Session's working directory in the system
 * file manager. Neither half can do it alone: which directory the person is
 * working in is the page's knowledge — it is the Session the main view holds —
 * and starting a process is the Host's, so the page names the directory here.
 */
const OPEN_PATH = '/api/little-icon/open'

/** The Git executable; a machine without one on PATH is reported, not guessed at. */
const GIT_EXECUTABLE = 'git'

/** Longest a single Git command may run before it is killed. */
const GIT_TIMEOUT_MS = 10_000

/** Default network deadline for an upstream check or pull; deployments can override it. */
const GIT_PULL_TIMEOUT_MS = 60_000

/** Ceiling on one command's output; a larger status or log is an error, not a pause. */
const GIT_MAX_BUFFER = 8 * 1024 * 1024

/**
 * Longest diff the route sends. A one-file diff of a generated file or a
 * lockfile can be tens of megabytes, which the page would have to lay out line
 * by line; past this the answer is cut and says so.
 */
const GIT_DIFF_MAX_CHARS = 200_000

/** The empty file an untracked path is diffed against: `--no-index` needs two files. */
const GIT_NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null'

/**
 * Flags every `git diff` here carries, right after the subcommand: the page
 * shows the text as it arrives, so a configured color or external diff driver
 * would put escape codes or another program's output in it.
 */
const GIT_DIFF_FLAGS = ['--no-color', '--no-ext-diff']

/**
 * How long the pet gets to answer a quit request before it is ended. Its own
 * timer reads the request within one 200 ms tick; the deadline only has to beat a
 * pet that cannot answer at all, and every millisecond of it delays a restart.
 */
const PET_QUIT_GRACE_MS = 1_000

/**
 * How many commits one page of the history column holds. The page asks for the
 * next one when the list is scrolled to its end, so this is what the column
 * shows before the reader asks for more rather than a cap on the list.
 */
const GIT_LOG_PAGE = 10

/**
 * Field separator inside one `git log` record. `-z` separates records with NUL,
 * so the two never collide however a subject is punctuated.
 */
const GIT_FIELD = '\u001f'

/** Volatile fields apply to the running plugin without remounting it. */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  /** Pet window edge in pixels; the frames are 256px and are scaled down. */
  size: z.number().step(1).min(64).max(512).default(160).volatile(),
  /** Whether the pet fades while the pointer is away from it. */
  translucent: z.boolean().default(true).volatile(),
  /** Opacity while the pointer is away; hover always shows the pet fully. */
  idleOpacity: z.number().min(0.1).max(1).default(0.45).volatile(),
  /** Milliseconds each animation frame stays on screen. */
  frameMs: z.number().step(10).min(120).max(5000).default(600).volatile(),
  /** Host sampling interval in milliseconds. */
  pollMs: z.number().step(50).min(200).max(10000).default(800).volatile(),
  /** How long `happy` lasts after a busy period ends. */
  happyMs: z.number().step(100).min(0).max(60000).default(3000).volatile(),
  /** Idle seconds between the pet's occasional `bored` interruptions. */
  boredEverySeconds: z.number().step(1).min(5).max(3600).default(60).volatile(),
  /** How long each `bored` interruption lasts. */
  boredMs: z.number().step(100).min(0).max(60000).default(5000).volatile(),
  /** Seconds without any user activity before the pet sleeps. */
  sleepAfterSeconds: z.number().step(1).min(5).max(86400).default(600).volatile(),
  /** Sleep timer while DSH is tucked away, where dragging the pet is the only activity. */
  sleepWhenHiddenSeconds: z.number().step(1).min(2).max(3600).default(20).volatile(),
  /** Whether the pet tucks DSH away on its own while another application is in front. */
  autoHide: z.boolean().default(true).volatile(),
  /** Seconds DSH stays behind before that tuck; zero tucks it as soon as it goes behind. */
  autoHideSeconds: z.number().step(1).min(0).max(3600).default(0).volatile(),
  /** Whether the pet stays above other windows. */
  topmost: z.boolean().default(true).volatile(),
  /** Click behaviour: tuck/restore DSH, minimize only, or nothing. */
  clickAction: z.union(['toggle', 'minimize', 'none']).default('toggle').volatile(),
  /** Milliseconds an upstream check or pull may spend contacting its remote. */
  gitPullTimeoutMs: z.number().step(1000).min(1000).max(300000).default(GIT_PULL_TIMEOUT_MS).volatile(),
  /**
   * Directory screenshots are written to; blank keeps them in the plugin's own
   * `shots/` beside the state file.
   */
  shotDir: z.string().default('').volatile(),
  /**
   * Sites the pet's menu offers, in this order. `name` is what the entry reads
   * and `url` what the page opens; a row whose address the in-app Browser tab
   * could not open is left out of the menu rather than offered as an entry that
   * does nothing.
   */
  sites: z.array(z.object({
    name: z.string().default(''),
    url: z.string().default(''),
  })).default([]).volatile(),
})

/**
 * The directory a capture goes to, as the pet is told it: a blank setting is no
 * choice at all, `~` expands to the user directory, and a relative path is
 * relative to that directory rather than to whatever this process was started in.
 * @param raw - the configured value.
 * @returns absolute directory, or undefined when the setting is blank.
 */
function resolveShotDir(raw) {
  const value = raw.trim()
  if (value === '') return undefined
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return isAbsolute(value) ? resolve(value) : resolve(homedir(), value)
}

/**
 * One address a menu entry may open in the in-app Browser tab. A person typing a
 * site writes `example.com`, so a missing scheme is completed the way a browser's
 * address bar completes one; a scheme that is already there is kept, which is
 * what leaves `file:` and `javascript:` refused here rather than opened later.
 * This is the only place that decides: the menu list is built from it, and the
 * command the pet sends back is checked against it too, because that command
 * arrives through a file.
 * @param value - the configured address.
 * @returns the absolute HTTP(S) address, or undefined when nothing may open.
 */
function openableUrl(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') return undefined
  const candidate = /^[a-z][a-z0-9+.-]*:/iu.test(text) ? text : `https://${text}`
  let url
  try {
    url = new URL(candidate)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (url.username !== '' || url.password !== '') return undefined
  return url.href
}

/**
 * The sites the pet's menu offers: the configured rows the Browser tab can open,
 * in the configured order. The note names the entry, and a row that left it blank
 * is named by its host so the menu never shows an empty line.
 * @param rows - configured rows.
 * @returns sites the pet is told about, in that order.
 */
function resolveSites(rows) {
  const sites = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const url = openableUrl(row?.url)
    if (url === undefined) continue
    const note = typeof row?.name === 'string' ? row.name.trim() : ''
    sites.push({ name: note === '' ? new URL(url).hostname : note, url })
  }
  return sites
}

/**
 * Resolve `$DSH_HOME` exactly as the harness does: blank means unset, a leading
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
 * Locate Windows PowerShell. The pet window needs an STA thread, which
 * `powershell.exe` provides by default and every Windows installation has;
 * `pwsh` may be absent.
 * @returns executable path.
 */
function resolvePowershell() {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
  const bundled = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return existsSync(bundled) ? bundled : 'powershell.exe'
}

// Windows refuses to replace a file another process has open at all — the share
// mode does not matter — and the pet reads the state file every 200 ms, so one of
// its reads can land inside this rename. Retry briefly instead of letting one
// refused replacement end the host: this runs in a timer, and the harness exits
// the whole process on an uncaught exception there.
const REPLACE_ATTEMPTS = 5
const REPLACE_RETRY_MS = 10
// A file that stays locked would otherwise report at the sampling rate.
const FAILURE_REPORT_MS = 30_000

/**
 * Wait without yielding. Node has no synchronous sleep, and no sampling tick may
 * run between two attempts at replacing the same file.
 * @param ms - milliseconds to block.
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Write the state file only when it changes, plus one heartbeat rewrite per
 * interval so the pet can treat a stale file as a dead host. A snapshot that
 * cannot be placed leaves the previous one readable and reports the error: the
 * caller is a timer, and throwing there takes DSH down with it.
 */
class StateFileWriter {
  /**
   * @param path - absolute state file path.
   * @param heartbeatMs - longest interval without a write while content is unchanged.
   * @param onFailure - receives the error of a write that could not be placed, at
   * most once per 30 seconds while writes keep failing.
   */
  constructor(path, heartbeatMs, onFailure) {
    this.path = path
    this.heartbeatMs = heartbeatMs
    this.onFailure = onFailure
    this.lastStable = ''
    this.lastWrite = 0
    this.lastFailureAt = 0
  }

  /**
   * Publish one snapshot. The heartbeat timestamp changes every sample, so the
   * comparison uses the fields the pet acts on and rewrites only when those move
   * or the heartbeat interval has passed.
   * @param state - snapshot to publish.
   * @returns whether the file was written.
   */
  write(state) {
    const { updatedAt, ...stable } = state
    const stableText = JSON.stringify(stable)
    const now = Date.now()
    if (stableText === this.lastStable && now - this.lastWrite < this.heartbeatMs) return false
    const temporary = `${this.path}.tmp`
    const text = `${JSON.stringify({ ...stable, updatedAt })}\n`
    let failure
    for (let attempt = 1; attempt <= REPLACE_ATTEMPTS; attempt += 1) {
      try {
        writeFileSync(temporary, text, 'utf8')
        renameSync(temporary, this.path)
        this.lastStable = stableText
        this.lastWrite = now
        return true
      } catch (error) {
        failure = error
        if (attempt < REPLACE_ATTEMPTS) sleepSync(REPLACE_RETRY_MS)
      }
    }
    const report = (error) => {
      if (now - this.lastFailureAt < FAILURE_REPORT_MS) return
      this.lastFailureAt = now
      this.onFailure(error)
    }
    // The pet reads this file every 200 ms and Windows refuses to rename over an
    // open file, so a snapshot can lose that race five times running. Writing in
    // place is not atomic, but the pet tolerates a half-read snapshot — its JSON
    // parse fails and it keeps the values it had — and a file that never moves is
    // worse: the pet would wear an old expression until the next launch. Only a
    // snapshot that cannot land either way is a failure worth reporting.
    try {
      writeFileSync(this.path, text, 'utf8')
      this.lastStable = stableText
      this.lastWrite = now
      return true
    } catch (error) {
      failure = error
    }
    report(failure)
    return false
  }
}

/** Cross-sample bookkeeping: the run edges, the boredom clock, and the last activity. */
function createTimeline(now) {
  return {
    /** Whether the last sample still had a run in flight: work under way, or a question. */
    inFlight: false,
    happyUntil: 0,
    boredUntil: 0,
    nextBoredAt: now + 60_000,
    lastActivityAt: now,
    /** Whether the last sample already reported sleep, so waking can be noticed. */
    asleep: false,
  }
}

/**
 * Decide which state the pet shows.
 *
 * One run reads as: work while it runs, surprise while it is blocked on the person
 * — a question with options or an approval is the pet asking for a decision, and it
 * keeps asking until it is answered — joy when the run ends, then idle. Boredom
 * follows the agent being idle rather than the mouse, so a person reading a long
 * answer still sees it now and then. Sleep follows user activity instead: the
 * caller passes the timer in force — much shorter while DSH is tucked away — and
 * any activity, whether page input, a drag, or bringing DSH back, leaves sleep for
 * idle.
 *
 * @param work - what the agents report: `busy` (work under way) and `waiting` (an agent blocked on the person).
 * @param activityAt - latest user activity seen, in milliseconds.
 * @param timeline - cross-sample bookkeeping, updated in place.
 * @param config - resolved config values; its `sleepAfterSeconds` is the limit in force.
 * @param now - sample time in milliseconds.
 * @returns one of {@link STATES}.
 */
function sampleState(work, activityAt, timeline, config, now) {
  const active = activityAt > timeline.lastActivityAt
  timeline.lastActivityAt = Math.max(timeline.lastActivityAt, activityAt)
  // Work and an unanswered question are one run: neither may report the run as
  // finished, and a question must not let the pet fall asleep on the person.
  const inFlight = work.busy || work.waiting
  if (inFlight) {
    timeline.lastActivityAt = now
    timeline.asleep = false
    if (!timeline.inFlight) {
      timeline.inFlight = true
      timeline.boredUntil = 0
    }
    return work.waiting ? 'alert' : 'working'
  }
  if (timeline.inFlight) {
    timeline.inFlight = false
    timeline.happyUntil = now + config.happyMs
    timeline.lastActivityAt = now
    timeline.boredUntil = 0
    timeline.nextBoredAt = now + config.boredEverySeconds * 1000
    timeline.asleep = false
  }
  if (now < timeline.happyUntil) return 'happy'
  if ((now - timeline.lastActivityAt) / 1000 >= config.sleepAfterSeconds) {
    timeline.asleep = true
    return 'sleep'
  }
  if (timeline.asleep) {
    // Waking starts a fresh idle stretch rather than resuming mid-boredom.
    timeline.asleep = false
    timeline.boredUntil = 0
    timeline.nextBoredAt = now + config.boredEverySeconds * 1000
  }
  if (active) timeline.boredUntil = 0
  if (now >= timeline.nextBoredAt) {
    // Jittered so the pet reads as idling rather than running a metronome.
    timeline.boredUntil = now + config.boredMs
    timeline.nextBoredAt = now + config.boredEverySeconds * 1000 * (0.7 + Math.random() * 0.6)
  }
  return now < timeline.boredUntil ? 'bored' : 'idle'
}

/**
 * What the agents report right now: whether work is under way once the agents
 * blocked on a human answer are set aside, and whether one of them is waiting for
 * that answer. The two waterfalls that ask the user leave the agent `running`
 * while they wait, and what the loop waits on then is the person, not the model.
 * @param ctx - host context carrying the optional `agents` and `jobs` services.
 * @param waiting - ids of the agents currently waiting for the user.
 * @returns `busy` with the waiting agents excluded, and `waiting` for any of them.
 */
function sampleWork(ctx, waiting) {
  const agents = ctx.get('agents')
  const jobs = ctx.get('jobs')
  const live = agents === undefined ? [] : agents.list()
  // Work is a model that is generating or running tools. A job does not count,
  // even though a running one is real work: every tool call's subprocess is a
  // job, and a call whose child outlives it — a dev server left running, a
  // detached helper, a push still holding its connection — keeps that job
  // `running` indefinitely, so a pet reading jobs stayed on "working" long after
  // the turn ended. A message in an inbox is not work either: a settled job's
  // completion notice lands in `nextStep` and waits there for a step that may
  // never come (a quiet delivery, or a spent wake budget). The desktop update
  // gate counts both because it asks a different question — whether stopping the
  // Host right now would lose something. A delegated subagent still shows up as
  // an agent, so real background work keeps the face it should have.
  const generating = live.filter(agent => !waiting.has(agent.id) && agent.status === 'running')
  const queued = live.reduce(
    (total, agent) => total + agent.inbox.nextTurn.length + agent.inbox.nextStep.length,
    0,
  )
  const working = jobs === undefined ? [] : [undefined, ...live].flatMap(agent => jobs.list(agent?.id)
    .filter(job => job.status === 'running' || job.status === 'stopping'))
  return {
    busy: generating.length > 0,
    waiting: live.some(agent => waiting.has(agent.id)),
    // Published with the state, so a face that looks wrong explains itself from
    // the file: how many agents generate, how many jobs are still running, and
    // how much input is waiting.
    reason: { agents: generating.length, jobs: working.length, queued },
  }
}

/**
 * Whether the pet should tuck DSH away now: another application is in front of a
 * window that is still on screen, and it has been for the configured stretch.
 * DSH itself in front is never tucked away, however long nothing is touched, and
 * neither is a running task a reason to wait: tucking DSH away while work
 * continues is the point of the setting. The pet executes the tuck, because it
 * owns the window.
 * @param dshWindow - what the pet last reported: `visible`, `foreground`, and `behindSince`.
 * @param config - resolved config values.
 * @param now - sample time in milliseconds.
 * @returns whether to ask the pet to tuck DSH away.
 */
function shouldTuck(dshWindow, config, now) {
  if (!config.autoHide || !dshWindow.visible || dshWindow.foreground) return false
  if (dshWindow.behindSince === undefined) return false
  return (now - dshWindow.behindSince) / 1000 >= config.autoHideSeconds
}

/**
 * Read the menu command the pet last wrote.
 * @param path - absolute command file path.
 * @returns that command, its timestamp, and — for the entry that opens a
 *   configured site — the address it named, which is carried only when the
 *   in-app Browser tab may open it. Undefined when there is nothing readable: no
 *   choice yet, or a half-written file.
 */
function readCommand(path) {
  try {
    const reported = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof reported.at !== 'number' || typeof reported.command !== 'string') return undefined
    const url = openableUrl(reported.url)
    return { command: reported.command, at: reported.at, ...url === undefined ? {} : { url } }
  } catch {
    // No command yet, or a half-written one.
    return undefined
  }
}

/**
 * Run one Git command in a directory.
 * @param cwd - directory the command runs in.
 * @param args - Git arguments, without the executable.
 * @param timeoutMs - command deadline in milliseconds.
 * @returns whether it succeeded, its output, an explanation when it did not, and
 *   whether the executable itself was absent; a spawn failure arrives here rather
 *   than as a rejection.
 */
function execGit(cwd, args, timeoutMs = GIT_TIMEOUT_MS) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => (
    value !== undefined && !/(?:KEY|SECRET|TOKEN|PASSWORD)/iu.test(key)
  )))
  // A pull has no terminal to answer a credential prompt. Refuse interactivity
  // explicitly so authentication trouble returns through the page instead of
  // leaving an invisible child until the deadline.
  env.GIT_TERMINAL_PROMPT = '0'
  env.GCM_INTERACTIVE = 'Never'
  return new Promise((resolve) => {
    execFile(GIT_EXECUTABLE, args, {
      cwd, timeout: timeoutMs, maxBuffer: GIT_MAX_BUFFER, windowsHide: true, encoding: 'utf8', env,
    }, (error, stdout, stderr) => {
      if (error === null) {
        resolve({ ok: true, stdout })
        return
      }
      const reported = (stderr ?? '').trim()
      resolve({
        ok: false,
        stdout: stdout ?? '',
        // A spawn failure and an exceeded output cap write no stderr, and the
        // error's own message is then the only explanation there is to show.
        message: reported === '' ? error.message : reported,
        missing: error.code === 'ENOENT',
        timedOut: error.killed === true,
      })
    })
  })
}

/**
 * Parse `git status --porcelain=v1 -z --untracked-files=all`.
 *
 * Each record is `XY <path>` followed by NUL, and a rename or copy carries its
 * source path as the next record, so the walk advances by hand. An untracked
 * file is `??`, which is what "new" means here; `--untracked-files=all` lists the
 * files inside a new directory instead of collapsing them into the directory.
 * @param raw - the command's output.
 * @returns one entry per changed path, in Git's own order.
 */
function parseGitStatus(raw) {
  const records = raw.split('\0')
  const entries = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record.length < 4) continue
    const status = record.slice(0, 2)
    const path = record.slice(3)
    const source = status.includes('R') || status.includes('C') ? records[index + 1] : undefined
    if (source !== undefined) index += 1
    entries.push({ path, status, ...source === undefined || source === '' ? {} : { from: source } })
  }
  return entries
}

/**
 * Parse `git log -z --pretty=format:<hash><field>…`.
 * @param raw - the command's output.
 * @returns one entry per commit, newest first as Git emitted them.
 */
function parseGitLog(raw) {
  const commits = []
  for (const record of raw.split('\0')) {
    if (record === '') continue
    const [hash, short, author, date, subject] = record.split(GIT_FIELD)
    if (hash === undefined || short === undefined) continue
    commits.push({ hash, short, author: author ?? '', date: date ?? '', subject: subject ?? '' })
  }
  return commits
}

/**
 * Arguments for one page of `git log`.
 *
 * One row over the page size is asked for, so whether a further page exists is
 * answered by the same walk instead of a second one counting the history.
 * `--skip` is what moves the page along; the listing's own first page is this
 * query without it, which is what keeps the two lined up. `-F` is what makes an
 * author identity a fixed string: `--author` reads its pattern as a basic
 * regular expression otherwise, where an address like `second+tag@example.test`
 * is a quantifier that matches another commit, or nothing at all.
 * @param options - page offset, rows per page, and the author identity to keep.
 * @returns the arguments, without the executable.
 */
function gitLogArgs({ skip = 0, limit = GIT_LOG_PAGE, author = '' } = {}) {
  const args = ['log', '-z', '-n', String(limit + 1), `--skip=${skip}`,
    `--pretty=format:%H${GIT_FIELD}%h${GIT_FIELD}%an${GIT_FIELD}%aI${GIT_FIELD}%s`]
  return author === '' ? args : [...args, '-F', `--author=${author}`]
}

/**
 * Parse `git shortlog -sne`.
 *
 * One line per identity: the commit count, a tab, then `Name <email>` as Git
 * spells it — the same spelling the log rows carry, which is what makes it the
 * filter's identity rather than a display name the page would have to translate
 * back into one.
 * @param raw - the command's output.
 * @returns one entry per author, in Git's own order, which counts down.
 */
function parseGitAuthors(raw) {
  const authors = []
  for (const line of raw.split('\n')) {
    const match = /^\s*(\d+)\t(.*)$/u.exec(line)
    if (match === null) continue
    const id = match[2].trim()
    if (id === '') continue
    const parts = /^(.*?)\s*<([^>]*)>$/u.exec(id)
    authors.push({
      id,
      name: parts === null ? id : parts[1],
      email: parts === null ? '' : parts[2],
      commits: Number(match[1]),
    })
  }
  return authors
}

/**
 * Whether a path is an existing directory.
 * @param path - absolute path to test.
 * @returns whether it is a directory right now.
 */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    // Missing, unreadable, or replaced by a file: either way not a directory.
    return false
  }
}

/**
 * Open one Session's working directory in the system file manager.
 *
 * The directory is checked here rather than left to the file manager: a Session
 * whose directory has since been deleted is something the pet says out loud,
 * where a shell asked for a path that is gone opens a different folder or a
 * dialog of its own — neither of which reads as a refusal.
 * @param cwd - the directory the page reported; empty when its Session has none.
 * @param launch - starts the file manager on one existing directory, and is the
 *   caller's because only it has a logger for the spawn failure that arrives
 *   after this returns.
 * @returns `{ ok: true, path }`, or `{ ok: false, reason }` with `no-cwd`,
 *   `no-dir`, or `failed` plus the launcher's message.
 */
function openWorkingDirectory(cwd, launch) {
  if (cwd === '') return { ok: false, reason: 'no-cwd' }
  if (!isDirectory(cwd)) return { ok: false, reason: 'no-dir' }
  try {
    launch(cwd)
    return { ok: true, path: cwd }
  } catch (error) {
    return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Read the Git state of one directory.
 *
 * The directory identifies the repository rather than the other way round: the
 * page sends the workspace its Session works in and Git resolves the root from
 * there, so a Session started in a subdirectory still reports its whole
 * repository. A directory outside every repository is a normal answer, not a
 * failure, and so is a repository whose first commit has not been made yet.
 * @param cwd - directory to inspect.
 * @returns `{ ok: true, root, branch, changes, commits, hasMoreCommits, authors }`,
 *   or `{ ok: false }` with a `reason` of `no-dir`, `no-git`, `not-a-repo`, or
 *   `failed` plus the command's message.
 */
async function readGitRepository(cwd) {
  // Checked here rather than inferred from a spawn failure: a missing directory
  // and a missing `git` both fail to spawn with ENOENT, and the page says
  // different things about them.
  if (!isDirectory(cwd)) return { ok: false, reason: 'no-dir' }
  const top = await execGit(cwd, ['rev-parse', '--show-toplevel'])
  if (!top.ok) return { ok: false, reason: top.missing ? 'no-git' : 'not-a-repo' }
  const root = top.stdout.trim()
  const [branch, status, log, authors] = await Promise.all([
    execGit(root, ['branch', '--show-current']),
    execGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    execGit(root, gitLogArgs()),
    // The filter's choices come from one walk of the history rather than from
    // the rows on screen, which would only ever offer the authors already there.
    execGit(root, ['shortlog', '-sne', 'HEAD']),
  ])
  if (!status.ok) return { ok: false, reason: 'failed', message: status.message }
  const rows = parseGitLog(log.stdout)
  return {
    ok: true,
    root,
    // A detached HEAD has no branch name; the column then shows the commit alone.
    branch: branch.ok ? branch.stdout.trim() : '',
    changes: parseGitStatus(status.stdout),
    // `git log` fails while the repository has no commit to walk from, which is
    // a repository that has no history rather than one that cannot be read.
    commits: log.ok ? rows.slice(0, GIT_LOG_PAGE) : [],
    hasMoreCommits: log.ok && rows.length > GIT_LOG_PAGE,
    authors: authors.ok ? parseGitAuthors(authors.stdout) : [],
  }
}

/**
 * Read one page of the history column.
 *
 * It is the listing's own log query moved along by `skip` and narrowed to one
 * author, because the column shows more of one list rather than a different
 * question. The directory identifies the repository exactly as it does for the
 * listing, so a page asked for after the workspace moved is answered about the
 * repository that is there now.
 * @param cwd - the Session's working directory.
 * @param skip - how many commits the column already shows.
 * @param author - one identity from the listing's own author list, or empty for
 *   every author.
 * @returns `{ ok: true, root, commits, hasMore }`, or `{ ok: false }` with the
 *   listing's own reasons.
 */
async function readGitCommits(cwd, skip = 0, author = '') {
  if (!isDirectory(cwd)) return { ok: false, reason: 'no-dir' }
  const top = await execGit(cwd, ['rev-parse', '--show-toplevel'])
  if (!top.ok) return { ok: false, reason: top.missing ? 'no-git' : 'not-a-repo' }
  const root = top.stdout.trim()
  const log = await execGit(root, gitLogArgs({ skip, author }))
  // Past the last page Git answers with nothing rather than failing; a walk that
  // did fail has no history to add, which is the same answer to the column.
  const rows = log.ok ? parseGitLog(log.stdout) : []
  return { ok: true, root, commits: rows.slice(0, GIT_LOG_PAGE), hasMore: rows.length > GIT_LOG_PAGE }
}

/** Last queued network operation per repository root. */
const gitNetworkTails = new Map()

/** Upstream checks already running for one repository and tracking ref. */
const gitRemoteChecks = new Map()

/**
 * Serialize remote operations for one repository.
 *
 * Separate tabs may refresh or pull the same checkout at once. Git protects its
 * refs with lock files, so those operations take turns here instead of exposing
 * an incidental lock failure in the page.
 * @param root - repository root used as the serialization key.
 * @param run - operation to start after the previous one settles.
 * @returns the operation's result.
 */
async function runGitNetworkOperation(root, run) {
  const previous = gitNetworkTails.get(root) ?? Promise.resolve()
  const operation = previous.catch(() => {}).then(run)
  const tail = operation.then(() => undefined, () => undefined)
  gitNetworkTails.set(root, tail)
  try {
    return await operation
  } finally {
    if (gitNetworkTails.get(root) === tail) gitNetworkTails.delete(root)
  }
}

/**
 * Refresh and compare one branch's configured upstream.
 *
 * The fetch updates only that branch's remote-tracking ref and never the local
 * branch, index, or working tree. `ahead` counts commits only on local HEAD;
 * `behind` counts commits available from the upstream but absent from HEAD.
 * Concurrent tabs join the same check.
 * @param cwd - directory inside the repository to inspect.
 * @param timeoutMs - remote contact deadline in milliseconds.
 * @returns `{ ok: true, relation, ahead, behind }`, or `{ ok: false }` with
 *   `no-dir`, `no-git`, `not-a-repo`, `detached-head`, `no-upstream`,
 *   `timed-out`, or `failed`.
 */
async function readGitRemoteStatus(cwd, timeoutMs = GIT_PULL_TIMEOUT_MS) {
  if (!isDirectory(cwd)) return { ok: false, reason: 'no-dir' }
  const top = await execGit(cwd, ['rev-parse', '--show-toplevel'])
  if (!top.ok) return { ok: false, reason: top.missing ? 'no-git' : 'not-a-repo' }
  const root = top.stdout.trim()
  const branch = await execGit(root, ['branch', '--show-current'])
  if (!branch.ok) return { ok: false, reason: 'failed', message: branch.message }
  const branchName = branch.stdout.trim()
  if (branchName === '') return { ok: false, reason: 'detached-head' }

  const configured = await execGit(root, [
    'for-each-ref',
    '--count=1',
    '--format=%(upstream:remotename)%00%(upstream:remoteref)%00%(upstream)',
    `refs/heads/${branchName}`,
  ])
  if (!configured.ok) return { ok: false, reason: 'failed', message: configured.message }
  const [remoteName = '', remoteRef = '', upstreamRef = ''] = configured.stdout.trim().split('\0')
  if (remoteName === '' || remoteRef === '' || upstreamRef === '') {
    return { ok: false, reason: 'no-upstream' }
  }

  const key = `${root}\0${upstreamRef}`
  const running = gitRemoteChecks.get(key)
  if (running !== undefined) return running
  const operation = runGitNetworkOperation(root, async () => {
    if (remoteName !== '.') {
      const fetched = await execGit(root, [
        'fetch', '--quiet', '--no-tags', '--no-write-fetch-head',
        remoteName, `+${remoteRef}:${upstreamRef}`,
      ], timeoutMs)
      if (!fetched.ok) {
        return {
          ok: false,
          reason: fetched.timedOut ? 'timed-out' : 'failed',
          message: fetched.message,
        }
      }
    }
    const counts = await execGit(root, ['rev-list', '--left-right', '--count', `HEAD...${upstreamRef}`])
    if (!counts.ok) return { ok: false, reason: 'failed', message: counts.message }
    const [aheadText, behindText] = counts.stdout.trim().split(/\s+/)
    const ahead = Number.parseInt(aheadText, 10)
    const behind = Number.parseInt(behindText, 10)
    if (!Number.isInteger(ahead) || !Number.isInteger(behind)) {
      return { ok: false, reason: 'failed', message: 'git rev-list returned invalid ahead/behind counts' }
    }
    return {
      ok: true,
      relation: behind === 0 ? 'up-to-date' : ahead === 0 ? 'behind' : 'diverged',
      ahead,
      behind,
    }
  })
  gitRemoteChecks.set(key, operation)
  try {
    return await operation
  } finally {
    if (gitRemoteChecks.get(key) === operation) gitRemoteChecks.delete(key)
  }
}

/** Pull operations already running for a repository root, shared by every open tab. */
const gitPulls = new Map()

/**
 * Fast-forward one directory's current branch from its configured upstream.
 *
 * The operation refuses a detached HEAD and a branch without an upstream before
 * it contacts a remote. `--ff-only` preserves local history: a diverged branch
 * fails instead of creating a merge commit. Concurrent tabs join the same pull
 * for one root so Git never competes with itself for repository locks.
 * @param cwd - Session working directory inside the repository to update.
 * @param timeoutMs - network and update deadline in milliseconds.
 * @returns the refreshed repository listing plus `updated`, or `{ ok: false }`
 *   with `no-dir`, `no-git`, `not-a-repo`, `detached-head`, `no-upstream`,
 *   `timed-out`, or `failed`.
 */
async function pullGitRepository(cwd, timeoutMs = GIT_PULL_TIMEOUT_MS) {
  if (!isDirectory(cwd)) return { ok: false, reason: 'no-dir' }
  const top = await execGit(cwd, ['rev-parse', '--show-toplevel'])
  if (!top.ok) return { ok: false, reason: top.missing ? 'no-git' : 'not-a-repo' }
  const root = top.stdout.trim()
  const branch = await execGit(root, ['branch', '--show-current'])
  if (!branch.ok) return { ok: false, reason: 'failed', message: branch.message }
  if (branch.stdout.trim() === '') return { ok: false, reason: 'detached-head' }
  const upstream = await execGit(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
  if (!upstream.ok) return { ok: false, reason: 'no-upstream' }

  const running = gitPulls.get(root)
  if (running !== undefined) return running
  const operation = (async () => {
    const updated = await runGitNetworkOperation(root, async () => {
      const before = await execGit(root, ['rev-parse', 'HEAD'])
      if (!before.ok) return { ok: false, reason: 'failed', message: before.message }
      const pulled = await execGit(root, [
        '-c', 'merge.autoStash=false', '-c', 'rebase.autoStash=false',
        'pull', '--ff-only',
      ], timeoutMs)
      if (!pulled.ok) {
        return { ok: false, reason: pulled.timedOut ? 'timed-out' : 'failed', message: pulled.message }
      }
      const after = await execGit(root, ['rev-parse', 'HEAD'])
      if (!after.ok) return { ok: false, reason: 'failed', message: after.message }
      return { ok: true, moved: before.stdout.trim() !== after.stdout.trim() }
    })
    if (!updated.ok) return updated
    const listing = await readGitRepository(root)
    return listing.ok
      ? { ...listing, updated: updated.moved }
      : listing
  })()
  gitPulls.set(root, operation)
  try {
    return await operation
  } finally {
    if (gitPulls.get(root) === operation) gitPulls.delete(root)
  }
}

/**
 * Read one changed file's diff.
 *
 * Which comparison shows the change depends on where the path stands, which is
 * what its own porcelain letters say: a path Git has never been told about has
 * nothing to compare against, so it is diffed against the null device, while a
 * staged change, an unstaged one, or both get one block per side. `HEAD` is
 * never named as the other side of the comparison: a repository whose first
 * commit has not been made yet has no such revision, and `--cached` already
 * compares the index against the empty tree there.
 * @param root - the repository root, which the page takes from the listing: a
 *   path is relative to the root, not to the Session's own directory.
 * @param path - the changed path, relative to the root.
 * @returns `{ ok: true, text, truncated }`, or `{ ok: false }` with the same
 *   `reason` values the listing answers with plus the command's message.
 */
async function readGitDiff(root, path) {
  // Checked and resolved exactly as the listing does it, so a page that names
  // something other than a repository gets the same explanations here.
  if (!isDirectory(root)) return { ok: false, reason: 'no-dir' }
  const top = await execGit(root, ['rev-parse', '--show-toplevel'])
  if (!top.ok) return { ok: false, reason: top.missing ? 'no-git' : 'not-a-repo' }
  // A pathspec that names this one path whatever glob characters its name holds;
  // `--no-index` takes plain filenames instead, so only the tracked diffs use it.
  const named = `:(literal)${path}`
  const status = await execGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', named])
  if (!status.ok) return { ok: false, reason: 'failed', message: status.message }
  const [entry] = parseGitStatus(status.stdout)
  // A path Git has nothing to report about has no diff either; that is an empty
  // answer, not a failure. It is also what a refresh sees once the change was
  // committed while the page was open.
  if (entry === undefined) return { ok: true, text: '', truncated: false }
  /** One read-only `git diff`, with the flags every diff here carries. */
  const runDiff = (args) => execGit(root, ['diff', ...GIT_DIFF_FLAGS, ...args])
  const blocks = []
  if (entry.status === '??') {
    // `--no-index` exits 1 when the two files differ, which is the answer here
    // rather than a failure, and it still writes the diff to stdout.
    const added = await runDiff(['--no-index', '--', GIT_NULL_DEVICE, path])
    if (!added.ok && added.stdout === '') return { ok: false, reason: 'failed', message: added.message }
    blocks.push(added.stdout)
  } else {
    // The index letter is the staged side, the worktree letter the unstaged one;
    // a space means that side holds nothing, so its command is not run at all.
    if (entry.status[0] !== ' ') {
      const staged = await runDiff(['--cached', '--', named])
      if (!staged.ok) return { ok: false, reason: 'failed', message: staged.message }
      blocks.push(staged.stdout)
    }
    if (entry.status[1] !== ' ') {
      const worktree = await runDiff(['--', named])
      if (!worktree.ok) return { ok: false, reason: 'failed', message: worktree.message }
      blocks.push(worktree.stdout)
    }
  }
  const text = blocks.join('')
  return text.length <= GIT_DIFF_MAX_CHARS
    ? { ok: true, text, truncated: false }
    : { ok: true, text: text.slice(0, GIT_DIFF_MAX_CHARS), truncated: true }
}

/**
 * Parse `git diff-tree --name-status -z` records.
 *
 * Each record is the status, then one path — or two, source before destination,
 * when rename detection matched a move.
 * @param raw - the command's output.
 * @returns one entry per changed path, in Git's own order, with `from` on a
 *   rename or copy.
 */
function parseGitCommitFiles(raw) {
  const records = raw.split('\0')
  const files = []
  for (let index = 0; index < records.length; index += 1) {
    const status = records[index]
    // The output ends with a NUL, so the last record is empty.
    if (status === '') continue
    const path = records[index + 1]
    if (path === undefined) break
    // A rename or copy is the one status that names two paths, and the source
    // comes first; its score rides along in the status (`R100`).
    if (status[0] === 'R' || status[0] === 'C') {
      const moved = records[index + 2]
      if (moved === undefined) break
      files.push({ status, path: moved, from: path })
      index += 2
      continue
    }
    files.push({ status, path })
    index += 1
  }
  return files
}

/**
 * Read the files one commit touched.
 *
 * A commit has no working tree to compare against, so its changed paths come
 * from `diff-tree`, which lists the two tree-ish it is given. The page sends the
 * hash the history column already showed, and the parents are asked for rather
 * than assumed: the first commit has none, so the empty tree is the other side,
 * and a merge commit diffs against its first parent — `diff-tree` lists nothing
 * at all for a merge given only its own hash.
 * @param root - the repository root, which the page takes from the listing.
 * @param hash - the commit to list.
 * @returns `{ ok: true, files }`, or `{ ok: false }` with the listing's own
 *   `reason` values plus the command's message.
 */
async function readGitCommit(root, hash) {
  if (!isDirectory(root)) return { ok: false, reason: 'no-dir' }
  const top = await execGit(root, ['rev-parse', '--show-toplevel'])
  if (!top.ok) return { ok: false, reason: top.missing ? 'no-git' : 'not-a-repo' }
  const lineage = await execGit(root, ['rev-list', '--parents', '-n', '1', hash])
  if (!lineage.ok) return { ok: false, reason: 'failed', message: lineage.message }
  const [commit, ...parents] = lineage.stdout.trim().split(/\s+/)
  // A hash the listing gave resolves, so this is the empty answer rather than a
  // refusal: nothing is known to have changed.
  if (commit === undefined || commit === '') return { ok: true, files: [] }
  const listed = await execGit(root, ['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', '-M',
    ...parents.length === 0 ? ['--root', commit] : [parents[0], commit]])
  if (!listed.ok) return { ok: false, reason: 'failed', message: listed.message }
  return { ok: true, files: parseGitCommitFiles(listed.stdout) }
}

/**
 * Answer one Git read as JSON.
 *
 * Every Git route here is a read a page asked for, so they share one frame: the
 * same-origin guard the harness's other routes use, GET only, and a JSON body
 * that is always 200 — a directory outside every repository is an answer the
 * page renders, not a transport failure.
 * @param ctx - host context, for the connection guard and the logger.
 * @param req - the request.
 * @param res - the response.
 * @param read - produces the payload for one request's query parameters.
 */
function serveGitRead(ctx, req, res, read) {
  const connection = ctx.get('connection')
  const rejection = connection === undefined ? undefined : connection.requestRejection(req)
  if (rejection !== undefined) {
    res.writeHead(rejection)
    res.end()
    return
  }
  if (req.method !== 'GET') {
    res.writeHead(405)
    res.end()
    return
  }
  const query = new URL(req.url ?? '', 'http://localhost').searchParams
  void read(query).then(
    (payload) => { sendJson(res, payload) },
    (error) => {
      // execGit settles every spawn failure, so this arm is a defect in a reader
      // rather than a repository problem.
      ctx.logger.warn('little-icon: git read failed: %s', String(error))
      sendJson(res, { ok: false, reason: 'failed', message: String(error) })
    })
}

/**
 * Run the Git page's explicit mutation and answer with its refreshed listing.
 * @param ctx - host context providing connection authorization and logging.
 * @param req - the request; only POST is accepted.
 * @param res - the response.
 * @param run - performs the mutation for the request's query parameters.
 */
function serveGitMutation(ctx, req, res, run) {
  const connection = ctx.get('connection')
  const rejection = connection === undefined ? undefined : connection.requestRejection(req)
  if (rejection !== undefined) {
    res.writeHead(rejection)
    res.end()
    return
  }
  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end()
    return
  }
  const query = new URL(req.url ?? '', 'http://localhost').searchParams
  void run(query).then(
    (payload) => { sendJson(res, payload) },
    (error) => {
      ctx.logger.warn('little-icon: git mutation failed: %s', String(error))
      sendJson(res, { ok: false, reason: 'failed', message: String(error) })
    })
}

/**
 * Write one JSON payload, uncached: the page re-reads on refresh and on opening
 * a diff, and a cached answer would show a repository that has already moved.
 * @param res - the response.
 * @param payload - the JSON-serializable body.
 */
function sendJson(res, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(200, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * Launch the pet process.
 * @param script - absolute `pet.ps1` path.
 * @param assets - absolute directory holding one folder per state.
 * @param stateFile - absolute state file path.
 * @param positionFile - absolute window position path.
 * @param dshPid - owning window process; 0 disables window control.
 * @returns the child process.
 */
function spawnPet(script, assets, stateFile, positionFile, dshPid) {
  return spawn(resolvePowershell(), [
    '-NoProfile',
    '-NonInteractive',
    '-STA',
    '-ExecutionPolicy', 'Bypass',
    '-File', script,
    '-AssetDir', assets,
    '-StateFile', stateFile,
    '-PositionFile', positionFile,
    '-DshPid', String(dshPid),
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
}

/**
 * Start the pet, publish its state, and stop both when the plugin unloads.
 * @param ctx - host context.
 * @param config - validated volatile config references.
 */
export function apply(ctx, config) {
  const dataDir = join(resolveDshHome(), 'little-icon')
  mkdirSync(dataDir, { recursive: true })
  const stateFile = join(dataDir, 'state.json')
  const positionFile = join(dataDir, 'position.json')
  /**
   * Written by the pet: whether DSH is on screen, which picks the sleep timer,
   * and whether it is the window in front, whose changes count as activity.
   */
  const windowFile = join(dataDir, 'window.json')
  /** Written by the pet when a menu entry is chosen; read here and relayed to the page. */
  const commandFile = join(dataDir, 'command.json')
  /**
   * Written here to ask the pet to quit rather than killing it: the pet answers by
   * storing its position and closing its own window, so a teardown never races the
   * position file it is still writing.
   */
  const quitFile = join(dataDir, 'quit')
  const writer = new StateFileWriter(stateFile, 4000, (error) => {
    ctx.logger.warn('little-icon: could not write %s: %s', stateFile, String(error))
  })
  const script = fileURLToPath(new URL('./pet/pet.ps1', import.meta.url))
  const assets = fileURLToPath(new URL('./assets', import.meta.url))

  // The desktop shell runs this host as an Electron process in Node mode, so the
  // host's parent is the Electron main process — the window the pet tucks away.
  // The running binary is what proves it: ELECTRON_RUN_AS_NODE is inherited by
  // every child, so a tool or a test started from the host has it too and would
  // otherwise aim the pet at its own parent. The web profile runs plain node and
  // has no window to control, so the pet then only floats.
  const dshPid = process.env.ELECTRON_RUN_AS_NODE === '1' && /^electron(\.exe)?$/iu.test(basename(process.execPath))
    ? process.ppid
    : 0
  const timeline = createTimeline(Date.now())
  /** Latest user activity the browser half reported, in milliseconds. */
  let reportedActivityAt = Date.now()
  /** Last window visibility the pet reported; assumed visible until it says so. */
  let dshVisible = true
  /**
   * Last foreground the pet reported; assumed in front until it says so, which is
   * also the state that never asks for a tuck.
   */
  let dshForeground = true
  /** When DSH last went behind an application, in milliseconds; undefined while it is in front. */
  let behindSince
  /** Timestamp of the last menu command already sent to the page; older ones are history. */
  let lastCommandAt = readCommand(commandFile)?.at ?? 0
  /**
   * The last request to open the working directory that ended without a window,
   * as `{ at, reason }`, or undefined while every one of them opened one. It
   * travels in the state file because the pet is the half with a place to say
   * it: the click happens on the pet, and a menu entry that opened nothing must
   * not read as one that did nothing. `at` is what tells a pet that has already
   * shown this one from a fresh failure.
   */
  let openNotice
  /** Open command streams, one per DSH window that is listening. */
  const commandStreams = new Set()
  let child
  let timer
  let disposed = false

  for (const state of STATES) {
    const dir = join(assets, state)
    if (!existsSync(dir) || !existsSync(join(dir, '1.png'))) {
      ctx.logger.warn('little-icon: missing pet frames for state "%s" in %s', state, assets)
    }
  }

  /** Current config values; volatile fields are references. */
  const values = () => ({
    enabled: config.enabled.get(),
    size: config.size.get(),
    translucent: config.translucent.get(),
    idleOpacity: config.idleOpacity.get(),
    frameMs: config.frameMs.get(),
    happyMs: config.happyMs.get(),
    boredEverySeconds: config.boredEverySeconds.get(),
    boredMs: config.boredMs.get(),
    sleepAfterSeconds: config.sleepAfterSeconds.get(),
    sleepWhenHiddenSeconds: config.sleepWhenHiddenSeconds.get(),
    autoHide: config.autoHide.get(),
    autoHideSeconds: config.autoHideSeconds.get(),
    topmost: config.topmost.get(),
    clickAction: config.clickAction.get(),
    shotDir: config.shotDir.get(),
    sites: resolveSites(config.sites.get()),
  })

  /**
   * Latest activity from every source the pet must notice: page input reported
   * over the route, and the pet's own position file, which changes whenever the
   * user drags it or asks the menu to move it home.
   * @returns the newest activity timestamp.
   */
  const activityAt = () => {
    let newest = reportedActivityAt
    try {
      newest = Math.max(newest, statSync(positionFile).mtimeMs)
    } catch {
      // No position yet: the pet has not been moved on this machine.
    }
    return newest
  }

  /**
   * What the pet last reported about the DSH window: whether it is on screen and
   * whether it — or the pet — is what the user has in front, plus when it last
   * went behind an application. Showing, hiding, and bringing it forward are all
   * deliberate acts, so either change counts as activity — it wakes the pet when
   * DSH comes back and restarts the tucked timer when it goes away.
   * @param now - sample time in milliseconds.
   * @returns the known window facts; a field the report leaves out keeps its last value.
   */
  const readDshWindow = (now) => {
    try {
      const reported = JSON.parse(readFileSync(windowFile, 'utf8'))
      if (typeof reported.dshVisible === 'boolean' && reported.dshVisible !== dshVisible) {
        dshVisible = reported.dshVisible
        reportedActivityAt = now
      }
      if (typeof reported.dshForeground === 'boolean' && reported.dshForeground !== dshForeground) {
        dshForeground = reported.dshForeground
        // The time DSH went behind is what the auto-tuck counts, so it starts
        // when the report turns and ends when DSH comes back to the front.
        behindSince = dshForeground ? undefined : now
        reportedActivityAt = now
      }
    } catch {
      // No report yet, or a half-written one: keep the last known values.
    }
    return { visible: dshVisible, foreground: dshForeground, behindSince }
  }

  const publish = () => {
    const now = Date.now()
    const current = values()
    const dshWindow = readDshWindow(now)
    // Tucked away, the only activity left is dragging the pet, so the pet sleeps
    // on the much shorter timer the settings card exposes.
    const config = dshWindow.visible ? current : { ...current, sleepAfterSeconds: current.sleepWhenHiddenSeconds }
    const activity = activityAt()
    const work = sampleWork(ctx, waitingForUser)
    const state = sampleState(work, activity, timeline, config, now)
    writer.write({
      state,
      // Why the pet says "working", for the settings card and for anyone
      // reading the file when it looks stuck: agents generating, jobs running,
      // and how much input is waiting in the inboxes.
      work: work.reason,
      size: current.size,
      // The pet applies one opacity; `translucent` is the switch the settings
      // card exposes, `idleOpacity` how far it fades.
      opacity: current.translucent ? current.idleOpacity : 1,
      frameMs: current.frameMs,
      topmost: current.topmost,
      clickAction: current.clickAction,
      // Where a capture goes. Absent while the setting is blank, which is what
      // leaves the pet on its own directory beside the state file.
      shotDir: resolveShotDir(current.shotDir),
      // The menu's site entries, in the configured order. The pet rebuilds that
      // submenu from this list whenever it opens, so an edit here reaches a
      // running pet without restarting either half.
      sites: current.sites,
      // A command rather than a fact: the pet hides the window it owns, and the
      // visibility it then reports turns this back off.
      tuck: shouldTuck(dshWindow, current, now),
      // Absent until an open fails, and unchanged after that, so it costs one
      // write rather than one per sample.
      notice: openNotice,
      updatedAt: now,
    })
  }

  /**
   * Send one menu command to every listening page. Nothing is queued: a command
   * chosen while no page listens is dropped, because the page is what performs it.
   * @param command - the menu entry's id, as the pet reported it.
   * @param url - the address that entry named, for the one id that carries one.
   */
  const publishCommand = (command, url) => {
    const frame = `data: ${JSON.stringify({ command, ...url === undefined ? {} : { url } })}\n\n`
    for (const stream of commandStreams) {
      if (stream.writableEnded || stream.destroyed) {
        commandStreams.delete(stream)
        continue
      }
      stream.write(frame)
    }
  }

  /** Relay a menu command the pet wrote since the last tick, if there is one. */
  const forwardCommand = () => {
    const pressed = readCommand(commandFile)
    if (pressed === undefined || pressed.at <= lastCommandAt) return
    lastCommandAt = pressed.at
    publishCommand(pressed.command, pressed.url)
  }

  /**
   * Agents blocked on a human answer right now. Asking the user is a waterfall
   * request that leaves the agent `running` while it waits, so a pet reading only
   * the status would show "working" for a decision nobody has seen yet.
   */
  const waitingForUser = new Set()

  /**
   * Follow one request for a human answer until its answer settles, however it
   * settles. The listener observes only: it returns the waterfall's own promise.
   * @param agent - the asking agent, as the scoped event carries it.
   * @param answered - the waterfall's promise for the user's answer.
   * @returns that same promise.
   */
  const trackWaiting = (agent, answered) => {
    const id = agent?.id
    if (id !== undefined) {
      waitingForUser.add(id)
      const done = () => { waitingForUser.delete(id) }
      Promise.resolve(answered).then(done, done)
    }
    return answered
  }

  // Prepended so the answerer a shipped bundle composes later cannot short-circuit
  // the waterfall before this observation; both listeners delegate with next().
  ctx.on('user-questions/request', (request, next) => trackWaiting(request.agent, next()), { prepend: true })
  ctx.on('approval/request', (request, next) => trackWaiting(request.agent, next()), { prepend: true })

  /**
   * Run one step that reads or writes the pet's files, reporting instead of
   * letting the error out. The harness exits the whole host on an uncaught
   * exception or rejection, and a pet file that cannot be written must not take
   * DSH with it, whether the step came from the sampling timer or a settings
   * change.
   * @param what - short label naming the step in the log line.
   * @param step - the step to run.
   */
  const guarded = (what, step) => {
    try {
      step()
    } catch (error) {
      ctx.logger.warn('little-icon: %s failed: %s', what, String(error))
    }
  }

  /**
   * One sampling tick: publish the pet's state, then relay any menu command.
   */
  const sample = () => {
    guarded('sampling tick', () => {
      publish()
      forwardCommand()
    })
  }

  // The page pings this on pointer and keyboard activity; without it the pet
  // could only tell "no task is running", which is not the same as "nobody is
  // there", and it would fall asleep while the person is working in DSH.
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: ACTIVITY_PATH,
      handler: (req, res) => {
        const connection = ctx.get('connection')
        const rejection = connection === undefined ? undefined : connection.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection)
          res.end()
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        reportedActivityAt = Date.now()
        res.writeHead(204)
        res.end()
      },
    }), `little-icon: POST ${ACTIVITY_PATH}`)
  })

  // One event stream per DSH window, held open until that window goes away; the
  // pet cannot reach the page and the page cannot see the pet's menu, so the
  // host is the only path between them.
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: COMMANDS_PATH,
      handler: (req, res) => {
        const connection = ctx.get('connection')
        const rejection = connection === undefined ? undefined : connection.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection)
          res.end()
          return
        }
        if (req.method !== 'GET') {
          res.writeHead(405)
          res.end()
          return
        }
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        // A comment frame opens the stream now, so a page that subscribes sees it
        // live rather than when the first command arrives.
        res.write(': little-icon menu commands\n\n')
        commandStreams.add(res)
        const forget = () => { commandStreams.delete(res) }
        req.on('close', forget)
        res.on('error', forget)
      },
    }), `little-icon: GET ${COMMANDS_PATH}`)
  })

  // The Git pages are drawn from these routes: the page has no filesystem and no
  // process of its own, so the Host is the only half that can ask Git anything.
  // The directory arrives with the listing request because the page is what knows
  // which Session it belongs to — the same directory the person already handed
  // this agent to work in. The upstream status route is POST because it refreshes
  // one remote-tracking ref. Pull is the only route that changes the local branch
  // or working tree, and it stays fast-forward-only.
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: GIT_PATH,
      handler: (req, res) => {
        serveGitRead(ctx, req, res, (query) => {
          const cwd = query.get('cwd') ?? ''
          // Checked here rather than inferred from a spawn failure, so a page that
          // has not learned its Session's workspace is told that, not that git is
          // missing.
          if (cwd === '') return Promise.resolve({ ok: false, reason: 'no-cwd' })
          return readGitRepository(cwd)
        })
      },
    }), `little-icon: GET ${GIT_PATH}`)
    // One file's diff, for the file a row in that listing was double-clicked on.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: GIT_DIFF_PATH,
      handler: (req, res) => {
        serveGitRead(ctx, req, res, (query) => readGitDiff(
          query.get('root') ?? '', query.get('path') ?? '',
        ))
      },
    }), `little-icon: GET ${GIT_DIFF_PATH}`)
    // One commit's changed files, for the commit a history row was double-clicked on.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: GIT_COMMIT_PATH,
      handler: (req, res) => {
        serveGitRead(ctx, req, res, (query) => readGitCommit(
          query.get('root') ?? '', query.get('hash') ?? '',
        ))
      },
    }), `little-icon: GET ${GIT_COMMIT_PATH}`)
    // Later pages of the same history column, and the same column under one
    // author: the page keeps one list and asks for more of it.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: GIT_COMMITS_PATH,
      handler: (req, res) => {
        serveGitRead(ctx, req, res, (query) => {
          const cwd = query.get('cwd') ?? ''
          if (cwd === '') return Promise.resolve({ ok: false, reason: 'no-cwd' })
          const skip = Number.parseInt(query.get('skip') ?? '', 10)
          return readGitCommits(
            cwd, Number.isSafeInteger(skip) && skip > 0 ? skip : 0, query.get('author') ?? '',
          )
        })
      },
    }), `little-icon: GET ${GIT_COMMITS_PATH}`)
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: GIT_REMOTE_PATH,
      handler: (req, res) => {
        serveGitMutation(ctx, req, res, (query) => readGitRemoteStatus(
          query.get('root') ?? '', config.gitPullTimeoutMs.get(),
        ))
      },
    }), `little-icon: POST ${GIT_REMOTE_PATH}`)
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: GIT_PULL_PATH,
      handler: (req, res) => {
        serveGitMutation(ctx, req, res, (query) => {
          const cwd = query.get('cwd') ?? ''
          if (cwd === '') return Promise.resolve({ ok: false, reason: 'no-cwd' })
          return pullGitRepository(cwd, config.gitPullTimeoutMs.get())
        })
      },
    }), `little-icon: POST ${GIT_PULL_PATH}`)
    // The one route here with a side effect outside the page: it opens the
    // directory in the shell's own file manager. POST, so a page that re-reads
    // its listing never opens a folder by itself.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: OPEN_PATH,
      handler: (req, res) => {
        const connection = ctx.get('connection')
        const rejection = connection === undefined ? undefined : connection.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection)
          res.end()
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        const query = new URL(req.url ?? '', 'http://localhost').searchParams
        const outcome = openWorkingDirectory(query.get('cwd') ?? '', (directory) => {
          // explorer.exe is the shell itself, so the folder opens in the window
          // the person already uses and an open Explorer is handed the path
          // rather than a second one being started.
          const child = spawn('explorer.exe', [directory], { detached: true, stdio: 'ignore' })
          // A spawn failure arrives after this returns. Without a listener it is
          // an unhandled `error` event, which takes the whole host down.
          child.once('error', (error) => {
            ctx.logger.warn('little-icon: could not open %s: %s', directory, String(error))
          })
          child.unref()
        })
        if (!outcome.ok) openNotice = { at: Date.now(), reason: outcome.reason }
        sendJson(res, outcome)
      },
    }), `little-icon: POST ${OPEN_PATH}`)
  })

  const startPet = () => {
    if (child !== undefined || disposed) return
    if (process.platform !== 'win32') {
      ctx.logger.info('little-icon: the pet window runs on Windows only')
      return
    }
    if (!existsSync(script)) {
      ctx.logger.warn('little-icon: pet script missing at %s', script)
      return
    }
    // A request left over from a host that died mid-teardown belongs to no pet;
    // leaving it would end the next one the moment it starts.
    try {
      rmSync(quitFile, { force: true })
    } catch (error) {
      ctx.logger.warn('little-icon: could not clear %s: %s', quitFile, String(error))
    }
    try {
      child = spawnPet(script, assets, stateFile, positionFile, dshPid)
    } catch (error) {
      ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      child = undefined
      return
    }
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (text !== '') ctx.logger.warn('little-icon pet: %s', text)
    })
    // A pet that exits — asked to quit, or killed outright — is not restarted:
    // restarting would undo the exit. The next DSH start brings it back.
    child.once('exit', (code) => {
      child = undefined
      if (!disposed) ctx.logger.info('little-icon: pet process exited with code %s', String(code))
    })
  }

  const stopPet = () => {
    const running = child
    child = undefined
    if (running === undefined) return
    // Ask first, kill as the fallback: the pet answers by storing its position and
    // closing its own window. It reads the request on its next tick, so the kill is
    // a deadline rather than the usual end.
    try {
      writeFileSync(quitFile, '')
    } catch (error) {
      ctx.logger.warn('little-icon: could not ask the pet to quit: %s', String(error))
    }
    const deadline = setTimeout(() => {
      ctx.logger.warn('little-icon: the pet did not answer the quit request; ending it')
      running.kill()
    }, PET_QUIT_GRACE_MS)
    running.once('exit', () => { clearTimeout(deadline) })
  }

  const schedule = () => {
    clearInterval(timer)
    timer = setInterval(sample, config.pollMs.get())
    timer.unref?.()
  }

  // The browser half renders the settings on the bundle's page, so the
  // schema-derived automatic page would be a second copy of the same fields.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })

  // A pet that went away stays away: only an explicit enable transition (or the
  // next DSH start) brings it back, never an unrelated settings write.
  let wasEnabled = false
  ctx.on('loader/volatile-update', () => {
    const enabled = values().enabled
    if (!enabled) stopPet()
    else if (!wasEnabled) startPet()
    wasEnabled = enabled
    guarded('publish', publish)
    schedule()
  })

  ctx.effect(() => () => {
    disposed = true
    clearInterval(timer)
    stopPet()
    // End every open stream, so a page is not left waiting on a plugin that is
    // no longer there to send anything.
    for (const stream of commandStreams) stream.end()
    commandStreams.clear()
  }, 'little-icon: pet lifetime')

  publish()
  wasEnabled = values().enabled
  if (wasEnabled) startPet()
  schedule()
}

/** Re-exported for the keyless smoke test. */
export const internals = {
  sampleState,
  createTimeline,
  sampleWork,
  shouldTuck,
  resolveDshHome,
  resolveShotDir,
  resolveSites,
  readGitRepository,
  readGitCommits,
  readGitRemoteStatus,
  pullGitRepository,
  readGitDiff,
  readGitCommit,
  openWorkingDirectory,
  parseGitStatus,
  parseGitCommitFiles,
  parseGitLog,
  parseGitAuthors,
  StateFileWriter,
  STATES,
  ACTIVITY_PATH,
  COMMANDS_PATH,
  GIT_PATH,
  GIT_DIFF_PATH,
  GIT_COMMIT_PATH,
  GIT_COMMITS_PATH,
  GIT_REMOTE_PATH,
  GIT_PULL_PATH,
  OPEN_PATH,
  GIT_DIFF_MAX_CHARS,
  GIT_LOG_PAGE,
}
