/**
 * `ui-stock-pnl` coverage: unit tests for the ledger acquisition logic and a
 * REAL-composition test that boots the node half through the vendored Loader
 * and asserts the user-visible `/api/stock-pnl` HTTP surface (the Cookie on
 * the ledger request and the returned snapshot).
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import z from '@deepseek-ai/schemastery'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as uiStockPnl from '../index.js'
import { CookieAcquirer, cookiesToHeader, isSignedIn } from '../acquire.js'
import { collectStats, cookieField, listPortfolios, verifyCookie } from '../fetch.js'
import {
  clearPositionsLocation, inspectPositionsChoice, LOCATION_FILE, resolvePositionsLocation, writePositionsLocation,
} from '../location.js'
import { parsePositionEntries, readPositionsView, savePositions } from '../positions.js'

/** A playwright cookie, as these tests hand it to the acquirer. */
interface PwCookie {
  name: string
  value: string
  domain: string
  path: string
}

/** The playwright module shape the acquirer launches through. */
interface PwModule {
  chromium: { launch(options?: { channel?: string; headless?: boolean; args?: string[] }): Promise<any> }
}

/** The fetch-compatible executor the ledger modules accept. */
type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** The `/api/stock-pnl/positions` view, as these tests read it. */
interface PositionsView {
  file: string
  file_source?: 'machine' | 'config' | 'default'
  file_default?: string
  exported_at?: string
  export_date?: string
  updated_at?: string
  cookie_configured: boolean
  skipped: number
  positions: Array<Record<string, any>>
  quotes_error: string
  unreadable?: string
}

/** The `/api/stock-pnl/positions` save answer, as these tests read it. */
interface SavePositionsResult {
  ok: boolean
  errors: Array<{ index: number, field: string, message: string }>
  view?: PositionsView
}

const FIXED_NOW = () => new Date('2026-05-26T06:00:00Z')
const COOKIE_ENV = 'STOCK_PNL_COOKIE'

/** The exported holdings the composition test starts from, as the xlsx export writes them. */
const POSITION_FIXTURE = {
  exported_at: '2026-05-01T15:00:00+08:00',
  export_date: '2026-05-01',
  source_file: 'D:/ledger/positions.xlsx',
  positions: [
    { code: '600941', name: 'AAA', qty: 400, cost: 87.291 },
    { code: '601668', name: 'BBB', qty: 15000, cost: 4.478 },
  ],
}

/**
 * The scripted quote-feed body. Names stay ASCII because the feed is GBK and
 * the reader decodes it as such; ASCII survives that decode unchanged.
 */
const QUOTE_BODY = [
  'v_sh600941="1~AAA~600941~88.00~87.00";',
  'v_sh601668="1~BBB~601668~4.50~4.40";',
].join('\n')


