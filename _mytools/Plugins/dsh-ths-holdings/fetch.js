/**
 * Ledger-data acquisition: POST the same form payloads the original overlay
 * server sent to the Tonghuashun investment-ledger (投资账本) API and normalize
 * the responses into the `/api/stock-pnl` fields. Credential-bearing requests
 * never follow a redirect, so the Cookie cannot be forwarded to another origin.
 * @module dsh-ths-holdings/fetch
 */

/** The P&L intraday time_share endpoint. */
export const PNL_URL = 'https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb/caishen_fund/pc/asset/v1/time_share'
/** The index quote endpoint. */
export const INDEX_URL = 'https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb/caishen_fund/invest/getQuotes'
/** The portfolio-account list endpoint, used to auto-discover the fund_key. */
export const ACCOUNT_LIST_URL = 'https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb/caishen_fund/pc/account/v1/account_list'

/** The browser User-Agent the request presents. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** The production executor backed by the global fetch. */
export const defaultFetch = (url, init) => fetch(url, init)

/**
 * Post one ledger endpoint with the Cookie and never follow a redirect.
 * @param {Function} fetchImpl - the fetch-compatible executor.
 * @param {string} url - the endpoint.
 * @param {string} payload - the form body.
 * @param {string} cookie - the stored Cookie, already normalized.
 * @returns {Promise<{ok: true, body: unknown} | {ok: false, tokenExpired: boolean, error: string}>} the decoded body or the failure.
 */
async function postForm(fetchImpl, url, payload, cookie) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: 'https://tzzb.10jqka.com.cn/pc/index.html',
    'User-Agent': UA,
    Cookie: cookie,
  }
  let response
  try {
    response = await fetchImpl(url, { method: 'POST', headers, body: payload, redirect: 'manual' })
  } catch (error) {
    return { ok: false, tokenExpired: false, error: `网络错误: ${error.message}` }
  }
  if (REDIRECT_STATUSES.has(response.status)) {
    return { ok: false, tokenExpired: false, error: `接口重定向未跟随 (HTTP ${response.status})` }
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, tokenExpired: true, error: `TOKEN_EXPIRED (HTTP ${response.status}) ${await bodySnippet(response)}`.trim() }
  }
  if (!response.ok) {
    return { ok: false, tokenExpired: false, error: `HTTP ${response.status} ${await bodySnippet(response)}`.trim() }
  }
  try {
    return { ok: true, body: await response.json() }
  } catch {
    return { ok: false, tokenExpired: false, error: '响应解析失败' }
  }
}

/**
 * Read a short prefix of a response body for diagnostics; never throws.
 * @param {Response} response - the response to sample.
 * @returns {Promise<string>} at most 200 characters, or an empty string.
 */
async function bodySnippet(response) {
  try {
    return (await response.text()).slice(0, 200)
  } catch {
    return ''
  }
}

/**
 * The P&L time_share form payload.
 * @param {{user_id: string, fund_key: string}} input - ledger identity.
 * @returns {string} the urlencoded body.
 */
function pnlPayload(input) {
  return `terminal=1&version=0.0.0&userid=${input.user_id}&user_id=${input.user_id}&manual_id=&fundid=&fund_key=${input.fund_key}&rzrq_fund_key=&custid=`
}

/**
 * The Shanghai Composite index form payload.
 * @param {{user_id: string}} input - ledger identity.
 * @returns {string} the urlencoded body.
 */
function indexPayload(input) {
  return `terminal=1&version=0.0.0&userid=${input.user_id}&user_id=${input.user_id}&code=2%3A1A0001&date=`
}

/**
 * Rebuild a Cookie the credentials store may have line-wrapped: the YAML
 * serializer folds long values across lines and the parser inserts a space at
 * each break, which corrupts base64/JWT values. Split on `;`, strip whitespace
 * from every `key=value`, and rejoin with the canonical `; ` separator.
 * @param {string} cookie - the stored Cookie.
 * @returns {string} the normalized Cookie.
 */
export function normalizeCookie(cookie) {
  return cookie
    .split(/;\s*/)
    .map(part => part.replace(/\s+/g, ''))
    .filter(part => part.length > 0)
    .join('; ')
}

/**
 * Read one `name=value` field out of a Cookie.
 * @param {string} cookie - the Cookie to read.
 * @param {string} name - the field name.
 * @returns {string | undefined} the field value, or undefined when absent.
 */
