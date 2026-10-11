/**
 * Local quote source: compute the route's snapshot from an exported ledger
 * position file plus the public quote feed, so the plugin works without a
 * ledger sign-in. `ths-export-positions.py`, beside the snapshot it writes,
 * produces that file; this module turns it into the `/api/stock-pnl` payload.
 *
 * Day P&L is measured against each holding's previous close: the position file
 * supplies quantities, so the number is the account's move today and never the
 * P&L carried since the position was opened.
 * @module dsh-ths-holdings/local
 */

import { readFile } from 'node:fs/promises'

/** The batch quote endpoint (GBK-encoded, one `v_<secid>="..."` line per code). */
export const QUOTE_URL = 'http://qt.gtimg.cn/q='
/** The per-code intraday minute endpoint backing the mini chart. */
const MINUTE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/minute/query?code='
/** Codes per batch quote request. */
const QUOTE_BATCH = 50
/** The Shanghai Composite Index security id. */
const INDEX_SECID = 'sh000001'
/** Default gap between intraday-series refreshes; the chart is not worth a request per poll. */
export const DEFAULT_MINUTE_REFRESH_MS = 120_000
/** Default per-request network budget. */
const DEFAULT_TIMEOUT_MS = 8_000
/** Request timeout for the intraday series, which is larger than a quote line. */
const MINUTE_TIMEOUT_MS = 15_000

/** The intraday percentile series cache, keyed by the snapshot identity. */
let chartCache

/**
 * The quote-feed security id for one ledger code: a leading `sh`, `sz`, or `bj`.
 * @param {string} code - the six-digit code as the ledger exports it.
 * @returns {string} the quote-feed security id.
 */
export function secid(code) {
  if (/^[5689]/.test(code)) return `sh${code}`
  if (/^[0123]/.test(code)) return `sz${code}`
  return `bj${code}`
}

/**
 * Parse one exported position snapshot.
 * @param {string} raw - the file's text.
 * @returns {object | undefined} the snapshot with its usable rows, or undefined when the text is not the snapshot object.
 */
export function parsePositionSnapshot(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  return normalizePositionSnapshot(parsed)
}

/**
 * Normalize an already-parsed snapshot value, dropping rows with no usable
 * quantity or cost and counting them, so the management view can say how many
 * rows it could not show.
 * @param {unknown} parsed - the parsed snapshot value.
 * @returns {object | undefined} the snapshot, or undefined when the value is not the snapshot object.
 */
export function normalizePositionSnapshot(parsed) {
  if (typeof parsed !== 'object' || parsed === null) return undefined
  if (!Array.isArray(parsed.positions)) return undefined
  const positions = []
  let skipped = 0
  for (const item of parsed.positions) {
    if (typeof item !== 'object' || item === null) {
      skipped += 1
      continue
    }
    const code = typeof item.code === 'string' ? item.code.trim() : ''
    const qty = typeof item.qty === 'number' ? item.qty : Number.NaN
    const cost = typeof item.cost === 'number' ? item.cost : Number.NaN
    if (code === '' || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost)) {
      skipped += 1
      continue
    }
    positions.push({
      code,
      name: typeof item.name === 'string' ? item.name : code,
      qty,
      cost,
    })
  }
  return {
    ...(typeof parsed.exported_at === 'string' ? { exported_at: parsed.exported_at } : {}),
    ...(typeof parsed.export_date === 'string' ? { export_date: parsed.export_date } : {}),
    ...(typeof parsed.updated_at === 'string' ? { updated_at: parsed.updated_at } : {}),
    skipped,
    positions,
  }
}

/**
 * Read and validate the exported position snapshot.
 * @param {string} file - absolute path of the snapshot JSON.
 * @returns {Promise<object | undefined>} the snapshot, or undefined when the file is absent, unreadable, or carries no usable position.
 */
export async function readPositionSnapshot(file) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return undefined
  }
  const snapshot = parsePositionSnapshot(raw)
  if (snapshot === undefined || snapshot.positions.length === 0) return undefined
  return snapshot
}

/**
 * Fetch batch quotes for the given security ids; missing or refused codes are simply absent.
 * @param {ReadonlyArray<string>} ids - quote-feed security ids.
 * @param {Function} fetchImpl - the executor.
 * @param {number} timeoutMs - per-request budget, ms.
 * @param {string} quoteUrl - the batch endpoint.
 * @returns {Promise<Map<string, {name: string, price: number, prevClose: number}>>} the decoded quotes.
 */
