/**
 * Keyless smoke test for the little-icon plugin: drives the host half's state
 * machine with fake `agents`/`jobs` services, checks that every state has its
 * animation frames, and (on Windows) runs `pet/pet.ps1 -SelfTest` so a broken
 * pet script fails here instead of at the next DSH start.
 *
 * Run: node tests/smoke.mjs           static checks and the pet script self test
 *      node tests/smoke.mjs --pet     also apply() the host half against a
 *                                     temporary DSH_HOME: it spawns a real pet
 *                                     window for a few seconds and asserts the
 *                                     disposer ends that process
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { join, sep } from 'node:path'

const { internals, apply } = await import('../index.js')
const {
  sampleState, createTimeline, sampleWork, shouldTuck, STATES, ACTIVITY_PATH, COMMANDS_PATH,
  GIT_PATH, GIT_DIFF_PATH, GIT_COMMIT_PATH, GIT_PULL_PATH, OPEN_PATH, GIT_DIFF_MAX_CHARS, GIT_LOG_LIMIT,
  parseGitStatus, parseGitLog, parseGitCommitFiles, readGitRepository, pullGitRepository, readGitDiff, readGitCommit,
  openWorkingDirectory, resolveShotDir, StateFileWriter,
} = internals

const root = fileURLToPath(new URL('..', import.meta.url))

// ---- busy predicate ---------------------------------------------------------

/** @param {object} options - which services exist and what they report. */
function fakeContext({ running = false, queued = false, jobs = [] } = {}) {
  const services = {
    agents: {
      list: () => [{
        id: 'agent-1',
        status: running ? 'running' : 'idle',
        inbox: { nextTurn: queued ? [{}] : [], nextStep: [] },
      }],
    },
    jobs: { list: () => jobs },
  }
  return { get: (name) => services[name] }
}

const noWaiting = new Set()
assert.deepEqual(sampleWork(fakeContext(), noWaiting), { busy: false, waiting: false })
assert.equal(sampleWork(fakeContext({ running: true }), noWaiting).busy, true, 'a running agent is work')
assert.equal(sampleWork(fakeContext({ queued: true }), noWaiting).busy, true, 'queued work is work')
assert.equal(sampleWork(fakeContext({ jobs: [{ status: 'running' }] }), noWaiting).busy, true, 'a running job is work')
assert.equal(sampleWork(fakeContext({ jobs: [{ status: 'stopping' }] }), noWaiting).busy, true, 'a stopping job is work')
assert.equal(sampleWork(fakeContext({ jobs: [{ status: 'completed' }] }), noWaiting).busy, false)
assert.equal(sampleWork({ get: () => undefined }, noWaiting).busy, false, 'a profile without agents or jobs is never busy')
// An agent waiting for the user is not working: the loop is blocked on the person,
// so a question on screen — or input queued behind it — must not read as work.
const askedWork = sampleWork(fakeContext({ running: true }), new Set(['agent-1']))
assert.equal(askedWork.busy, false, 'an agent waiting for the user is not work')
assert.equal(askedWork.waiting, true, 'and it is reported as waiting, which the pet shows as surprise')
assert.equal(sampleWork(fakeContext({ queued: true }), new Set(['agent-1'])).busy, false,
  'input queued while an agent waits for the user is not work either')
assert.equal(sampleWork(fakeContext({ running: true }), new Set(['another-agent'])).busy, true,
  'a different agent keeps working while one waits')
assert.equal(sampleWork(fakeContext({ running: true }), new Set(['another-agent'])).waiting, false,
  'a question for one agent is not reported for another')
assert.equal(sampleWork(fakeContext({ running: true, jobs: [{ status: 'running' }] }), new Set(['agent-1'])).busy, true,
  'a background job still counts while an agent waits')

const DEFAULTS = {
  size: 160,
  idleOpacity: 0.45,
  frameMs: 600,
  happyMs: 3000,
  boredEverySeconds: 60,
  boredMs: 5000,
  sleepAfterSeconds: 600,
  topmost: true,
  clickAction: 'toggle',
  autoHide: true,
  autoHideSeconds: 0,
}

const start = 1_000_000

/** Work in flight, nobody waiting on the person. */
const working = { busy: true, waiting: false }
/** The model blocked on an answer: the pet asks for the decision instead. */
const waiting = { busy: false, waiting: true }
/** Nothing under way. */
const quietWork = { busy: false, waiting: false }

// One run reads as work, surprise while it waits for the person, joy when it ends,
// then idle — then boredom now and then, and sleep once nothing has happened for
// the configured stretch.
let timeline = createTimeline(start)
const quiet = (now) => sampleState(quietWork, start, timeline, DEFAULTS, now)

assert.equal(quiet(start), 'idle', 'a fresh pet idles')
assert.equal(sampleState(working, start, timeline, DEFAULTS, start + 100), 'working',
  'a task starts working directly, with no startle first')
// A question parks the run on the person, and the surprise lasts as long as the
// question is unanswered — the whole point of the expression.
const asked = start + 5000
assert.equal(sampleState(waiting, start, timeline, DEFAULTS, asked), 'alert', 'waiting for the answer startles')
assert.equal(sampleState(waiting, start, timeline, DEFAULTS, asked + DEFAULTS.happyMs), 'alert',
  'the startle does not time out while the question stands')
assert.equal(sampleState(working, start, timeline, DEFAULTS, asked + 6000), 'working',
  'the answer puts the pet straight back to work')
const busyEnd = start + 40_000
assert.equal(sampleState(quietWork, start, timeline, DEFAULTS, busyEnd), 'happy', 'work ends happy')
assert.equal(quiet(busyEnd + DEFAULTS.happyMs - 1), 'happy')
assert.equal(quiet(busyEnd + DEFAULTS.happyMs), 'idle')

// Boredom follows the idle agent rather than the mouse: moving the pointer while
// nothing runs must not postpone it.
const boredAt = busyEnd + DEFAULTS.boredEverySeconds * 1000
assert.equal(quiet(boredAt - 1), 'idle')
const wiggle = busyEnd + 30_000
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, wiggle), 'idle')
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, boredAt), 'bored', 'activity while idle must not postpone boredom')
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, boredAt + DEFAULTS.boredMs), 'idle')

// Sleep follows activity instead, on the timer the caller puts in force.
const asleep = wiggle + DEFAULTS.sleepAfterSeconds * 1000
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, asleep), 'sleep')
assert.equal(sampleState(quietWork, asleep, timeline, DEFAULTS, asleep + 500), 'idle', 'activity wakes the pet')
assert.equal(sampleState(quietWork, asleep + 500, timeline, DEFAULTS, asleep + 500 + DEFAULTS.boredEverySeconds * 1000 - 1),
  'idle', 'waking restarts the boredom clock rather than showing boredom at once')
// Tucked away the host passes the much shorter timer, and the same rule applies.
const tucked = { ...DEFAULTS, sleepAfterSeconds: 20 }
assert.equal(sampleState(quietWork, asleep + 500, timeline, tucked, asleep + 500 + 19_000), 'idle')
assert.equal(sampleState(quietWork, asleep + 500, timeline, tucked, asleep + 500 + 20_000), 'sleep')

// Movement of the pet itself is activity too, and a run starting again works at once.
const moved = asleep + 500 + 20_000
assert.equal(sampleState(quietWork, moved, timeline, DEFAULTS, moved + 200), 'idle')
assert.equal(sampleState(working, moved, timeline, DEFAULTS, moved + 1000), 'working')

// Tucking DSH away follows what is in front rather than the activity clock: DSH
// itself in front is never tucked away, and another application in front is what
// asks for the tuck after the configured stretch — zero by default, so it lands on
// the next sample. Only the pet can hide a window, so the decision stays a fact.
const behindAt = moved + 200
const behind = { visible: true, foreground: false, behindSince: behindAt }
const inFront = { visible: true, foreground: true, behindSince: undefined }
assert.equal(shouldTuck(inFront, DEFAULTS, behindAt + 3_600_000), false,
  'DSH in front is never tucked away, however long nothing is touched')
assert.equal(shouldTuck(behind, DEFAULTS, behindAt), true, 'with no delay it goes on the sample it went behind')
assert.equal(shouldTuck({ visible: false, foreground: false, behindSince: behindAt }, DEFAULTS, behindAt + 1000), false,
  'a hidden DSH has nothing to tuck')
assert.equal(shouldTuck({ visible: true, foreground: false, behindSince: undefined }, DEFAULTS, behindAt + 1000), false,
  'a window that never went behind has no tuck clock')
assert.equal(shouldTuck(behind, { ...DEFAULTS, autoHide: false }, behindAt + 60_000), false,
  'the switch turns the tuck off')
assert.equal(shouldTuck(behind, { ...DEFAULTS, autoHideSeconds: 30 }, behindAt + 29_999), false)
assert.equal(shouldTuck(behind, { ...DEFAULTS, autoHideSeconds: 30 }, behindAt + 30_000), true,
  'a configured stretch counts from going behind, not from the last input')

// Every state the host can publish has frames on disk, and the generator's
// frames.json agrees with the files: the art decides the count per state (the
// working sheet holds six figures, the others four), and the pet probes it.
const frameCounts = JSON.parse(readFileSync(join(root, 'assets', 'frames.json'), 'utf8'))
assert.deepEqual(Object.keys(frameCounts).sort(), [...STATES].sort())
for (const state of STATES) {
  const count = frameCounts[state]
  assert.ok(Number.isInteger(count) && count >= 2, `frames.json has no frame count for ${state}`)
  for (let frame = 1; frame <= count; frame += 1) {
    const file = join(root, 'assets', state, `${frame}.png`)
    assert.ok(existsSync(file), `missing pet frame ${file}`)
  }
  assert.ok(!existsSync(join(root, 'assets', state, `${count + 1}.png`)),
    `${state} has more frames on disk than frames.json records`)
}
assert.ok(existsSync(join(root, 'pet', 'pet.ps1')), 'missing pet/pet.ps1')

// The pet script stays ASCII: Windows PowerShell 5.1 decodes a .ps1 without a
// BOM as ANSI, and the mojibake that follows can swallow quotes. Localized tray
// text therefore lives in labels.json.
const petSource = readFileSync(join(root, 'pet', 'pet.ps1'), 'utf8')
const firstNonAscii = [...petSource].findIndex((character) => character.codePointAt(0) > 127)
assert.equal(firstNonAscii, -1, `pet/pet.ps1 must stay ASCII; found ${JSON.stringify(petSource.slice(firstNonAscii, firstNonAscii + 20))}`)
// PowerShell takes the last definition and says nothing, so a helper edited into
// the script twice would silently drop the first copy's behaviour.
const petFunctions = [...petSource.matchAll(/^function ([\w-]+)/gm)].map((match) => match[1])
assert.deepEqual(petFunctions.filter((name, index) => petFunctions.indexOf(name) !== index), [],
  `pet/pet.ps1 defines a function twice: ${petFunctions.join(', ')}`)

const labels = JSON.parse(readFileSync(join(root, 'pet', 'labels.json'), 'utf8'))
assert.equal(labels.QuitDsh, '退出 DSH', 'the menu entry that ends DSH')
assert.equal(labels.RestartDsh, '重启 DSH', 'the menu entry that ends DSH and starts it again')
assert.equal(labels.OpenCwd, '打开工作目录', 'the menu entry that opens the working directory')
assert.equal(labels.Settings, '设置', 'the menu entry that opens the plugin settings page')
assert.equal(labels.Shot, '截图', 'the menu entry that captures a region of the screen')
for (const key of ['PetName', 'Chat', 'Git', 'OpenCwd', 'OpenCwdNoCwd', 'OpenCwdNoDir', 'OpenCwdFailed',
  'Settings', 'Shot', 'ShotHint', 'ShotSaved', 'ShotSavedNoClipboard', 'ShotFailed',
  'RestartDsh', 'RestartDshConfirm', 'RestartDshUnavailable', 'RestartDshFailed', 'QuitDsh', 'QuitDshConfirm']) {
  assert.ok(typeof labels[key] === 'string' && labels[key].length > 0, `labels.json is missing ${key}`)
}
// The pet has no quit entry of its own any more: the plugin's enable switch owns
// its lifetime, and the freed entry ends DSH instead.
assert.equal(labels.Quit, undefined, 'the pet must not offer to quit itself')
// Nor does the menu carry the window utilities any more: clicking the pet is the
// tuck route (DSH's own tray icon is the other), and the position only ever moves
// by dragging the pet.
assert.equal(labels.ToggleShown, undefined, 'the menu must not offer to tuck DSH away')
assert.equal(labels.ToggleHidden, undefined, 'the menu must not offer to show DSH either')
assert.equal(labels.Reset, undefined, 'the menu must not offer to move the pet home')

