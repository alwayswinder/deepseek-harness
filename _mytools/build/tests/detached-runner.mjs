/**
 * Keyless smoke test for the detached build runner. It uses private temporary
 * batch files so the real build, Desktop process, and DSH_HOME stay untouched.
 *
 * Run: node _mytools/build/tests/detached-runner.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') {
  console.log('skipping detached build runner smoke: Windows only')
  process.exit(0)
}

const buildDir = dirname(fileURLToPath(new URL('../run-detached-build.ps1', import.meta.url)))
const runner = join(buildDir, 'run-detached-build.ps1')
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-detached-runner-'))

const detachSource = readFileSync(join(buildDir, 'detach.ps1'), 'utf8')
assert.match(detachSource, /run-detached-build\.ps1/, 'WMI hand-off must use the visible runner')
assert.doesNotMatch(detachSource, />>/, 'WMI hand-off must not hide output with shell redirection')

function runFixture(name, exitCode) {
  const fixture = join(temporaryRoot, `${name}.cmd`)
  const log = join(temporaryRoot, `${name}.log`)
  writeFileSync(fixture, [
    '@echo off',
    `echo [fixture] ${name} stdout`,
    `>&2 echo [fixture] ${name} stderr`,
    `exit /b ${exitCode}`,
    '',
  ].join('\r\n'), 'utf8')

  const result = spawnSync(powershell, [
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', runner,
    '-Script', fixture,
    '-Mode', 'desktop',
    '-Log', log,
    '-NoWaitOnError',
  ], { encoding: 'utf8', timeout: 30_000, windowsHide: true })

  assert.equal(result.error, undefined, `${name} runner did not finish: ${result.error?.message}`)
  assert.equal(result.signal, null, `${name} runner ended by signal ${result.signal}`)
  assert.equal(result.status, exitCode,
    `${name} runner changed exit code:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  assert.equal(result.stderr, '', `${name} runner leaked stderr instead of displaying it`)
  const normalizeNewlines = (text) => text.replaceAll('\r\n', '\n')
  assert.equal(normalizeNewlines(readFileSync(log, 'utf8')), normalizeNewlines(result.stdout),
    `${name} console and log diverged`)
  assert.match(result.stdout, new RegExp(`\\[fixture\\] ${name} stdout`))
  assert.match(result.stdout, new RegExp(`\\[fixture\\] ${name} stderr`))
  return result.stdout
}

try {
  const success = runFixture('success', 0)
  assert.match(success, /Detached build finished successfully/)

  const failure = runFixture('failure', 7)
  assert.match(failure, /Detached build failed with exit code 7/)
  assert.match(failure, /final build lines above identify the failed step/)
  assert.match(failure, /Full log:/)
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}

console.log('detached build runner smoke passed')
