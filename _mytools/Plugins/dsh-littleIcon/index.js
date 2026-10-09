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
 * per machine and never sync with the repository. The settings do sync: this
 * half copies the profile's `little-icon` section and the Desktop's shortcut
 * document into the repository's `_mytools/settings/` when either changes, and
 * the launcher — or the pet, on a restart from its own menu — merges those files
 * back into a machine before the next start.
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
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { MusicLibrary, musicView, isInside, musicEntryId, parseBilibiliRef, resolveMusicDir, resolveMusicLinks } from './music.js'

export const name = 'little-icon'

/** One animation directory per state, built by `tools/build-assets.py`. */
const STATES = ['idle', 'working', 'bored', 'sleep', 'happy', 'alert']

/**
 * The expression the pet wears while its own player runs and no task is in
 * flight. The sampler below never returns it: listening is not a state of the
 * agent but of the pet, so it is the one expression with frames on disk that
 * {@link withMusic} selects.
 */
const MUSIC_STATE = 'music'

/** Every expression with frames on disk: the sampler's states plus the one only playback selects. */
const FRAME_STATES = [...STATES, MUSIC_STATE]

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

/**
 * Same-origin routes behind the settings card's music section. The card can
 * neither read a directory nor reach Bilibili, so the Host answers with the
 * library as this machine has it and does the downloading itself: one route reads
 * the view, one downloads a link the person just pasted, one fills in every link
 * this machine has no file for, one forgets an entry, and one carries a playback
 * command to the pet — which plays the audio, because the pet process outlives a
 * hidden DSH window and a page's audio element does not.
 */
const MUSIC_PATH = '/api/little-icon/music'

/** POST: download every configured link this machine has no file for. */
const MUSIC_SYNC_PATH = '/api/little-icon/music/sync'

/** POST `?url=`: download one link, for the one that was just added. */
const MUSIC_DOWNLOAD_PATH = '/api/little-icon/music/download'

/** POST `?url=`: every link one pasted link stands for, without downloading any. */
const MUSIC_EXPAND_PATH = '/api/little-icon/music/expand'

/** POST `?count=`: a set the page has just added, for the pet to say how many. */
const MUSIC_ADDED_PATH = '/api/little-icon/music/added'

/** POST `?id=`, or `?ids=` for a whole set: forget entries and delete their files. */
const MUSIC_REMOVE_PATH = '/api/little-icon/music/remove'

/** POST `?action=`: ask the pet to play, pause, toggle, or step. */
const MUSIC_COMMAND_PATH = '/api/little-icon/music/command'

/** The playback commands that route accepts; anything else is refused. */
const MUSIC_COMMANDS = new Set(['play', 'pause', 'toggle', 'next', 'prev'])

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
 * How long a settings write settles before this machine's settings are copied
 * into the checked-in files. One card edit can persist several fields in a row,
 * the config editor reports each of them to the Loader, and one shortcut edit
 * reaches this half as several file events.
 */
const SETTINGS_SYNC_DEBOUNCE_MS = 1_500

/**
 * The profile whose settings the checked-in files carry. The pet window belongs
 * to the desktop profile, and the Desktop shortcut document exists only there;
 * the web profile can install this plugin too, and letting that second copy write
 * the same files would overwrite what the desktops share, so only this profile
 * saves on its own.
 */
const SETTINGS_SYNC_PROFILE = 'desktop'

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
  /**
   * Multi-machine: the address the settings name decides this machine's side. A
   * network adapter on that IP means this is the host, anything else means it is
   * the client — both machines therefore share one setting instead of each storing
   * its own role.
   */
  coopAddress: z.string().default('192.168.1.3:15180').volatile(),
  /** Hotkey the host uses to switch between this computer and the remote one. */
  coopHotkey: z.string().default('ctrl+alt+f12').volatile(),
  /**
   * Whether the multi-machine link starts with DSH instead of waiting for the
   * menu entry. It behaves like the pet's own switch: turning it on starts the
   * link, turning it off ends it, and a link stopped from the menu stays stopped
   * until the next DSH start. On by default: the two machines are set up to share
   * one keyboard and mouse, so the link is what the plugin is for on this machine.
   */
  coopAutoStart: z.boolean().default(true).volatile(),
  /**
   * Bilibili links the music library is built from, in the order the pet plays
   * them. This list is the only part of the feature that travels between machines
   * — the settings card writes it, and the repository's `pet-settings.yml` carries
   * it — so a checkout holds links and never audio. Every machine downloads its
   * own files into its own music directory.
   */
  musicLinks: z.array(z.string()).default([]).volatile(),
  /**
   * Where downloaded audio is written. Blank is this machine's own
   * `little-icon/music` under the harness home; a directory inside the checkout is
   * reported rather than used quietly, because those files would be committed.
   */
  musicDir: z.string().default('').volatile(),
  /** Volume the pet plays at, 0-100. */
  musicVolume: z.number().step(1).min(0).max(100).default(70).volatile(),
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
 * Which side of a multi-machine pair a machine with this address is on: the one
 * whose adapter carries the configured IP is the host, every other machine is the
 * client. Two machines therefore share one setting instead of each storing a role.
 * @param address - the configured host address, `IP[:port]`.
 * @param adapters - the machine's adapters, as `networkInterfaces()` reports them.
 * @returns `host` when this machine carries that IP, otherwise `agent`.
 */