// ---- screenshot folder ------------------------------------------------------

// What the pet is told is an absolute path or nothing at all. A blank setting means
// "no choice", which leaves the pet on its own directory; `~` and a relative path
// resolve against the user directory, never against wherever DSH happened to be
// started, because the pet is handed a directory rather than a rule for finding one.
assert.equal(resolveShotDir('   '), undefined, 'a blank setting is no choice at all')
assert.equal(resolveShotDir('~'), homedir())
assert.equal(resolveShotDir('~/pics'), join(homedir(), 'pics'), 'a leading ~ expands to the user directory')
assert.equal(resolveShotDir(join('pics', 'dsh')), join(homedir(), 'pics', 'dsh'),
  'a relative path is relative to the user directory, not to this process')
const absoluteShotDir = join(homedir(), 'somewhere', 'shots')
assert.equal(resolveShotDir(absoluteShotDir), absoluteShotDir, 'an absolute path is kept as it is')
assert.equal(resolveShotDir(`${absoluteShotDir}${sep}`), absoluteShotDir,
  'a trailing separator is normalized away, so one folder has one spelling')

// ---- state writer -----------------------------------------------------------

// Windows refuses to replace a file another process holds open — the pet reads
// state.json every 200 ms, so this happens for real. A write that cannot be placed
// reports and keeps the last snapshot the pet can still read: it runs in the
// sampling timer, and an uncaught exception there exits the whole DSH host.
const writerDir = mkdtempSync(join(tmpdir(), 'little-icon-state-'))
const stateFile = join(writerDir, 'state.json')
const writeFailures = []
const writer = new StateFileWriter(stateFile, 60_000, (error) => writeFailures.push(error))
assert.equal(writer.write({ state: 'idle', updatedAt: 1 }), true, 'the first snapshot is written')
assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).state, 'idle')
assert.equal(writer.write({ state: 'idle', updatedAt: 2 }), false, 'unchanged content writes nothing')
assert.equal(writer.write({ state: 'working', updatedAt: 3 }), true, 'changed content is written')

if (process.platform === 'win32') {
  // The obstruction the crash had: an open handle on the state file. Only Windows
  // refuses the replacement, and that is the platform the pet runs on.
  const holder = openSync(stateFile, 'r')
  try {
    const started = Date.now()
    assert.equal(writer.write({ state: 'happy', updatedAt: 4 }), false, 'a refused write returns false')
    // Attempts, not duration, are what matter; the floor only proves the retry loop
    // ran instead of giving up on the first refusal.
    assert.ok(Date.now() - started >= 40, 'the refused write retried before giving up')
    assert.equal(writeFailures.length, 1, 'the refused write reports its error')
    assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).state, 'working',
      'the pet keeps reading the last snapshot that landed')
    assert.equal(writer.write({ state: 'bored', updatedAt: 5 }), false, 'a repeated failure does not throw')
    assert.equal(writeFailures.length, 1, 'a failing stretch reports once, not once per tick')
  } finally {
    closeSync(holder)
  }
  assert.equal(writer.write({ state: 'happy', updatedAt: 6 }), true, 'writing resumes once the file is free')
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).state, 'happy')
} else {
  console.log('skipping the held-open state file case: only Windows refuses the replacement')
}
rmSync(writerDir, { recursive: true, force: true })

// ---- pet script -------------------------------------------------------------

