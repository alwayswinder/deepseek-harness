/**
 * Keyless smoke test for the temp-space host half.
 *
 * Drives the real routes over a real HTTP listener and a real Git repository in
 * a temporary directory, so the checks cover what the page would actually meet:
 * name sanitization against traversal, both quota refusals, the state revision
 * that keeps two writers apart, the byte round trip, the Git actions, the
 * refusals of the reveal route, and the clipboard commands the page cannot build
 * for itself. Nothing here needs DSH_HOME, a browser, or a network remote.
 *
 * Run: node tests/smoke.mjs
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { apply, internals } = await import('../index.js')
const {
  sanitizeName, contentTypeOf, validateItems, explorerTarget, revealCommand, powerShellLiteral, clipboardCommand,
  STATE_PATH, BLOB_PATH, GIT_PATH, SPACE_PATH, REVEAL_PATH, CLIPBOARD_PATH, LOCATION_FILE,
} = internals

// Every apply resolves `$DSH_HOME` for the path setting, so the test pins it to
// a directory of its own: a real home's remembered path must never leak in.
const previousDshHome = process.env.DSH_HOME
const testHome = mkdtempSync(join(tmpdir(), 'temp-space-home-'))
process.env.DSH_HOME = testHome

// ---- pure helpers ---------------------------------------------------------

assert.equal(sanitizeName('..\\..\\Windows\\system32\\evil.png'), 'evil.png',
  'a path is reduced to its last segment')
assert.equal(sanitizeName('../../etc/passwd'), 'passwd', 'a relative traversal keeps only the file name')
assert.equal(sanitizeName('a\u0000b\u001fc.txt'), 'abc.txt', 'control characters are dropped')
assert.equal(sanitizeName('nul'), 'nul_', 'a Windows device name is escaped')
assert.equal(sanitizeName('NUL.txt'), 'NUL_.txt', 'a device name with an extension is escaped too')
assert.equal(sanitizeName('   '), 'file', 'a name that is only blanks becomes a placeholder')
assert.equal(sanitizeName('...hidden.md'), 'hidden.md', 'leading dots are dropped')
assert.equal(sanitizeName('trailing.  '), 'trailing', 'trailing dots and blanks are dropped')
const long = sanitizeName(`${'x'.repeat(400)}.png`)
assert.ok(long.length <= internals.MAX_NAME_LENGTH, 'a long name is truncated')
assert.ok(long.endsWith('.png'), 'truncation keeps the extension')

assert.equal(contentTypeOf('a.PNG'), 'image/png', 'the type follows the extension, case aside')
assert.equal(contentTypeOf('a.bin'), 'application/octet-stream', 'an unknown extension is a byte stream')

// Showing a stored file where it lies is the host's job, so the command is built
// here: the page has no file manager of its own, and a Linux desktop has no
// portable "select this file", which is why that one opens the directory.
assert.deepEqual(revealCommand('C:\\space\\files\\a.txt', 'win32'), {
  command: 'explorer.exe',
  args: ['/select,', 'file:///C:/space/files/a.txt'],
}, 'Windows selects the stored file inside a folder window')
assert.deepEqual(revealCommand('/home/me/space/files/a.txt', 'darwin'), {
  command: 'open',
  args: ['-R', '/home/me/space/files/a.txt'],
}, 'macOS reveals the stored file in Finder')
assert.deepEqual(revealCommand('/home/me/space/files/a.txt', 'linux'), {
  command: 'xdg-open',
  args: ['/home/me/space/files'],
}, 'a Linux desktop opens the directory its file managers all agree on')
assert.equal(explorerTarget('C:\\space\\a,b=c.txt'), 'file:///C:/space/a%2Cb%3Dc.txt',
  'a comma or an equals sign would otherwise split the target Explorer parses')
assert.equal(explorerTarget('C:\\space\\报告.txt'), 'file:///C:/space/报告.txt',
  'non-ASCII arrives as characters, because Explorer rejects the escaped form')

// The clipboard is the other thing the page cannot do itself: a browser can read a
// file list off the clipboard but has no way to put one back. Files go out as a
// file drop list, and text goes in on standard input so no character of a note has
// to survive a command line.
assert.equal(powerShellLiteral("C:\\space\\it's.png"), "'C:\\space\\it''s.png'",
  'a quote in a path is doubled, the way PowerShell reads a literal')
assert.deepEqual(clipboardCommand({ files: ['C:\\space\\files\\a.png'], text: '' }, 'win32'), {
  command: 'powershell.exe',
  args: ['-NoProfile', '-NonInteractive', '-Command', "Set-Clipboard -LiteralPath 'C:\\space\\files\\a.png'"],
}, 'Windows publishes the stored file as a file the desktop can paste')
assert.deepEqual(clipboardCommand({ files: [], text: "it's fine\nsecond line" }, 'win32'), {
  command: 'powershell.exe',
  args: ['-NoProfile', '-NonInteractive', '-Command', '$input | Set-Clipboard'],
  stdin: "it's fine\nsecond line",
}, 'text travels on standard input, where nothing has to be escaped')
assert.deepEqual(clipboardCommand({ files: ['/home/me/space/files/a.txt'], text: '' }, 'darwin'), {
  command: 'osascript',
  args: ['-e', 'set the clipboard to {(POSIX file "/home/me/space/files/a.txt")}'],
}, 'macOS hands Finder the file itself')
assert.deepEqual(clipboardCommand({ files: [], text: 'hello' }, 'darwin'), {
  command: 'pbcopy',
  args: [],
  stdin: 'hello',
}, 'and takes text on its own standard input')
assert.equal(clipboardCommand({ files: ['/a/b.txt'], text: '' }, 'linux'), undefined,
  'a platform with no clipboard command is reported rather than guessed at')

assert.deepEqual(validateItems([{ id: 'a', kind: 'text', text: 'hi', x: 1, y: 2, w: 3, h: 4, z: 5 }]),
  [{ id: 'a', kind: 'text', x: 1, y: 2, w: 3, h: 4, z: 5, text: 'hi' }], 'a note is accepted')
assert.deepEqual(
  validateItems([{ id: 'a', kind: 'text', text: 'hi', title: '待办', x: 1, y: 2, w: 3, h: 4, z: 5 }])[0].title,
  '待办', 'a card carries the title the person gave it')
assert.equal(
  validateItems([{ id: 'a', kind: 'text', text: 'hi', title: '  ', x: 1, y: 2, w: 3, h: 4, z: 5 }])[0].title,
  undefined, 'a title that is only blanks is no title at all')
assert.equal(
  validateItems([{ id: 'a', kind: 'text', text: 'hi', title: 'x'.repeat(400), x: 1, y: 2, w: 3, h: 4, z: 5 }])[0].title.length,
  internals.MAX_TITLE_LENGTH, 'a long title is capped')
assert.equal(validateItems({}), undefined, 'an object that is not a list is refused')
assert.equal(validateItems([{ id: 'a', kind: 'text', text: 'x', x: 0, y: 0, w: 1, h: 1 }]), undefined,
  'an item without a z is refused')
assert.equal(validateItems([{ id: 'a', kind: 'text', text: 'x', x: 0, y: 0, w: 1, h: 1, z: Number.NaN }]), undefined,
  'a coordinate that is not finite is refused')
assert.equal(validateItems([{ id: 'a', kind: 'file', file: '../escape.png', x: 0, y: 0, w: 1, h: 1, z: 1 }]), undefined,
  'a file that does not name a stored name is refused')
assert.equal(validateItems([
  { id: 'a', kind: 'text', text: 'x', x: 0, y: 0, w: 1, h: 1, z: 1 },
  { id: 'a', kind: 'text', text: 'y', x: 0, y: 0, w: 1, h: 1, z: 2 },
]), undefined, 'a repeated id is refused')

// ---- routes over a real listener ------------------------------------------

const space = mkdtempSync(join(tmpdir(), 'temp-space-smoke-'))
const run = (args) => execFileSync('git', args, { cwd: space, stdio: 'ignore' })
run(['init', '--quiet'])
run(['config', 'user.email', 'smoke@example.invalid'])
run(['config', 'user.name', 'Smoke'])
writeFileSync(join(space, 'README.md'), 'temp space\n')
run(['add', '-A'])
run(['commit', '--quiet', '-m', 'first'])

const routes = new Map()
const ctx = {
  logger: { warn: () => {}, info: () => {} },
  get: () => undefined,
  inject: (names, callback) => {
    callback({
      effect: (register) => { register() },
      webServer: {
        register: (route) => { routes.set(route.path, route); return () => { routes.delete(route.path) } },
      },
    })
  },
}

apply(ctx, {
  dataDir: space,
  gitRemote: 'origin',
  maxFileBytes: 4096,
  maxTotalBytes: 5000,
  commitPrefix: 'smoke',
  gitTimeoutMs: 20_000,
})

assert.deepEqual([...routes.keys()].sort(),
  [BLOB_PATH, CLIPBOARD_PATH, GIT_PATH, SPACE_PATH, REVEAL_PATH, STATE_PATH].sort(),
  'the six routes are registered')

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '', 'http://localhost').pathname
  const route = routes.get(pathname)
  if (route === undefined) { res.writeHead(404); res.end(); return }
  route.handler(req, res)
})
await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve) })
const origin = `http://127.0.0.1:${server.address().port}`
const json = async (response) => ({ status: response.status, body: await response.json() })

try {
  // The state starts empty and reports the quota it enforces.
  const first = await json(await fetch(`${origin}${STATE_PATH}`))
  assert.equal(first.status, 200, 'the state is served')
  assert.deepEqual(first.body.items, [], 'a fresh space holds no items')
  assert.equal(first.body.revision, 1, 'a fresh space starts at revision 1')
  assert.deepEqual(first.body.usage, { usedBytes: 0, maxTotalBytes: 5000, maxFileBytes: 4096 },
    'the quota the host enforces is what the page is told')

  // A traversal name is stored under its last segment and nowhere else.
  const upload = await json(await fetch(`${origin}${BLOB_PATH}?name=${encodeURIComponent('..\\..\\escape.txt')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: Buffer.from('hello space'),
  }))
  assert.equal(upload.status, 201, 'a file is stored')
  assert.equal(upload.body.name, 'escape.txt', 'the stored name is the sanitized one')
  assert.equal(existsSync(join(space, 'files', 'escape.txt')), true, 'the file lands in the files directory')
  assert.equal(existsSync(join(space, 'escape.txt')), false, 'nothing escapes the files directory')

  // The bytes come back with the type their extension names.
  const read = await fetch(`${origin}${BLOB_PATH}?name=escape.txt`)
  assert.equal(read.status, 200, 'the file is served back')
  assert.equal(read.headers.get('content-type'), 'text/plain; charset=utf-8', 'the type follows the extension')
  assert.equal(await read.text(), 'hello space', 'the bytes are the bytes that were stored')

  // Both quotas are refusals, and neither leaves a file behind.
  const tooBig = await json(await fetch(`${origin}${BLOB_PATH}?name=big.bin`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: Buffer.alloc(5000, 7),
  }))
  assert.equal(tooBig.status, 413, 'one file over the per-file cap is refused')
  assert.equal(tooBig.body.reason, 'file-too-large', 'the refusal names the per-file cap')
  const fills = await json(await fetch(`${origin}${BLOB_PATH}?name=filler.bin`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: Buffer.alloc(4096, 7),
  }))
  assert.equal(fills.status, 201, 'a file that still fits the total cap is stored')
  const full = await json(await fetch(`${origin}${BLOB_PATH}?name=overflow.bin`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: Buffer.alloc(4096, 7),
  }))
  assert.equal(full.status, 413, 'a file that would pass the total cap is refused')
  assert.equal(full.body.reason, 'space-full', 'the refusal names the total cap')
  assert.equal(existsSync(join(space, 'files', 'overflow.bin')), false, 'a refused file is not written')

  // One canvas, two writers: the stale one is told rather than obeyed.
  const saved = await json(await fetch(`${origin}${STATE_PATH}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      revision: 1,
      items: [{ id: 'a', kind: 'file', file: 'escape.txt', x: 10, y: 20, w: 100, h: 80, z: 1 }],
    }),
  }))
  assert.equal(saved.status, 200, 'a save at the current revision is accepted')
  assert.equal(saved.body.revision, 2, 'an accepted save moves the revision on')
  const stale = await json(await fetch(`${origin}${STATE_PATH}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision: 1, items: [] }),
  }))
  assert.equal(stale.status, 409, 'a save at a stale revision is refused')
  assert.equal(stale.body.reason, 'conflict', 'the refusal names the conflict')
  assert.equal(stale.body.revision, 2, 'the refusal carries the revision to reload at')
  const reloaded = await json(await fetch(`${origin}${STATE_PATH}`))
  assert.equal(reloaded.body.items.length, 1, 'the refused save did not replace the stored canvas')

  // Git: the branch, a real save, and the refusal of an action nobody offers.
  const status = await json(await fetch(`${origin}${GIT_PATH}`))
  assert.equal(status.body.ok, true, 'git status is served')
  assert.equal(status.body.relation, 'no-upstream', 'a repository without an upstream says so')
  writeFileSync(join(space, 'files', 'escape.txt'), 'changed')
  const savedToGit = await json(await fetch(`${origin}${GIT_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'save' }),
  }))
  // This repository has no remote, which is how a save ends when the upload
  // cannot go: the commit is local and durable, and the two halves are reported
  // separately rather than as one failure.
  assert.equal(savedToGit.body.committed, true, 'a save commits the canvas')
  assert.equal(savedToGit.body.ok, false, 'a save that cannot upload is not reported as done')
  assert.equal(savedToGit.body.reason, 'push-failed', 'the refusal names the half that failed')
  assert.ok(String(savedToGit.body.message).length > 0, 'the refusal carries the command output to show')
  const again = await json(await fetch(`${origin}${GIT_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'save' }),
  }))
  assert.equal(again.body.ok, true, 'a save with nothing to do is still an answer')
  assert.equal(again.body.committed, false, 'nothing was committed the second time')
  assert.equal(again.body.pushed, false, 'nothing was uploaded the second time')
  const unknown = await json(await fetch(`${origin}${GIT_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'rm-rf' }),
  }))
  assert.equal(unknown.status, 409, 'an action this plugin does not offer is refused')
  assert.equal(unknown.body.reason, 'unknown-action', 'the refusal names the action')

  // Revealing is the one route that moves nothing: the bytes already sit on the
  // disk of every machine that pulled them. Only its refusals are driven here,
  // because its success would start a real file manager on whoever runs this.
  const missingReveal = await json(await fetch(`${origin}${REVEAL_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'not-stored.txt' }),
  }))
  assert.equal(missingReveal.status, 404, 'revealing a file this space does not hold is refused')
  assert.equal(missingReveal.body.reason, 'no-such-file', 'the refusal names what is missing')
  const revealMethod = await fetch(`${origin}${REVEAL_PATH}`)
  assert.equal(revealMethod.status, 405, 'the reveal route answers a POST and nothing else')

  // The clipboard route refuses the same way, and its success is not driven here
  // either: it would overwrite the clipboard of whoever runs this test.
  const emptyCopy = await json(await fetch(`${origin}${CLIPBOARD_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }))
  assert.equal(emptyCopy.status, 400, 'a copy with neither files nor text is refused')
  assert.equal(emptyCopy.body.reason, 'invalid-body', 'the refusal names the body')
  const missingCopy = await json(await fetch(`${origin}${CLIPBOARD_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ names: ['not-stored.txt'] }),
  }))
  assert.equal(missingCopy.status, 404, 'copying a file this space does not hold is refused')
  assert.equal(missingCopy.body.reason, 'no-such-file', 'the refusal names what is missing')
  const copyMethod = await fetch(`${origin}${CLIPBOARD_PATH}`)
  assert.equal(copyMethod.status, 405, 'the clipboard route answers a POST and nothing else')

  // Deleting is the one route that frees quota.
  const deleted = await json(await fetch(`${origin}${BLOB_PATH}?name=escape.txt`, { method: 'DELETE' }))
  assert.equal(deleted.body.ok, true, 'the file is deleted')
  assert.equal(existsSync(join(space, 'files', 'escape.txt')), false, 'the bytes are gone')
  const afterDelete = await json(await fetch(`${origin}${BLOB_PATH}?name=escape.txt`))
  assert.equal(afterDelete.status, 404, 'a deleted file is not served')

  // The state file is what a Git clone carries, so it has to be on disk as JSON.
  const stored = JSON.parse(readFileSync(join(space, 'index.json'), 'utf8'))
  assert.equal(stored.revision, 2, 'the state file holds the revision the page was told')

  // Discarding is the way back: every local change goes, the ones nothing has
  // committed yet included, because a file left behind is still something to
  // commit. What HEAD holds comes back, which for the deleted file means its
  // bytes, and the answer counts what actually went.
  writeFileSync(join(space, 'files', 'scratch.bin'), 'draft')
  writeFileSync(join(space, 'notes.txt'), 'draft')
  const toDiscard = await json(await fetch(`${origin}${GIT_PATH}`))
  assert.ok(toDiscard.body.changes >= 3, 'the space under test has changes of both kinds to discard')
  const discarded = await json(await fetch(`${origin}${GIT_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'discard' }),
  }))
  assert.equal(discarded.status, 200, 'a discard is served')
  assert.equal(discarded.body.ok, true, 'a discard succeeds')
  assert.equal(discarded.body.acted, 'discard', 'the answer names the action it performed')
  assert.equal(discarded.body.discarded, toDiscard.body.changes, 'the answer counts what went')
  assert.equal(discarded.body.changes, 0, 'nothing is left to commit')
  assert.equal(existsSync(join(space, 'files', 'scratch.bin')), false, 'a file nothing committed is removed')
  assert.equal(existsSync(join(space, 'notes.txt')), false, 'and so is one outside the files directory')
  assert.equal(readFileSync(join(space, 'files', 'escape.txt'), 'utf8'), 'changed',
    'a tracked file comes back to what was committed')
  const discardedAgain = await json(await fetch(`${origin}${GIT_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'discard' }),
  }))
  assert.equal(discardedAgain.body.ok, true, 'discarding a space with nothing to discard is still an answer')
  assert.equal(discardedAgain.body.discarded, 0, 'and says that nothing went')

  // A space that is not a repository is refused by name rather than by a Git error.
  const bare = mkdtempSync(join(tmpdir(), 'temp-space-bare-'))
  mkdirSync(join(bare, 'files'), { recursive: true })
  const bareRoutes = new Map()
  apply({
    logger: { warn: () => {} },
    get: () => undefined,
    inject: (names, callback) => {
      callback({
        effect: (register) => { register() },
        webServer: { register: (route) => { bareRoutes.set(route.path, route); return () => {} } },
      })
    },
  }, { dataDir: bare })
  const bareServer = createServer((req, res) => {
    const pathname = new URL(req.url ?? '', 'http://localhost').pathname
    bareRoutes.get(pathname)?.handler(req, res)
  })
  await new Promise((resolve) => { bareServer.listen(0, '127.0.0.1', resolve) })
  const bareOrigin = `http://127.0.0.1:${bareServer.address().port}`
  const notRepo = await json(await fetch(`${bareOrigin}${STATE_PATH}`))
  assert.equal(notRepo.status, 409, 'a directory that is not a repository is refused')
  assert.equal(notRepo.body.reason, 'not-a-repo', 'the refusal names what is missing')
  assert.equal(notRepo.body.dir, bare, 'the refusal names the directory to clone into')
  await new Promise((resolve) => {
    bareServer.closeAllConnections?.()
    bareServer.close(resolve)
  })
  rmSync(bare, { recursive: true, force: true })

  // ---- the local repository path setting ------------------------------------

  /** Mount one plugin instance and return its route table. */
  const mount = (config) => {
    const table = new Map()
    apply({
      logger: { warn: () => {}, info: () => {} },
      get: () => undefined,
      inject: (names, callback) => {
        callback({
          effect: (register) => { register() },
          webServer: {
            register: (route) => { table.set(route.path, route); return () => { table.delete(route.path) } },
          },
        })
      },
    }, config)
    return table
  }

  /** Serve one route table and return its origin and a close function. */
  const listenTo = async (table) => {
    const listener = createServer((req, res) => {
      const pathname = new URL(req.url ?? '', 'http://localhost').pathname
      const route = table.get(pathname)
      if (route === undefined) { res.writeHead(404); res.end(); return }
      route.handler(req, res)
    })
    await new Promise((resolve) => { listener.listen(0, '127.0.0.1', resolve) })
    return {
      origin: `http://127.0.0.1:${listener.address().port}`,
      close: () => new Promise((resolve) => {
        listener.closeAllConnections?.()
        listener.close(resolve)
      }),
    }
  }

  const postSpace = (origin, body) => fetch(`${origin}${SPACE_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json)

  const locationFile = join(testHome, LOCATION_FILE)
  const configuredMissing = join(testHome, 'configured-space')

  const firstTable = mount({ dataDir: configuredMissing, gitTimeoutMs: 20_000 })
  const firstSpace = await listenTo(firstTable)
  try {
    const initial = await json(await fetch(`${firstSpace.origin}${SPACE_PATH}`))
    assert.equal(initial.status, 200, 'the path route answers even before a path is usable')
    assert.equal(initial.body.dir, configuredMissing, 'the configured path is reported')
    assert.equal(initial.body.exists, false, 'the configured path is not on disk yet')
    assert.equal(initial.body.override, false, 'nothing has overridden the configuration yet')
    const missingState = await json(await fetch(`${firstSpace.origin}${STATE_PATH}`))
    assert.equal(missingState.status, 409, 'a missing space is still refused by the state route')
    assert.equal(missingState.body.reason, 'no-dir')

    const adopted = await postSpace(firstSpace.origin, { action: 'use', dir: space })
    assert.equal(adopted.status, 200, 'an existing repository is adopted')
    assert.equal(adopted.body.ok, true)
    assert.equal(adopted.body.mode, 'adopted')
    assert.equal(adopted.body.dir, space)
    const afterUse = await json(await fetch(`${firstSpace.origin}${STATE_PATH}`))
    assert.equal(afterUse.status, 200, 'the page reads the adopted space without a restart')
    const remembered = JSON.parse(readFileSync(locationFile, 'utf8'))
    assert.equal(remembered.dataDir, space, 'the chosen path is remembered on this machine')
  } finally {
    await firstSpace.close()
  }

  const otherConfigured = join(testHome, 'another-configured')
  const secondTable = mount({ dataDir: otherConfigured, gitTimeoutMs: 20_000 })
  const second = await listenTo(secondTable)
  try {
    const persisted = await json(await fetch(`${second.origin}${SPACE_PATH}`))
    assert.equal(persisted.body.dir, space, 'a restart reads the remembered path')
    assert.equal(persisted.body.override, true, 'and says the configuration is overridden')

    const plain = mkdtempSync(join(tmpdir(), 'temp-space-plain-'))
    const notRepoUse = await postSpace(second.origin, { action: 'use', dir: plain })
    assert.equal(notRepoUse.status, 409, 'a directory that is not a repository is not adopted')
    assert.equal(notRepoUse.body.reason, 'not-a-repo')
    const relative = await postSpace(second.origin, { action: 'use', dir: 'relative/path' })
    assert.equal(relative.status, 400, 'a relative path is refused rather than guessed at')
    assert.equal(relative.body.reason, 'invalid-path')
    const missingUse = await postSpace(second.origin, { action: 'use', dir: join(testHome, 'nowhere') })
    assert.equal(missingUse.status, 409, 'a path that is not there is not adopted')
    assert.equal(missingUse.body.reason, 'no-dir')

    const seed = mkdtempSync(join(tmpdir(), 'temp-space-seed-'))
    const seedGit = (args) => execFileSync('git', args, { cwd: seed, stdio: 'ignore' })
    seedGit(['init', '--quiet'])
    seedGit(['config', 'user.email', 'smoke@example.invalid'])
    seedGit(['config', 'user.name', 'Smoke'])
    writeFileSync(join(seed, 'index.json'), JSON.stringify({ version: 1, revision: 1, items: [] }))
    seedGit(['add', '-A'])
    seedGit(['commit', '--quiet', '-m', 'seed'])
    const bareRemote = mkdtempSync(join(tmpdir(), 'temp-space-remote-'))
    execFileSync('git', ['clone', '--bare', seed, bareRemote], { stdio: 'ignore' })
    const cloneParent = mkdtempSync(join(tmpdir(), 'temp-space-clone-'))
    const cloneDir = join(cloneParent, 'space')

    const noUrlDir = join(mkdtempSync(join(tmpdir(), 'temp-space-nourl-')), 'space')
    const noUrl = await postSpace(second.origin, { action: 'pull', dir: noUrlDir })
    assert.equal(noUrl.status, 400, 'pulling a new space without a URL is refused')
    assert.equal(noUrl.body.reason, 'no-repo-url')

    const filled = mkdtempSync(join(tmpdir(), 'temp-space-filled-'))
    writeFileSync(join(filled, 'occupied.txt'), 'x')
    const filledPull = await postSpace(second.origin, { action: 'pull', dir: filled, repoUrl: bareRemote })
    assert.equal(filledPull.status, 409, 'a non-empty directory that is not a repository is refused')
    assert.equal(filledPull.body.reason, 'dir-not-empty')

    const cloned = await postSpace(second.origin, { action: 'pull', dir: cloneDir, repoUrl: bareRemote })
    assert.equal(cloned.status, 200, 'a missing path is cloned into')
    assert.equal(cloned.body.mode, 'cloned')
    assert.equal(existsSync(join(cloneDir, 'index.json')), true, 'the remote contents arrive')
    const clonedState = await json(await fetch(`${second.origin}${STATE_PATH}`))
    assert.equal(clonedState.status, 200, 'the page reads the cloned space without a restart')

    writeFileSync(join(seed, 'README.md'), 'after the clone\n')
    seedGit(['add', '-A'])
    seedGit(['commit', '--quiet', '-m', 'second'])
    execFileSync('git', ['push', bareRemote, 'HEAD'], { cwd: seed, stdio: 'ignore' })
    const pulled = await postSpace(second.origin, { action: 'pull', dir: cloneDir })
    assert.equal(pulled.status, 200, 'an existing repository is adopted and pulled')
    assert.equal(pulled.body.mode, 'pulled')
    assert.equal(existsSync(join(cloneDir, 'README.md')), true, 'the new commit arrives')

    const reset = await postSpace(second.origin, { action: 'reset' })
    assert.equal(reset.status, 200, 'the configured path can be restored')
    assert.equal(reset.body.mode, 'reset')
    assert.equal(reset.body.dir, otherConfigured)
    assert.equal(existsSync(locationFile), false, 'resetting forgets the chosen path')

    rmSync(seed, { recursive: true, force: true })
    rmSync(bareRemote, { recursive: true, force: true })
    rmSync(cloneParent, { recursive: true, force: true })
    rmSync(plain, { recursive: true, force: true })
    rmSync(filled, { recursive: true, force: true })
  } finally {
    await second.close()
  }
} finally {
  await new Promise((resolve) => {
    server.closeAllConnections?.()
    server.close(resolve)
  })
  rmSync(space, { recursive: true, force: true })
  rmSync(testHome, { recursive: true, force: true })
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
}

console.log('temp-space smoke: ok')