function coopRoleFor(address, adapters = networkInterfaces()) {
  const host = String(address).split(':')[0]?.trim()
  if (host === undefined || host === '') return 'agent'
  for (const list of Object.values(adapters)) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && entry.address === host) return 'host'
    }
  }
  return 'agent'
}

/**
 * The port the host side listens on, taken from the same address.
 * @param address - the configured host address, `IP[:port]`.
 * @returns that port, or MouseShare's own default when it is missing or unusable.
 */
function coopPortFor(address) {
  const text = String(address)
  const at = text.lastIndexOf(':')
  const port = at < 0 ? '' : text.slice(at + 1).trim()
  return /^\d{1,5}$/.test(port) ? port : '15180'
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
 * The expression the pet wears, after the one input the sampler cannot see: its
 * own player. A person who started music is present and awake, so while audio
 * plays the listening frames stand in for the idle family, while the run's own
 * faces — working, the startle that holds while it waits on an answer, and the
 * celebration that ends it — keep the frames that say so. Playback never
 * outranks the run.
 * @param base - the expression {@link sampleState} chose.
 * @param playing - whether the pet reported itself playing, from `music-player.json`.
 * @returns `music` while audio plays and the run has nothing of its own to show, otherwise `base`.
 */
function withMusic(base, playing) {
  if (playing !== true) return base
  return base === 'working' || base === 'alert' || base === 'happy' ? base : MUSIC_STATE
}

/**
 * A volume the pet's menu asked for, as the configuration stores it.
 * @param value - the requested volume, as the pet wrote it.
 * @returns a whole percent between 0 and 100, or undefined when that is not a number.
 */
function clampVolume(value) {
  const percent = Math.round(Number(value))
  if (!Number.isFinite(percent)) return undefined
  return Math.max(0, Math.min(100, percent))
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
    // The volume entries carry a number; anything else the pet writes stays out.
    const value = typeof reported.value === 'number' && Number.isFinite(reported.value) ? reported.value : undefined
    // A music link is what the person typed rather than an address to open, so it
    // keeps its own field: the guard above would rewrite a bare id into a host.
    const link = typeof reported.link === 'string' ? reported.link.trim().slice(0, 2000) : undefined
    return {
      command: reported.command,
      at: reported.at,
      ...url === undefined ? {} : { url },
      ...value === undefined ? {} : { value },
      ...link === undefined || link === '' ? {} : { link },
    }
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
 * Answer one request with the result of a step. A step that throws is reported to
 * the waiting page as a refusal: an unanswered socket would leave the settings
 * card loading forever, and an exception out of a route handler ends the host.
 * @param res - the response to answer.
 * @param step - the step, returning the JSON-serializable body.
 */
function serveJson(res, step) {
  try {
    sendJson(res, step())
  } catch (error) {
    refuseJson(res, error)
  }
}

/**
 * The same answer for a step that waits — a download takes seconds, and its
 * outcome is the answer.
 * @param res - the response to answer.
 * @param step - the step, resolving to the body.
 * @returns a promise for the answer having been sent.
 */
async function serveJsonAsync(res, step) {
  try {
    sendJson(res, await step())
  } catch (error) {
    refuseJson(res, error)
  }
}

/**
 * Report one failed step to the waiting page. Writing can fail by itself — the
 * socket is gone, or the response was already ended — and a throw from here would
 * be an unhandled rejection, which takes the whole host down.
 * @param res - the response to answer.
 * @param error - what the step threw.
 */
function refuseJson(res, error) {
  try {
    sendJson(res, { ok: false, reason: 'failed', message: String(error?.message ?? error) })
  } catch {
    // Nothing left to answer with: the socket is already gone.
    res.destroy?.()
  }
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
 * Path of the repository tool that copies this machine's settings into the
 * checked-in files, or undefined when this plugin is mounted outside the
 * repository. The plugin is normally a junction into the repository, so its own
 * location answers this in one step; a profile that holds a copy of it instead
 * names the source directory in its own manifest, which is the second attempt.
 * @param profileDir - the active profile's directory.
 * @returns absolute path of `sync-settings.mjs`.
 */
function resolveSettingsSync(profileDir) {
  const beside = fileURLToPath(new URL('../../settings/sync-settings.mjs', import.meta.url))
  if (existsSync(beside)) return beside
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  } catch {
    // No readable profile manifest: this half cannot trace the plugin back to a repository.
    return undefined
  }
  for (const value of Object.values(manifest.dependencies ?? {})) {
    const source = String(value).replace(/^(?:link|file):/u, '').replace(/\\/gu, '/')
    const at = source.indexOf('/_mytools/Plugins/dsh-littleIcon')
    if (at <= 0) continue
    const script = `${source.slice(0, at)}/_mytools/settings/sync-settings.mjs`
    if (existsSync(script)) return script
  }
  return undefined
}

/**
 * The Desktop's shortcut document, resolved the way the settings tool resolves
 * it: the userData directory the launcher pins under the harness home, or the
 * development override when one is set.
 * @returns absolute path of `keybindings.json`.
 */
function shortcutSettingsPath() {
  const configured = process.env.DSH_DESKTOP_USER_DATA_DIR
  const directory = configured !== undefined && configured.trim() !== ''
    ? resolve(configured.trim())
    : join(resolveDshHome(), 'desktop', 'electron-user-data')
  return join(directory, 'keybindings.json')
}

/**
 * What a settings write does to the multi-machine link: only the switch's own
 * transition acts, so a link stopped from the menu stays stopped until the next
 * DSH start and an unrelated write never restarts it.
 * @param auto - the switch's value now.
 * @param wasAuto - the switch's value the last time this was asked.
 * @returns `start`, `stop`, or `none` when the switch did not move.
 */
function coopAutoAction(auto, wasAuto) {
  if (auto === wasAuto) return 'none'
  return auto ? 'start' : 'stop'
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

  // ---- multi-machine (MouseShare) -------------------------------------------
  //
  // It runs the exe shipped inside the plugin: `_mytools/MouseShare/build.bat`
  // copies `MouseShare.exe` here after every build, so the plugin finds it whether
  // the profile installed it as a link or as a copied directory. The client side
  // always dials in and retries every three seconds, so either machine may be the
  // one whose menu entry is clicked first.
  const coopExe = fileURLToPath(new URL('./bin/MouseShare.exe', import.meta.url))
  /**
   * The status file MouseShare writes for `--status`. Parsing the console output it
   * prints for a person would be brittle; this JSON is what the pet reads at every
   * menu open, so what the submenu shows is never a cached link.
   */
  const coopStatusFile = join(dataDir, 'coop.json')
  let coopChild
  /** Why the last start failed, for the menu to report: `exe`, `address`, or `spawn`. */
  let coopError = ''

  /**
   * End the multi-machine process and drop the status file it left behind.
   * @param why - reason recorded in the log.
   */
  const coopStop = (why) => {
    const running = coopChild
    coopChild = undefined
    rmSync(coopStatusFile, { force: true })
    if (running === undefined) return
    try { running.kill() } catch { /* already gone; nothing left to end */ }
    ctx.logger.info('little-icon: multi-machine stopped (%s)', why)
  }

  /** Start this machine's side from the settings; a second call while one runs is a no-op. */
  const coopStart = () => {
    if (coopChild !== undefined) return
    coopError = ''
    const address = String(config.coopAddress.get()).trim()
    const role = coopRoleFor(address)
    if (!existsSync(coopExe)) { coopError = 'exe'; return }
    if (address === '') { coopError = 'address'; return }
    const hotkey = String(config.coopHotkey.get()).trim() || 'ctrl+alt+f12'
    const args = role === 'host'
      ? ['host', '--port', coopPortFor(address), '--hotkey', hotkey, '--status', coopStatusFile]
      : ['agent', '--server', address, '--status', coopStatusFile]
    let started
    try {
      started = spawn(coopExe, args, { windowsHide: true, stdio: 'ignore' })
    } catch (error) {
      coopError = 'spawn'
      ctx.logger.warn('little-icon: could not start multi-machine: %s', String(error))
      return
    }
    coopChild = started
    started.once('exit', (code) => {
      if (coopChild !== started) return
      coopChild = undefined
      rmSync(coopStatusFile, { force: true })
      if (!disposed) ctx.logger.info('little-icon: multi-machine exited with code %s', String(code))
    })
    started.once('error', (error) => {
      if (coopChild !== started) return
      coopChild = undefined
      coopError = 'spawn'
      ctx.logger.warn('little-icon: multi-machine process failed: %s', String(error))
    })
    ctx.logger.info('little-icon: multi-machine started as %s (%s)', role, address)
  }

  // ---- music -----------------------------------------------------------------
  //
  // The link list travels and the audio does not: it is config, copied into the
  // repository's `pet-settings.yml`, while each machine downloads its own files
  // into the directory its own settings name. The pet is the half that plays them —
  // a page's audio element belongs to a window that can be hidden, while the pet
  // process stays on the desktop — so the tracks it may play arrive in a file of
  // their own, written here on change rather than every sampling tick.
  //
  // The pet also carries out what the settings card asks: a playback command and a
  // download request both arrive in that same file, and the download itself is this
  // half's work, which is what lets the pet's own menu fill a fresh machine in with
  // no page listening at all.
  const musicFile = join(dataDir, 'music.json')
  /** What the pet is playing; the pet writes it, the settings card reads it. */
  const musicPlayerFile = join(dataDir, 'music-player.json')
  const musicWriter = new StateFileWriter(musicFile, 4000, (error) => {
    ctx.logger.warn('little-icon music: could not write %s: %s', musicFile, String(error))
  })
  /**
   * The checkout this plugin lives in, when it lives in one. A music directory
   * inside it would put the downloaded audio in the repository, which is the one
   * thing this feature must not do, so it is reported instead.
   */
  const checkoutRoot = existsSync(fileURLToPath(new URL('../../../_mytools', import.meta.url)))
    ? fileURLToPath(new URL('../../../', import.meta.url))
    : undefined
  /** Playback command the settings card asked for, waiting for the pet's next tick. */
  let musicCommand
  /** Download outcome the pet has not shown yet, as a notice above the pet. */
  let musicNotice
  /**
   * The volume the pet was last told the configuration holds, so a change - from the
   * card or from the menu's slider, which the page writes - is reported above the pet
   * exactly once.
   */
  let lastConfiguredVolume
  /**
   * The volume the page was asked to write and has not written yet, published in the
   * meantime so the number the menu just chose does not snap back while the write
   * lands. Dropped when the configuration catches up, or after a few seconds, so a
   * page that never wrote it cannot leave the pet on a volume no file holds.
   */
  let pendingVolume
  let pendingVolumeUntil = 0
  let library
  let libraryDir = ''

  /**
   * The music directory as it is now, and what is wrong with it: `inside-checkout`
   * when the configured folder is inside the repository, `unwritable` when a folder
   * cannot be made.
   *
   * A configured folder inside the checkout is not used at all, only reported: the
   * audio downloaded into it would be committed with the links, which is the one
   * thing this feature is arranged to avoid. The machine's own default folder takes
   * its place, so the setting is wrong rather than destructive, and the card says so.
   * @returns the absolute directory and the warning code, empty when all is well.
   */
  const musicDirNow = () => {
    const configured = resolveMusicDir(config.musicDir.get(), resolveDshHome())
    const inside = checkoutRoot !== undefined && isInside(configured, checkoutRoot)
    // Decided by where the setting points rather than by comparing the two paths: a
    // harness home that itself sits in the checkout resolves both to the same folder,
    // and that folder is still one the audio must not be written into.
    const dir = inside ? resolveMusicDir('', resolveDshHome()) : configured
    const warning = inside ? 'inside-checkout' : ''
    try {
      mkdirSync(dir, { recursive: true })
    } catch (error) {
      ctx.logger.warn('little-icon music: could not use %s: %s', dir, String(error))
      return { dir, warning: 'unwritable' }
    }
    return { dir, warning }
  }

  /**
   * The library over the configured directory. Changing that setting makes a new
   * one over the same index: the index is per machine, and the entries it names are
   * looked for in the directory in force, so files left in the old directory read
   * as missing rather than as somebody else's.
   * @returns the library.
   */
  const musicLibrary = () => {
    const { dir } = musicDirNow()
    if (library === undefined || dir !== libraryDir) {
      library = new MusicLibrary({
        dataDir,
        dir,
        logger: ctx.logger,
        onChange: () => { guarded('music library publish', publishMusic) },
      })
      libraryDir = dir
    }
    return library
  }

  /**
   * What the pet last reported about its own playback.
   * @returns the state, or undefined when the pet has not reported one yet.
   */
  const readMusicPlayer = () => {
    try {
      const reported = JSON.parse(readFileSync(musicPlayerFile, 'utf8'))
      return {
        playing: reported.playing === true,
        id: typeof reported.id === 'string' ? reported.id : '',
        title: typeof reported.title === 'string' ? reported.title : '',
        positionMs: Number.isFinite(reported.positionMs) ? reported.positionMs : 0,
        error: typeof reported.error === 'string' ? reported.error : '',
      }
    } catch {
      // No report yet, or a half-written one: the card shows "nothing playing".
      return undefined
    }
  }

  // The menu's volume and link entries are configuration, so they are written the way
  // the settings card writes: through the settings service, from the page. This half
  // cannot make that write. The service refuses any write attempted inside an HMR
  // transaction, and this plugin's own timer runs in the context of the load that
  // created it, so a write from a tick is refused as nested. Both commands are
  // therefore forwarded to the page (see forwardCommand), whose request context is
  // outside that transaction; the download they ask for stays here, on the route the
  // card already uses, because a download is this half's own work.

  /**
   * Publish what the pet may play. Absolute paths travel because the pet opens the
   * files itself; the id travels back so the settings card can name the row the pet
   * is on. A link with no file is only counted, so the menu can offer to fill it in.
   */
  const publishMusic = () => {
    // A download that finishes after the plugin unloaded would otherwise write a
    // file for a pet that is already gone.
    if (disposed) return
    const configured = config.musicVolume.get()
    // A volume that changed - from the card, or from the menu, which is the page's
    // write - is said above the pet once. The first publish only records it: the
    // value the run started with is not news.
    if (lastConfiguredVolume !== undefined && configured !== lastConfiguredVolume) {
      musicNotice = { at: Date.now(), kind: 'volume', percent: Math.round(configured) }
    }
    lastConfiguredVolume = configured
    // A pending volume is published until the configuration carries it, or until the
    // page has had long enough to write it: one that never did must not leave the pet
    // on a volume no file holds.
    if (pendingVolume !== undefined && (configured === pendingVolume || Date.now() > pendingVolumeUntil)) {
      pendingVolume = undefined
    }
    const volume = pendingVolume ?? configured
    const { dir, warning } = musicDirNow()
    const current = musicLibrary()
    const links = resolveMusicLinks(config.musicLinks.get())
    const tracks = []
    const seen = new Set()
    /** Links this machine has no playable file for, counted per link rather than per
     * video: two spellings of one link are one track but two rows to satisfy. */
    let missing = 0
    for (const link of links) {
      const entry = current.entryForLink(link)
      const path = entry === undefined ? undefined : current.filePath(entry.id)
      if (path === undefined) {
        missing += 1
        continue
      }
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      tracks.push({ id: entry.id, title: entry.title, file: path })
    }
    musicWriter.write({
      version: 1,
      dir,
      warning,
      volume,
      tracks,
      missing,
      sync: current.progress,
      command: musicCommand,
      notice: musicNotice,
      updatedAt: Date.now(),
    })
  }

  /**
   * Download every link this machine has no file for, in the background. Asked for
   * from the pet's menu or from the settings card, and safe to ask twice: a sync
   * already running refuses the second call rather than downloading in parallel.
   * @returns the started count, or why nothing started.
   */
  const startMusicSync = () => {
    const links = resolveMusicLinks(config.musicLinks.get())
    const current = musicLibrary()
    const pending = links.filter((link) => {
      const entry = current.entryForLink(link)
      return entry === undefined || current.filePath(entry.id) === undefined
    })
    if (current.progress.running) return { ok: false, reason: 'running' }
    if (pending.length === 0) return { ok: true, started: 0 }
    ctx.logger.info('little-icon music: downloading %d link(s)', pending.length)
    void current.sync(links).then((result) => {
      if (disposed) return
      musicNotice = result.ok === true
        ? { at: Date.now(), kind: 'synced', added: result.added, failed: result.failed.length, total: result.total }
        : { at: Date.now(), kind: 'refused', added: 0, failed: 0, total: 0 }
      guarded('music publish', publishMusic)
      ctx.logger.info('little-icon music: sync finished, %d added, %d failed', result.added ?? 0, result.failed?.length ?? 0)
    }, (error) => {
      ctx.logger.warn('little-icon music: sync failed: %s', String(error))
    })
    return { ok: true, started: pending.length }
  }

  /** Open the music directory in the system file manager, creating it first. */
  const openMusicDir = () => {
    const { dir } = musicDirNow()
    const outcome = openWorkingDirectory(dir, (directory) => {
      const child = spawn('explorer.exe', [directory], { detached: true, stdio: 'ignore' })
      child.once('error', (error) => {
        ctx.logger.warn('little-icon music: could not open %s: %s', directory, String(error))
      })
      child.unref()
    })
    if (!outcome.ok) musicNotice = { at: Date.now(), kind: 'no-dir', added: 0, failed: 0, total: 0 }
  }

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

  for (const state of FRAME_STATES) {
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
    coopAddress: String(config.coopAddress.get()).trim(),
    coopHotkey: String(config.coopHotkey.get()).trim(),
    coopAutoStart: config.coopAutoStart.get(),
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
    const sampled = sampleState(work, activity, timeline, config, now)
    // The player belongs to the pet, and its report is the one place this half
    // learns that audio is running.
    const state = withMusic(sampled, readMusicPlayer()?.playing === true)
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
      // Multi-machine: whether it runs, which side this machine was taken for, the
      // configured address and hotkey, and why a start last failed. The link itself
      // — connected, latency, remote mode — is in the status file MouseShare writes,
      // which the submenu reads at every open rather than waiting for this tick.
      coop: {
        running: coopChild !== undefined,
        role: coopChild === undefined ? '' : coopRoleFor(current.coopAddress),
        address: current.coopAddress,
        hotkey: current.coopHotkey,
        error: coopError,
      },
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
  const publishCommand = (command, payload = {}) => {
    const frame = `data: ${JSON.stringify({ command, ...payload })}\n\n`
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
    // Multi-machine runs on this half, not on the page: starting it means starting a
    // process, and that must work whether or not a page is listening. The state is
    // published straight away so the menu shows the new state on its next open.
    if (pressed.command === 'coop-start') {
      guarded('multi-machine start', () => { coopStart(); publish() })
      return
    }
    if (pressed.command === 'coop-stop') {
      guarded('multi-machine stop', () => { coopStop('menu'); publish() })
      return
    }
    // Filling the library in and opening its folder are this half's work too: both
    // need a process and a filesystem, and neither needs the page, so a menu entry
    // for them acts whether or not a window is listening.
    if (pressed.command === 'music-sync') {
      guarded('music sync', () => { startMusicSync(); publishMusic() })
      return
    }
    if (pressed.command === 'music-open-dir') {
      guarded('music folder', () => { openMusicDir(); publishMusic() })
      return
    }
    // Volume and a pasted link are configuration, which the settings card owns, and
    // only the page can write it: the settings service refuses a write made inside an
    // HMR transaction, which is the context this timer runs in. The page then writes
    // the same fields the card writes, and the download a link asks for comes back
    // here through the route the card already uses.
    if (pressed.command === 'music-volume') {
      const value = clampVolume(pressed.value)
      if (value === undefined) return
      pendingVolume = value
      pendingVolumeUntil = Date.now() + 5000
      publishMusic()
      publishCommand('music-volume', { value })
      return
    }
    if (pressed.command === 'music-add-link') {
      const link = String(pressed.link ?? '').trim()
      const ref = parseBilibiliRef(link)
      if (link === '' || ref === undefined) {
        // Nothing here names a video, so nothing is written and nothing is
        // downloaded: the pet is told what the card would have told a person.
        musicNotice = { at: Date.now(), kind: 'add-failed', reason: 'unrecognized' }
        publishMusic()
        return
      }
      const known = resolveMusicLinks(config.musicLinks.get())
        .map(entry => parseBilibiliRef(entry))
        .filter(entry => entry !== undefined)
        .map(entry => musicEntryId(entry))
      if (known.includes(musicEntryId(ref))) {
        // One video, however it is spelled, is one row: the same answer the card
        // gets from the download route.
        musicNotice = { at: Date.now(), kind: 'duplicate' }
        publishMusic()
        return
      }
      publishCommand('music-add-link', { link })
      return
    }
    publishCommand(pressed.command, pressed.url === undefined ? {} : { url: pressed.url })
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

  // ---- settings sync --------------------------------------------------------
  //
  // What this machine decides about itself belongs to every machine, so it is
  // copied into the repository's `_mytools/settings/` as it changes: the pet's
  // own settings when the settings card writes them (the config editor writes
  // the profile patch and only then reports the change to the Loader, so that
  // export always reads a file holding the new values), and the Desktop's
  // shortcut document when the app rewrites it. Two paths merge those files back
  // before DSH starts: the `build/start-desktop.bat` launcher for an ordinary
  // start, and this plugin's own `pet/pet.ps1` for a restart from the pet menu,
  // which replays the Electron command line instead of going through that
  // launcher. Committing and pushing stay the person's call, which is why this
  // only ever writes the working tree.
  const profile = ctx.get('profileContext')
  const syncScript = profile === undefined || profile.name !== SETTINGS_SYNC_PROFILE
    ? undefined
    : resolveSettingsSync(profile.dir)
  if (syncScript === undefined) {
    ctx.logger.info('little-icon: settings are not saved to the repository from this profile')
  }
  let syncTimer
  let shortcutTimer

  /**
   * Copy one artifact out to the repository, reporting its own failure rather
   * than letting it reach the host.
   * @param only - `pet` or `keybindings`, the artifact to write.
   */
  const exportSettings = (only) => {
    const child = spawn(process.execPath, [syncScript, 'export', '--profile', profile.name, '--only', only, '--quiet'], {
      // The desktop host is itself an Electron process in Node mode, so the tool
      // it starts has to be told the same thing rather than opening a second app.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (text !== '') ctx.logger.warn('little-icon settings: %s', text)
    })
    child.once('error', (error) => {
      ctx.logger.warn('little-icon: could not save the %s settings: %s', only, String(error))
    })
    child.once('exit', (code) => {
      if (code !== 0) ctx.logger.warn('little-icon: saving the %s settings exited with code %s', only, String(code))
    })
  }

  /** Copy the pet settings once the writes that reported them have stopped arriving. */
  const scheduleSettingsSync = () => {
    if (syncScript === undefined) return
    clearTimeout(syncTimer)
    syncTimer = setTimeout(() => { guarded('settings export', () => exportSettings('pet')) }, SETTINGS_SYNC_DEBOUNCE_MS)
  }

  /**
   * Watch the Desktop's shortcut document. The main process owns that file and
   * rewrites it whole whenever the settings page changes a binding, and this
   * half sees no event for it: watching the file is what turns such an edit into
   * the same automatic export the pet's own settings get.
   * @returns disposer for the watcher.
   */
  const watchShortcutSettings = () => {
    if (syncScript === undefined) return () => {}
    const path = shortcutSettingsPath()
    if (!existsSync(path)) {
      ctx.logger.info('little-icon: no Desktop shortcut document yet at %s', path)
      return () => {}
    }
    let watcher
    try {
      watcher = watch(path, () => {
        clearTimeout(shortcutTimer)
        shortcutTimer = setTimeout(() => {
          guarded('shortcut settings export', () => exportSettings('keybindings'))
        }, SETTINGS_SYNC_DEBOUNCE_MS)
      })
    } catch (error) {
      // A document that vanished between the check and the watch, or one this
      // process may not watch: the plugin still has to load, so this is a report
      // rather than a failure.
      ctx.logger.warn('little-icon: could not watch the shortcut document at %s: %s', path, String(error))
      return () => {}
    }
    watcher.on('error', (error) => {
      ctx.logger.warn('little-icon: watching the shortcut document failed: %s', String(error))
    })
    return () => {
      clearTimeout(shortcutTimer)
      watcher.close()
    }
  }
  ctx.effect(watchShortcutSettings, 'little-icon: shortcut settings')

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

  // The music routes: the settings card reads the library here and asks for work
  // here, because the page can neither list a directory nor reach Bilibili. The
  // pet's own menu does not use them — it plays local files and asks this half for
  // a download through the command file, which works with no page listening.
  ctx.inject(['webServer'], (webCtx) => {
    /**
     * Whether a request may be answered: the connection's own check, then the
     * method. A refusal is written here rather than left to the caller.
     * @param req - the request.
     * @param res - the response.
     * @param method - the method this route accepts.
     * @returns whether the handler should continue.
     */
    const allowed = (req, res, method) => {
      const connection = ctx.get('connection')
      const rejection = connection === undefined ? undefined : connection.requestRejection(req)
      if (rejection !== undefined) {
        res.writeHead(rejection)
        res.end()
        return false
      }
      if (req.method !== method) {
        res.writeHead(405)
        res.end()
        return false
      }
      return true
    }
    const queryOf = (req) => new URL(req.url ?? '', 'http://localhost').searchParams

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: MUSIC_PATH,
      handler: (req, res) => {
        if (!allowed(req, res, 'GET')) return
        serveJson(res, () => {
          const { dir, warning } = musicDirNow()
          const current = musicLibrary()
          return musicView({
            links: resolveMusicLinks(config.musicLinks.get()),
            entries: current.entries,
            dir,
            warning,
            volume: config.musicVolume.get(),
            sync: current.progress,
            player: readMusicPlayer(),
          })
        })
      },
    }), `little-icon: GET ${MUSIC_PATH}`)

    // Filling the whole library in is one click on a machine that just pulled the
    // link list, and it is this half's own work: the answer says how many started,
    // and the page follows the progress on the view route.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: MUSIC_SYNC_PATH,
      handler: (req, res) => {
        if (!allowed(req, res, 'POST')) return
        serveJson(res, () => startMusicSync())
      },
    }), `little-icon: POST ${MUSIC_SYNC_PATH}`)

    // One link, the one just pasted. It is answered when the download is done, so
    // the card can report the title or the reason without polling for a first time.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: MUSIC_DOWNLOAD_PATH,
      handler: (req, res) => {
        if (!allowed(req, res, 'POST')) return
        void serveJsonAsync(res, async () => {
          const outcome = await musicLibrary().download(queryOf(req).get('url') ?? '')
          // Both ends report through this one route, so the outcome is said above the
          // pet as well: the menu has no page of its own to report in, and the card's
          // own notice is the same event seen from the same place.
          musicNotice = outcome.ok !== true
            ? { at: Date.now(), kind: 'add-failed', reason: String(outcome.reason ?? 'unknown') }
            : outcome.duplicate === true
              ? { at: Date.now(), kind: 'duplicate' }
              : { at: Date.now(), kind: 'added', title: String(outcome.title ?? '') }
          publishMusic()
          return outcome
        })
      },
    }), `little-icon: POST ${MUSIC_DOWNLOAD_PATH}`)

    // What one pasted link stands for, before the page writes it into the settings.
    // The reading of the link and the video's own facts stay on this side, which is
    // the half that talks to Bilibili; the write stays on the page, because the
    // settings service refuses a write made from this half's timer context.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: MUSIC_EXPAND_PATH,
      handler: (req, res) => {
        if (!allowed(req, res, 'POST')) return
        void serveJsonAsync(res, async () => {
          const outcome = await musicLibrary().expand(queryOf(req).get('url') ?? '')
          if (outcome.ok !== true) return outcome
          // Only the links the settings do not already hold: one video has many
          // spellings, and its id is what decides whether it is the same song.
          const known = new Set(resolveMusicLinks(config.musicLinks.get())
            .map(link => parseBilibiliRef(link))
            .filter(ref => ref !== undefined)
            .map(ref => musicEntryId(ref)))
          const fresh = outcome.links.filter((link) => {
            const ref = parseBilibiliRef(link)
            return ref !== undefined && !known.has(musicEntryId(ref))
          })
          return { ...outcome, fresh, known: outcome.links.length - fresh.length }
        })
      },
    }), `little-icon: POST ${MUSIC_EXPAND_PATH}`)

    // A set the page added without downloading it: the pet says how many, so a paste
    // that turned into a hundred rows does not look like nothing happened until the
    // fill-in runs.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: MUSIC_ADDED_PATH,
      handler: (req, res) => {
        if (!allowed(req, res, 'POST')) return
        serveJson(res, () => {
          const count = Number.parseInt(queryOf(req).get('count') ?? '', 10)
          if (!Number.isSafeInteger(count) || count < 1) return { ok: false, reason: 'count' }
          musicNotice = { at: Date.now(), kind: 'added-many', count }
          publishMusic()
          return { ok: true, count }
        })
      },
    }), `little-icon: POST ${MUSIC_ADDED_PATH}`)

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: MUSIC_REMOVE_PATH,
      handler: (req, res) => {
        if (!allowed(req, res, 'POST')) return
        serveJson(res, () => {
          const query = queryOf(req)
          // One id, or a whole set's worth: dropping a hundred-part video a link at a
          // time would be a hundred round trips for one decision.
          const ids = [query.get('id') ?? '', ...(query.get('ids') ?? '').split(',')]
            .map(text => text.trim())
            .filter(text => text !== '')
          if (ids.length === 0) return { ok: false, reason: 'empty' }
          const outcomes = ids.map(id => musicLibrary().remove(id))
          // The pet is playing from a list that just lost rows, so it is told now
          // rather than at the next download: a file that went away under it would
          // otherwise keep failing until something else published.
          if (outcomes.some(outcome => outcome.ok === true)) publishMusic()
          if (outcomes.length === 1) return outcomes[0]
          const removed = outcomes.filter(outcome => outcome.ok === true).length
          return { ok: removed > 0, removed, failed: outcomes.length - removed }
        })
      },
    }), `little-icon: POST ${MUSIC_REMOVE_PATH}`)

    // The card's own playback controls. The command travels in the music file and
    // the pet applies it on its next tick, which is the same path the pet's menu
    // uses in the other direction.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: MUSIC_COMMAND_PATH,
      handler: (req, res) => {
        if (!allowed(req, res, 'POST')) return
        serveJson(res, () => {
          const action = queryOf(req).get('action') ?? ''
          if (!MUSIC_COMMANDS.has(action)) return { ok: false, reason: 'unknown' }
          musicCommand = { action, at: Date.now() }
          publishMusic()
          return { ok: true, action }
        })
      },
    }), `little-icon: POST ${MUSIC_COMMAND_PATH}`)
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
  // next DSH start) brings it back, never an unrelated settings write. The
  // multi-machine link follows the same rule through its own switch: turned on it
  // starts, turned off it ends, and a link stopped from the menu is never
  // restarted by a write to some other field, because only the off-to-on
  // transition starts one.
  let wasEnabled = false
  let wasCoopAuto = false
  const followCoopAutoStart = () => {
    const auto = values().coopAutoStart
    const action = coopAutoAction(auto, wasCoopAuto)
    if (action === 'none') return
    wasCoopAuto = auto
    if (action === 'start') coopStart()
    else coopStop('settings')
    // The pet's submenu reads the link state out of the state file, so the change
    // is published now rather than at the next sampling tick.
    guarded('publish', publish)
  }
  ctx.on('loader/volatile-update', () => {
    const enabled = values().enabled
    if (!enabled) stopPet()
    else if (!wasEnabled) startPet()
    wasEnabled = enabled
    followCoopAutoStart()
    guarded('publish', publish)
    // The link list, the music directory, and the volume all reach the pet through
    // its own file, so a settings write is what tells a pet that is already running
    // about a new song or a new volume — neither half restarts for it.
    guarded('music publish', publishMusic)
    schedule()
    scheduleSettingsSync()
  })

  ctx.effect(() => () => {
    disposed = true
    clearInterval(timer)
    clearTimeout(syncTimer)
    stopPet()
    // A download already in flight is left to finish rather than aborted: the file it
    // writes and the index entry naming it stay valid for the next start, and the
    // publish that would follow is refused above (see publishMusic).
    // The multi-machine process ends with DSH: it holds a listening port and global
    // input hooks, so leaving it behind would be a service nobody asked for.
    coopStop('DSH exit')
    // End every open stream, so a page is not left waiting on a plugin that is
    // no longer there to send anything.
    for (const stream of commandStreams) stream.end()
    commandStreams.clear()
  }, 'little-icon: pet lifetime')

  publish()
  guarded('music publish', publishMusic)
  wasEnabled = values().enabled
  if (wasEnabled) startPet()
  followCoopAutoStart()
  schedule()
}

/** Re-exported for the keyless smoke test. */
export const internals = {
  sampleState,
  createTimeline,
  sampleWork,
  shouldTuck,
  withMusic,
  clampVolume,
  MUSIC_STATE,
  resolveDshHome,
  resolveShotDir,
  resolveSites,
  coopRoleFor,
  coopPortFor,
  coopAutoAction,
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
  MUSIC_PATH,
  MUSIC_SYNC_PATH,
  MUSIC_DOWNLOAD_PATH,
  MUSIC_EXPAND_PATH,
  MUSIC_ADDED_PATH,
  MUSIC_REMOVE_PATH,
  MUSIC_COMMAND_PATH,
  GIT_DIFF_MAX_CHARS,
  GIT_LOG_PAGE,
}