if (process.platform === 'win32') {
  // The self test exits before it touches these; a temp directory keeps a stray
  // failure from dropping state files into the repository.
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const probeDir = mkdtempSync(join(tmpdir(), 'little-icon-selftest-'))
  const selfTest = spawnSync(powershell, [
    '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'pet', 'pet.ps1'),
    '-AssetDir', join(root, 'assets'),
    '-StateFile', join(probeDir, 'state.json'),
    '-PositionFile', join(probeDir, 'position.json'),
    '-SelfTest',
  ], { encoding: 'utf8' })
  rmSync(probeDir, { recursive: true, force: true })
  assert.equal(selfTest.status, 0, `pet.ps1 -SelfTest failed: ${selfTest.stderr}`)
  // The self test counts frames by probing the directories, so its output is the
  // pet's own view; it must agree with what the generator recorded.
  for (const state of STATES) assert.match(selfTest.stdout, new RegExp(`${state}=${frameCounts[state]}`))
  // The self test prints the labels it loaded from labels.json, so this proves
  // Windows PowerShell read that UTF-8 file as UTF-8.
  assert.match(selfTest.stdout, /Git 改动/, 'the self test must report the Git menu entry too')
  assert.match(selfTest.stdout, /打开工作目录/, 'the self test must report the open-directory entry too')
  assert.match(selfTest.stdout, /设置/, 'the self test must report the settings entry too')
  assert.match(selfTest.stdout, /截图/, 'the self test must report the capture entry too')
  assert.match(selfTest.stdout, /重启 DSH/, 'the self test must report the restart entry too')
  // A capture lands beside the state file, in the harness home rather than the
  // repository, and its name is what tells two captures in one second apart.
  const shotFile = /shot-file: (.*)/.exec(selfTest.stdout)
  assert.ok(shotFile !== null, 'the self test must report where a capture lands')
  assert.match(shotFile[1].trim(), /shots[\\/]shot-\d{8}-\d{6}-\d{3}\.png$/,
    'a capture lands in shots/ beside the state file')
  // A drag that runs up and to the left selects the same rectangle as one that
  // runs down and to the right, which is what the bitmap is cut with.
  assert.match(selfTest.stdout, /shot-rect: 10,20 20x20/, 'the drag rectangle is rebuilt from its corners')
  // The settings may name the folder captures go to; a blank setting and no
  // setting at all are the same thing, which is the plugin's own directory.
  const shotDirs = /shot-dirs: (.*)/.exec(selfTest.stdout)
  assert.ok(shotDirs !== null, 'the self test must report where a capture would go')
  const [configuredDir, blankDir, missingDir] = shotDirs[1].trim().split(' / ')
  assert.equal(configuredDir, 'C:\\shots', 'a configured folder is used as it is')
  assert.equal(blankDir, missingDir, 'a blank setting and no setting are the same directory')
  assert.equal(blankDir, join(probeDir, 'shots'), 'and both are the plugin\'s own shots directory')
  // A failed open is reported in the pet's own words, which only happens if the
  // reason the host sends is one this mapping knows.
  assert.ok(selfTest.stdout.includes(
    `open-failure: ${labels.OpenCwdNoCwd} / ${labels.OpenCwdNoDir} / ${labels.OpenCwdFailed}`),
  'every reason the host can report must have its own line in the pet')
  // Restarting ends DSH, so the self test reports what it would run instead: the
  // directory the replacement starts in is the application directory quoted in the
  // launcher's command line, and the waiter waits for DSH, waits out its shutdown,
  // and lets cmd expand the variable the command line travels in.
  const relaunchDir = /relaunch-dir: (.*)/.exec(selfTest.stdout)
  assert.ok(relaunchDir !== null, 'the self test must report the relaunch directory')
  assert.equal(relaunchDir[1].trim(), join(root, 'assets'), 'the last quoted directory wins over the executable')
  const relaunchScript = /relaunch-script: (.*)/.exec(selfTest.stdout)
  assert.ok(relaunchScript !== null, 'the self test must report the waiter script')
  assert.match(relaunchScript[1], /Get-Process -Id 4321/)
  assert.match(relaunchScript[1], /Start-Sleep -Seconds 4/, 'the next instance must wait out the shutdown')
  // Without this the replacement is an Electron that boots as Node, because this
  // pet inherits ELECTRON_RUN_AS_NODE=1 from the Host it was started by.
  assert.match(relaunchScript[1], /Remove-Item Env:ELECTRON_RUN_AS_NODE/)
  assert.match(relaunchScript[1], /Set-Location -LiteralPath 'C:\\somewhere'/)
  assert.match(relaunchScript[1], /'\/d','\/s','\/c','%DSH_RELAUNCH_CMD%'/, 'cmd expands the launcher line')
  assert.match(relaunchScript[1], /-WindowStyle Hidden/)
  // Arming is what broke silently in Windows PowerShell (`$env[$name]` cannot be
  // assigned), and it happens before DSH is ended, so the self test reads back the
  // value the waiter's cmd is meant to expand.
  assert.match(selfTest.stdout, /relaunch-variable: relaunch probe/,
    'the command the waiter expands must be readable back out of the environment')

  // The capture itself, taken for real: the sheet is not drawn and nobody drags, so
  // what is left under test is the screen read, the encoder, and the directory. A
  // machine whose screen cannot be read fails here rather than at the first drag.
  const shotDir = mkdtempSync(join(tmpdir(), 'little-icon-shot-'))
  const shotProbe = spawnSync(powershell, [
    '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'pet', 'pet.ps1'),
    '-AssetDir', join(root, 'assets'),
    '-StateFile', join(shotDir, 'state.json'),
    '-PositionFile', join(shotDir, 'position.json'),
    '-ShotProbe',
  ], { encoding: 'utf8' })
  assert.equal(shotProbe.status, 0, `pet.ps1 -ShotProbe failed: ${shotProbe.stderr}`)
  const shotPath = /shot-probe: (.*)/.exec(shotProbe.stdout)
  assert.ok(shotPath !== null, 'the capture probe must report the file it wrote')
  const shotBytes = readFileSync(shotPath[1].trim())
  rmSync(shotDir, { recursive: true, force: true })
  assert.deepEqual([...shotBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'a capture is a PNG')
  // The bitmap is cut to the rectangle it was given: a capture that came back at
  // another size would mean the selection and the shutter disagree about units.
  assert.equal(shotBytes.readUInt32BE(16), 320, 'the capture is as wide as the rectangle it was given')
  assert.equal(shotBytes.readUInt32BE(20), 200, 'the capture is as tall as the rectangle it was given')
  const shotReported = /shot-probe-bytes: (\d+)/.exec(shotProbe.stdout)
  assert.ok(shotReported !== null, 'the capture probe must report the bytes it wrote')
  assert.equal(Number(shotReported[1]), shotBytes.length, 'the reported size is the file that landed')
} else {
  console.log('skipping pet.ps1 -SelfTest: the pet window is Windows-only')
}

// ---- git readers ------------------------------------------------------------

// Real `git status --porcelain=v1 -z` output, one record per shape the list must
// survive: an unstaged edit, a staged add, an unstaged delete, an untracked file,
// and a rename, whose source path rides in the record after its own.
const STATUS_FIXTURE = [
  ' M kept.txt',
  'A  staged new file.txt',
  ' D gone.txt',
  '?? untracked.txt',
  'R  moved-new.txt',
  'moved-old.txt',
  '',
].join('\0')
assert.deepEqual(parseGitStatus(STATUS_FIXTURE), [
  { path: 'kept.txt', status: ' M' },
  { path: 'staged new file.txt', status: 'A ' },
  { path: 'gone.txt', status: ' D' },
  { path: 'untracked.txt', status: '??' },
  { path: 'moved-new.txt', status: 'R ', from: 'moved-old.txt' },
])
assert.deepEqual(parseGitStatus(''), [], 'an empty status is no changes, not one entry')
// A path keeps its own leading space: trimming it would misname the file.
assert.deepEqual(parseGitStatus(' M  spaced name.txt\0'), [{ path: ' spaced name.txt', status: ' M' }])

const FIELD = '\u001f'
const LOG_FIXTURE = [
  `abc${FIELD}abc1234${FIELD}Ada${FIELD}2026-01-02T03:04:05+08:00${FIELD}first subject`,
  `def${FIELD}def5678${FIELD}Bob${FIELD}2026-01-01T00:00:00+00:00${FIELD}second subject`,
  '',
].join('\0')
assert.deepEqual(parseGitLog(LOG_FIXTURE), [
  { hash: 'abc', short: 'abc1234', author: 'Ada', date: '2026-01-02T03:04:05+08:00', subject: 'first subject' },
  { hash: 'def', short: 'def5678', author: 'Bob', date: '2026-01-01T00:00:00+00:00', subject: 'second subject' },
])
assert.deepEqual(parseGitLog(''), [])

// A path that is not a directory and a directory outside every repository are
// different answers: the page says different things about them. Both are cheap,
// so they run even without git.
const missingDir = await readGitRepository(join(tmpdir(), 'little-icon-no-such-directory'))
assert.deepEqual(missingDir, { ok: false, reason: 'no-dir' })
// The detail readers answer the same four reasons as the listing, so a page that
// asks about a directory that is gone is told that rather than that Git failed.
assert.deepEqual(await readGitDiff(join(tmpdir(), 'little-icon-no-such-directory'), 'a.txt'),
  { ok: false, reason: 'no-dir' })
assert.deepEqual(await readGitCommit(join(tmpdir(), 'little-icon-no-such-directory'), 'HEAD'),
  { ok: false, reason: 'no-dir' })

// `git diff-tree --name-status -z` records: the status, then the path, and for a
// rename or copy two paths with the source first.
const TREE_FIXTURE = ['M', 'kept.txt', 'A', 'staged.txt', 'D', 'gone.txt',
  'R100', 'old.txt', 'new.txt', 'C075', 'copy-src.txt', 'copy-dst.txt', ''].join('\0')
assert.deepEqual(parseGitCommitFiles(TREE_FIXTURE), [
  { status: 'M', path: 'kept.txt' },
  { status: 'A', path: 'staged.txt' },
  { status: 'D', path: 'gone.txt' },
  { status: 'R100', path: 'new.txt', from: 'old.txt' },
  { status: 'C075', path: 'copy-dst.txt', from: 'copy-src.txt' },
])
// An empty commit wrote no records at all, which is no files rather than one.
assert.deepEqual(parseGitCommitFiles(''), [])

// ---- opening the working directory ------------------------------------------

// The menu's open entry is the mirror of the Git reads: the page names one
// directory and the Host hands it to the file manager. Which directory, and
// whether there is still one to open, is decided before anything is started; the
// file manager itself belongs to the caller, so the smoke test watches the
// hand-off instead of putting an Explorer window on the desktop.
const launched = []
assert.deepEqual(openWorkingDirectory('', path => launched.push(path)),
  { ok: false, reason: 'no-cwd' }, 'a Session with no directory has nothing to open')
const goneDir = join(tmpdir(), 'little-icon-no-such-directory')
assert.deepEqual(openWorkingDirectory(goneDir, path => launched.push(path)),
  { ok: false, reason: 'no-dir' }, 'a directory that is gone is its own answer, not a shell dialog')
const openDir = mkdtempSync(join(tmpdir(), 'little-icon-open-'))
assert.deepEqual(openWorkingDirectory(openDir, path => launched.push(path)),
  { ok: true, path: openDir }, 'an existing directory opens')
assert.deepEqual(launched, [openDir], 'the directory the page named is the one handed over')
assert.deepEqual(openWorkingDirectory(openDir, () => { throw new Error('no shell') }),
  { ok: false, reason: 'failed', message: 'no shell' }, 'a file manager that will not start is reported')
assert.deepEqual(launched, [openDir], 'a refused start hands over nothing')
rmSync(openDir, { recursive: true, force: true })

// The route around that reader, and the state it publishes for the pet. The pet
// is switched off here, so this runs anywhere and leaves no folder window and no
// message box on the desktop of whoever runs the suite — which is why the
// `--pet` run below does not exercise this route at all.
{
  const home = mkdtempSync(join(tmpdir(), 'little-icon-open-host-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const disposers = []
  const routes = []
  const hostCtx = {
    // No `agents`, no `jobs`, no `connection`: all three are optional to this half.
    get: () => undefined,
    logger: { info: () => {}, warn: () => {} },
    on: () => () => {},
    effect: (factory) => { disposers.push(factory()) },
    inject: (_services, callback) => callback({
      effect: (factory) => { disposers.push(factory()) },
      settings: { configure: () => () => {} },
      webServer: { register: (route) => { routes.push(route); return () => {} } },
    }),
  }
  const fixed = (value) => ({ get: () => value })
  const config = {
    enabled: fixed(false), size: fixed(160), translucent: fixed(true), idleOpacity: fixed(0.5),
    frameMs: fixed(600), pollMs: fixed(200), happyMs: fixed(3000), boredEverySeconds: fixed(60),
    boredMs: fixed(5000), sleepAfterSeconds: fixed(600), sleepWhenHiddenSeconds: fixed(20),
    autoHide: fixed(true), autoHideSeconds: fixed(0), topmost: fixed(true), clickAction: fixed('toggle'),
    gitPullTimeoutMs: fixed(60_000), shotDir: fixed(''),
  }
  try {
    apply(hostCtx, config)
    const route = routes.find((entry) => entry.path === OPEN_PATH)
    assert.ok(route !== undefined, 'apply() must register the open route')
    const ask = (method, url) => {
      const response = { status: 0, body: '', writeHead(code) { this.status = code }, end(chunk) { this.body = chunk ?? '' } }
      route.handler({ method, url, on: () => {} }, response)
      return response
    }
    // Opening a folder is the one thing here with an effect outside the page, so
    // it is the one surface a re-read must not reach.
    assert.equal(ask('GET', OPEN_PATH).status, 405, 'opening a folder is a POST')
    assert.deepEqual(JSON.parse(ask('POST', OPEN_PATH).body), { ok: false, reason: 'no-cwd' },
      'a Session with no directory is answered, not attempted')
    const goneDir = join(home, 'gone')
    assert.deepEqual(JSON.parse(ask('POST', `${OPEN_PATH}?cwd=${encodeURIComponent(goneDir)}`).body),
      { ok: false, reason: 'no-dir' }, 'a directory that is gone is answered too')
    // The person clicked on the pet, so the pet is what says the folder did not
    // open; the last failure rides in the state file with the timestamp that
    // keeps a pet which already showed it from showing it again.
    const statePath = join(home, 'little-icon', 'state.json')
    const notice = () => JSON.parse(readFileSync(statePath, 'utf8')).notice
    const untilNoticed = Date.now() + 4000
    while (notice() === undefined && Date.now() < untilNoticed) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(notice()?.reason, 'no-dir', 'the failed open must reach the pet')
    assert.ok(typeof notice()?.at === 'number', 'the pet tells a new failure from one it has shown')
  } finally {
    for (const disposer of disposers.splice(0)) disposer()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
}

if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0) {
  const repo = mkdtempSync(join(tmpdir(), 'little-icon-repo-'))
  const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  try {
    git('init', '-q')
    git('config', 'user.email', 'smoke@example.test')
    git('config', 'user.name', 'smoke')
    writeFileSync(join(repo, 'kept.txt'), 'one\n')
    git('add', '.')
    git('commit', '-q', '-m', 'first commit')
    writeFileSync(join(repo, 'kept.txt'), 'two\n')
    writeFileSync(join(repo, 'untracked.txt'), 'new\n')
    const read = await readGitRepository(repo)
    assert.equal(read.ok, true)
    assert.equal(read.branch, git('branch', '--show-current').stdout.trim())
    assert.deepEqual(read.changes.map(change => [change.status, change.path]),
      [[' M', 'kept.txt'], ['??', 'untracked.txt']])
    assert.deepEqual(read.commits.map(commit => commit.subject), ['first commit'])
    assert.match(read.commits[0].hash, /^[0-9a-f]{40}$/)

    // One file's diff. The reader looks the path's own status up instead of
    // trusting the caller, so an unstaged edit is compared against the index and
    // an untracked file against the null device — `git diff` alone would show
    // nothing for the file the person just added.
    const edited = await readGitDiff(repo, 'kept.txt')
    assert.equal(edited.ok, true, JSON.stringify(edited))
    assert.match(edited.text, /^-one$/m)
    assert.match(edited.text, /^\+two$/m)
    assert.equal(edited.truncated, false)
    const added = await readGitDiff(repo, 'untracked.txt')
    assert.equal(added.ok, true, JSON.stringify(added))
    assert.match(added.text, /^\+new$/m)
    assert.match(added.text, /^--- \/dev\/null$/m)
    // A staged change is compared against the index, which is also what works in
    // a repository whose first commit has not been made yet: `HEAD` would not
    // resolve there.
    writeFileSync(join(repo, 'staged.txt'), 'staged\n')
    git('add', 'staged.txt')
    const staged = await readGitDiff(repo, 'staged.txt')
    assert.equal(staged.ok, true, JSON.stringify(staged))
    assert.match(staged.text, /^\+staged$/m)
    // A path Git has nothing to report about is an empty diff, not a failure:
    // that is also what a refresh sees once the change was committed.
    assert.deepEqual(await readGitDiff(repo, 'committed-elsewhere.txt'),
      { ok: true, text: '', truncated: false })

    // A diff past the cap is cut and says so, rather than being laid out line by
    // line in the page: one generated file can be tens of megabytes.
    const wide = Array.from({ length: 5000 }, (_, index) => `line ${index} ${'x'.repeat(60)}`).join('\n')
    writeFileSync(join(repo, 'wide.txt'), `${wide}\n`)
    git('add', 'wide.txt')
    git('commit', '-q', '-m', 'wide file')
    writeFileSync(join(repo, 'wide.txt'), `${wide.replace(/x/g, 'y')}\n`)
    const capped = await readGitDiff(repo, 'wide.txt')
    assert.equal(capped.ok, true)
    assert.equal(capped.truncated, true, 'a diff past the cap must be reported as cut')
    assert.equal(capped.text.length, GIT_DIFF_MAX_CHARS)

    // One commit's files. The reader asks Git for the commit's parents instead of
    // assuming them: the first commit has none, and `diff-tree` lists nothing at
    // all for it without `--root`.
    const firstHash = git('rev-list', '--max-parents=0', 'HEAD').stdout.trim()
    assert.deepEqual(await readGitCommit(repo, firstHash),
      { ok: true, files: [{ status: 'A', path: 'kept.txt' }] }, 'the first commit is read against the empty tree')
    // Everything staged at the time goes into that commit, so it lists both files.
    assert.deepEqual(await readGitCommit(repo, git('rev-parse', 'HEAD').stdout.trim()),
      { ok: true, files: [{ status: 'A', path: 'staged.txt' }, { status: 'A', path: 'wide.txt' }] })
    // A commit Git does not have is the reader's failure, with Git's own words.
    const unknownCommit = await readGitCommit(repo, 'deadbeef')
    assert.equal(unknownCommit.ok, false)
    assert.equal(unknownCommit.reason, 'failed')
    assert.match(unknownCommit.message, /unknown revision|ambiguous argument/)
    // A rename is one row carrying the path it came from; an empty commit has no
    // files at all, which is an answer rather than a failure. The rename moves a
    // file nothing else has touched, so Git scores it as one.
    writeFileSync(join(repo, 'move-me.txt'), 'move\n')
    git('add', 'move-me.txt')
    git('commit', '-q', '-m', 'add move-me')
    git('mv', 'move-me.txt', 'moved.txt')
    git('commit', '-q', '-m', 'rename it')
    assert.deepEqual(await readGitCommit(repo, git('rev-parse', 'HEAD').stdout.trim()),
      { ok: true, files: [{ status: 'R100', path: 'moved.txt', from: 'move-me.txt' }] })
    git('commit', '-q', '--allow-empty', '-m', 'nothing at all')
    assert.deepEqual(await readGitCommit(repo, git('rev-parse', 'HEAD').stdout.trim()), { ok: true, files: [] })

    // A merge commit is read against its first parent, because `diff-tree` given
    // only the merge itself lists nothing — "the files this commit touched" for a
    // merge is what it brought in. Its own repository keeps the working tree above
    // out of the picture.
    const forked = mkdtempSync(join(tmpdir(), 'little-icon-merge-'))
    try {
      const side = (...args) => spawnSync('git', args, { cwd: forked, encoding: 'utf8' })
      side('init', '-q', '-b', 'main')
      side('config', 'user.email', 'smoke@example.test')
      side('config', 'user.name', 'smoke')
      writeFileSync(join(forked, 'base.txt'), 'base\n')
      side('add', '.')
      side('commit', '-q', '-m', 'base')
      side('checkout', '-q', '-b', 'side')
      writeFileSync(join(forked, 'side.txt'), 'side\n')
      side('add', 'side.txt')
      side('commit', '-q', '-m', 'side work')
      side('checkout', '-q', 'main')
      writeFileSync(join(forked, 'main.txt'), 'main\n')
      side('add', 'main.txt')
      side('commit', '-q', '-m', 'main work')
      side('merge', '-q', '--no-ff', 'side', '-m', 'merge side')
      const merged = await readGitCommit(forked, side('rev-parse', 'HEAD').stdout.trim())
      assert.deepEqual(merged, { ok: true, files: [{ status: 'A', path: 'side.txt' }] },
        'a merge lists what it brought in, not nothing')
    } finally {
      rmSync(forked, { recursive: true, force: true })
    }

    // A repository whose first commit has not been made yet answers with no
    // commits rather than failing: `git log` errors there.
    const empty = mkdtempSync(join(tmpdir(), 'little-icon-unborn-'))
    try {
      spawnSync('git', ['init', '-q'], { cwd: empty })
      const unborn = await readGitRepository(empty)
      assert.equal(unborn.ok, true, `an unborn HEAD is still a repository: ${JSON.stringify(unborn)}`)
      assert.deepEqual(unborn.commits, [])
      assert.equal(unborn.branch !== '', true, 'the branch is known before the first commit')
      // The diff reader names no revision either, so a staged file in a repository
      // without a first commit still has a diff to show.
      writeFileSync(join(empty, 'first.txt'), 'first\n')
      spawnSync('git', ['add', 'first.txt'], { cwd: empty })
      const unbornDiff = await readGitDiff(empty, 'first.txt')
      assert.equal(unbornDiff.ok, true, JSON.stringify(unbornDiff))
      assert.match(unbornDiff.text, /^\+first$/m)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }

  // A private file:// remote keeps the mutation test keyless and isolated from
  // network state. Two simultaneous page requests join one fast-forward, then a
  // second pull observes that the local branch is already current.
  const pullWorld = mkdtempSync(join(tmpdir(), 'little-icon-pull-'))
  try {
    const remote = join(pullWorld, 'remote.git')
    const upstream = join(pullWorld, 'upstream')
    const local = join(pullWorld, 'local')
    const run = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })
    const must = (cwd, ...args) => {
      const outcome = run(cwd, ...args)
      assert.equal(outcome.status, 0, `git ${args.join(' ')} failed: ${outcome.stderr}`)
      return outcome
    }
    must(pullWorld, 'init', '--bare', '-q', '--initial-branch=main', remote)
    must(pullWorld, 'clone', '-q', remote, upstream)
    must(upstream, 'config', 'user.email', 'smoke@example.test')
    must(upstream, 'config', 'user.name', 'smoke')
    writeFileSync(join(upstream, 'shared.txt'), 'one\n')
    must(upstream, 'add', 'shared.txt')
    must(upstream, 'commit', '-q', '-m', 'initial')
    must(upstream, 'push', '-q', '-u', 'origin', 'main')
    must(pullWorld, 'clone', '-q', remote, local)

    writeFileSync(join(upstream, 'shared.txt'), 'two\n')
    must(upstream, 'commit', '-q', '-am', 'remote update')
    must(upstream, 'push', '-q')
    const [first, joined] = await Promise.all([
      pullGitRepository(local, 10_000),
      pullGitRepository(local, 10_000),
    ])
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(joined.ok, true, JSON.stringify(joined))
    assert.equal(first.updated, true, 'the first pull must move HEAD to the remote commit')
    assert.equal(readFileSync(join(local, 'shared.txt'), 'utf8').replaceAll('\r\n', '\n'), 'two\n',
      'the working tree must receive the remote file')
    assert.equal(must(local, 'rev-parse', 'HEAD').stdout.trim(), must(upstream, 'rev-parse', 'HEAD').stdout.trim())
    const current = await pullGitRepository(local, 10_000)
    assert.equal(current.ok, true, JSON.stringify(current))
    assert.equal(current.updated, false, 'pulling an up-to-date branch must say HEAD did not move')

    // `--ff-only` must leave both local history and the working tree alone once
    // the two sides diverge; fetching the remote ref is allowed, merging is not.
    must(local, 'config', 'user.email', 'smoke@example.test')
    must(local, 'config', 'user.name', 'smoke')
    writeFileSync(join(local, 'local.txt'), 'local\n')
    must(local, 'add', 'local.txt')
    must(local, 'commit', '-q', '-m', 'local update')
    const localHead = must(local, 'rev-parse', 'HEAD').stdout.trim()
    writeFileSync(join(upstream, 'remote.txt'), 'remote\n')
    must(upstream, 'add', 'remote.txt')
    must(upstream, 'commit', '-q', '-m', 'second remote update')
    must(upstream, 'push', '-q')
    const diverged = await pullGitRepository(local, 10_000)
    assert.equal(diverged.ok, false)
    assert.equal(diverged.reason, 'failed')
    assert.equal(must(local, 'rev-parse', 'HEAD').stdout.trim(), localHead,
      'a diverged pull must not create a merge commit')
    assert.equal(existsSync(join(local, 'remote.txt')), false, 'a diverged pull must not update the working tree')

    must(local, 'checkout', '-q', '-b', 'local-only')
    assert.deepEqual(await pullGitRepository(local, 10_000), { ok: false, reason: 'no-upstream' })
    must(local, 'checkout', '-q', '--detach', 'main')
    assert.deepEqual(await pullGitRepository(local, 10_000), { ok: false, reason: 'detached-head' })
  } finally {
    rmSync(pullWorld, { recursive: true, force: true })
  }
  console.log('little-icon smoke: git readers ok')
} else {
  console.log('skipping the real-repository read: no git on PATH')
}

// ---- browser half -----------------------------------------------------------

/** Fake `window.__ModuleLoader__` plus the browser surface the activity ping uses. */
let loadedRecord = null
const windowListeners = new Map()
const documentListeners = new Map()
const pings = []
globalThis.window = {
  __ModuleLoader__: { load: (record) => { loadedRecord = record } },
  addEventListener: (name, handler) => { windowListeners.set(name, handler) },
  removeEventListener: (name) => { windowListeners.delete(name) },
}
globalThis.document = {
  visibilityState: 'visible',
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '' }),
  head: { appendChild() {} },
  addEventListener: (name, handler) => { documentListeners.set(name, handler) },
  removeEventListener: (name) => { documentListeners.delete(name) },
}
globalThis.fetch = (url, init) => {
  pings.push({ url, method: init?.method })
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, root: '/repo', branch: 'main', changes: [], commits: [] }) })
}
/** Event streams the page opens; the test dispatches the Host's frames itself. */
const eventSources = []
globalThis.EventSource = class {
  constructor(url) {
    this.url = url
    this.closed = false
    eventSources.push(this)
  }

  close() { this.closed = true }
}
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  // A component under test may seed the state its load effect would set; with
  // nothing seeded, `useState` returns its initial value as React does.
  useState: (initial) => [seeded.length > 0 ? seeded.shift() : initial, () => {}],
  useRef: (initial) => ({ current: initial }),
  useEffect: () => {},
}
const requireStub = (specifier) => {
  if (specifier === 'react') return reactStub
  if (specifier === '@deepseek-ai/dsh-client-store') {
    return { createSnapshotStore: (initial) => {
      let state = initial
      return { getSnapshot: () => state, set: (next) => { state = next }, subscribe: () => () => {} }
    } }
  }
  throw new Error(`client.js required an unexpected module: ${specifier}`)
}