/** Wrap any JSON as a fetch-style Response. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const PNL_BODY = { error_code: '0', ex_data: { data: [{ time: 1, zf: -1.0 }, { time: 2, zf: 2.5 }] } }
const INDEX_BODY = {
  error_code: '0',
  ex_data: [
    { zqdm: '000001', xianjia: 3000, zuoshou: 0 },
    { zqdm: '1A0001', xianjia: 3030, zuoshou: 3000 },
  ],
}

describe('collectStats', () => {
  const base = {
    pnlUrl: 'https://ledger.test/pnl',
    indexUrl: 'https://ledger.test/index',
    cookie: 'sid=abc',
    cookieEnv: COOKIE_ENV,
    user_id: '825299250',
    fund_key: '172074074',
    now: FIXED_NOW,
  }

  it('normalizes a successful P&L and index fetch without a redirect-following request', async () => {
    const initList: RequestInit[] = []
    const queue = [PNL_BODY, INDEX_BODY]
    const fetchImpl: FetchLike = async (_url, init) => {
      initList.push(init)
      return jsonResponse(queue.shift())
    }
    const stats = await collectStats({ ...base, fetchImpl })
    expect(stats.error).toBe('')
    expect(stats.token_expired).toBe(false)
    expect(stats.pnl_pct).toBe(2.5)
    expect(stats.sh_pct).toBe(1)
    expect(stats.chart_data).toEqual([{ t: 1, v: -1.0 }, { t: 2, v: 2.5 }])
    for (const init of initList) expect(init.redirect).toBe('manual')
  })

  it('reports a missing Cookie without touching the ledger', async () => {
    let called = false
    const stats = await collectStats({
      ...base,
      cookie: undefined,
      fetchImpl: async () => { called = true; return jsonResponse(PNL_BODY) },
    })
    expect(called).toBe(false)
    expect(stats.error).toContain(COOKIE_ENV)
  })

  it('flags an HTTP 401 as token expiry', async () => {
    const stats = await collectStats({ ...base, fetchImpl: async () => new Response('', { status: 401 }) })
    expect(stats.token_expired).toBe(true)
    expect(stats.error).toContain('TOKEN_EXPIRED')
  })

  it('derives the ledger user id from the Cookie when user_id is empty', async () => {
    const bodies: string[] = []
    const queue = [PNL_BODY, INDEX_BODY]
    const fetchImpl: FetchLike = async (_url, init) => {
      bodies.push(String(init.body))
      return jsonResponse(queue.shift())
    }
    await collectStats({ ...base, cookie: 'userid=825299250; sess_tk=abc', user_id: '', fetchImpl })
    expect(bodies[0]).toContain('userid=825299250')
    expect(bodies[0]).toContain('user_id=825299250')
  })

  it('refuses to follow a redirect with the Cookie', async () => {
    const stats = await collectStats({
      ...base,
      fetchImpl: async (_url, init) => { expect(init.redirect).toBe('manual'); return new Response(null, { status: 302 }) },
    })
    expect(stats.error).toContain('重定向未跟随')
  })
})

describe('cookieField', () => {
  it('reads the anchored `userid` field even when another cookie embeds a `userid=` substring', () => {
    // The ledger Cookie can carry a `pex_userid` (or similar) field whose value
    // ends in `=...`; a bare `/userid=([^;]*)/` regex matches the wrong field
    // and the account_list gateway answers 403 ("请求失败，请稍后重试"). The
    // field-boundary regex must win.
    const cookie = 'pex_userid=el2bijcg9j; userid=825299250; tz=8'
    expect(cookieField(cookie, 'userid')).toBe('825299250')
    // Reaffirm the doc'd regression: the naive extraction would be WRONG here.
    expect(cookie.match(/userid=([^;]*)/)?.[1]).toBe('el2bijcg9j')
  })
})

describe('listPortfolios', () => {
  it('normalizes a line-wrapped cookie and sends the minimal accepted request shape', async () => {
    // A credential-store read of a long cookie arrives with a space at each
    // YAML-fold break; the header must be rebuilt before it reaches the API.
    const wrapped = 'userid=825299250; sid=abc def ghi; tz=8'
    const seen: Record<string, string | undefined> = {}
    const list = await listPortfolios(wrapped, '825299250', async (_url, init) => {
      expect(init.redirect).toBe('manual')
      const headers = new Headers(init.headers)
      seen.cookie = headers.get('cookie') ?? ''
      seen.referer = headers.get('referer') ?? undefined
      seen.accept = headers.get('accept') ?? undefined
      return jsonResponse({ error_code: '0', ex_data: { common: [{ fund_key: 'k1', manualname: '组合A', brokername: '华泰' }] } })
    })
    // normalizeCookie strips whitespace per `key=value` part and rejoins with '; '.
    expect(seen.cookie).toBe('userid=825299250; sid=abcdefghi; tz=8')
    // The minimal shape (no browser-simulation headers) is what the gateway accepts.
    expect(seen.referer).toBeUndefined()
    expect(seen.accept).toBeUndefined()
    expect(list).toEqual([{ fund_key: 'k1', manualname: '组合A', brokername: '华泰' }])
  })
})

/** An in-memory credentials provider resolving from the process environment, for the Loader boot. */
class TestCredentialProvider extends CredentialProvider {
  static Config = z.object({})
  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = process.env[ref]
    return Promise.resolve(value !== undefined && value.length > 0 ? { value, source: 'env' } : undefined)
  }
  describe(ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: Boolean(process.env[ref]), writable: false })
  }
  set(): Promise<void> { return Promise.resolve() }
  unset(): Promise<void> { return Promise.resolve() }
}

let root: string | undefined
let context: Context | undefined
let ledgerServer: Server | undefined
let quoteServer: Server | undefined
let ledgerCookie: string | undefined
/** The `$DSH_HOME` the test process started with, restored after every case. */
const originalDshHome = process.env.DSH_HOME
/** Absolute path of the snapshot file the composition test's management route reads and writes. */
let positionsPath: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  if (ledgerServer !== undefined) await new Promise<void>(resolve => { ledgerServer?.close(() => { resolve() }) })
  ledgerServer = undefined
  if (quoteServer !== undefined) await new Promise<void>(resolve => { quoteServer?.close(() => { resolve() }) })
  quoteServer = undefined
  positionsPath = undefined
  delete process.env[COOKIE_ENV]
  ledgerCookie = undefined
})