export function cookieField(cookie, name) {
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1]
}

/**
 * Query the portfolio list and return the first account's `fund_key`.
 * Returns `undefined` on any network or parse failure so the caller falls back
 * to a configured default.
 * @param {string} cookie - the stored Cookie.
 * @param {string} user_id - the ledger user id.
 * @returns {Promise<string | undefined>} the first fund key.
 */
export async function fetchFundKey(cookie, user_id) {
  const list = await listPortfolios(cookie, user_id)
  return list[0]?.fund_key
}

/**
 * Normalize the account-list payload into portfolio rows (empty when absent).
 * @param {{ex_data?: {common?: ReadonlyArray<Record<string, unknown>>}}} body - the decoded account_list response.
 * @returns {Array<{fund_key: string, manualname: string, brokername: string}>} the rows with a non-empty fund_key.
 */
function parsePortfolios(body) {
  const common = body.ex_data?.common ?? []
  return common.map(item => ({
    fund_key: String(item.fund_key ?? ''),
    manualname: String(item.manualname ?? ''),
    brokername: String(item.brokername ?? ''),
  })).filter(portfolio => portfolio.fund_key.length > 0)
}

/**
 * Query the portfolio list and return every account. Silently returns `[]` on
 * any network or parse failure so the caller can fall back gracefully.
 * The request shape is byte-identical to verifyCookie's (the same endpoint) —
 * extra browser headers (Accept/Referer/Accept-Language) or a redirect-follow
 * get the account_list gateway refused, while this minimal shape is accepted.
 * The Cookie is normalized first: the credentials store folds long values
 * across YAML lines and the read inserts a space at each break.
 * @param {string} cookie - the stored Cookie.
 * @param {string} user_id - the ledger user id.
 * @param {Function} [fetchImpl] - executor override for tests.
 * @returns {Promise<ReadonlyArray<{fund_key: string, manualname: string, brokername: string}>>} the portfolio rows.
 */
export async function listPortfolios(cookie, user_id, fetchImpl = defaultFetch) {
  const payload = `terminal=1&version=0.0.0&userid=${user_id}&user_id=${user_id}`
  try {
    const response = await fetchImpl(ACCOUNT_LIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Cookie: normalizeCookie(cookie) },
      body: payload,
      redirect: 'manual',
    })
    if (REDIRECT_STATUSES.has(response.status) || response.status === 401 || response.status === 403 || !response.ok) return []
    const body = await response.json()
    return parsePortfolios(body)
  } catch {
    return []
  }
}

/**
 * Probe the ledger account-list endpoint with the stored Cookie and report
 * whether it is accepted. A 401/403 means the Cookie expired; a 200 with a
 * rejected envelope means the ledger refused the session; any other failure is
 * reported as-is (the ledger call must not be retried or followed).
 * @param {string | undefined} cookie - the stored Cookie, or undefined when nothing is configured.
 * @param {string} [user_id] - explicit user id, or undefined to derive it from the Cookie.
 * @param {Function} [fetchImpl] - executor override for tests.
 * @returns {Promise<{valid: boolean, reason: string, error?: string, hint?: string, portfolios?: ReadonlyArray<object>}>} the structured verdict, never throwing.
 */
export async function verifyCookie(cookie, user_id, fetchImpl = defaultFetch) {
  if (cookie === undefined || cookie.length === 0) {
    return { valid: false, reason: 'missing', error: '未配置 Cookie（请粘贴或自动获取）' }
  }
  const normalized = normalizeCookie(cookie)
  const uid = (user_id ?? '').length > 0 ? user_id : cookieField(normalized, 'userid')
  if (uid === undefined || uid.length === 0) {
    return { valid: false, reason: 'no-userid', error: 'Cookie 缺少 userid 字段，可能已失效' }
  }
  let response
  try {
    response = await fetchImpl(ACCOUNT_LIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Cookie: normalized },
      body: `terminal=1&version=0.0.0&userid=${uid}&user_id=${uid}`,
      redirect: 'manual',
    })
  } catch (error) {
    return { valid: false, reason: 'http', error: `网络错误: ${error.message}` }
  }
  if (REDIRECT_STATUSES.has(response.status)) {
    return { valid: false, reason: 'redirected', error: `接口重定向未跟随 (HTTP ${response.status})` }
  }
  if (response.status === 401 || response.status === 403) {
    return { valid: false, reason: 'expired', error: 'Cookie 已过期（Token 无效），请重新登录获取', hint: '点击「自动获取 Cookie」或重新粘贴' }
  }
  if (!response.ok) {
    return { valid: false, reason: 'http', error: `HTTP ${response.status}` }
  }
  let body
  try {
    body = await response.json()
  } catch {
    return { valid: false, reason: 'parse', error: '响应解析失败' }
  }
  if (body.error_code !== undefined && body.error_code !== '0') {
    const message = String(body.error_msg ?? '未知错误')
    return {
      valid: false,
      reason: 'rejected',
      error: `账本拒绝请求: ${message}`,
      hint: message.includes('登录') ? '请重新登录获取新的 Cookie' : undefined,
    }
  }
  return { valid: true, reason: 'ok', portfolios: parsePortfolios(body) }
}

