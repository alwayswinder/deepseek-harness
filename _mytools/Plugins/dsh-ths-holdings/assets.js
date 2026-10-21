/**
 * The machine-local total-assets setting.
 *
 * The holdings snapshot only knows what is invested, so "available cash" cannot
 * be derived from it: a person has to state the account's total assets once.
 * That number is personal data, so it lives beside the chosen holdings path in
 * `$DSH_HOME/ths-holdings.assets.json`, never in the package and never inside
 * the snapshot the xlsx export rewrites.
 *
 * Available cash is the difference between that total and the priced holdings;
 * when nothing is invested it is the whole account. The value is reported as
 * `null` (not zero) when the setting is absent, so a page can tell "not set"
 * from "no cash left".
 * @module dsh-ths-holdings/assets
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** The machine-local file under `$DSH_HOME` that remembers the total assets. */
export const ASSETS_FILE = 'ths-holdings.assets.json'

/** Largest accepted total: one trillion yuan, far above any retail account. */
export const MAX_TOTAL_ASSETS = 1_000_000_000_000

/**
 * Read the total assets this machine remembers.
 * @param {string} assetsPath - the assets file under the harness home.
 * @returns {number | null} the positive total, or null when unset or unusable.
 */
export function readTotalAssets(assetsPath) {
  let raw
  try {
    raw = readFileSync(assetsPath, 'utf8')
  } catch {
    return null
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  return positiveAmount(parsed.totalAssets)
}

/**
 * Check one value the page sent before it is stored.
 *
 * `null` and an empty string both mean "forget this setting": the page offers a
 * clear control, and an empty input is the same intent.
 * @param {unknown} raw - the request body's totalAssets field.
 * @returns {{ok: true, value: number | null} | {ok: false, message: string}} the stored value, or why it was refused.
 */
export function parseTotalAssetsInput(raw) {
  if (raw === null || raw === '') return { ok: true, value: null }
  const value = typeof raw === 'number' ? raw : Number.NaN
  if (!Number.isFinite(value)) return { ok: false, message: 'totalAssets 需要数字，或 null 表示清除' }
  if (!(value > 0)) return { ok: false, message: '总资产需要大于 0' }
  if (value > MAX_TOTAL_ASSETS) return { ok: false, message: `总资产不能超过 ${MAX_TOTAL_ASSETS.toLocaleString('en-US')} 元` }
  return { ok: true, value: Math.round(value * 100) / 100 }
}

/**
 * Remember one total for this machine.
 * @param {string} assetsPath - the assets file under the harness home.
 * @param {number} value - the positive total to store.
 * @returns {void}
 */
export function writeTotalAssets(assetsPath, value) {
  mkdirSync(dirname(assetsPath), { recursive: true })
  const temporary = `${assetsPath}.${String(process.pid)}.tmp`
  const document = { totalAssets: value, updatedAt: new Date().toISOString() }
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  renameSync(temporary, assetsPath)
}

/**
 * Forget this machine's total, returning to "unknown".
 * @param {string} assetsPath - the assets file under the harness home.
 * @returns {void}
 */
export function clearTotalAssets(assetsPath) {
  rmSync(assetsPath, { force: true })
}

/**
 * Derive the account figures the page and the API report.
 *
 * Holdings are summed from the rows that carry a price; a row without a quote
 * is left out of the market value and therefore counted as cash, which is the
 * reading that never overstates what is invested.
 * @param {ReadonlyArray<object>} positions - priced rows from the snapshot view.
 * @param {number | null} totalAssets - the machine total, or null when unset.
 * @returns {{total_assets: number | null, holdings_value: number, cash: number | null, cash_pct: number | null}} the account figures.
 */
export function computePortfolioAssets(positions, totalAssets) {
  const holdingsValue = round2(positions.reduce((sum, row) => {
    const value = typeof row.market_value === 'number' && Number.isFinite(row.market_value) ? row.market_value : 0
    return sum + value
  }, 0))
  if (totalAssets === null || totalAssets === undefined) {
    return { total_assets: null, holdings_value: holdingsValue, cash: null, cash_pct: null }
  }
  const cash = round2(totalAssets - holdingsValue)
  return {
    total_assets: totalAssets,
    holdings_value: holdingsValue,
    cash,
    cash_pct: totalAssets > 0 ? round2((cash / totalAssets) * 100) : null,
  }
}

function positiveAmount(value) {
  const parsed = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function round2(value) {
  return Math.round(value * 100) / 100
}