await import(pathToFileURL(join(root, 'client.js')).href)
assert.ok(loadedRecord !== null, 'client.js did not register a factory with __ModuleLoader__')
const packageName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
assert.equal(loadedRecord.id, packageName, 'the loader id must equal the package name')

const clientPlugin = loadedRecord.factory(requireStub)
assert.equal(typeof clientPlugin.apply, 'function')

/** Stand-in for the settings form the Host serves for this row. */
const formListeners = new Set()
const form = {
  snapshot: { status: 'ready', writable: true, revision: 7, value: {} },
  writes: [],
  getSnapshot() { return this.snapshot },
  subscribe(listener) { formListeners.add(listener); return () => formListeners.delete(listener) },
  mutate(ops, revision) { this.writes.push({ ops, revision }); return Promise.resolve(true) },
  /** Accept a new Host section, exactly as an accepted write does. */
  accept(value) {
    this.snapshot = { ...this.snapshot, value }
    for (const listener of formListeners) listener()
  },
}
const registrations = []
const dictionaries = new Map()
const clientDisposers = []
/** One render's seeded component state, consumed by that render's next `useState`. */
const seeded = []
/** The two optional services the menu commands reach for, plus the calls they make. */
const openedTabs = []
/** Tab types the page registers with the right Sidebar's registry. */
const registeredTypes = []
const clientServices = {
  sidebarRight: { openTab: (kind, options) => { openedTabs.push({ kind, options }) } },
  sidebarRightTabs: {
    register: (definition) => { registeredTypes.push(definition); return () => {} },
    get: (kind) => registeredTypes.find(definition => definition.kind === kind)
      ?? (kind === 'browser' ? { id: 'browser' } : undefined),
  },
}
/** The plugin's context; `inject` hands the same services to an optional dependency's scope. */
const clientCtx = {
  effect: (factory) => { clientDisposers.push(factory()) },
  get: (name) => clientServices[name],
  inject: (_names, callback) => { callback(clientCtx) },
  locale: { register: (ns, dict) => { dictionaries.set(ns, dict) }, bind: (ns) => (key, params) => {
    // The real binding reads the language in force at call time; the test runs in
    // Chinese, which is also how the copy assertions below read it.
    const text = dictionaries.get(ns).zh[key]
    assert.ok(typeof text === 'string', `the page asked for missing copy: ${key}`)
    return params === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name) => String(params[name]))
  } },
  configForms: { get: () => form },
  slots: {
    inject: (_key, callback) => callback(),
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
  // Cordis exposes an injected service as a property of the scope it injected
  // into; the plugin reads the tab registry that way.
  sidebarRightTabs: clientServices.sidebarRightTabs,
}
clientPlugin.apply(clientCtx)
// The plugin registers the settings card and, once the right Sidebar's registry
// is there, the Git page's body; the Git type itself is registered on that
// registry rather than through a slot.
assert.equal(registrations.length, 2, 'the browser half must register the card and the Git body')
const [registration] = registrations.filter(entry => entry.options.name === 'plugins.bundle.config')
const [gitBody] = registrations.filter(entry => entry.options.name === 'sidebar.right.pane.tab')
assert.ok(registration !== undefined && gitBody !== undefined, 'both registrations must be present')
// The card belongs on the bundle's own page: the Plugins list is where a person
// looks, and the row page behind it is one click too deep.
assert.equal(registration.options.name, 'plugins.bundle.config')
assert.equal(registration.options.key, packageName)

// Input reports itself to the Host so the pet can tell "nobody is there" from
// "no task is running"; it is throttled, so a mouse move is not a request.
assert.deepEqual([...windowListeners.keys()].sort(), ['keydown', 'pointerdown', 'pointermove', 'wheel'])
assert.equal(documentListeners.has('visibilitychange'), true)
assert.deepEqual(pings[0], { url: ACTIVITY_PATH, method: 'POST' }, 'the page reports activity when it loads')
windowListeners.get('pointermove')()
assert.equal(pings.length, 1, 'activity pings must be throttled')

