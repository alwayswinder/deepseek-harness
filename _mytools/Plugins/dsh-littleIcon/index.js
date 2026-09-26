/**
 * DSH Little Icon — host half.
 *
 * The pet is a separate process, not an overlay inside the DSH window: this half
 * samples the agent state and writes it to a state file, and `pet/pet.ps1`
 * (PowerShell + WPF) draws a frameless always-on-top window from it, handling
 * dragging, click-to-tuck the DSH window, and its own tray menu. Because the pet
 * owns its window, it stays on the desktop while the DSH window is hidden.
 *
 * Either side can tuck DSH away: the pet on a click, and this half by asking for
 * one in the state file once DSH has been left untouched, still on screen, for
 * the configured stretch. Only the pet touches the window; the host owns the
 * activity clock, because the page reports its input to the host rather than to
 * the pet.
 *
 * Click-to-tuck needs Win32: the desktop shell exposes no window control to
 * plugins (no tray in `apps/desktop`, no minimize/hide channel in its preload),
 * and this half runs in the `ELECTRON_RUN_AS_NODE` child process, where Electron
 * APIs are unavailable. The pet therefore calls `ShowWindow` on the window owned
 * by this process's parent — the Electron main process.
 *
 * State and window position live under `$DSH_HOME/little-icon/`, so they stay
 * per machine and never sync with the repository.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
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
  /** How long the startle frames play when a task begins. */
  alertMs: z.number().step(100).min(0).max(60000).default(1500).volatile(),
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
})

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

/**
 * Write the state file only when it changes, plus one heartbeat rewrite per
 * interval so the pet can treat a stale file as a dead host.
 */
class StateFileWriter {
  /**
   * @param path - absolute state file path.
   * @param heartbeatMs - longest interval without a write while content is unchanged.
   */
  constructor(path, heartbeatMs) {
    this.path = path
    this.heartbeatMs = heartbeatMs
    this.lastStable = ''
    this.lastWrite = 0
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
    writeFileSync(temporary, `${JSON.stringify({ ...stable, updatedAt })}\n`, 'utf8')
    renameSync(temporary, this.path)
    this.lastStable = stableText
    this.lastWrite = now
    return true
  }
}

