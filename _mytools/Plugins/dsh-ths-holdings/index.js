/**
 * Stock P&L plugin, node half: registers `/api/stock-pnl` on the shared web
 * server. While no Cookie is configured the route answers from the exported
 * position snapshot this plugin reads — a file outside the package, chosen on
 * the plugin's own page — priced with the public quote feed; with a Cookie it
 * answers from the Tonghuashun ledger API instead. The Cookie itself never
 * leaves the host process.
 *
 * Hand-written ESM, the way this working copy's other out-of-tree plugins are
 * written: this file is the artifact, so the plugin needs no bundler and no
 * installed build dependencies.
 * @module dsh-ths-holdings
 */

import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { CookieAcquirer, resolvePlaywright } from './acquire.js'
import { collectStats, cookieField, fetchFundKey, INDEX_URL, listPortfolios, normalizeCookie, PNL_URL, verifyCookie } from './fetch.js'
import { collectLocalStats, DEFAULT_MINUTE_REFRESH_MS, QUOTE_URL } from './local.js'
import {
  clearPositionsLocation, defaultPositionsFile, inspectPositionsChoice, LOCATION_FILE,
  resolveDshHome, resolvePositionsLocation, writePositionsLocation,
} from './location.js'
import {
  ASSETS_FILE, clearTotalAssets, computePortfolioAssets, parseTotalAssetsInput, readTotalAssets, writeTotalAssets,
} from './assets.js'
import { savePositions, readPositionsView } from './positions.js'

export const name = 'ui-stock-pnl'
export const inject = ['webServer', 'credentials']

/** The same-origin route the composer strip polls. */
export const ROUTE_PATH = '/api/stock-pnl'

/** The same-origin route this plugin's page reads and writes the holdings through. */
export const POSITIONS_PATH = '/api/stock-pnl/positions'

/** The route that switches which file the holdings routes read and write. */
export const POSITIONS_LOCATION_PATH = '/api/stock-pnl/positions/location'

/** The route that stores the account's total assets, so available cash can be reported. */
export const POSITIONS_ASSETS_PATH = '/api/stock-pnl/positions/assets'

/** Largest accepted holdings-save body: a few hundred rows of four short fields. */
const MAX_POSITIONS_BODY_BYTES = 256 * 1024

/** Largest accepted location body: one path. */
const MAX_LOCATION_BODY_BYTES = 4 * 1024

/** Schemastery config for the routes. */
export const Config = z.object({
  cookieEnv: z.string().default('STOCK_PNL_COOKIE'),
  fundKeyEnv: z.string().default('STOCK_PNL_FUND_KEY'),
  user_id: z.string().default(''),
  fund_key: z.string().default(''),
  pnlUrl: z.string().default(PNL_URL),
  indexUrl: z.string().default(INDEX_URL),
  quoteUrl: z.string().default(QUOTE_URL),
  pollMs: z.number().min(1000).default(20000),
  positionsFile: z.string().default(''),
  minuteRefreshMs: z.number().min(10000).default(DEFAULT_MINUTE_REFRESH_MS),
})

/**
 * Resolve defaults the same way Schemastery would, so direct `apply` calls stay correct.
 * @param {object} config - the plugin config.
 * @returns {object} the fully materialized route policy.
 */
function resolveConfig(config) {
  return {
    cookieEnv: config.cookieEnv ?? 'STOCK_PNL_COOKIE',
    fundKeyEnv: config.fundKeyEnv ?? 'STOCK_PNL_FUND_KEY',
    user_id: config.user_id ?? '',
    fund_key: config.fund_key ?? '',
    pnlUrl: config.pnlUrl ?? PNL_URL,
    indexUrl: config.indexUrl ?? INDEX_URL,
    quoteUrl: config.quoteUrl ?? QUOTE_URL,
    pollMs: config.pollMs ?? 20000,
    positionsFile: config.positionsFile ?? '',
    minuteRefreshMs: config.minuteRefreshMs ?? DEFAULT_MINUTE_REFRESH_MS,
  }
}

/**
 * Resolve one credential-reference value through the seam.
 * @param {object} ctx - the plugin context.
 * @param {string} ref - the credential reference name.
 * @returns {Promise<string | undefined>} the value, or undefined when unconfigured.
 */
async function resolveCredential(ctx, ref) {
  const resolved = await ctx.credentials.resolve(credentialRef(ref))
  return resolved?.value
}

/**
 * Write a JSON response (same-origin only, so no CORS header).
 * @param {object} res - the node response.
 * @param {number} status - the HTTP status.
 * @param {unknown} value - the JSON value.
 * @returns {void}
 */
