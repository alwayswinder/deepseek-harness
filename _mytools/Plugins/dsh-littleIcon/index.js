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
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

export const name = 'little-icon'

/** One animation directory per state, built by `tools/build-assets.py`. */
const STATES = ['idle', 'working', 'bored', 'sleep', 'happy', 'alert']

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
  /** Idle seconds before the pet leaves `idle` for `bored`. */
  boredAfterSeconds: z.number().step(1).min(5).max(3600).default(60).volatile(),
  /** Further idle seconds before it falls asleep. */
  sleepAfterSeconds: z.number().step(1).min(5).max(86400).default(600).volatile(),
  /** How long `happy` lasts after a busy period ends. */
  happyMs: z.number().step(100).min(0).max(60000).default(3000).volatile(),
  /** How long `alert` lasts after an agent error. */
  alertMs: z.number().step(100).min(0).max(60000).default(8000).volatile(),
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

/** Busy/idle bookkeeping that survives between samples. */
function createTimeline(now) {
  return { wasBusy: false, idleSince: now, happyUntil: 0, alertUntil: 0 }
}

/**
 * Decide which state the pet shows.
 * @param ctx - host context carrying the optional `agents` and `jobs` services.
 * @param timeline - cross-sample bookkeeping, updated in place.
 * @param config - resolved config values.
 * @param now - sample time in milliseconds.
 * @returns one of {@link STATES}.
 */
function sampleState(ctx, timeline, config, now) {
  const agents = ctx.get('agents')
  const jobs = ctx.get('jobs')
  const live = agents === undefined ? [] : agents.list()
  const agentBusy = live.some(agent => agent.status === 'running'
    || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0)
  const jobsBusy = jobs !== undefined && [undefined, ...live].some(agent => jobs.list(agent?.id)
    .some(job => job.status === 'running' || job.status === 'stopping'))
  if (agentBusy || jobsBusy) {
    timeline.wasBusy = true
    return 'working'
  }
  if (timeline.wasBusy) {
    timeline.wasBusy = false
    timeline.idleSince = now
    timeline.happyUntil = now + config.happyMs
  }
  if (now < timeline.happyUntil) return 'happy'
  if (now < timeline.alertUntil) return 'alert'
  const idleSeconds = (now - timeline.idleSince) / 1000
  if (idleSeconds >= config.sleepAfterSeconds) return 'sleep'
  if (idleSeconds >= config.boredAfterSeconds) return 'bored'
  return 'idle'
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

  // The desktop shell spawns this host with ELECTRON_RUN_AS_NODE, so the host's
  // parent is the Electron main process — the window the pet tucks away. The web
  // profile has no window to control, and the pet then only floats.
  const dshPid = process.env.ELECTRON_RUN_AS_NODE === '1' ? process.ppid : 0
  const timeline = createTimeline(Date.now())
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
    boredAfterSeconds: config.boredAfterSeconds.get(),
    sleepAfterSeconds: config.sleepAfterSeconds.get(),
    happyMs: config.happyMs.get(),
    alertMs: config.alertMs.get(),
    topmost: config.topmost.get(),
    clickAction: config.clickAction.get(),
  })

  const publish = () => {
    const now = Date.now()
    const current = values()
    const state = sampleState(ctx, timeline, current, now)
    writer.write({
      state,
      size: current.size,
      // The pet applies one opacity; `translucent` is the switch the settings
      // page exposes, `idleOpacity` how far it fades.
      opacity: current.translucent ? current.idleOpacity : 1,
      frameMs: current.frameMs,
      topmost: current.topmost,
      clickAction: current.clickAction,
      updatedAt: now,
    })
  }

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

  ctx.on('agent/error', () => {
    timeline.alertUntil = Date.now() + config.alertMs.get()
  })

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
export const internals = { sampleState, createTimeline, resolveDshHome, STATES }