// The pet's menu is drawn by another process, so its commands arrive here on a
// Host-held event stream and this half performs them: "chat" opens the DeepSeek
// chat site in DSH's own Browser tab, never in the system browser, and "git"
// opens this plugin's own Git page beside the conversation.
assert.equal(eventSources.length, 1, 'the page must listen for menu commands')
assert.equal(eventSources[0].url, COMMANDS_PATH)
const [commands] = eventSources
const warned = []
const realWarn = console.warn
console.warn = (...args) => { warned.push(args.join(' ')) }
try {
  commands.onmessage({ data: '{"command":"chat"}' })
  assert.equal(openedTabs.length, 1, 'the chat command must open one tab')
  assert.deepEqual(openedTabs[0], { kind: 'browser', options: { params: { url: 'https://chat.deepseek.com' } } })
  commands.onmessage({ data: '{"command":"git"}' })
  assert.equal(openedTabs.length, 2, 'the git command must open one tab')
  assert.deepEqual(openedTabs[1], { kind: 'little-icon-git', options: undefined },
    'the Git page is page content of this plugin, opened by kind alone')
  // Unknown or malformed frames are ignored rather than thrown at the user.
  commands.onmessage({ data: '{"command":"nonsense"}' })
  commands.onmessage({ data: 'not json' })
  assert.equal(openedTabs.length, 2, 'only known commands open anything')
  // A Web profile may leave the Browser tab disabled and a build without the right
  // Sidebar provides no service at all: the command must then do nothing instead
  // of failing at the click, and the card must still have been registered.
  clientServices.sidebarRightTabs.get = () => undefined
  commands.onmessage({ data: '{"command":"chat"}' })
  commands.onmessage({ data: '{"command":"git"}' })
  assert.equal(openedTabs.length, 2, 'without a registered type nothing may open')
  clientServices.sidebarRightTabs.get = (kind) => registeredTypes.find(definition => definition.kind === kind)
    ?? (kind === 'browser' ? { id: 'browser' } : undefined)
  clientServices.sidebarRight = undefined
  commands.onmessage({ data: '{"command":"chat"}' })
  commands.onmessage({ data: '{"command":"git"}' })
  assert.equal(openedTabs.length, 2, 'without the Sidebar service nothing may open')
  // "Settings" is cross-plugin navigation rather than a page of this plugin's own:
  // the card is rendered on the plugin manager's page, so the service that page
  // provides is what selects this bundle, and a build without that page must say
  // so instead of quietly doing nothing.
  const openedBundles = []
  clientServices.pluginNavigation = { openBundle: (name) => { openedBundles.push(name) } }
  commands.onmessage({ data: '{"command":"settings"}' })
  assert.deepEqual(openedBundles, [packageName], 'settings must select this bundle on the Plugins page')
  clientServices.pluginNavigation = undefined
  commands.onmessage({ data: '{"command":"settings"}' })
  assert.deepEqual(openedBundles, [packageName], 'without the Plugins page nothing may be selected')
} finally {
  console.warn = realWarn
  clientServices.sidebarRight = { openTab: (kind, options) => { openedTabs.push({ kind, options }) } }
}
// One unknown command, the two refusals above in each of their two forms, and the
// settings entry with no Plugins page to reach.
assert.equal(warned.length, 6, `a command that cannot run must say so: ${warned.join(' | ')}`)

// "Open working directory" is the one command this half only names: the folder
// belongs to the Session the main view holds — the same row the shipped
// workspace control opens — and starting a file manager is the Host's, so the
// page sends the directory and leaves the outcome to the pet, which is where the
// click happened. Without a main-view Session there is no directory to send.
const openedFor = (rows) => {
  clientServices.sessions = { list: { getSnapshot: () => ({ byId: rows }) } }
  const before = pings.length
  commands.onmessage({ data: '{"command":"open-cwd"}' })
  return pings[before]
}
assert.deepEqual(openedFor({ s1: { cwd: 'D:\\work\\proj', retainedBy: {} }, s2: { cwd: 'D:\\other', retainedBy: { mainView: 1 } } }),
  { url: `${OPEN_PATH}?cwd=D%3A%5Cother`, method: 'POST' },
  'the directory is the one the main view holds, escaped into the query')
assert.deepEqual(openedFor({ s1: { cwd: 'D:\\work\\proj', retainedBy: {} } }),
  { url: `${OPEN_PATH}?cwd=`, method: 'POST' },
  'no main-view Session means no directory to open, which the Host answers')
delete clientServices.sessions
assert.deepEqual(openedFor({}), { url: `${OPEN_PATH}?cwd=`, method: 'POST' },
  'a build without the sessions service still reaches the Host, which explains itself')
delete clientServices.sessions

// The Git page is a tab type of this plugin's own: the right Sidebar's registry
// carries the type, and its keyed seat carries the body that reads the Host.
assert.equal(registeredTypes.length, 1, 'the page must register exactly one tab type')
const [gitType] = registeredTypes
assert.equal(gitType.id, '@local/dsh-little-icon/git')
assert.equal(gitType.kind, 'little-icon-git')
assert.equal(gitType.title(), 'Git 改动', 'the chip reads the current language')
assert.equal(gitBody.options.key, gitType.id, 'the body registers under the type implementation id')
assert.equal(gitBody.options.locale, 'little-icon')

// The body never reads during render: it asks the Host for one directory and gets
// one JSON object, which is what the injected `load` is. The inject face is built
// for one Session, which is the one its `sendPrompt` addresses.
const gitFace = gitBody.options.inject('session')
const loaded = await gitFace.load('D:\\work\\proj', undefined)
assert.deepEqual(pings.at(-1), { url: `${GIT_PATH}?cwd=D%3A%5Cwork%5Cproj`, method: undefined },
  'the directory travels as a query parameter, escaped')
assert.equal(loaded.ok, true)
const pulled = await gitFace.pull('D:\\work\\proj', undefined)
assert.deepEqual(pings.at(-1), { url: `${GIT_PULL_PATH}?cwd=D%3A%5Cwork%5Cproj`, method: 'POST' },
  'pull is an explicit POST naming the Session directory')
assert.equal(pulled.ok, true)
// The diff face names the repository root rather than the Session's directory,
// because the path it carries is relative to that root; the commit face is the
// same read for a history row, naming the hash instead of a path.
await gitFace.loadDiff('/repo', 'src/a.ts', undefined)
assert.deepEqual(pings.at(-1), { url: `${GIT_DIFF_PATH}?root=%2Frepo&path=src%2Fa.ts`, method: undefined },
  'the diff read names the root and one path, both escaped')
await gitFace.loadCommit('/repo', 'abc123', undefined)
assert.deepEqual(pings.at(-1), { url: `${GIT_COMMIT_PATH}?root=%2Frepo&hash=abc123`, method: undefined },
  'the commit read names the root and one hash, both escaped')
const answerFetch = globalThis.fetch
globalThis.fetch = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
await assert.rejects(() => gitFace.load('/repo', undefined), /answered 500/)
await assert.rejects(() => gitFace.loadDiff('/repo', 'a.txt', undefined), /answered 500/)
await assert.rejects(() => gitFace.loadCommit('/repo', 'abc123', undefined), /answered 500/)
await assert.rejects(() => gitFace.pull('/repo', undefined), /answered 500/)
globalThis.fetch = answerFetch

// The button's message is a real user turn: the page goes through the Session's
// own conversation face — the admission the composer uses — and reports what the
// Host said about it.
const sent = []
const reachable = (conversation) => ({
  scope: (id) => (id === 'session' ? { get: (name) => (name === 'conversation' ? conversation : undefined) } : undefined),
})
clientServices.sessions = reachable({ send: async (text) => { sent.push(text) } })
assert.deepEqual(await gitFace.sendPrompt('提交并推送'), { ok: true })
assert.deepEqual(sent, ['提交并推送'], 'the message reaches the conversation verbatim')
// A Session nobody holds has no conversation to put anything in, and an admission
// the Host refuses reports its own message rather than throwing at the button.
clientServices.sessions = { scope: () => undefined }
assert.deepEqual(await gitFace.sendPrompt('提交并推送'), { ok: false, reason: 'no-channel' })
clientServices.sessions = reachable({ send: async () => { throw new Error('inbox full') } })
assert.deepEqual(await gitFace.sendPrompt('提交并推送'), { ok: false, reason: 'failed', message: 'inbox full' })
clientServices.sessions = reachable({ send: async (text) => { sent.push(text) } })

const dictionary = dictionaries.get('little-icon')
assert.ok(dictionary?.zh !== undefined && dictionary?.en !== undefined, 'missing locale dictionaries')
assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary.zh).sort(),
  'the English and Chinese dictionaries must cover the same keys')

/** Translate through the Chinese dictionary, failing on a key the page asks for but nobody wrote. */
const t = (key, params) => {
  const text = dictionary.zh[key]
  assert.ok(typeof text === 'string', `the page asked for missing copy: ${key}`)
  return params === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name) => String(params[name]))
}

/**
 * Every element in a rendered stub tree. Controls travel as props (`control`),
 * so props are walked too rather than only children.
 */
const flatten = (node, found = []) => {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, found)
    return found
  }
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (node.type !== undefined) found.push(node)
  for (const value of Object.values(node.props ?? {})) flatten(value, found)
  flatten(node.children, found)
  return found
}

const face = registration.options.inject()
/** The framework binds `use<Name>` hooks from the inject face's hooks compartment. */
const usePetSettings = (selector) => selector(face.hooks.petSettings.getSnapshot())
/** Directories the stub picker answers with, in order; an empty queue is a cancel. */
const picks = []
const render = (value) => {
  form.accept(value)
  return registration.component({
    t,
    view: 'page',
    usePetSettings,
    write: face.write,
    pickDirectory: () => Promise.resolve(picks.length === 0 ? null : picks.shift()),
  })
}

const summary = registration.component({ t, view: 'summary' })
assert.equal(summary.type, 'span')
assert.deepEqual(summary.children, [t('summary')], 'the summary view returns the one-liner')

const elements = flatten(render(undefined))
const sizeSlider = elements.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 96)
assert.ok(sizeSlider !== undefined, 'the size slider is missing')
assert.equal(sizeSlider.props.max, 320)
assert.equal(sizeSlider.props.value, 160, 'the size slider must start from the schema default')
const translucent = elements.find(node => node.type === 'input' && node.props.type === 'checkbox' && node.props.checked === true)
assert.ok(translucent !== undefined, 'the translucency switch is missing')
const opacitySlider = elements.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 0.15)
assert.ok(opacitySlider !== undefined, 'the translucency degree slider is missing')
assert.notEqual(opacitySlider.props.disabled, true, 'the degree slider is enabled while translucency is on')

// With translucency off the degree slider follows.
const offElements = flatten(render({ translucent: false }))
const offSlider = offElements.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 0.15)
assert.equal(offSlider.props.disabled, true, 'the degree slider must be disabled while translucency is off')

// The auto-tuck switch starts on, and its delay is editable only while it is.
const tuckRow = elements.find(node => node.props?.label === t('autoHide'))
assert.ok(tuckRow !== undefined, 'the auto-tuck switch is missing')
assert.equal(tuckRow.props.control.props.checked, true, 'the auto-tuck switch is on by default')
const tuckSecondsRow = elements.find(node => node.props?.label === t('autoHideSeconds'))
assert.ok(tuckSecondsRow !== undefined, 'the auto-tuck delay is missing')
assert.equal(tuckSecondsRow.props.control.props.value, 0, 'DSH is tucked away as soon as it goes behind by default')
const noTuck = flatten(render({ autoHide: false }))
assert.equal(noTuck.find(node => node.props?.label === t('autoHideSeconds')).props.disabled, true,
  'the auto-tuck delay must be disabled while the switch is off')

// Controls start from the accepted Host section, not from the defaults.
const stored = flatten(render({ size: 240, translucent: false, clickAction: 'minimize', autoHideSeconds: 90 }))
const storedSlider = stored.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 96)
assert.equal(storedSlider.props.value, 240, 'the card must show the stored size')
assert.equal(stored.find(node => node.type === 'select').props.value, 'minimize', 'the card must show the stored click action')
assert.equal(stored.find(node => node.props?.label === t('autoHideSeconds')).props.control.props.value, 90,
  'the card must show the stored auto-tuck delay')

// A switch writes at once; a drag merges into one write. Both reach the form
// with the revision it was read at.
face.write({ translucent: false }, true)
assert.deepEqual(form.writes[0], { ops: [{ op: 'set', path: ['translucent'], value: false }], revision: 7 })
face.write({ size: 200 }, false)
face.write({ size: 208 }, false)
await new Promise((resolve) => setTimeout(resolve, 400))
assert.equal(form.writes.length, 2, 'a slider drag must merge into one write')
assert.deepEqual(form.writes[1].ops, [{ op: 'set', path: ['size'], value: 208 }])