/** Boot the node half plus a webserver and credentials provider through the real Loader. */
async function loadComposition(): Promise<number> {
  root = await mkdtemp(join(tmpdir(), 'dsh-stock-pnl-loader-'))
  // The host half remembers a machine-chosen holdings path under the harness
  // home; a test must never read or write the real one.
  process.env.DSH_HOME = root

  ledgerCookie = ''
  ledgerServer = createServer((req, res) => {
    ledgerCookie = String(req.headers.cookie ?? '')
    res.writeHead(200, { 'content-type': 'application/json' })
    if (req.url === '/pnl') res.end(JSON.stringify(PNL_BODY))
    else res.end(JSON.stringify(INDEX_BODY))
  })
  await new Promise<void>((resolve, reject) => {
    ledgerServer!.once('error', reject)
    ledgerServer!.listen(0, '127.0.0.1', () => { resolve() })
  })
  const ledgerPort = (ledgerServer.address() as AddressInfo).port

  // The public quote feed is scripted too: the management view prices every
  // row, and a test must not depend on the live feed.
  quoteServer = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=gbk' })
    res.end(QUOTE_BODY)
  })
  await new Promise<void>((resolve, reject) => {
    quoteServer!.once('error', reject)
    quoteServer!.listen(0, '127.0.0.1', () => { resolve() })
  })
  const quotePort = (quoteServer.address() as AddressInfo).port

  process.env[COOKIE_ENV] = 'sid=test-secret'

  positionsPath = join(root, 'positions.json')
  await writeFile(positionsPath, `${JSON.stringify(POSITION_FIXTURE, null, 2)}\n`, 'utf8')

  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@deepseek-ai/dsh-credentials-test'",
    "- name: '@deepseek-ai/dsh-client-ui-stock-pnl'",
    '  config:',
    `    cookieEnv: '${COOKIE_ENV}'`,
    `    pnlUrl: 'http://127.0.0.1:${String(ledgerPort)}/pnl'`,
    `    indexUrl: 'http://127.0.0.1:${String(ledgerPort)}/index'`,
    `    quoteUrl: 'http://127.0.0.1:${String(quotePort)}/q='`,
    `    positionsFile: '${positionsPath.replaceAll('\\', '/')}'`,
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['@deepseek-ai/dsh-credentials-test', TestCredentialProvider],
    ['@deepseek-ai/dsh-client-ui-stock-pnl', uiStockPnl],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()

  const server = context.webServer as InstanceType<typeof WebServer>
  return server.port
}

/** A cookie for a fake browser session. */
function fakeCookie(name: string, value: string, domain = '.10jqka.com.cn'): PwCookie {
  return { name, value, domain, path: '/' }
}

/** A fake playwright module: never opens a window, exposes the state the acquire state machine reads. */
function fakePlaywright(cookies: PwCookie[], brokenChannels: string[] = []): { module: PwModule; browser: any; calls: string[]; setCookies(next: PwCookie[]): void; setClosed(v: boolean): void } {
  const calls: string[] = []
  const browser = {
    closed: false,
    isConnected: () => !browser.closed,
    async close() { browser.closed = true },
    async newContext(opts?: { locale?: string; viewport?: { width: number; height: number } }) {
      expect(opts?.locale).toBe('zh-CN')
      return {
        async cookies() { return cookies },
        async addInitScript() {},
        async newPage() {
          return {
            async goto() {},
            async content() { return '' },
            async waitForLoadState() {},
            isClosed: () => false,
          }
        },
      }
    },
  }
  const module: PwModule = {
    chromium: {
      async launch(opts?: { channel?: string; headless?: boolean; args?: string[] }) {
        expect(opts?.headless).toBe(false)
        expect(opts?.args).toContain('--disable-blink-features=AutomationControlled')
        calls.push(opts?.channel ?? '')
        if (brokenChannels.includes(opts?.channel ?? '')) throw new Error(`no executable for ${opts?.channel}`)
        return browser
      },
    },
  }
  return {
    module,
    browser,
    calls,
    setCookies(next) { cookies.splice(0, cookies.length, ...next) },
    setClosed(v) { browser.closed = v },
  }
}