function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(new TextEncoder().encode(body).length),
  })
  res.end(body)
}

/**
 * Register the `/api/stock-pnl` routes. Per-request failures answer 500 and
 * never take the server down; the routes unregister with the plugin fiber.
 *
 * @param {object} ctx - Cordis context carrying the `webServer` and `credentials` services.
 * @param {object} [config] - plugin config.
 * @returns {void}
 */
export function apply(ctx, config = {}) {
  const spec = resolveConfig(config)
  const home = resolveDshHome()
  const locationPath = join(home, LOCATION_FILE)
  // The holdings file in force. The page may switch it without a restart, so
  // every route reads `location` instead of the configuration captured here; a
  // path chosen on this machine wins over the profile's `positionsFile`.
  let location = resolvePositionsLocation({ home, configured: spec.positionsFile, locationPath })
  const currentFile = () => location.file
  /** The location fields every holdings answer carries, so the page can draw its setting. */
  const locationView = () => ({
    file: location.file,
    file_source: location.source,
    file_default: defaultPositionsFile(home),
  })
  const assetsPath = join(home, ASSETS_FILE)
  /**
   * The account figures every holdings answer carries. The total is read per
   * request, so a hand-edited file shows up without a restart; cash is the
   * total minus the priced holdings.
   * @param {object} view - the priced holdings view.
   * @returns {object} the total, holdings value, cash, and cash share.
   */
  const assetsView = (view) => computePortfolioAssets(view.positions ?? [], readTotalAssets(assetsPath))
  const route = {
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (_req, res) => {
      try {
        const cookie = await resolveCredential(ctx, spec.cookieEnv)

        // Without a ledger session the exported positions plus the public quote
        // feed still produce the whole payload, so the strip stays live for a
        // deployment that never signs in.
        if (cookie === undefined || cookie.length === 0) {
          const local = await collectLocalStats({
            positionsFile: currentFile(),
            quoteUrl: spec.quoteUrl,
            minuteRefreshMs: spec.minuteRefreshMs,
          })
          if (local !== undefined) {
            writeJson(res, 200, { ...local, poll_ms: spec.pollMs, source: 'local' })
            return
          }
        }

        // Derive the ledger user id (same fallback as collectStats) so we can
        // call the account_list API when fund_key has not yet been stored.
        // The Cookie is normalized first (the store folds long values across
        // YAML lines and the read inserts a space at each break) and the field
        // is read with the anchored cookieField — a bare `/userid=/` regex
        // would match a different `*_userid=` cookie and get the ledger 403.
        const resolvedUser = spec.user_id.length > 0
          ? spec.user_id
          : (cookieField(normalizeCookie(cookie ?? ''), 'userid') ?? '')

        // fund_key: credential store → auto-discover from account_list → config default
        const fundKeyCred = await resolveCredential(ctx, spec.fundKeyEnv)
        let fundKey = fundKeyCred ?? spec.fund_key
        if (!fundKeyCred && cookie && resolvedUser) {
          const discovered = await fetchFundKey(cookie, resolvedUser)
          if (discovered !== undefined) fundKey = discovered
        }

        const stats = await collectStats({
          pnlUrl: spec.pnlUrl,
          indexUrl: spec.indexUrl,
          cookie,
          cookieEnv: spec.cookieEnv,
          user_id: spec.user_id,
          fund_key: fundKey,
        })
        writeJson(res, 200, { ...stats, poll_ms: spec.pollMs, source: 'ledger' })
      } catch (error) {
        ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        if (res.headersSent) {
          res.destroy()
          return
        }
        res.writeHead(500)
        res.end()
      }
    },
  }
  ctx.effect(() => ctx.webServer.register(route), 'ui-stock-pnl: /api/stock-pnl route')

  // Portfolio list endpoint: lets a client render a portfolio selector.
  const portfolioRoute = {
    kind: 'exact',
    path: '/api/stock-pnl/portfolios',
    handler: async (_req, res) => {
      try {
        const cookie = await resolveCredential(ctx, spec.cookieEnv)
        if (!cookie) { writeJson(res, 200, []); return }
        const user_id = spec.user_id.length > 0
          ? spec.user_id
          : (cookieField(normalizeCookie(cookie), 'userid') ?? '')
        if (!user_id) { writeJson(res, 200, []); return }
        const list = await listPortfolios(cookie, user_id)
        writeJson(res, 200, list)
      } catch (error) {
        ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        if (res.headersSent) { res.destroy(); return }
        res.writeHead(500)
        res.end()
      }
    },
  }
  ctx.effect(() => ctx.webServer.register(portfolioRoute), 'ui-stock-pnl: /api/stock-pnl/portfolios route')

  /**
   * Register one exact route for the life of the plugin fiber.
   * @param {string} path - the route path.
   * @param {Function} handler - the route handler.
   * @returns {void}
   */
  const addRoute = (path, handler) => {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler }), `ui-stock-pnl: ${path}`)
  }

  // Auto-acquire: a visible Edge window waits for the sign-in, then its Cookie
  // is committed through the same reference the snapshot route reads.
  const acquirer = new CookieAcquirer({
    resolvePlaywright,
    save: async cookie => {
      await ctx.credentials.set(credentialRef(spec.cookieEnv), cookie)
    },
  })
  ctx.effect(() => async () => { await acquirer.dispose() }, 'ui-stock-pnl: acquire teardown')

  // Verify: probe the ledger with the stored Cookie and report whether it works.
  const verifyHandler = async (_req, res) => {
    try {
      const cookie = await resolveCredential(ctx, spec.cookieEnv)
      if (cookie === undefined || cookie.length === 0) {
        const local = await collectLocalStats({
          positionsFile: currentFile(),
          quoteUrl: spec.quoteUrl,
          minuteRefreshMs: spec.minuteRefreshMs,
        })
        if (local !== undefined) {
          writeJson(res, 200, { configured: false, valid: false, error: '本地行情模式：数据来自导出的持仓快照，无需 Cookie' })
          return
        }
      }
      const user = spec.user_id.length > 0 ? spec.user_id : undefined
      const result = await verifyCookie(cookie, user)
      writeJson(res, 200, {
        configured: cookie !== undefined && cookie.length > 0,
        valid: result.valid,
        ...(result.error !== undefined ? { error: result.error } : {}),
        ...(result.hint !== undefined ? { hint: result.hint } : {}),
        ...(result.portfolios !== undefined ? { portfolios: result.portfolios } : {}),
      })
    } catch (error) {
      ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      writeJson(res, 200, { configured: false, valid: false, error: '验证失败' })
    }
  }
  addRoute('/api/stock-pnl/verify', verifyHandler)

  // Auto-acquire lifecycle: start / status / immediate-check / cancel.
  addRoute('/api/stock-pnl/acquire', async (_req, res) => { writeJson(res, 200, await acquirer.start()) })
  addRoute('/api/stock-pnl/acquire/status', (_req, res) => { writeJson(res, 200, acquirer.status()) })
  addRoute('/api/stock-pnl/acquire/check', async (_req, res) => { writeJson(res, 200, await acquirer.check()) })
  addRoute('/api/stock-pnl/acquire/cancel', async (_req, res) => { writeJson(res, 200, await acquirer.cancel()) })

  // Holdings management: this plugin's page reads the same snapshot the local
  // source prices and writes an edited list back to it. A save is accepted
  // only as an `application/json` body, which also keeps a cross-origin form
  // post from reaching this write.
  addRoute(POSITIONS_PATH, async (req, res) => {
    try {
      const cookie = await resolveCredential(ctx, spec.cookieEnv)
      const cookieConfigured = cookie !== undefined && cookie.length > 0
      const input = {
        file: currentFile(),
        cookieConfigured,
        quoteUrl: spec.quoteUrl,
      }

      if (req.method === 'POST') {
        // A cross-origin form post reaches this loopback server without a
        // preflight, so the media type is part of the write's contract: only a
        // JSON body is read, and everything else is refused before parsing.
        const contentType = req.headers['content-type'] ?? ''
        if (!contentType.toLowerCase().startsWith('application/json')) {
          writeJson(res, 415, {
            ok: false,
            errors: [{ index: -1, field: 'body', message: '请求的 Content-Type 必须是 application/json' }],
          })
          return
        }
        const body = await readJsonBody(req, MAX_POSITIONS_BODY_BYTES)
        if (body === undefined) {
          writeJson(res, 400, {
            ok: false,
            errors: [{ index: -1, field: 'body', message: `请求体必须是 JSON 对象，且不超过 ${String(MAX_POSITIONS_BODY_BYTES)} 字节` }],
          })
          return
        }
        const result = await savePositions({ ...input, body })
        writeJson(res, result.ok ? 200 : 400,
          result.ok
            ? { ...result, view: { ...result.view, ...locationView(), ...assetsView(result.view) } }
            : result)
        return
      }

      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET, POST' })
        res.end()
        return
      }
      const view = await readPositionsView(input)
      writeJson(res, 200, { ...view, ...locationView(), ...assetsView(view) })
    } catch (error) {
      ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      if (res.headersSent) { res.destroy(); return }
      res.writeHead(500)
      res.end()
    }
  })

  // Where the holdings file lives. The path is remembered for this machine only
  // (never in the package), and an empty value returns to the profile's
  // `positionsFile` or the default under the harness home.
  addRoute(POSITIONS_LOCATION_PATH, async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' })
        res.end()
        return
      }
      const contentType = req.headers['content-type'] ?? ''
      if (!contentType.toLowerCase().startsWith('application/json')) {
        writeJson(res, 415, { ok: false, message: '请求的 Content-Type 必须是 application/json' })
        return
      }
      const body = await readJsonBody(req, MAX_LOCATION_BODY_BYTES)
      if (typeof body !== 'object' || body === null || typeof body.positionsFile !== 'string') {
        writeJson(res, 400, { ok: false, message: `请求体需要 positionsFile 字符串，且不超过 ${String(MAX_LOCATION_BODY_BYTES)} 字节` })
        return
      }

      const raw = body.positionsFile.trim()
      if (raw === '') {
        try {
          clearPositionsLocation(locationPath)
        } catch (error) {
          writeJson(res, 500, { ok: false, message: `清除本机设置失败：${error instanceof Error ? error.message : String(error)}` })
          return
        }
        location = resolvePositionsLocation({ home, configured: spec.positionsFile, locationPath })
        writeJson(res, 200, { ok: true, ...locationView() })
        return
      }

      const choice = inspectPositionsChoice(raw)
      if (!choice.ok) {
        writeJson(res, 400, { ok: false, message: choice.message })
        return
      }
      try {
        writePositionsLocation(locationPath, choice.file)
      } catch (error) {
        writeJson(res, 500, { ok: false, message: `写入本机设置失败：${error instanceof Error ? error.message : String(error)}` })
        return
      }
      location = { file: choice.file, source: 'machine' }
      writeJson(res, 200, { ok: true, ...locationView() })
    } catch (error) {
      ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      if (res.headersSent) { res.destroy(); return }
      res.writeHead(500)
      res.end()
    }
  })

  // The account's total assets: one number per machine, stored beside the
  // holdings path, so the page can show what is left as available cash. A
  // `null` (or empty) value forgets the setting, which is different from zero.
  addRoute(POSITIONS_ASSETS_PATH, async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' })
        res.end()
        return
      }
      const contentType = req.headers['content-type'] ?? ''
      if (!contentType.toLowerCase().startsWith('application/json')) {
        writeJson(res, 415, { ok: false, message: '请求的 Content-Type 必须是 application/json' })
        return
      }
      const body = await readJsonBody(req, MAX_LOCATION_BODY_BYTES)
      if (typeof body !== 'object' || body === null || !('totalAssets' in body)) {
        writeJson(res, 400, {
          ok: false,
          message: `请求体需要 totalAssets 字段（数字，或 null 清除），且不超过 ${String(MAX_LOCATION_BODY_BYTES)} 字节`,
        })
        return
      }
      const parsed = parseTotalAssetsInput(body.totalAssets)
      if (!parsed.ok) {
        writeJson(res, 400, { ok: false, message: parsed.message })
        return
      }
      try {
        if (parsed.value === null) clearTotalAssets(assetsPath)
        else writeTotalAssets(assetsPath, parsed.value)
      } catch (error) {
        writeJson(res, 500, {
          ok: false,
          message: `写入总资产失败：${error instanceof Error ? error.message : String(error)}`,
        })
        return
      }
      writeJson(res, 200, { ok: true, total_assets: parsed.value })
    } catch (error) {
      ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      if (res.headersSent) { res.destroy(); return }
      res.writeHead(500)
      res.end()
    }
  })
}

/**
 * Read one JSON request body.
 *
 * The body is bounded before it is parsed and drained rather than buffered
 * past the cap, so an oversized request is still answered instead of stalling
 * the connection.
 * @param {object} req - the request stream.
 * @param {number} limit - most bytes to accept.
 * @returns {Promise<unknown>} the parsed body, or undefined when the request carried none, exceeded the cap, or did not carry JSON.
 */
function readJsonBody(req, limit) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    let over = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        over = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (over) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        // A body that is not JSON is a request this route cannot answer.
        resolve(undefined)
      }
    })
    req.on('error', () => { resolve(undefined) })
  })
}