// The screenshot folder is a path, not a slider: typing echoes locally and the
// setting is written once the field is left, so a path being spelled out is not
// one profile write per keystroke. The picker writes the folder it answered with,
// and a cancelled one changes nothing.
const shotElements = flatten(render({ shotDir: 'D:\\shots' }))
const shotField = shotElements.find(node => node.type === 'input' && node.props.type === 'text')
assert.ok(shotField !== undefined, 'the screenshot folder field is missing')
assert.equal(shotField.props.value, 'D:\\shots', 'the card must show the stored screenshot folder')
const writesBeforeTyping = form.writes.length
shotField.props.onChange({ target: { value: 'E:\\pics' } })
assert.equal(form.writes.length, writesBeforeTyping, 'typing a path must not write per keystroke')
shotField.props.onBlur({ target: { value: '  E:\\pics  ' } })
assert.deepEqual(form.writes.at(-1).ops, [{ op: 'set', path: ['shotDir'], value: 'E:\\pics' }],
  'leaving the field writes the trimmed path')
assert.equal(form.writes.at(-1).revision, 7, 'and it reaches the form at the revision it was read at')
const browseButton = shotElements.find(node => node.type === 'button')
assert.ok(browseButton !== undefined, 'the folder-picking button is missing')
assert.deepEqual(browseButton.children, [t('shotDirBrowse')], 'the button carries its own label')
picks.push('F:\\picked')
await browseButton.props.onClick()
assert.deepEqual(form.writes.at(-1).ops, [{ op: 'set', path: ['shotDir'], value: 'F:\\picked' }],
  'choosing a folder stores it')
const writesAfterPicking = form.writes.length
await browseButton.props.onClick()
assert.equal(form.writes.length, writesAfterPicking, 'a cancelled picker changes nothing')

// The Git page draws two columns from one Host answer. The load effect normally
// sets that answer; the test seeds it instead, so only the render is under test.
/** Every string a stub tree shows, including control props such as `title`. */
const strings = (node, found = []) => {
  if (typeof node === 'string') { found.push(node); return found }
  if (Array.isArray(node)) { for (const child of node) strings(child, found); return found }
  if (node === null || typeof node !== 'object') return found
  for (const value of Object.values(node.props ?? {})) strings(value, found)
  strings(node.children, found)
  return found
}
const gitProps = {
  t,
  sessionId: 'session',
  useSessions: (select) => select({ byId: { session: { cwd: '/repo' } } }),
  useTabInfo: () => ({ tab: { navigation: { revision: 1 } } }),
  load: () => Promise.resolve({}),
  pull: async (cwd) => { pullRequests.push(cwd); return { ...listing, updated: true } },
  loadDiff: () => Promise.resolve({}),
  loadCommit: () => Promise.resolve({}),
  sendPrompt: gitFace.sendPrompt,
}
const pullRequests = []
/** One render's seeded component state, consumed by the next `useState` call. */
const gitRender = () => {
  const view = gitBody.component(gitProps)
  const nodes = strings(view)
  return { view, nodes, section: flatten(view).filter(node => node.type === 'section').length }
}

/** The listing every seeded render below starts from. */
const listing = {
  ok: true,
  root: '/repo',
  branch: 'main',
  changes: [
    { path: 'src/a.ts', status: ' M' },
    { path: 'src/b.ts', status: 'A ' },
    { path: 'new file.txt', status: '??' },
    { path: 'src/old.ts', status: 'R ', from: 'src/older.ts' },
  ],
  commits: [{ hash: 'abc', short: 'abc1234', author: 'Ada', date: '2026-01-02T03:04:05+08:00', subject: 'first subject' }],
}
seeded.push({ phase: 'settled', result: listing })
const populated = gitRender()
assert.equal(populated.section, 2, 'the page is one column of changes beside one column of commits')
for (const text of [t('gitChanges'), t('gitCommits'), t('gitBranch', { name: 'main' }), t('gitRefresh'),
  t('gitPull'), t('gitModified'), t('gitAdded'), t('gitUntracked'), t('gitRenamed'), t('gitStaged'),
  'src/a.ts', 'new file.txt', 'abc1234', 'first subject']) {
  assert.ok(populated.nodes.includes(text), `the Git page must show ${text}`)
}
assert.equal(populated.nodes.filter(text => text === t('gitStaged')).length, 2,
  'the staged add and the staged rename carry the marker; the unstaged edit and the untracked file do not')

// A changed file opens its own diff, which is the one thing on this page a click
// does; the tooltip has to say so, since nothing about a row looks clickable.
const changeRow = flatten(populated.view).find(node => node.props?.className === 'dli-git-row')
assert.equal(typeof changeRow.props.onDoubleClick, 'function', 'a changed file opens its diff on a double-click')
assert.equal(changeRow.props.title, `src/a.ts\n${t('gitDiffHint')}`,
  'the row names the path it stands for and what a double-click does')
assert.equal(flatten(populated.view).filter(node => node.props?.className === 'dli-git-row').length, 4,
  'every changed file row opens a diff, not just the first')

// One commit reads top to bottom: the message, the number it names, then who
// wrote it and when. The message leads because it is what the reader scans for.
const commit = flatten(populated.view).find(node => node.props?.className === 'dli-git-commit')
assert.deepEqual(commit.children.map(line => line.props.className),
  ['dli-git-subject', 'dli-git-hash', 'dli-git-byline'])
assert.equal(commit.children[0].children[0], 'first subject')
assert.equal(commit.children[1].children[0], 'abc1234')
assert.equal(commit.children[2].children[0], `Ada · ${new Date('2026-01-02T03:04:05+08:00').toLocaleString()}`)
// A history row opens its own file list the same way a change row opens its diff.
assert.equal(typeof commit.props.onDoubleClick, 'function', 'a commit opens its files on a double-click')
assert.equal(commit.props.title, `first subject\n${t('gitCommitHint')}`,
  'the row says what a double-click does, and keeps the subject as its tooltip')

// The page carries the one action that writes something: it puts "commit and
// push" in the conversation and lets the agent do it. Clicking sends that text
// through the same face the composer uses — nothing in the page touches Git.
const sendButton = flatten(populated.view).find(node => node.props?.className === 'dli-git-send')
assert.equal(sendButton.children[0], t('gitCommitAndPush'), 'the button keeps its short label')
assert.notEqual(sendButton.props.disabled, true, 'a readable repository offers the button')
sent.length = 0
sendButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(sent, ['没问题就提交并推送吧！'], 'clicking the button sends the instruction into the conversation')
const pullButton = flatten(populated.view).find(node => node.props?.className === 'dli-git-pull')
assert.equal(pullButton.children[0], t('gitPull'), 'the pull button names its direct Git action')
assert.notEqual(pullButton.props.disabled, true, 'a readable repository can pull')
pullButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(pullRequests, ['/repo'], 'pull uses the current Session repository')

// Each refusal has its own line, and the page names no repository in any of them.
for (const [reason, copy] of [['not-a-repo', t('gitNotARepo')], ['no-git', t('gitNoGit')],
  ['no-dir', t('gitNoDir')], ['no-cwd', t('gitNoCwd')]]) {
  seeded.push({ phase: 'settled', result: { ok: false, reason } })
  const refused = gitRender()
  assert.equal(refused.section, 0, `${reason} must show no columns`)
  assert.ok(refused.nodes.includes(copy), `${reason} must explain itself`)
  assert.equal(flatten(refused.view).find(node => node.props?.className === 'dli-git-send').props.disabled, true,
    `${reason} must not offer to commit and push`)
}
// An empty repository is a normal answer: two columns, both saying they are empty.
seeded.push({ phase: 'settled', result: { ok: true, root: '/repo', branch: '', changes: [], commits: [] } })
const empty = gitRender()
assert.equal(empty.section, 2)
assert.ok(empty.nodes.includes(t('gitEmptyChanges')) && empty.nodes.includes(t('gitEmptyCommits')))

// One row's detail takes both columns' room: it is the same question about one
// subject, and the back button is the only way between the two views.
const openDetail = (state) => {
  seeded.push({ phase: 'settled', result: listing }, 0, { phase: 'idle' }, { phase: 'idle' }, state)
  return gitRender()
}
const openDiff = (state) => openDetail({ kind: 'diff', ...state })
const openCommit = (state) => openDetail({ kind: 'commit', commit: listing.commits[0], ...state })
const diffing = openDiff({
  phase: 'settled',
  root: '/repo',
  path: 'src/a.ts',
  status: ' M',
  result: {
    ok: true,
    text: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n',
    truncated: false,
  },
})
assert.equal(diffing.section, 1, 'the diff replaces both columns rather than joining them')
assert.ok(!diffing.nodes.includes(t('gitCommits')), 'the commit column is gone while a diff is open')
assert.ok(!diffing.nodes.includes(t('gitChanges')), 'so is the change column')
for (const text of ['src/a.ts', t('gitModified'), t('gitDiffBack'), '@@ -1 +1 @@', '-old', '+new']) {
  assert.ok(diffing.nodes.includes(text), `the diff view must show ${text}`)
}
const backButton = flatten(diffing.view).find(node => node.props?.className === 'dli-git-detail-back')
assert.equal(backButton.children[0], t('gitDiffBack'), 'the back button names itself')
assert.equal(typeof backButton.props.onClick, 'function', 'and it is the way back to the listing')
// Each line is colored by what it is; the two file headers start with the same
// characters as an added and a removed line, so they are read as headers.
const diffTextLines = (view) => flatten(view).filter(node => typeof node.props?.className === 'string'
  && node.props.className.split(' ')[0] === 'dli-git-diff-line')
const drawn = diffTextLines(diffing.view)
assert.deepEqual(drawn.map(node => node.props.className.replace('dli-git-diff-line dli-git-diff-', '')),
  ['meta', 'meta', 'meta', 'hunk', 'del', 'add'], 'every diff line carries its own tone')
assert.deepEqual(drawn.map(node => node.children[0]),
  ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '-old', '+new'])

// A file with nothing to show, a cut diff, and a read that failed each say so
// where the diff would be; none of them falls back to the columns.
const nothing = openDiff({ phase: 'settled', root: '/repo', path: 'src/a.ts', status: ' M',
  result: { ok: true, text: '', truncated: false } })
assert.ok(nothing.nodes.includes(t('gitDiffEmpty')), 'an empty diff explains itself')
const cut = openDiff({ phase: 'settled', root: '/repo', path: 'src/a.ts', status: ' M',
  result: { ok: true, text: '+new\n', truncated: true } })
assert.ok(cut.nodes.includes(t('gitDiffTruncated')), 'a cut diff says it is cut')
assert.deepEqual(diffTextLines(cut.view).map(node => node.children[0]), [t('gitDiffTruncated'), '+new'],
  'the note is the first line of the diff it belongs to')
const refusedDiff = openDiff({ phase: 'settled', root: '/repo', path: 'src/a.ts', status: ' M',
  result: { ok: false, reason: 'no-git' } })
assert.ok(refusedDiff.nodes.includes(t('gitNoGit')), 'a refused read reuses the listing explanations')
const brokenDiff = openDiff({ phase: 'failed', path: 'src/a.ts', error: new Error('offline') })
assert.ok(brokenDiff.nodes.includes(t('gitFailed', { message: 'offline' })))
const readingDiff = openDiff({ phase: 'loading', path: 'src/a.ts' })
assert.ok(readingDiff.nodes.includes(t('gitDiffLoading')))
assert.equal(flatten(readingDiff.view).some(node => node.props?.className === 'dli-git-diff-body'), false,
  'nothing is laid out before the diff arrives')

// A commit's detail is its own file list: the message leads the header, the count
// and the hash it names sit beside it, and each file is a row with the status
// word the listing uses for the same letter.
const commitFiles = [
  { status: 'M', path: 'src/a.ts' },
  { status: 'A', path: 'src/b.ts' },
  { status: 'D', path: 'gone.ts' },
  { status: 'R100', path: 'src/new.ts', from: 'src/old.ts' },
]
const files = openCommit({ phase: 'settled', root: '/repo', hash: 'abc', result: { ok: true, files: commitFiles } })
assert.equal(files.section, 1, "the commit's files replace both columns")
assert.ok(!files.nodes.includes(t('gitChanges')) && !files.nodes.includes(t('gitCommits')),
  'neither column is left behind')