async function fetchQuotes(ids, fetchImpl, timeoutMs, quoteUrl) {
  const quotes = new Map()
  for (let start = 0; start < ids.length; start += QUOTE_BATCH) {
    const batch = ids.slice(start, start + QUOTE_BATCH)
    let text
    try {
      const response = await fetchImpl(`${quoteUrl}${batch.join(',')}`, {
        headers: { Referer: 'http://qt.gtimg.cn/' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) continue
      // The quote feed answers GBK; a UTF-8 read would mangle every name.
      text = new TextDecoder('gbk').decode(await response.arrayBuffer())
    } catch {
      continue
    }
    for (const match of text.matchAll(/v_([a-z]{2}\d{6})="([^"]*)"/g)) {
      const [, id, body] = match
      if (id === undefined || body === undefined) continue
      const fields = body.split('~')
      const price = Number(fields[3])
      const prevClose = Number(fields[4])
      if (!Number.isFinite(prevClose) || prevClose <= 0) continue
      quotes.set(id, {
        name: fields[1] ?? '',
        price: Number.isFinite(price) && price > 0 ? price : prevClose,
        prevClose,
      })
    }
  }
  return quotes
}

/**
 * Price holdings with the public quote feed for the management view: each row
 * carries its cost-derived and previous-close-derived figures, and a code the
 * feed does not answer keeps its editable fields with no price.
 * @param {{positions: ReadonlyArray<object>, quoteUrl?: string, fetchImpl?: Function, timeoutMs?: number}} input - the holdings, endpoint, and test seams.
 * @returns {Promise<{rows: ReadonlyArray<object>, missing: ReadonlyArray<string>}>} the priced rows in input order plus the unpriced names/codes.
 */
export async function pricePositions(input) {
  const fetchImpl = input.fetchImpl ?? ((url, init) => fetch(url, init))
  const ids = [...new Set(input.positions.map(position => secid(position.code)))]
  const quotes = ids.length === 0
    ? new Map()
    : await fetchQuotes(ids, fetchImpl, input.timeoutMs ?? DEFAULT_TIMEOUT_MS, input.quoteUrl ?? QUOTE_URL)

  const rows = []
  const missing = []
  for (const position of input.positions) {
    const quote = quotes.get(secid(position.code))
    const base = { code: position.code, name: position.name, qty: position.qty, cost: position.cost }
    if (quote === undefined) {
      missing.push(position.name === '' ? position.code : position.name)
      rows.push(base)
      continue
    }
    const marketValue = quote.price * position.qty
    const costValue = position.cost * position.qty
    const pnl = marketValue - costValue
    const baselineValue = quote.prevClose * position.qty
    const dayPnl = (quote.price - quote.prevClose) * position.qty
    rows.push({
      ...base,
      price: quote.price,
      prev_close: quote.prevClose,
      market_value: round(marketValue),
      cost_value: round(costValue),
      pnl: round(pnl),
      pnl_pct: costValue > 0 ? round((pnl / costValue) * 100, 4) : 0,
      day_pnl: round(dayPnl),
      day_pnl_pct: baselineValue > 0 ? round((dayPnl / baselineValue) * 100, 4) : 0,
    })
  }
  return { rows, missing }
}

/**
 * Round a money or percent value to `decimals` places.
 * @param {number} value - the value to round.
 * @param {number} [decimals] - decimal places.
 * @returns {number} the rounded value.
 */
function round(value, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Sum the day P&L and its denominator over the resolved positions.
 * @param {ReadonlyArray<{qty: number, baseline: number, price: number}>} weighted - the resolved positions.
 * @returns {{pnlYk: number, pnlPct: number}} the day P&L and its percent.
 */
function summarize(weighted) {
  let pnlYk = 0
  let base = 0
  for (const row of weighted) {
    pnlYk += (row.price - row.baseline) * row.qty
    base += row.baseline * row.qty
  }
  return { pnlYk, pnlPct: base > 0 ? (pnlYk / base) * 100 : 0 }
}

/**
 * Today's `HHMM` minute key as epoch milliseconds, so the chart carries real timestamps.
 * @param {Date} now - the current time.
 * @param {string} hhmm - the minute key.
 * @returns {number} epoch milliseconds.
 */
function minuteTimestamp(now, hhmm) {
  const hours = Number(hhmm.slice(0, 2))
  const minutes = Number(hhmm.slice(2, 4))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return now.getTime()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes).getTime()
}

/**
 * Fetch one code's intraday minute series as `HHMM -> price`.
 * @param {string} id - the quote-feed security id.
 * @param {Function} fetchImpl - the executor.
 * @returns {Promise<Map<string, number> | undefined>} the series, or undefined when the feed answered nothing.
 */
async function fetchMinutes(id, fetchImpl) {
  const series = new Map()
  try {
    const response = await fetchImpl(`${MINUTE_URL}${id}`, { signal: AbortSignal.timeout(MINUTE_TIMEOUT_MS) })
    if (!response.ok) return undefined
    const body = await response.json()
    const rows = body.data?.[id]?.data?.data
    if (!Array.isArray(rows)) return undefined
    for (const row of rows) {
      if (typeof row !== 'string') continue
      const [hhmm, price] = row.split(' ')
      const value = Number(price)
      if (hhmm === undefined || hhmm.length !== 4 || !Number.isFinite(value) || value <= 0) continue
      series.set(hhmm, value)
    }
  } catch {
    return undefined
  }
  return series.size > 0 ? series : undefined
}

/**
 * Build the intraday P&L percent series for the whole account, cached for
 * `minuteRefreshMs`: one minute request per holding is too many to repeat on
 * every poll.
 * @param {object} snapshot - the position snapshot.
 * @param {Map<string, {name: string, price: number, prevClose: number}>} quotes - the decoded quotes.
 * @param {Function} fetchImpl - the executor.
 * @param {number} minuteRefreshMs - the cache window.
 * @param {Date} now - the current time.
 * @returns {Promise<ReadonlyArray<{t: number, v: number}>>} the chart points.
 */
async function buildChart(snapshot, quotes, fetchImpl, minuteRefreshMs, now) {
  // The cached series belongs to one set of quantities and costs: an edited
  // holding is a different account, not a stale answer.
  const signature = `${snapshot.exported_at ?? ''}|${snapshot.updated_at ?? ''}`
    + `|${snapshot.positions.map(position => `${position.code}:${String(position.qty)}:${String(position.cost)}`).join(',')}`
  if (chartCache !== undefined && chartCache.signature === signature && now.getTime() - chartCache.at < minuteRefreshMs) {
    return chartCache.points
  }
  const series = await Promise.all(snapshot.positions.map(async position => {
    const quote = quotes.get(secid(position.code))
    if (quote === undefined) return undefined
    const minutes = await fetchMinutes(secid(position.code), fetchImpl)
    if (minutes === undefined) return undefined
    return { position, baseline: quote.prevClose, minutes }
  }))

  const maintained = series.filter(entry => entry !== undefined)
  if (maintained.length === 0) return []

  // Forward-fill each code over the union of minute keys: a code that has not
  // traded yet holds its last price instead of dropping out of the curve.
  const keys = [...new Set(maintained.flatMap(entry => [...entry.minutes.keys()]))].sort()
  const last = new Map()
  const points = []
  for (const key of keys) {
    let pnlYk = 0
    let base = 0
    for (const entry of maintained) {
      const price = entry.minutes.get(key)
      if (price !== undefined) last.set(entry.position.code, price)
      const carried = last.get(entry.position.code)
      if (carried === undefined) continue
      pnlYk += (carried - entry.baseline) * entry.position.qty
      base += entry.baseline * entry.position.qty
    }
    if (base <= 0) continue
    points.push({ t: minuteTimestamp(now, key), v: (pnlYk / base) * 100 })
  }
  chartCache = { signature, at: now.getTime(), points }
  return points
}

/**
 * Compute the route snapshot from the exported positions and the live quote
 * feed.
 * @param {object} input - the snapshot path, cache window, and test seams.
 * @param {string} input.positionsFile - absolute path of the exported position snapshot.
 * @param {number} [input.minuteRefreshMs] - how long one intraday series stays cached, ms.
 * @param {string} [input.quoteUrl] - quote-feed endpoint override.
 * @param {Function} [input.fetchImpl] - executor override for tests.
 * @param {Function} [input.now] - clock override for tests.
 * @returns {Promise<object | undefined>} the snapshot, or undefined when no exported position file is readable.
 */
export async function collectLocalStats(input) {
  const snapshot = await readPositionSnapshot(input.positionsFile)
  if (snapshot === undefined) return undefined

  const fetchImpl = input.fetchImpl ?? ((url, init) => fetch(url, init))
  const now = (input.now ?? (() => new Date()))()
  const ids = [...new Set([...snapshot.positions.map(position => secid(position.code)), INDEX_SECID])]
  const quotes = await fetchQuotes(ids, fetchImpl, DEFAULT_TIMEOUT_MS, input.quoteUrl ?? QUOTE_URL)

  const weighted = []
  const missing = []
  for (const position of snapshot.positions) {
    const quote = quotes.get(secid(position.code))
    if (quote === undefined) {
      missing.push(position.name === '' ? position.code : position.name)
      continue
    }
    weighted.push({ qty: position.qty, baseline: quote.prevClose, price: quote.price })
  }
  if (weighted.length === 0) {
    return {
      pnl_pct: 0, pnl_yk: 0, sh_pct: 0, chart_data: [], updated_at: now.toISOString(),
      error: `行情获取失败（${missing.length} 只持仓无报价）`, token_expired: false,
    }
  }

  const { pnlYk, pnlPct } = summarize(weighted)
  const index = quotes.get(INDEX_SECID)
  const shPct = index === undefined ? 0 : Math.round(((index.price - index.prevClose) / index.prevClose) * 10000) / 100
  const chart = await buildChart(snapshot, quotes, fetchImpl, input.minuteRefreshMs ?? DEFAULT_MINUTE_REFRESH_MS, now)

  return {
    pnl_pct: Math.round(pnlPct * 10000) / 10000,
    pnl_yk: Math.round(pnlYk * 100) / 100,
    sh_pct: shPct,
    chart_data: chart,
    updated_at: now.toISOString(),
    error: missing.length === 0 ? '' : `无报价: ${missing.join('、')}`,
    token_expired: false,
  }
}
