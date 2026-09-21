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
import type { ChartPoint, Stats } from './types.ts'

/** The batch quote endpoint (GBK-encoded, one `v_<secid>="..."` line per code). */
const QUOTE_URL = 'http://qt.gtimg.cn/q='
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

/** One holding read from the exported snapshot file. */
export interface LocalPosition {
  readonly code: string
  readonly name: string
  readonly qty: number
  /** The export's unit cost, kept for reference; the day baseline is the previous close. */
  readonly cost: number
}

/** The exported snapshot file, as written by `ths-export-positions.py`. */
export interface PositionSnapshot {
  readonly exported_at?: string
  readonly export_date?: string
  readonly positions: readonly LocalPosition[]
}

/** One decoded quote line. */
interface Quote {
  readonly name: string
  readonly price: number
  readonly prevClose: number
}

/** The fetch executor, injectable so tests supply scripted responses. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** The intraday percentile series cache, keyed by the snapshot identity. */
let chartCache: { readonly signature: string; readonly at: number; readonly points: readonly ChartPoint[] } | undefined

/**
 * The quote-feed security id for one ledger code: a leading `sh`, `sz`, or `bj`.
 * @param code - the six-digit code as the ledger exports it.
 * @returns the quote-feed security id.
 */
export function secid(code: string): string {
  if (/^[5689]/.test(code)) return `sh${code}`
  if (/^[0123]/.test(code)) return `sz${code}`
  return `bj${code}`
}

/**
 * Read and validate the exported position snapshot.
 * @param file - absolute path of the snapshot JSON.
 * @returns the snapshot, or undefined when the file is absent, unreadable, or carries no usable position.
 */
export async function readPositionSnapshot(file: string): Promise<PositionSnapshot | undefined> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const candidate = parsed as { exported_at?: unknown; export_date?: unknown; positions?: unknown }
  if (!Array.isArray(candidate.positions)) return undefined
  const positions: LocalPosition[] = []
  for (const item of candidate.positions) {
    if (typeof item !== 'object' || item === null) continue
    const row = item as Record<string, unknown>
    const code = typeof row.code === 'string' ? row.code.trim() : ''
    const qty = typeof row.qty === 'number' ? row.qty : Number.NaN
    const cost = typeof row.cost === 'number' ? row.cost : Number.NaN
    if (code === '' || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost)) continue
    positions.push({
      code,
      name: typeof row.name === 'string' ? row.name : code,
      qty,
      cost,
    })
  }
  if (positions.length === 0) return undefined
  return {
    ...(typeof candidate.exported_at === 'string' ? { exported_at: candidate.exported_at } : {}),
    ...(typeof candidate.export_date === 'string' ? { export_date: candidate.export_date } : {}),
    positions,
  }
}

/** Fetch batch quotes for the given security ids; missing or refused codes are simply absent. */
async function fetchQuotes(ids: readonly string[], fetchImpl: FetchLike, timeoutMs: number): Promise<Map<string, Quote>> {
  const quotes = new Map<string, Quote>()
  for (let start = 0; start < ids.length; start += QUOTE_BATCH) {
    const batch = ids.slice(start, start + QUOTE_BATCH)
    let text: string
    try {
      const response = await fetchImpl(`${QUOTE_URL}${batch.join(',')}`, {
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

/** One position paired with its quote and previous close. */
interface WeightedPosition {
  readonly qty: number
  readonly baseline: number
  readonly price: number
}

/** Sum the day P&L and its denominator over the resolved positions. */
function summarize(weighted: readonly WeightedPosition[]): { pnlYk: number; pnlPct: number } {
  let pnlYk = 0
  let base = 0
  for (const row of weighted) {
    pnlYk += (row.price - row.baseline) * row.qty
    base += row.baseline * row.qty
  }
  return { pnlYk, pnlPct: base > 0 ? (pnlYk / base) * 100 : 0 }
}

/** Today's `HHMM` minute key as epoch milliseconds, so the chart carries real timestamps. */
function minuteTimestamp(now: Date, hhmm: string): number {
  const hours = Number(hhmm.slice(0, 2))
  const minutes = Number(hhmm.slice(2, 4))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return now.getTime()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes).getTime()
}

/** Fetch one code's intraday minute series as `HHMM -> price`. */
async function fetchMinutes(id: string, fetchImpl: FetchLike): Promise<Map<string, number> | undefined> {
  const series = new Map<string, number>()
  try {
    const response = await fetchImpl(`${MINUTE_URL}${id}`, { signal: AbortSignal.timeout(MINUTE_TIMEOUT_MS) })
    if (!response.ok) return undefined
    const body = (await response.json()) as { data?: Record<string, { data?: { data?: unknown } }> }
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
 */
async function buildChart(
  snapshot: PositionSnapshot,
  quotes: Map<string, Quote>,
  fetchImpl: FetchLike,
  minuteRefreshMs: number,
  now: Date,
): Promise<readonly ChartPoint[]> {
  const signature = `${snapshot.exported_at ?? ''}|${snapshot.positions.map(position => position.code).join(',')}`
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

  const maintained = series.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
  if (maintained.length === 0) return []

  // Forward-fill each code over the union of minute keys: a code that has not
  // traded yet holds its last price instead of dropping out of the curve.
  const keys = [...new Set(maintained.flatMap(entry => [...entry.minutes.keys()]))].sort()
  const last = new Map<string, number>()
  const points: ChartPoint[] = []
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

/** Inputs for one local snapshot. */
export interface LocalStatsInput {
  /** Absolute path of the exported position snapshot. */
  readonly positionsFile: string
  /** How long one intraday series stays cached, ms. */
  readonly minuteRefreshMs?: number
  /** Executor override for tests; defaults to the global fetch. */
  readonly fetchImpl?: FetchLike
  /** Clock override for tests; defaults to `new Date()`. */
  readonly now?: () => Date
}

/**
 * Compute the route snapshot from the exported positions and the live quote
 * feed.
 * @param input - the snapshot path, cache window, and test seams.
 * @returns the snapshot, or undefined when no exported position file is readable.
 */
export async function collectLocalStats(input: LocalStatsInput): Promise<Stats | undefined> {
  const snapshot = await readPositionSnapshot(input.positionsFile)
  if (snapshot === undefined) return undefined

  const fetchImpl = input.fetchImpl ?? ((url, init) => fetch(url, init))
  const now = (input.now ?? (() => new Date()))()
  const ids = [...new Set([...snapshot.positions.map(position => secid(position.code)), INDEX_SECID])]
  const quotes = await fetchQuotes(ids, fetchImpl, DEFAULT_TIMEOUT_MS)

  const weighted: WeightedPosition[] = []
  const missing: string[] = []
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
