#!/usr/bin/env node
/**
 * 交易日历的纯计算。
 *
 * 只跳过周末，不查法定节假日：长假前后由使用者自己核对交易所通知。这样
 * 没有需要每月刷新的数据文件，也就不存在「日历过期但仍显示已核验」的问题。
 */

const DAY_MS = 86_400_000
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/**
 * 从 YYYY-MM-DD 加减天数。
 * @param {string} iso - 起始日期。
 * @param {number} days - 要加的天数，可为负。
 * @returns {string} 结果日期。
 */
export function addDays(iso, days) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * 星期中文名。
 * @param {string} iso - YYYY-MM-DD。
 * @returns {string} 例如 `周三`。
 */
export function weekdayOf(iso) {
  return WEEKDAY_LABELS[new Date(`${iso}T00:00:00Z`).getUTCDay()]
}

/**
 * 是否周末。
 * @param {string} iso - YYYY-MM-DD。
 * @returns {boolean} 周六或周日为 true。
 */
export function isWeekend(iso) {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return weekday === 0 || weekday === 6
}

/**
 * 基准日之后的下一个（或几个）交易日。
 * @param {string} fromIso - 基准日，YYYY-MM-DD；结果从它的次日开始。
 * @param {number} count - 要几个交易日。
 * @returns {Array<{date: string, weekday: string}>} 升序的交易日。
 */
export function nextTradingDays(fromIso, count) {
  const next = []
  for (let offset = 1; next.length < count && offset < 40; offset++) {
    const date = addDays(fromIso, offset)
    if (isWeekend(date)) continue
    next.push({ date, weekday: weekdayOf(date) })
  }
  return next
}

/**
 * 当前处于交易的哪个时段。
 * @param {string} nowIso - Asia/Shanghai 时间，至少到分钟，例如 `2026-10-21T09:20`。
 * @returns {string} 盘前 / 集合竞价 / 盘中 / 收盘后；时间无法解析时为「未知」。
 */
export function sessionPhase(nowIso) {
  const time = nowIso.length >= 16 ? nowIso.slice(11, 16) : ''
  if (!/^\d{2}:\d{2}$/.test(time)) return '未知'
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  if (minutes < 9 * 60 + 15) return '盘前（9:15 前）'
  if (minutes < 9 * 60 + 25) return '集合竞价（9:15–9:25）'
  if (minutes < 15 * 60) return '盘中（9:25–15:00）'
  return '收盘后（15:00 后）'
}