for (const text of ['first subject', 'abc1234', t('gitCommitFiles', { count: 4 }),
  t('gitModified'), t('gitAdded'), t('gitDeleted'), t('gitRenamed'),
  'src/a.ts', 'src/b.ts', 'gone.ts', 'src/new.ts', '← src/old.ts']) {
  assert.ok(files.nodes.includes(text), `the commit view must show ${text}`)
}
assert.equal(flatten(files.view).find(node => node.props?.className === 'dli-git-detail-back').children[0],
  t('gitDiffBack'), 'the same back button returns from a commit')
// A rename is one row rather than two: the path it has now, and the one it came from.
const renamedRow = flatten(files.view).filter(node => node.props?.className === 'dli-git-row').at(-1)
assert.deepEqual(renamedRow.children.map(child => child.props.className),
  ['dli-git-badge dli-git-badge-moved', 'dli-git-path', 'dli-git-from'])
assert.equal(renamedRow.children[2].children[0], '← src/old.ts')
const commitRows = flatten(files.view).filter(node => node.props?.className === 'dli-git-row')
assert.deepEqual(commitRows.map(row => row.children[1].children[0]), commitFiles.map(file => file.path),
  'one row per file, in the order Git listed them')

// A commit with no files, a merge read that failed, and the read still in flight
// each say so in the commit's own place.
const noFiles = openCommit({ phase: 'settled', root: '/repo', hash: 'abc', result: { ok: true, files: [] } })
assert.ok(noFiles.nodes.includes(t('gitCommitEmpty')), 'a commit with no files says so')
const refusedCommit = openCommit({ phase: 'settled', root: '/repo', hash: 'abc',
  result: { ok: false, reason: 'not-a-repo' } })
assert.ok(refusedCommit.nodes.includes(t('gitNotARepo')), 'a refused commit read reuses the listing explanations')
const brokenCommit = openCommit({ phase: 'failed', hash: 'abc', error: new Error('offline') })
assert.ok(brokenCommit.nodes.includes(t('gitFailed', { message: 'offline' })))
const readingCommit = openCommit({ phase: 'loading', hash: 'abc' })
assert.ok(readingCommit.nodes.includes(t('gitCommitLoading')))
assert.ok(!readingCommit.nodes.includes(t('gitCommitFiles', { count: 0 })),
  'no count is shown before the files arrive')

// A transport failure is the page's own, not the repository's.
seeded.push({ phase: 'failed', error: new Error('offline') })
assert.ok(gitRender().nodes.includes(t('gitFailed', { message: 'offline' })))
// Nothing seeded is the state a freshly opened tab starts in, where the button
// has no repository to speak about yet.
const loading = gitRender()
assert.ok(loading.nodes.includes(t('gitLoading')))
assert.equal(flatten(loading.view).find(node => node.props?.className === 'dli-git-send').props.disabled, true,
  'a read still in flight must not offer to commit and push')

// Registrations are effects: disposing the plugin's contributions closes the
// stream it opened, so a reloaded page never leaves a listener on the Host.
for (const dispose of clientDisposers) { if (typeof dispose === 'function') dispose() }
assert.equal(commands.closed, true, 'disposal must close the command stream')

console.log('little-icon smoke: browser half ok')

// ---- host half, end to end (opt-in: it shows a real pet window) -------------

