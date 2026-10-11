/**
 * The editable holdings behind the management view: read the exported snapshot
 * as priced rows, validate what the page sends back, and write it to the same
 * file the local quote source reads. The write preserves every other field of
 * the snapshot (the xlsx export's `exported_at`, `export_date`, and
 * `source_file`) so switching between the export flow and hand edits never
 * loses the provenance of the data.
 * @module dsh-ths-holdings/positions
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { normalizePositionSnapshot, pricePositions } from './local.js'

/** Most holdings one save may carry, so a runaway request cannot rewrite the file unbounded. */
export const MAX_POSITIONS = 500
/** Longest accepted display name. */
export const MAX_NAME_LENGTH = 40
/** The security-code form every row must have: six digits. */
const CODE_PATTERN = /^\d{6}$/
/** Most decimal places kept for a quantity; A-share lots are whole shares, funds may not be. */
const QTY_DECIMALS = 4
/** Most decimal places kept for a unit cost. */
const COST_DECIMALS = 4

/**
 * Parse and validate the rows of one save request.
 *
 * Every row is reported, not just the first: the page marks each rejected
 * field, so a person repairing a list needs all of them at once.
 * @param {unknown} body - the parsed request body.
 * @returns {{entries: ReadonlyArray<object>, errors: ReadonlyArray<object>}} the accepted rows (empty when any error was found) and every error.
 */
export function parsePositionEntries(body) {
  const errors = []
  if (typeof body !== 'object' || body === null || !Array.isArray(body.positions)) {
    return { entries: [], errors: [{ index: -1, field: 'positions', message: '请求体需要一个 positions 数组' }] }
  }
  const rows = body.positions
  if (rows.length > MAX_POSITIONS) {
    return { entries: [], errors: [{ index: -1, field: 'positions', message: `最多 ${String(MAX_POSITIONS)} 条持仓` }] }
  }

  const entries = []
  const seen = new Set()
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    if (typeof row !== 'object' || row === null) {
      errors.push({ index, field: 'row', message: '每行必须是一个对象' })
      continue
    }
    const code = typeof row.code === 'string' ? row.code.trim() : ''
    if (!CODE_PATTERN.test(code)) {
      errors.push({ index, field: 'code', message: '代码必须是 6 位数字' })
    } else if (seen.has(code)) {
      errors.push({ index, field: 'code', message: '代码重复' })
    }
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    if (name.length > MAX_NAME_LENGTH) {
      errors.push({ index, field: 'name', message: `名称最多 ${String(MAX_NAME_LENGTH)} 个字符` })
    }
    const qty = typeof row.qty === 'number' ? row.qty : Number.NaN
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push({ index, field: 'qty', message: '数量必须是大于 0 的数字' })
    }
    const cost = typeof row.cost === 'number' ? row.cost : Number.NaN
    if (!Number.isFinite(cost) || cost < 0) {
      errors.push({ index, field: 'cost', message: '成本必须是不小于 0 的数字' })
    }
    if (errors.some(error => error.index === index)) continue
    seen.add(code)
    entries.push({
      code,
      name,
      qty: roundTo(qty, QTY_DECIMALS),
      cost: roundTo(cost, COST_DECIMALS),
    })
  }
  return { entries: errors.length === 0 ? entries : [], errors }
}

/**
 * Read the snapshot file into the management view.
 *
 * A file that is absent or holds no parseable snapshot answers an empty list
 * rather than a failure: this page is also the way to create the first holding
 * on a machine that never ran the xlsx export.
 * @param {object} input - the file path, ledger state, and test seams.
 * @param {string} input.file - absolute path of the snapshot file.
 * @param {boolean} input.cookieConfigured - true when a ledger Cookie is stored.
 * @param {string} [input.quoteUrl] - quote-feed endpoint override (tests point at a scripted server).
 * @param {Function} [input.fetchImpl] - executor override for tests.
 * @returns {Promise<object>} the priced view, with `unreadable` set when the file exists but cannot be parsed.
 */
