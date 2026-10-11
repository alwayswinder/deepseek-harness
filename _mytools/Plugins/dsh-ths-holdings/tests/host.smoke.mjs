/**
 * Keyless smoke test for the host half as the profile loads it.
 *
 * The vitest suite imports the modules directly; this script boots the package
 * through the real Loader by its row name (`dsh-ths-holdings`), which is the
 * same resolution the profile performs — so a package that cannot be loaded,
 * or a route that broke, fails here without starting DSH.
 *
 * Run: node tests/host.smoke.mjs  (from the plugin directory)
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import z from '@deepseek-ai/schemastery'

const POSITIONS = {
  exported_at: '2026-05-01T15:00:00+08:00',
  export_date: '2026-05-01',
  source_file: 'D:/ledger/positions.xlsx',
  positions: [
    { code: '600941', name: 'AAA', qty: 400, cost: 87.291 },
    { code: '601668', name: 'BBB', qty: 15000, cost: 4.478 },
  ],
}
const QUOTE_BODY = ['v_sh600941="1~AAA~600941~88.00~87.00";', 'v_sh601668="1~BBB~601668~4.50~4.40";'].join('\n')

/** Credentials that answer from the process environment, so the plugin boots without a store. */
class TestCredentialProvider extends CredentialProvider {
  static Config = z.object({})
  resolve(ref) {
    const value = process.env[ref]
    return Promise.resolve(value !== undefined && value.length > 0 ? { value, source: 'env' } : undefined)
  }
  describe(ref) {
    return Promise.resolve({ configured: Boolean(process.env[ref]), writable: false })
  }
  set() { return Promise.resolve() }
  unset() { return Promise.resolve() }
}

/** One scripted HTTP server, listening on a free loopback port. */
async function listen(handler) {
  const server = createServer(handler)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return { server, port: server.address().port }
}

const root = await mkdtemp(join(tmpdir(), 'dsh-stock-pnl-built-'))
const positionsFile = join(root, 'positions.json')
await writeFile(positionsFile, `${JSON.stringify(POSITIONS, null, 2)}\n`, 'utf8')

const quotes = await listen((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=gbk' })
  res.end(QUOTE_BODY)
})

delete process.env.STOCK_PNL_COOKIE
const configPath = join(root, 'cordis.yml')
await writeFile(configPath, [
  "- name: '@deepseek-ai/dsh-host-webserver'",
  '  config:',
  "    host: '127.0.0.1'",
  '    port: 0',
  "- name: '@deepseek-ai/dsh-credentials-test'",
  '- name: dsh-ths-holdings',
  '  config:',
  `    quoteUrl: 'http://127.0.0.1:${String(quotes.port)}/q='`,
  `    positionsFile: '${positionsFile.replaceAll('\\', '/')}'`,
  '',
].join('\n'))

// The one row the scripted provider replaces; every other specifier resolves
// the way the profile resolves it, including `dsh-ths-holdings` itself.
const host = await import('../index.js')
const replacements = new Map([['@deepseek-ai/dsh-credentials-test', TestCredentialProvider]])

const context = new Context()
context.baseUrl = `${pathToFileURL(root).href}/`
await context.plugin(Loader)
context.loader.builtins.include = Include
context.loader.internal = {
  version: 'v2',
  async import(specifier) {
    const replacement = replacements.get(specifier)
    if (replacement !== undefined) return replacement
    return await import(specifier)
  },
}
await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
await context.loader.await()

const port = context.webServer.port
const base = `http://127.0.0.1:${String(port)}/api/stock-pnl/positions`

const loaded = await fetch(base)
assert.equal(loaded.status, 200, 'the package serves the holdings route')
const view = await loaded.json()
assert.equal(view.positions.length, 2)
assert.equal(view.cookie_configured, false)
assert.deepEqual(view.positions.map(row => row.code), ['600941', '601668'])
assert.equal(view.positions[0].price, 88)
assert.equal(view.positions[1].market_value, 67500)

const saved = await fetch(base, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ positions: [{ code: '600941', name: 'AAA', qty: 500, cost: 86.5 }] }),
})
assert.equal(saved.status, 200, 'the package saves the holdings')
assert.equal((await saved.json()).ok, true)

const stored = JSON.parse(await readFile(positionsFile, 'utf8'))
assert.equal(stored.exported_at, POSITIONS.exported_at, 'the export facts survive a save')
assert.deepEqual(stored.positions, [{ code: '600941', name: 'AAA', qty: 500, cost: 86.5 }])
assert.equal(typeof stored.updated_at, 'string')

const rejected = await fetch(base, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ positions: [{ code: '600941', name: 'AAA', qty: 0, cost: 1 }] }),
})
assert.equal(rejected.status, 400, 'the package refuses an invalid row')

await context.fiber.dispose()
await new Promise(resolve => { quotes.server.close(resolve) })
await rm(root, { recursive: true, force: true })

// The entry the profile loads is the one just exercised.
assert.equal(typeof host.apply, 'function', 'the package entry exports apply')
console.log('dsh-ths-holdings host smoke: all assertions passed')