describe('acquire helpers', () => {
  it('isSignedIn requires a non-empty userid on the ledger domain', () => {
    expect(isSignedIn([fakeCookie('userid', '123')])).toBe(true)
    expect(isSignedIn([fakeCookie('userid', '')])).toBe(false)
    expect(isSignedIn([fakeCookie('other', 'x')])).toBe(false)
    expect(isSignedIn([fakeCookie('userid', '123', '.baidu.com')])).toBe(false)
  })

  it('cookiesToHeader keeps only ledger-domain cookies and normalizes the header', () => {
    const header = cookiesToHeader([
      fakeCookie('userid', '123'),
      fakeCookie('sess', 'abc', 'other.com'),
      fakeCookie('visited', '1', '10jqka.com.cn'),
    ])
    expect(header).toBe('userid=123; visited=1')
  })

  it('fails fast with an actionable hint when playwright-core is missing', async () => {
    const saved: string[] = []
    const acq = new CookieAcquirer({
      save: async v => { saved.push(v) },
      resolvePlaywright: () => undefined,
    })
    const st = await acq.start()
    expect(st.state).toBe('failed')
    expect(st.error).toContain('playwright-core')
    expect(st.hint).toBeTruthy()
    expect(saved).toEqual([])
    await acq.dispose()
  })

  it('falls back to Chrome when Edge is not installed', async () => {
    const saved: string[] = []
    const fw = fakePlaywright([fakeCookie('sid', 'pre')], ['msedge'])
    const acq = new CookieAcquirer({
      save: async v => { saved.push(v) },
      resolvePlaywright: () => fw.module,
      pollMs: 5,
      timeoutMs: 60_000,
    })
    expect((await acq.start()).state).toBe('acquiring')
    // msedge tried and failed, chrome (the second channel) won.
    expect(fw.calls[0]).toBe('msedge')
    expect(fw.calls[1]).toBe('chrome')
    fw.setCookies([fakeCookie('userid', 'u1')])
    expect((await acq.check()).state).toBe('saved')
    expect(saved).toEqual(['userid=u1'])
    await acq.dispose()
  })

  it('reports an actionable hint when no installed browser is found', async () => {
    const fw = fakePlaywright([], ['msedge', 'chrome', 'msedge-beta', 'chrome-beta'])
    const acq = new CookieAcquirer({
      save: async () => {},
      resolvePlaywright: () => fw.module,
      pollMs: 5,
    })
    const st = await acq.start()
    expect(st.state).toBe('failed')
    expect(st.error).toContain('未检测到已安装的浏览器')
    expect(st.hint).toContain('Edge')
    await acq.dispose()
  })

  it('launches a visible edge window, waits for the sign-in, then commits the cookie', async () => {
    const saved: string[] = []
    const fw = fakePlaywright([fakeCookie('sid', 'pre')])
    const acq = new CookieAcquirer({
      save: async v => { saved.push(v) },
      resolvePlaywright: () => fw.module,
      pollMs: 5,
      timeoutMs: 60_000,
    })
    expect((await acq.start()).state).toBe('acquiring')
    // Not signed in yet: status stays acquiring and nothing is saved.
    expect((await acq.check()).state).toBe('acquiring')
    expect(saved).toEqual([])
    // The human signs in -> the next probe commits the cookie.
    fw.setCookies([fakeCookie('userid', '825299250'), fakeCookie('sid', 'abc')])
    expect((await acq.check()).state).toBe('saved')
    expect(saved).toEqual(['userid=825299250; sid=abc'])
    expect(fw.browser.closed).toBe(true) // The window closes itself after saving.
    await acq.dispose()
  })

  it('times out when the sign-in never happens', async () => {
    const fw = fakePlaywright([fakeCookie('sid', 'pre')])
    const acq = new CookieAcquirer({
      save: async () => {},
      resolvePlaywright: () => fw.module,
      pollMs: 5,
      timeoutMs: 20,
    })
    expect((await acq.start()).state).toBe('acquiring')
    // Fast-forward past the timeout: with a 5ms poll cadence and a 20ms budget,
    // the probe trips the deadline almost immediately.
    await new Promise(resolve => setTimeout(resolve, 60))
    const st = await acq.check()
    expect(st.state).toBe('failed')
    expect(st.error).toContain('超时')
    await acq.dispose()
  })

  it('cancel abandons a run and returns to idle without saving', async () => {
    const saved: string[] = []
    const fw = fakePlaywright([fakeCookie('sid', 'pre')])
    const acq = new CookieAcquirer({
      save: async v => { saved.push(v) },
      resolvePlaywright: () => fw.module,
      pollMs: 5,
    })
    expect((await acq.start()).state).toBe('acquiring')
    expect((await acq.cancel()).state).toBe('idle')
    expect(saved).toEqual([])
    expect(fw.browser.closed).toBe(true)
    await acq.dispose()
  })
})