export async function readPositionsView(input) {
  const { document, exists } = await readSnapshotDocument(input.file)
  const snapshot = document === undefined ? undefined : normalizePositionSnapshot(document)
  const positions = snapshot?.positions ?? []
  const priced = await pricePositions({
    positions,
    ...(input.quoteUrl !== undefined ? { quoteUrl: input.quoteUrl } : {}),
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
  })
  return {
    file: input.file,
    ...(snapshot?.exported_at !== undefined ? { exported_at: snapshot.exported_at } : {}),
    ...(snapshot?.export_date !== undefined ? { export_date: snapshot.export_date } : {}),
    ...(snapshot?.updated_at !== undefined ? { updated_at: snapshot.updated_at } : {}),
    cookie_configured: input.cookieConfigured,
    skipped: snapshot?.skipped ?? 0,
    positions: priced.rows,
    quotes_error: priced.missing.length === 0 ? '' : `无报价: ${priced.missing.join('、')}`,
    ...(exists && document === undefined ? { unreadable: `${input.file} 不是持仓快照 JSON` } : {}),
  }
}

/**
 * Validate one save request and rewrite the snapshot file.
 *
 * Nothing is written unless every row passes: a partial write would leave the
 * card pricing a list the person never submitted.
 * @param {object} input - the file path, request body, ledger state, and test seams.
 * @param {string} input.file - absolute path of the snapshot file to rewrite.
 * @param {unknown} input.body - the request body as received.
 * @param {boolean} input.cookieConfigured - true when a ledger Cookie is stored.
 * @param {string} [input.quoteUrl] - quote-feed endpoint override.
 * @param {Function} [input.fetchImpl] - executor override for tests.
 * @returns {Promise<{ok: boolean, errors: ReadonlyArray<object>, view?: object}>} the stored view, or the rejected fields with nothing written.
 */
export async function savePositions(input) {
  const { entries, errors } = parsePositionEntries(input.body)
  if (errors.length > 0) return { ok: false, errors }

  const { document, exists } = await readSnapshotDocument(input.file)
  if (document === undefined && exists) {
    return { ok: false, errors: [{ index: -1, field: 'file', message: `${input.file} 无法解析为 JSON，请先修复或删除该文件` }] }
  }

  const next = { ...(document ?? {}), positions: entries.map(toStoredRow) }
  next.updated_at = new Date().toISOString()
  await writeSnapshotDocument(input.file, next)

  return {
    ok: true,
    errors: [],
    view: await readPositionsView({
      file: input.file,
      cookieConfigured: input.cookieConfigured,
      ...(input.quoteUrl !== undefined ? { quoteUrl: input.quoteUrl } : {}),
      ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
    }),
  }
}

/**
 * One stored row: the file's own field order.
 * @param {object} entry - the accepted row.
 * @returns {object} the row as the snapshot file stores it.
 */
function toStoredRow(entry) {
  return { code: entry.code, name: entry.name, qty: entry.qty, cost: entry.cost }
}

/**
 * Read the snapshot document, keeping every field the parser does not model so
 * a save writes them back untouched.
 * @param {string} file - absolute path of the snapshot file.
 * @returns {Promise<{document: object | undefined, exists: boolean}>} the parsed object (or undefined when unreadable) and whether anything exists at the path.
 */
async function readSnapshotDocument(file) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return { document: undefined, exists: await pathExists(file) }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { document: undefined, exists: true }
  }
  return {
    document: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : undefined,
    exists: true,
  }
}

/**
 * Whether a path exists at all, so an unparseable file is told apart from an absent one.
 * @param {string} file - the path to test.
 * @returns {Promise<boolean>} whether anything exists there.
 */
async function pathExists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

/**
 * Replace the snapshot file atomically, so a poll never reads a half-written list.
 * @param {string} file - the snapshot path.
 * @param {object} document - the document to write.
 * @returns {Promise<void>} resolution once the rename committed.
 */
async function writeSnapshotDocument(file, document) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${String(process.pid)}.tmp`
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  await rename(temporary, file)
}

/**
 * Round to `decimals` places, so a stored quantity is what the page showed.
 * @param {number} value - the value to round.
 * @param {number} decimals - decimal places.
 * @returns {number} the rounded value.
 */
function roundTo(value, decimals) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