/**
 * Fetch and normalize one snapshot. A missing Cookie and a refused ledger
 * request both return a populated payload with a non-empty `error`; only a
 * thrown executor falls through to the caller (already contained).
 * @param {object} input - endpoints, ledger identity, and test seams.
 * @param {string} input.pnlUrl - the P&L endpoint.
 * @param {string} input.indexUrl - the index endpoint.
 * @param {string | undefined} input.cookie - the resolved Cookie, if any.
 * @param {string} input.cookieEnv - the credential name named in the not-configured error.
 * @param {string} input.user_id - the ledger user id; empty falls back to the Cookie's `userid`.
 * @param {string} input.fund_key - the ledger fund key selecting the managed portfolio.
 * @param {Function} [input.fetchImpl] - executor override for tests.
 * @param {Function} [input.now] - clock override for tests.
 * @returns {Promise<object>} the `/api/stock-pnl` fields.
 */
export async function collectStats(input) {
  const fetchImpl = input.fetchImpl ?? defaultFetch
  const now = input.now ?? (() => new Date())
  if (input.cookie === undefined || input.cookie.length === 0) {
    return {
      pnl_pct: 0,
      pnl_yk: 0,
      sh_pct: 0,
      chart_data: [],
      updated_at: now().toISOString(),
      error: `请配置 Cookie（环境变量 ${input.cookieEnv}）`,
      token_expired: false,
    }
  }

  let pnlPct = 0
  let pnlYk = 0
  let chartData = []
  let shPct = 0
  let error = ''
  let tokenExpired = false

  const cookie = normalizeCookie(input.cookie)
  // The ledger form payload needs the user id; fall back to the Cookie's own
  // `userid` field so the plugin works without a separate `user_id` config.
  const user_id = input.user_id.length > 0 ? input.user_id : (cookieField(cookie, 'userid') ?? '')

  const pnl = await postForm(fetchImpl, input.pnlUrl, pnlPayload({ user_id, fund_key: input.fund_key }), cookie)
  if (pnl.ok) {
    if (pnl.body.error_code !== '0') {
      error = String(pnl.body.error_msg ?? 'API 错误')
    } else {
      const points = pnl.body.ex_data?.data
      if (points !== undefined && points.length > 0) {
        const last = points[points.length - 1]
        pnlPct = Number(last?.zf ?? 0)
        pnlYk = Number(last?.yk ?? 0)
        chartData = points.map(point => ({ t: Number(point.time ?? 0), v: Number(point.zf ?? 0) }))
      }
    }
  } else {
    tokenExpired = pnl.tokenExpired
    error = pnl.error
  }

  if (error === '') {
    const index = await postForm(fetchImpl, input.indexUrl, indexPayload({ user_id }), cookie)
    if (index.ok) {
      for (const item of index.body.ex_data ?? []) {
        if (item.zqdm !== '1A0001') continue
        const price = Number(item.xianjia ?? 0)
        const prev = Number(item.zuoshou ?? 0)
        if (prev > 0) shPct = Math.round(((price - prev) / prev) * 10000) / 100
        break
      }
    }
  }

  return {
    pnl_pct: pnlPct,
    pnl_yk: pnlYk,
    sh_pct: shPct,
    chart_data: chartData,
    updated_at: now().toISOString(),
    error,
    token_expired: tokenExpired,
  }
}
