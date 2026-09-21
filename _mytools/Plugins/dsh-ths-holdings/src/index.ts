/**
 * Stock P&L plugin, node half: registers `/api/stock-pnl` on the shared web
 * server. While no Cookie is configured the route answers from the exported
 * position file that ships in this package, priced with the public quote feed;
 * with a Cookie it answers from the Tonghuashun ledger API instead. The Cookie
 * itself never leaves the host process.
 * @module @deepseek-ai/dsh-client-ui-stock-pnl
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { CookieAcquirer, resolvePlaywright } from './acquire.ts'
import { collectStats, cookieField, fetchFundKey, INDEX_URL, listPortfolios, normalizeCookie, PNL_URL, type Portfolio, verifyCookie } from './fetch.ts'
import { collectLocalStats, DEFAULT_MINUTE_REFRESH_MS } from './local.ts'
import type { Stats } from './types.ts'

export const name = 'ui-stock-pnl'
export const inject = ['webServer', 'credentials']

/** The same-origin route the composer strip polls. */
export const ROUTE_PATH = '/api/stock-pnl'

/** Plugin config: the Cookie reference and ledger identity/endpoints. */
export interface Config {
  /** Environment-variable name holding the ledger Cookie; defaults to `STOCK_PNL_COOKIE`. */
  cookieEnv?: string
  /** Credential reference holding the ledger fund key; defaults to `STOCK_PNL_FUND_KEY`. */
  fundKeyEnv?: string
  /** The ledger user id included in every form payload; empty falls back to the Cookie's `userid`. */
  user_id?: string
  /** The ledger fund key selecting the managed portfolio; auto-discovered when empty. */
  fund_key?: string
  /** P&L endpoint override (tests point at a scripted server). */
  pnlUrl?: string
  /** Index endpoint override (tests point at a scripted server). */
  indexUrl?: string
  /** Poll interval the strip should use, in milliseconds; defaults to 20000. */
  pollMs?: number
  /**
   * Exported-position snapshot feeding the local quote source; defaults to
   * `positions.json` beside this package's own files, so the single file a
   * person replaces when the holdings change lives in the plugin directory.
   */
  positionsFile?: string
  /** How long one intraday P&L series stays cached, in milliseconds; defaults to 120000. */
  minuteRefreshMs?: number
}

/** Schemastery config for the overlay route. */
export const Config: z<Config> = z.object({
  cookieEnv: z.string().default('STOCK_PNL_COOKIE'),
  fundKeyEnv: z.string().default('STOCK_PNL_FUND_KEY'),
  user_id: z.string().default(''),
  fund_key: z.string().default(''),
  pnlUrl: z.string().default(PNL_URL),
  indexUrl: z.string().default(INDEX_URL),
  pollMs: z.number().min(1000).default(20000),
  positionsFile: z.string().default(''),
  minuteRefreshMs: z.number().min(10000).default(DEFAULT_MINUTE_REFRESH_MS),
})

/** Fully materialized route policy; defaulting happens here, never inline. */
interface ResolvedConfig {
  cookieEnv: string
  fundKeyEnv: string
  user_id: string
  fund_key: string
  pnlUrl: string
  indexUrl: string
  pollMs: number
  positionsFile: string
  minuteRefreshMs: number
}

/** Resolve defaults the same way Schemastery would, so direct `apply` calls stay correct. */
function resolveConfig(config: Config): ResolvedConfig {
  return {
    cookieEnv: config.cookieEnv ?? 'STOCK_PNL_COOKIE',
    fundKeyEnv: config.fundKeyEnv ?? 'STOCK_PNL_FUND_KEY',
    user_id: config.user_id ?? '',
    fund_key: config.fund_key ?? '',
    pnlUrl: config.pnlUrl ?? PNL_URL,
    indexUrl: config.indexUrl ?? INDEX_URL,
    pollMs: config.pollMs ?? 20000,
    positionsFile: config.positionsFile ?? '',
    minuteRefreshMs: config.minuteRefreshMs ?? DEFAULT_MINUTE_REFRESH_MS,
  }
}

/** The package directory (the parent of the built `lib/` this module loads from). */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * The exported-position snapshot the local quote source reads by default: one
 * file in the plugin directory, so swapping the holdings is copying one file
 * into the package rather than hunting a path under the DSH home directory.
 */
function defaultPositionsFile(): string {
  return path.join(PACKAGE_ROOT, 'positions.json')
}

/** Resolve one credential-reference value through the seam; `undefined` when unconfigured. */
async function resolveCredential(ctx: Context, ref: string): Promise<string | undefined> {
  const resolved = await ctx.credentials.resolve(credentialRef(ref))
  return resolved?.value
}

/** The web server's response type, derived from the route contract (no node import). */
type RouteResponse = Parameters<NonNullable<WebRoute['handler']>>[1]

/** The route's response value: the stats snapshot plus the poll interval the strip should use. */
export type RouteStats = Stats & {
  readonly poll_ms: number
  /** Which source answered: the ledger API through a Cookie, or the local quote feed. */
  readonly source: 'ledger' | 'local'
}

/** Write a JSON response (same-origin only, so no CORS header). */
function writeJson<T>(res: RouteResponse, status: number, value: T): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(new TextEncoder().encode(body).length),
  })
  res.end(body)
}

/**
 * Register the `/api/stock-pnl` route. Per-request failures answer 500 and
 * never take the server down; the route unregisters with the plugin fiber.
 *
 * @param ctx - Cordis context carrying the `webServer` and `credentials` services.
 * @param config - plugin config.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const spec = resolveConfig(config)
  const route: WebRoute = {
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
            positionsFile: spec.positionsFile === '' ? defaultPositionsFile() : spec.positionsFile,
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
  const portfolioRoute: WebRoute = {
    kind: 'exact',
    path: '/api/stock-pnl/portfolios',
    handler: async (_req, res) => {
      try {
        const cookie = await resolveCredential(ctx, spec.cookieEnv)
        if (!cookie) { writeJson(res, 200, [] as readonly Portfolio[]); return }
        const user_id = spec.user_id.length > 0
          ? spec.user_id
          : (cookieField(normalizeCookie(cookie), 'userid') ?? '')
        if (!user_id) { writeJson(res, 200, [] as readonly Portfolio[]); return }
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

  // Register one exact route for the life of the plugin fiber.
  const addRoute = (path: string, handler: WebRoute['handler']): void => {
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
  const verifyHandler: WebRoute['handler'] = async (_req, res) => {
    try {
      const cookie = await resolveCredential(ctx, spec.cookieEnv)
      if (cookie === undefined || cookie.length === 0) {
        const local = await collectLocalStats({
          positionsFile: spec.positionsFile === '' ? defaultPositionsFile() : spec.positionsFile,
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
}
