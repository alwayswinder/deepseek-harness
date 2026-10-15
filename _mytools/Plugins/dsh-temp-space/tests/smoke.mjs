/**
 * Keyless smoke test for the temp-space host half.
 *
 * Drives the real routes over a real HTTP listener and a real Git repository in
 * a temporary directory, so the checks cover what the page would actually meet:
 * name sanitization against traversal, both quota refusals, the state revision
 * that keeps two writers apart, the byte round trip, and the four Git actions.
 * Nothing here needs DSH_HOME, a browser, or a network remote.
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
  sanitizeName, contentTypeOf, validateItems, STATE_PATH, BLOB_PATH, GIT_PATH,
} = internals

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

assert.deepEqual([...routes.keys()].sort(), [BLOB_PATH, GIT_PATH, STATE_PATH].sort(),
  'the three routes are registered')

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

  // Deleting is the one route that frees quota.
  const deleted = await json(await fetch(`${origin}${BLOB_PATH}?name=escape.txt`, { method: 'DELETE' }))
  assert.equal(deleted.body.ok, true, 'the file is deleted')
  assert.equal(existsSync(join(space, 'files', 'escape.txt')), false, 'the bytes are gone')
  const afterDelete = await json(await fetch(`${origin}${BLOB_PATH}?name=escape.txt`))
  assert.equal(afterDelete.status, 404, 'a deleted file is not served')

  // The state file is what a Git clone carries, so it has to be on disk as JSON.
  const stored = JSON.parse(readFileSync(join(space, 'index.json'), 'utf8'))
  assert.equal(stored.revision, 2, 'the state file holds the revision the page was told')

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
} finally {
  await new Promise((resolve) => {
    server.closeAllConnections?.()
    server.close(resolve)
  })
  rmSync(space, { recursive: true, force: true })
}

console.log('temp-space smoke: ok')