if (process.argv.includes('--pet')) {
  assert.equal(process.platform, 'win32', '--pet runs the Windows pet window')
  // Say it out loud: this run puts a real pet on the desktop for about half a
  // minute, in its own temporary home so it can coexist with a running pet.
  console.log('little-icon smoke --pet: showing a real pet window in the TOP-LEFT corner for about 25s')

  const home = mkdtempSync(join(tmpdir(), 'little-icon-smoke-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  // Park it in the top-left corner rather than the default bottom-right, where
  // the pet a person is actually using lives: a stray window is then obviously
  // this test's, not a second pet somebody's plugin started.
  mkdirSync(join(home, 'little-icon'), { recursive: true })
  writeFileSync(join(home, 'little-icon', 'position.json'), '{"x":0,"y":0}\n', 'utf8')
  // A menu command the pet wrote before this host started: the relay must treat
  // it as history rather than open a tab the user asked for in a past run.
  writeFileSync(join(home, 'little-icon', 'command.json'), '{"command":"chat","at":1}\n', 'utf8')
  const disposers = []
  const handlers = new Map()
  const logged = []
  const autoFormOff = []
  const routes = []
  /** What the fake `agents` service reports; the test flips it to start a task. */
  const agents = { running: false }
  const context = {
    get: (name) => (name === 'agents'
      ? { list: () => [{ id: 'agent-1', status: agents.running ? 'running' : 'idle', inbox: { nextTurn: [], nextStep: [] } }] }
      : undefined),
    logger: { info: (...args) => logged.push(args.join(' ')), warn: (...args) => logged.push(args.join(' ')) },
    on: (event, handler) => { handlers.set(event, handler); return () => handlers.delete(event) },
    effect: (factory) => { disposers.push(factory()) },
    // Cordis runs the callback once its services exist; the eager call here keeps
    // the injections in apply() exercised without a loader.
    inject: (_services, callback) => callback({
      effect: (factory) => { disposers.push(factory()) },
      // The real configure returns the disposer that drops the presentation.
      settings: { configure: (presentation) => { autoFormOff.push(presentation.auto); return () => {} } },
      webServer: { register: (route) => { routes.push(route); return () => {} } },
    }),
  }
  /** A config reference the test can also flip, as the loader does. */
  const ref = (value) => {
    const box = { value }
    return { get: () => box.value, set: (next) => { box.value = next } }
  }
  const config = {
    enabled: ref(true),
    size: ref(180),
    translucent: ref(true),
    idleOpacity: ref(0.5),
    frameMs: ref(500),
    pollMs: ref(300),
    happyMs: ref(500),
    boredEverySeconds: ref(30),
    boredMs: ref(1000),
    // Short enough that the sleep-and-wake cycle fits in a test, long enough
    // that the write-rate window below stays inside one steady state.
    sleepAfterSeconds: ref(6),
    sleepWhenHiddenSeconds: ref(2),
    // The plugin default: DSH is tucked away the moment another application is in
    // front, which is also what makes the assertion below deterministic.
    autoHide: ref(true),
    autoHideSeconds: ref(0),
    topmost: ref(true),
    clickAction: ref('toggle'),
    gitPullTimeoutMs: ref(60_000),
  }

  const countPetProcesses = () => {
    const marker = join(home, 'little-icon', 'state.json')
    // The probe itself is a powershell.exe whose command line carries the marker,
    // so it must exclude its own process id.
    const query = `@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*${marker}*' }).Count`
    const probe = spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-Command', query], { encoding: 'utf8' })
    assert.equal(probe.status, 0, `pet process probe failed: ${probe.stderr}`)
    return Number(probe.stdout.trim())
  }

  /**
   * Measure the pet window in physical pixels from a DPI-aware process. Mixing
   * WPF's DIP geometry with WinForms' physical geometry puts the window off the
   * screen at any display scaling other than 100%, so the check is worth a probe.
   * @returns {{bounds: string, virtual: string, onScreen: boolean}} measurement.
   */
  const measurePetWindow = () => {
    const marker = join(home, 'little-icon', 'state.json')
    const script = join(home, 'measure.ps1')
    writeFileSync(script, `
param([string]$Marker)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace PetMeasure -Name Win32 -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(System.IntPtr ctx);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, System.IntPtr extra);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public delegate bool EnumProc(System.IntPtr h, System.IntPtr extra);
"@
[void][PetMeasure.Win32]::SetProcessDpiAwarenessContext([IntPtr](-4))
$pids = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like "*$Marker*" } | ForEach-Object { [int]$_.ProcessId })
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$found = @()
foreach ($target in $pids) {
  $script:t = $target
  $cb = [PetMeasure.Win32+EnumProc]{
    param([IntPtr]$h, [IntPtr]$x)
    $owner = 0
    [void][PetMeasure.Win32]::GetWindowThreadProcessId($h, [ref]$owner)
    if ($owner -eq $script:t -and [PetMeasure.Win32]::IsWindowVisible($h)) {
      $r = New-Object PetMeasure.Win32+RECT
      [void][PetMeasure.Win32]::GetWindowRect($h, [ref]$r)
      if (($r.Right - $r.Left) -gt 8 -and ($r.Bottom - $r.Top) -gt 8) {
        $onScreen = ($r.Left -ge $vs.Left) -and ($r.Top -ge $vs.Top) -and ($r.Right -le $vs.Right) -and ($r.Bottom -le $vs.Bottom)
        $script:found += "$onScreen $($r.Left),$($r.Top) $($r.Right - $r.Left)x$($r.Bottom - $r.Top)"
      }
    }
    return $true
  }
  [void][PetMeasure.Win32]::EnumWindows($cb, [IntPtr]::Zero)
}
"virtual=$($vs.Width)x$($vs.Height)"
$found
`, 'utf8')
    const probe = spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, marker], { encoding: 'utf8' })
    assert.equal(probe.status, 0, `window measurement failed: ${probe.stderr}`)
    const lines = probe.stdout.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    return { virtual: lines[0] ?? 'virtual=?', windows: lines.slice(1) }
  }

  try {
    // A quit request left behind by a host that died mid-teardown belongs to no
    // pet: starting one must clear it, or the new pet would quit on its first tick.
    writeFileSync(join(home, 'little-icon', 'quit'), '')
    apply(context, config)
    assert.equal(existsSync(join(home, 'little-icon', 'quit')), false,
      'starting a pet must clear a stale quit request')
    const statePath = join(home, 'little-icon', 'state.json')
    assert.ok(existsSync(statePath), 'apply() did not publish a state file')
    const first = JSON.parse(readFileSync(statePath, 'utf8'))
    assert.equal(first.state, 'idle')
    assert.equal(first.size, 180)
    assert.equal(first.clickAction, 'toggle')
    assert.equal(first.tuck, false, 'a freshly started host must not ask for a tuck')
    // The custom card owns the fields, so the schema-derived automatic page must
    // be switched off or the row would show both.
    assert.deepEqual(autoFormOff, [false], 'apply() did not disable the automatic settings page')
    // The page reports input here; without it the pet could only see agents and
    // jobs, and it would sleep while the person is using DSH. The second route is
    // the stream the pet's menu commands come back on, the next four are what
    // the Git page reads and fast-forwards a Session's repository through, and
    // the last is the menu's open-directory entry.
    assert.deepEqual(routes.map((route) => `${route.kind} ${route.path}`),
      [`exact ${ACTIVITY_PATH}`, `exact ${COMMANDS_PATH}`, `exact ${GIT_PATH}`,
        `exact ${GIT_DIFF_PATH}`, `exact ${GIT_COMMIT_PATH}`, `exact ${GIT_PULL_PATH}`,
        `exact ${OPEN_PATH}`])

    // The Git routes answer JSON for one directory and refuse everything else.
    // The directory is checked here rather than inferred from a spawn failure, so
    // a page that has not learned its Session's workspace is told that, not that
    // git is missing.
    const gitRoute = routes.find((route) => route.path === GIT_PATH)
    const diffRoute = routes.find((route) => route.path === GIT_DIFF_PATH)
    const commitRoute = routes.find((route) => route.path === GIT_COMMIT_PATH)
    const pullRoute = routes.find((route) => route.path === GIT_PULL_PATH)
    const answered = () => {
      const response = {
        status: 0,
        headers: {},
        body: '',
        writeHead(code, headers) { this.status = code; this.headers = headers ?? {} },
        end(chunk) { this.body = chunk ?? '' },
      }
      return response
    }
    const askGit = async (route, method, url) => {
      const response = answered()
      route.handler({ method, url, on: () => {} }, response)
      // Successful handlers answer through a promise. Wait for that observable
      // response rather than assuming the machine will settle it within one
      // fixed delay; method refusals need no body.
      const deadline = Date.now() + 4000
      while (response.status === 0 || (response.status === 200 && response.body === '')) {
        if (Date.now() >= deadline) assert.fail(`${method} ${url} did not answer`)
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      return {
        status: response.status,
        headers: response.headers,
        body: response.body === '' ? undefined : JSON.parse(response.body),
      }
    }
    assert.equal((await askGit(gitRoute, 'POST', GIT_PATH)).status, 405, 'the Git route is read-only')
    const noCwd = await askGit(gitRoute, 'GET', GIT_PATH)
    assert.equal(noCwd.status, 200)
    assert.deepEqual(noCwd.body, { ok: false, reason: 'no-cwd' })
    assert.equal(noCwd.headers['content-type'], 'application/json')
    assert.equal(noCwd.headers['cache-control'], 'no-store', 'a stale repository listing must not be cached')
    const missing = await askGit(gitRoute, 'GET', `${GIT_PATH}?cwd=${encodeURIComponent(join(home, 'gone'))}`)
    assert.deepEqual(missing.body, { ok: false, reason: 'no-dir' })
    const outside = await askGit(gitRoute, 'GET', `${GIT_PATH}?cwd=${encodeURIComponent(home)}`)
    assert.deepEqual(outside.body, { ok: false, reason: 'not-a-repo' },
      'a temporary DSH_HOME is not inside a repository either')

    // The diff route is a read like the listing, and it answers the same reasons:
    // the page names the root it just listed and one path inside it.
    assert.equal((await askGit(diffRoute, 'POST', GIT_DIFF_PATH)).status, 405, 'the diff route is read-only')
    const goneDiff = await askGit(diffRoute, 'GET',
      `${GIT_DIFF_PATH}?root=${encodeURIComponent(join(home, 'gone'))}&path=a.txt`)
    assert.deepEqual(goneDiff.body, { ok: false, reason: 'no-dir' })
    const outsideDiff = await askGit(diffRoute, 'GET',
      `${GIT_DIFF_PATH}?root=${encodeURIComponent(home)}&path=a.txt`)
    assert.deepEqual(outsideDiff.body, { ok: false, reason: 'not-a-repo' },
      'a directory outside every repository is the listing\'s own answer, not a bare failure')
    assert.equal(outsideDiff.headers['cache-control'], 'no-store', 'a diff must not be cached either')

    // The commit route is the same read shaped for a history row: a repository
    // root and one hash, and the same explanations when either is wrong.
    assert.equal((await askGit(commitRoute, 'POST', GIT_COMMIT_PATH)).status, 405,
      'the commit route is read-only')
    const goneCommit = await askGit(commitRoute, 'GET',
      `${GIT_COMMIT_PATH}?root=${encodeURIComponent(join(home, 'gone'))}&hash=abc`)
    assert.deepEqual(goneCommit.body, { ok: false, reason: 'no-dir' })
    const outsideCommit = await askGit(commitRoute, 'GET',
      `${GIT_COMMIT_PATH}?root=${encodeURIComponent(home)}&hash=abc`)
    assert.deepEqual(outsideCommit.body, { ok: false, reason: 'not-a-repo' })

    // Pull is the one Git mutation: re-reads cannot trigger it, and an explicit
    // POST without a Session directory is answered before Git is started.
    assert.equal((await askGit(pullRoute, 'GET', GIT_PULL_PATH)).status, 405,
      'the pull route must require POST')
    const noPullCwd = await askGit(pullRoute, 'POST', GIT_PULL_PATH)
    assert.equal(noPullCwd.status, 200)
    assert.deepEqual(noPullCwd.body, { ok: false, reason: 'no-cwd' })
    assert.equal(noPullCwd.headers['cache-control'], 'no-store', 'a pull result must not be cached')

    // The pet's right-click menu is drawn in another process, so the host relays
    // what it chooses: the page holds one stream open and receives a frame per
    // command. A command from before this host started is history, not a request.
    const commandsRoute = routes.find((route) => route.path === COMMANDS_PATH)
    const stream = {
      status: 0,
      headers: {},
      frames: [],
      writableEnded: false,
      destroyed: false,
      writeHead(code, headers) { this.status = code; this.headers = headers ?? {} },
      write(chunk) { this.frames.push(chunk) },
      end() { this.writableEnded = true },
      on() {},
    }
    commandsRoute.handler({ method: 'GET', on: () => {} }, stream)
    assert.equal(stream.status, 200, 'the command stream must open')
    assert.equal(stream.headers['content-type'], 'text/event-stream')
    assert.equal(stream.frames.length, 1, 'the stream opens with its comment frame')
    await new Promise((resolve) => setTimeout(resolve, 700))
    assert.equal(stream.frames.length, 1, 'a command from before this host started must not be replayed')
    writeFileSync(join(home, 'little-icon', 'command.json'),
      `${JSON.stringify({ command: 'chat', at: Date.now() })}\n`, 'utf8')
    const untilDelivered = Date.now() + 5000
    while (stream.frames.length < 2 && Date.now() < untilDelivered) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(stream.frames.length, 2, 'a menu command must reach the open stream')
    assert.match(stream.frames[1], /^data: \{"command":"chat"\}\n\n$/)

    // An unchanged state must not rewrite the file on every poll (300ms here):
    // only the 4s heartbeat refreshes it, so 2.5s of sampling sees at most one
    // write, where a per-poll writer would produce about eight. Measured before
    // the pet's own sleep lands, so the window holds one steady state.
    let previous = statSync(statePath).mtimeMs
    let writes = 0
    for (let sample = 0; sample < 50; sample += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      const current = statSync(statePath).mtimeMs
      if (current !== previous) {
        previous = current
        writes += 1
      }
    }
    assert.ok(writes <= 1, `the state file was rewritten ${writes} times in 2.5s without a state change`)

    // The pet process is started by apply(); give it a moment to appear.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    assert.equal(countPetProcesses(), 1, `expected exactly one pet process (close a running pet first); log: ${logged.join(' | ')}`)

    // The window must land inside the screen: WPF's Window.Left/Top are DIPs, so
    // mixing them with physical work-area pixels pushes the pet off-screen at any
    // scaling other than 100% and nothing would ever be visible.
    const measured = measurePetWindow()
    assert.equal(measured.windows.length, 1, `expected one visible pet window, got: ${measured.windows.join(' | ')}`)
    const [onScreen, position] = measured.windows[0].split(' ')
    assert.equal(onScreen.toLowerCase(), 'true', `the pet window is off-screen (${measured.windows[0]} on ${measured.virtual})`)
    // The test parks the pet in the top-left corner through its position file —
    // one more reason a stray window is recognisably this test's — and that also
    // proves a stored position is honored at startup.
    const [left, top] = position.split(',').map(Number)
    assert.ok(left < 300 && top < 300, `the pet should start in the top-left corner, found ${position}`)

    // No activity for sleepAfterSeconds (6s here) puts the pet to sleep, and one
    // activity ping brings it straight back to idle.
    const readState = () => JSON.parse(readFileSync(statePath, 'utf8')).state
    const untilAsleep = Date.now() + 12_000
    while (readState() !== 'sleep' && Date.now() < untilAsleep) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    assert.equal(readState(), 'sleep', 'a quiet pet should fall asleep')
    const accepted = { writeHead: (code) => { accepted.code = code }, end: () => {} }
    routes[0].handler({ method: 'POST' }, accepted)
    assert.equal(accepted.code, 204, 'the activity route answers 204')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    assert.equal(readState(), 'idle', 'activity should wake the pet')
    // Anything else on that route is refused.
    const refused = { writeHead: (code) => { refused.code = code }, end: () => {} }
    routes[0].handler({ method: 'GET' }, refused)
    assert.equal(refused.code, 405, 'the activity route only accepts POST')

    // The pet reports whether DSH is on screen and whether it is in front;
    // tucked away, the much shorter sleep timer applies, and showing DSH again
    // counts as activity and wakes it. (The test's pet has no window to control,
    // so it writes no report itself.)
    const windowPath = join(home, 'little-icon', 'window.json')
    writeFileSync(windowPath, '{"dshVisible":false,"dshForeground":false}\n', 'utf8')
    const untilTucked = Date.now() + 6000
    while (readState() !== 'sleep' && Date.now() < untilTucked) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(readState(), 'sleep', 'a tucked DSH should put the pet to sleep on the short timer')
    writeFileSync(windowPath, '{"dshVisible":true,"dshForeground":true}\n', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    assert.equal(readState(), 'idle', 'showing DSH again should wake the pet')

    // A task starts working directly — no startle first, surprise belongs to the
    // question below — and ending it must play happy before settling back to idle.
    agents.running = true
    const untilWorking = Date.now() + 3000
    while (readState() !== 'working' && Date.now() < untilWorking) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'working', 'a task start should go straight to working')
    // The auto-tuck follows what is in front: DSH in front is never tucked away,
    // and going behind an application is what asks for the tuck — with no delay,
    // on the next sample, and without sparing the running task.
    const readTuck = () => JSON.parse(readFileSync(statePath, 'utf8')).tuck
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(readTuck(), false, 'DSH in front must never be tucked away')
    writeFileSync(windowPath, '{"dshVisible":true,"dshForeground":false}\n', 'utf8')
    const untilTuck = Date.now() + 10_000
    while (readTuck() !== true && Date.now() < untilTuck) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(readTuck(), true, 'going behind another application must ask for the tuck')
    assert.equal(readState(), 'working', 'the tuck must not wait for the running task to finish')

    // A question the agent asks the user parks the run on the person, so while the
    // choice is unanswered the pet shows surprise, and the answer puts it back to
    // work. The waterfall the tool calls is what the host observes.
    const asked = handlers.get('user-questions/request')
    assert.equal(typeof asked, 'function', 'the host must observe the question waterfall')
    const answer = Promise.withResolvers()
    void asked({ agent: { id: 'agent-1' }, questions: [] }, () => answer.promise)
    const untilSurprised = Date.now() + 4000
    while (readState() !== 'alert' && Date.now() < untilSurprised) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'alert', 'an unanswered question must surprise the pet')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(readState(), 'alert', 'the surprise must stand as long as the question does')
    answer.resolve({ answers: [] })
    const untilResumed = Date.now() + 4000
    while (readState() !== 'working' && Date.now() < untilResumed) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'working', 'the answer puts the pet back to work')

    agents.running = false
    const untilHappy = Date.now() + 3000
    while (readState() !== 'happy' && Date.now() < untilHappy) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'happy', 'finishing a task should play the happy frames')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(readState(), 'idle', 'the pet should settle back to idle')

    // Disabling the pet ends its process; enabling it again starts a new one,
    // while an unrelated settings write never resurrects a pet the user quit. The
    // pet is asked to quit rather than killed, so it stores its position and closes
    // its window in order instead of dying mid-write.
    const quitPath = join(home, 'little-icon', 'quit')
    const volatileUpdate = handlers.get('loader/volatile-update')
    config.enabled.set(false)
    volatileUpdate()
    assert.equal(existsSync(quitPath), true, 'disabling the pet must ask it to quit')
    await new Promise((resolve) => setTimeout(resolve, 1500))
    assert.equal(countPetProcesses(), 0, 'disabling the pet left its process running')
    assert.equal(existsSync(quitPath), false, 'the pet must take the request with it as it goes')
    config.size.set(200)
    volatileUpdate()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(countPetProcesses(), 0, 'a settings write restarted a disabled pet')
    config.enabled.set(true)
    volatileUpdate()
    await new Promise((resolve) => setTimeout(resolve, 2500))
    assert.equal(countPetProcesses(), 1, 'enabling the pet did not start it again')
    assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).size, 200)

    // The switch stops the request without touching anything else.
    config.autoHide.set(false)
    volatileUpdate()
    assert.equal(readTuck(), false, 'the auto-tuck switch must stop the request')
    config.autoHide.set(true)
    volatileUpdate()
    const untilBack = Date.now() + 10_000
    while (readTuck() !== true && Date.now() < untilBack) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(readTuck(), true, 'turning the switch back on must resume the request')

    // Disposal kills the process so DSH never leaves an orphan pet behind, and
    // ends the command stream so no page is left listening to a plugin that is gone.
    for (const disposer of disposers.splice(0)) disposer()
    assert.equal(stream.writableEnded, true, 'disposal must end the command stream')
    await new Promise((resolve) => setTimeout(resolve, 2500))
    assert.equal(countPetProcesses(), 0, 'disposal left a pet process running')
    const problems = logged.filter((line) => line.includes('pet:') || line.includes('missing'))
    assert.equal(problems.length, 0, `the pet reported a problem: ${problems.join(' | ')}`)
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
  console.log('little-icon smoke: pet lifecycle ok')
}

console.log('little-icon smoke: ok')