/** Cross-sample bookkeeping: the task edges, the boredom clock, and the last activity. */
function createTimeline(now) {
  return {
    wasBusy: false,
    alertUntil: 0,
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
 * One task reads as: startle when work begins, work while it runs, joy when it
 * ends, then idle. Boredom follows the agent being idle rather than the mouse,
 * so a person reading a long answer still sees it now and then. Sleep follows
 * user activity instead: the caller passes the timer in force — much shorter
 * while DSH is tucked away — and any activity, whether page input, a drag, or
 * bringing DSH back, leaves sleep for idle.
 *
 * @param busy - whether an agent or job is running.
 * @param activityAt - latest user activity seen, in milliseconds.
 * @param timeline - cross-sample bookkeeping, updated in place.
 * @param config - resolved config values; its `sleepAfterSeconds` is the limit in force.
 * @param now - sample time in milliseconds.
 * @returns one of {@link STATES}.
 */
function sampleState(busy, activityAt, timeline, config, now) {
  const active = activityAt > timeline.lastActivityAt
  timeline.lastActivityAt = Math.max(timeline.lastActivityAt, activityAt)
  if (busy) {
    timeline.lastActivityAt = now
    timeline.asleep = false
    if (!timeline.wasBusy) {
      timeline.wasBusy = true
      timeline.alertUntil = now + config.alertMs
      timeline.boredUntil = 0
    }
    return now < timeline.alertUntil ? 'alert' : 'working'
  }
  if (timeline.wasBusy) {
    timeline.wasBusy = false
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
 * Whether an agent or a job is running; the same test `apps/desktop-host` uses,
 * except that an agent blocked on a human answer does not count. The two
 * waterfalls that ask the user leave the agent `running` while they wait, and what
 * the loop waits on then is the person rather than the model.
 * @param ctx - host context carrying the optional `agents` and `jobs` services.
 * @param waiting - ids of the agents currently waiting for the user.
 * @returns true while work is in flight.
 */
function isBusy(ctx, waiting) {
  const agents = ctx.get('agents')
  const jobs = ctx.get('jobs')
  const live = agents === undefined ? [] : agents.list()
  const agentBusy = live.some(agent => !waiting.has(agent.id) && (agent.status === 'running'
    || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0))
  const jobsBusy = jobs !== undefined && [undefined, ...live].some(agent => jobs.list(agent?.id)
    .some(job => job.status === 'running' || job.status === 'stopping'))
  return agentBusy || jobsBusy
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
 * @returns that command and its timestamp, or undefined when there is nothing
 *   readable: no choice yet, or a half-written file.
 */
function readCommand(path) {
  try {
    const reported = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof reported.at !== 'number' || typeof reported.command !== 'string') return undefined
    return { command: reported.command, at: reported.at }
  } catch {
    // No command yet, or a half-written one.
    return undefined
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
  const writer = new StateFileWriter(stateFile, 4000)
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
    alertMs: config.alertMs.get(),
    happyMs: config.happyMs.get(),
    boredEverySeconds: config.boredEverySeconds.get(),
    boredMs: config.boredMs.get(),
    sleepAfterSeconds: config.sleepAfterSeconds.get(),
    sleepWhenHiddenSeconds: config.sleepWhenHiddenSeconds.get(),
    autoHide: config.autoHide.get(),
    autoHideSeconds: config.autoHideSeconds.get(),
    topmost: config.topmost.get(),
    clickAction: config.clickAction.get(),
  })

  /**
   * Latest activity from every source the pet must notice: page input reported
   * over the route, and the pet's own position file, which changes whenever the
   * user drags it or asks the tray to move it home.
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
    const state = sampleState(isBusy(ctx, waitingForUser), activity, timeline, config, now)
    writer.write({
      state,
      size: current.size,
      // The pet applies one opacity; `translucent` is the switch the settings
      // card exposes, `idleOpacity` how far it fades.
      opacity: current.translucent ? current.idleOpacity : 1,
      frameMs: current.frameMs,
      topmost: current.topmost,
      clickAction: current.clickAction,
      // A command rather than a fact: the pet hides the window it owns, and the
      // visibility it then reports turns this back off.
      tuck: shouldTuck(dshWindow, current, now),
      updatedAt: now,
    })
  }

  /**
   * Send one menu command to every listening page. Nothing is queued: a command
   * chosen while no page listens is dropped, because the page is what performs it.
   * @param command - the menu entry's id, as the pet reported it.
   */
  const publishCommand = (command) => {
    const frame = `data: ${JSON.stringify({ command })}\n\n`
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
    publishCommand(pressed.command)
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

  /** One sampling tick: publish the pet's state, then relay any menu command. */
  const sample = () => {
    publish()
    forwardCommand()
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
    // A pet that exits — through its tray menu or by external kill — is not
    // restarted: restarting would undo the user's own exit. The next DSH start
    // brings it back.
    child.once('exit', (code) => {
      child = undefined
      if (!disposed) ctx.logger.info('little-icon: pet process exited with code %s', String(code))
    })
  }

  const stopPet = () => {
    const running = child
    child = undefined
    running?.kill()
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

  // A pet the user quit from its tray stays quit: only an explicit enable
  // transition (or the next DSH start) brings it back, never an unrelated
  // settings write.
  let wasEnabled = false
  ctx.on('loader/volatile-update', () => {
    const enabled = values().enabled
    if (!enabled) stopPet()
    else if (!wasEnabled) startPet()
    wasEnabled = enabled
    publish()
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
export const internals = { sampleState, createTimeline, isBusy, shouldTuck, resolveDshHome, STATES, ACTIVITY_PATH, COMMANDS_PATH }