describe('verifyCookie', () => {
  it('reports a missing cookie', async () => {
    const result = await verifyCookie(undefined)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('missing')
  })

  it('rejects a cookie without a userid field', async () => {
    const result = await verifyCookie('sid=abc', undefined, async () => jsonResponse({}))
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('no-userid')
  })

  it('flags HTTP 401/403 as expired with a re-login hint', async () => {
    const fetchImpl: FetchLike = async (_url, init) => {
      expect(init.redirect).toBe('manual')
      return new Response('', { status: 401 })
    }
    const result = await verifyCookie('userid=825299250; sid=abc', undefined, fetchImpl)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('expired')
    expect(result.hint).toContain('自动获取')
  })

  it('passes when the ledger accepts the cookie and lists portfolios', async () => {
    const fetchImpl: FetchLike = async (_url, init) => {
      expect(new Headers(init.headers).get('cookie')).toContain('sid=abc')
      return jsonResponse({
        error_code: '0',
        ex_data: { common: [{ fund_key: 'k1', manualname: '组合A', brokername: '华泰' }] },
      })
    }
    const result = await verifyCookie('userid=u042; sid=abc', undefined, fetchImpl)
    expect(result.valid).toBe(true)
    expect(result.reason).toBe('ok')
    expect(result.portfolios).toEqual([{ fund_key: 'k1', manualname: '组合A', brokername: '华泰' }])
  })

  it('reports a rejected envelope with the ledger message', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ error_code: '1', error_msg: '需要登录' })
    const result = await verifyCookie('userid=u042; sid=abc', undefined, fetchImpl)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('rejected')
    expect(result.error).toContain('需要登录')
    expect(result.hint).toContain('重新登录')
  })
})

describe('parsePositionEntries', () => {
  it('accepts whole rows and keeps quantity and cost at storage precision', () => {
    const { entries, errors } = parsePositionEntries({
      positions: [
        { code: ' 600941 ', name: '中国移动', qty: 400.000001, cost: 87.29123456 },
        { code: '513330', name: '', qty: 286800, cost: 0.407 },
      ],
    })
    expect(errors).toEqual([])
    expect(entries).toEqual([
      { code: '600941', name: '中国移动', qty: 400, cost: 87.2912 },
      { code: '513330', name: '', qty: 286800, cost: 0.407 },
    ])
  })

  it('reports every rejected field instead of stopping at the first row', () => {
    const { entries, errors } = parsePositionEntries({
      positions: [
        { code: '60094', name: 'AAA', qty: 100, cost: 1 },
        { code: '600941', name: 'AAA', qty: 0, cost: 1 },
        { code: '600941', name: 'AAA', qty: 100, cost: -1 },
        { code: '601668', name: 'x'.repeat(41), qty: 100, cost: 1 },
      ],
    })
    expect(entries).toEqual([])
    expect(errors.map(error => `${String(error.index)}:${error.field}`)).toEqual([
      '0:code',
      '1:qty',
      '2:cost',
      '3:name',
    ])
    expect(errors[0]?.message).toContain('6 位数字')
  })

  it('rejects a repeated code', () => {
    const { errors } = parsePositionEntries({
      positions: [
        { code: '600941', name: 'AAA', qty: 100, cost: 1 },
        { code: '600941', name: 'AAA', qty: 200, cost: 1 },
      ],
    })
    expect(errors).toEqual([{ index: 1, field: 'code', message: '代码重复' }])
  })

  it('rejects a body without a positions array', () => {
    expect(parsePositionEntries({ rows: [] }).errors).toEqual([
      { index: -1, field: 'positions', message: '请求体需要一个 positions 数组' },
    ])
    expect(parsePositionEntries(undefined).entries).toEqual([])
  })

  it('rejects more rows than the write accepts', () => {
    const positions = Array.from({ length: 501 }, (_value, index) => ({
      code: String(600000 + index),
      name: '',
      qty: 1,
      cost: 1,
    }))
    expect(parsePositionEntries({ positions }).errors[0]?.field).toBe('positions')
  })

  it('accepts an empty list, which is how the page clears the holdings', () => {
    expect(parsePositionEntries({ positions: [] })).toEqual({ entries: [], errors: [] })
  })
})

