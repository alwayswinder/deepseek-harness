/**
 * DSH Little Icon — host half.
 *
 * The pet is a separate process, not an overlay inside the DSH window: this half
 * samples the agent state and writes it to a state file, and `pet/pet.ps1`
 * (PowerShell + WPF) draws a frameless always-on-top window from it, handling
 * dragging, click-to-tuck the DSH window, and its own tray menu. Because the pet
 * owns its window, it stays on the desktop while the DSH window is hidden.
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
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
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
  }
}

/**
 * Decide which state the pet shows.
 *
 * One task reads as: startle when work begins, work while it runs, joy when it
 * ends, then idle — with boredom interrupting now and then, and sleep once
 * nobody has touched anything for long enough. Activity is what leaves sleep, so
 * the pet never stays asleep while the person is using DSH.
 *
 * @param busy - whether an agent or job is running.
 * @param activityAt - latest user activity seen, in milliseconds.
 * @param timeline - cross-sample bookkeeping, updated in place.
 * @param config - resolved config values.
 * @param now - sample time in milliseconds.
 * @returns one of {@link STATES}.
 */
function sampleState(busy, activityAt, timeline, config, now) {
  // New activity restarts the quiet stretch: boredom only comes around after a
  // full interval without any, and it ends the moment something happens.
  if (activityAt > timeline.lastActivityAt) {
    timeline.boredUntil = 0
    timeline.nextBoredAt = now + config.boredEverySeconds * 1000
  }
  timeline.lastActivityAt = Math.max(timeline.lastActivityAt, activityAt)
  if (busy) {
    timeline.lastActivityAt = now
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
  }
  if (now < timeline.happyUntil) return 'happy'
  if ((now - timeline.lastActivityAt) / 1000 >= config.sleepAfterSeconds) return 'sleep'
  if (now >= timeline.nextBoredAt) {
    // Jittered so the pet reads as idling rather than running a metronome.
    timeline.boredUntil = now + config.boredMs
    timeline.nextBoredAt = now + config.boredEverySeconds * 1000 * (0.7 + Math.random() * 0.6)
  }
  return now < timeline.boredUntil ? 'bored' : 'idle'
}

/**
 * Whether an agent or a job is running; the same test `apps/desktop-host` uses.
 * @param ctx - host context carrying the optional `agents` and `jobs` services.
 * @returns true while work is in flight.
 */
function isBusy(ctx) {
  const agents = ctx.get('agents')
  const jobs = ctx.get('jobs')
  const live = agents === undefined ? [] : agents.list()
  const agentBusy = live.some(agent => agent.status === 'running'
    || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0)
  const jobsBusy = jobs !== undefined && [undefined, ...live].some(agent => jobs.list(agent?.id)
    .some(job => job.status === 'running' || job.status === 'stopping'))
  return agentBusy || jobsBusy
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

  const publish = () => {
    const now = Date.now()
    const current = values()
    const state = sampleState(isBusy(ctx), activityAt(), timeline, current, now)
    writer.write({
      state,
      size: current.size,
      // The pet applies one opacity; `translucent` is the switch the settings
      // card exposes, `idleOpacity` how far it fades.
      opacity: current.translucent ? current.idleOpacity : 1,
      frameMs: current.frameMs,
      topmost: current.topmost,
      clickAction: current.clickAction,
      updatedAt: now,
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
    timer = setInterval(publish, config.pollMs.get())
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
  }, 'little-icon: pet lifetime')

  publish()
  wasEnabled = values().enabled
  if (wasEnabled) startPet()
  schedule()
}

/** Re-exported for the keyless smoke test. */
export const internals = { sampleState, createTimeline, isBusy, resolveDshHome, STATES, ACTIVITY_PATH }