describe('savePositions', () => {
  /** A quote-feed response for the two fixture holdings. */
  const quotingFetch: FetchLike = async () => new Response(QUOTE_BODY, { status: 200 })

  it('creates the snapshot file when the deployment never exported one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-stock-pnl-positions-'))
    try {
      const file = join(dir, 'nested', 'positions.json')
      const result = await savePositions({
        file,
        body: { positions: [{ code: '600941', name: 'AAA', qty: 100, cost: 90 }] },
        cookieConfigured: false,
        fetchImpl: quotingFetch,
      })
      expect(result.ok).toBe(true)
      const stored = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
      expect(stored.positions).toEqual([{ code: '600941', name: 'AAA', qty: 100, cost: 90 }])
      expect(typeof stored.updated_at).toBe('string')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('writes nothing when a row is rejected', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-stock-pnl-positions-'))
    try {
      const file = join(dir, 'positions.json')
      await writeFile(file, `${JSON.stringify(POSITION_FIXTURE, null, 2)}\n`, 'utf8')
      const result = await savePositions({
        file,
        body: { positions: [{ code: '600941', name: 'AAA', qty: -5, cost: 90 }] },
        cookieConfigured: false,
        fetchImpl: quotingFetch,
      })
      expect(result.ok).toBe(false)
      expect(result.errors.map(error => error.field)).toEqual(['qty'])
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(POSITION_FIXTURE)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses to overwrite a file it cannot parse', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-stock-pnl-positions-'))
    try {
      const file = join(dir, 'positions.json')
      await writeFile(file, 'not json', 'utf8')
      const result = await savePositions({
        file,
        body: { positions: [{ code: '600941', name: 'AAA', qty: 100, cost: 90 }] },
        cookieConfigured: false,
        fetchImpl: quotingFetch,
      })
      expect(result.ok).toBe(false)
      expect(result.errors[0]?.field).toBe('file')
      expect(await readFile(file, 'utf8')).toBe('not json')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('readPositionsView', () => {
  const quotingFetch: FetchLike = async () => new Response(QUOTE_BODY, { status: 200 })

  it('answers an empty list for a machine that never exported holdings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-stock-pnl-view-'))
    try {
      const view = await readPositionsView({
        file: join(dir, 'positions.json'),
        cookieConfigured: false,
        fetchImpl: quotingFetch,
      })
      expect(view.positions).toEqual([])
      expect(view.skipped).toBe(0)
      expect(view.unreadable).toBeUndefined()
      expect(view.quotes_error).toBe('')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports rows the snapshot carries without a usable quantity or cost', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-stock-pnl-view-'))
    try {
      const file = join(dir, 'positions.json')
      await writeFile(file, JSON.stringify({
        exported_at: POSITION_FIXTURE.exported_at,
        positions: [
          { code: '600941', name: 'AAA', qty: 400, cost: 87.291 },
          { code: '601668', name: 'BBB', qty: 0, cost: 4.478 },
        ],
      }), 'utf8')
      const view = await readPositionsView({ file, cookieConfigured: false, fetchImpl: quotingFetch })
      expect(view.positions.map(row => row.code)).toEqual(['600941'])
      expect(view.skipped).toBe(1)
      expect(view.exported_at).toBe(POSITION_FIXTURE.exported_at)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('flags a file that is not a snapshot object so the page can explain an empty table', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-stock-pnl-view-'))
    try {
      const file = join(dir, 'positions.json')
      await writeFile(file, '[]', 'utf8')
      const view = await readPositionsView({ file, cookieConfigured: true, fetchImpl: quotingFetch })
      expect(view.positions).toEqual([])
      expect(view.unreadable).toContain('不是持仓快照 JSON')
      expect(view.cookie_configured).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('resolvePositionsLocation', () => {
  it('prefers the machine choice, then the profile config, then the harness home default', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-stock-pnl-location-'))
    try {
      const locationPath = join(dir, LOCATION_FILE)
      const configured = join(dir, 'configured.json')
      const chosen = join(dir, 'chosen.json')
      const fallback = { file: join(dir, 'ths-holdings', 'positions.json'), source: 'default' }

      expect(resolvePositionsLocation({ home: dir, configured: '', locationPath })).toEqual(fallback)
      expect(resolvePositionsLocation({ home: dir, configured, locationPath })).toEqual({ file: configured, source: 'config' })

      writePositionsLocation(locationPath, chosen)
      expect(JSON.parse(await readFile(locationPath, 'utf8'))).toEqual({ positionsFile: chosen })
      expect(resolvePositionsLocation({ home: dir, configured, locationPath })).toEqual({ file: chosen, source: 'machine' })

      clearPositionsLocation(locationPath)
      expect(existsSync(locationPath)).toBe(false)
      expect(resolvePositionsLocation({ home: dir, configured, locationPath })).toEqual({ file: configured, source: 'config' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('inspectPositionsChoice', () => {
  it('accepts a file in an existing directory and refuses paths the page cannot use', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-stock-pnl-choice-'))
    try {
      expect(inspectPositionsChoice(join(dir, 'positions.json'))).toEqual({ ok: true, file: join(dir, 'positions.json') })
      expect(inspectPositionsChoice('positions.json')).toMatchObject({ ok: false })
      expect(inspectPositionsChoice('')).toMatchObject({ ok: false })
      expect(inspectPositionsChoice(dir)).toMatchObject({ ok: false, message: expect.stringContaining('是目录') })
      expect(inspectPositionsChoice(join(dir, 'missing', 'positions.json')))
        .toMatchObject({ ok: false, message: expect.stringContaining('所在目录不存在') })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('positions management route', () => {
  it('prices the exported holdings and reports the ledger state', { timeout: 60_000 }, async () => {
    const port = await loadComposition()

    const response = await fetch(`http://127.0.0.1:${String(port)}/api/stock-pnl/positions`)
    expect(response.status).toBe(200)
    const view = (await response.json()) as PositionsView
    // The config passes the path with forward slashes, which is how the view reports it back.
    expect(view.file.replaceAll('\\', '/')).toBe(positionsPath!.replaceAll('\\', '/'))
    expect(view.file_source).toBe('config')
    expect(view.file_default).toBe(join(root!, 'ths-holdings', 'positions.json'))
    expect(view.exported_at).toBe(POSITION_FIXTURE.exported_at)
    expect(view.export_date).toBe(POSITION_FIXTURE.export_date)
    expect(view.cookie_configured).toBe(true)
    expect(view.skipped).toBe(0)
    expect(view.quotes_error).toBe('')
    expect(view.positions).toEqual([
      {
        code: '600941', name: 'AAA', qty: 400, cost: 87.291,
        price: 88, prev_close: 87, market_value: 35200, cost_value: 34916.4,
        pnl: 283.6, pnl_pct: 0.8122, day_pnl: 400, day_pnl_pct: 1.1494,
      },
      {
        code: '601668', name: 'BBB', qty: 15000, cost: 4.478,
        price: 4.5, prev_close: 4.4, market_value: 67500, cost_value: 67170,
        pnl: 330, pnl_pct: 0.4913, day_pnl: 1500, day_pnl_pct: 2.2727,
      },
    ])
  })

  it('saves an edited list and keeps the export facts the page never edited', { timeout: 60_000 }, async () => {
    const port = await loadComposition()

    const response = await fetch(`http://127.0.0.1:${String(port)}/api/stock-pnl/positions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        positions: [
          { code: '600941', name: 'AAA', qty: 500, cost: 86.5 },
          { code: '000895', name: 'CCC', qty: 1700, cost: 25 },
        ],
      }),
    })
    expect(response.status).toBe(200)
    const result = (await response.json()) as SavePositionsResult
    expect(result.ok).toBe(true)
    expect(result.view?.positions.map(row => row.code)).toEqual(['600941', '000895'])

    const stored = JSON.parse(await readFile(positionsPath!, 'utf8')) as Record<string, unknown>
    expect(stored.exported_at).toBe(POSITION_FIXTURE.exported_at)
    expect(stored.source_file).toBe(POSITION_FIXTURE.source_file)
    expect(stored.positions).toEqual([
      { code: '600941', name: 'AAA', qty: 500, cost: 86.5 },
      { code: '000895', name: 'CCC', qty: 1700, cost: 25 },
    ])
    expect(typeof stored.updated_at).toBe('string')

    // A fresh read returns what the file now holds, so the edit survives the request.
    const reread = (await (await fetch(`http://127.0.0.1:${String(port)}/api/stock-pnl/positions`)).json()) as PositionsView
    expect(reread.positions.map(row => row.qty)).toEqual([500, 1700])
    expect(reread.updated_at).toBe(stored.updated_at)
  })

  it('rejects invalid rows, a non-JSON media type, and a non-JSON body without writing', { timeout: 60_000 }, async () => {
    const port = await loadComposition()
    const url = `http://127.0.0.1:${String(port)}/api/stock-pnl/positions`

    const rejected = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ positions: [{ code: '600941', name: 'AAA', qty: 0, cost: -1 }] }),
    })
    expect(rejected.status).toBe(400)
    const result = (await rejected.json()) as SavePositionsResult
    expect(result.ok).toBe(false)
    expect(result.errors.map(error => error.field)).toEqual(['qty', 'cost'])

    // A form post is a simple request that reaches loopback without a
    // preflight; the media type is what keeps it out of the write.
    const notJson = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'positions=1' })
    expect(notJson.status).toBe(415)

    const unparsable = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
    expect(unparsable.status).toBe(400)

    expect(JSON.parse(await readFile(positionsPath!, 'utf8'))).toEqual(POSITION_FIXTURE)
  })

  it('answers 405 for methods it does not serve', { timeout: 60_000 }, async () => {
    const port = await loadComposition()
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/stock-pnl/positions`, { method: 'DELETE' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, POST')
  })

  it('switches the holdings file for this machine and resets to the configured path', { timeout: 60_000 }, async () => {
    const port = await loadComposition()
    const base = `http://127.0.0.1:${String(port)}/api/stock-pnl/positions`
    const locationPath = join(root!, LOCATION_FILE)
    const alternate = join(root!, 'private-repo', 'positions.json')
    await mkdir(dirname(alternate), { recursive: true })
    await writeFile(alternate, `${JSON.stringify({ positions: [{ code: '000895', name: 'CCC', qty: 1700, cost: 25 }] }, null, 2)}\n`, 'utf8')

    const switched = await fetch(`${base}/location`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ positionsFile: alternate }),
    })
    expect(switched.status).toBe(200)
    const chosen = (await switched.json()) as { ok: boolean, file: string, file_source: string }
    expect(chosen.ok).toBe(true)
    expect(chosen.file_source).toBe('machine')
    expect(chosen.file.replaceAll('\\', '/')).toBe(alternate.replaceAll('\\', '/'))

    // The choice is remembered and the same routes now read the new file.
    expect(JSON.parse(await readFile(locationPath, 'utf8'))).toEqual({ positionsFile: alternate })
    const view = (await (await fetch(base)).json()) as PositionsView
    expect(view.file_source).toBe('machine')
    expect(view.file.replaceAll('\\', '/')).toBe(alternate.replaceAll('\\', '/'))
    expect(view.positions.map(row => row.code)).toEqual(['000895'])

    const refused = await fetch(`${base}/location`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ positionsFile: join(root!, 'missing-dir', 'positions.json') }),
    })
    expect(refused.status).toBe(400)
    expect(((await refused.json()) as { message: string }).message).toContain('所在目录不存在')

    // Saving a holding writes the chosen file, not the configured one.
    const saved = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ positions: [{ code: '000895', name: 'CCC', qty: 1800, cost: 25 }] }),
    })
    expect(saved.status).toBe(200)
    expect(JSON.parse(await readFile(alternate, 'utf8')).positions[0].qty).toBe(1800)
    expect(JSON.parse(await readFile(positionsPath!, 'utf8'))).toEqual(POSITION_FIXTURE)

    // An empty path forgets the machine choice and returns to the config.
    const reset = await fetch(`${base}/location`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ positionsFile: '' }),
    })
    expect(reset.status).toBe(200)
    expect(((await reset.json()) as { file_source: string }).file_source).toBe('config')
    expect(existsSync(locationPath)).toBe(false)
    const back = (await (await fetch(base)).json()) as PositionsView
    expect(back.file.replaceAll('\\', '/')).toBe(positionsPath!.replaceAll('\\', '/'))

    const notJson = await fetch(`${base}/location`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: `{"positionsFile":"${alternate.replaceAll('\\', '\\\\')}"}`,
    })
    expect(notJson.status).toBe(415)
    expect((await fetch(`${base}/location`)).status).toBe(405)
  })
})

describe('real Loader composition', () => {
  it('serves /api/stock-pnl with the Cookie, and unknown routes 404', { timeout: 60_000 }, async () => {
    const port = await loadComposition()

    const response = await fetch(`http://127.0.0.1:${String(port)}/api/stock-pnl`)
    expect(response.status).toBe(200)
    const stats = (await response.json()) as {
      pnl_pct: number
      sh_pct: number
      error: string
      token_expired: boolean
      poll_ms: number
    }
    expect(stats.error).toBe('')
    expect(stats.token_expired).toBe(false)
    expect(stats.pnl_pct).toBe(2.5)
    expect(stats.sh_pct).toBe(1)
    expect(stats.poll_ms).toBe(20000)
    expect(ledgerCookie).toContain('sid=test-secret')

    expect((await fetch(`http://127.0.0.1:${String(port)}/no/such/route`)).status).toBe(404)
  })
})
