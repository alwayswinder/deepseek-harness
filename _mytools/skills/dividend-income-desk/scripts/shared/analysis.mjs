#!/usr/bin/env node
/**
 * 收息数据的纯计算：分红汇总、股息率与目标价、提醒标记、组合权重。
 *
 * 这里不读写文件、不联网：输入是已经取好的记录，输出直接进报告，也可以
 * 在 tests 里用固定数据验证。
 */

const DAY_MS = 86_400_000

/**
 * 两个 YYYY-MM-DD 之间相差的天数（后者减前者）。
 * @param {string} fromIso - 起始日期。
 * @param {string} toIso - 结束日期。
 * @returns {number | null} 天数；任一侧不是有效日期时为 null。
 */
export function daysBetween(fromIso, toIso) {
  const from = Date.parse(`${fromIso}T00:00:00Z`)
  const to = Date.parse(`${toIso}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.round((to - from) / DAY_MS)
}

/**
 * 按报告期汇总股票分红，并给出股息率、派息率、目标价与分红趋势。
 *
 * 「最近一个完整年度」按 REPORT_DATE 的年份汇总该年度所有已实施分配（中期 +
 * 季度 + 年度），而不是只看年度那一笔；年度利润取同年 12-31 的 EPS。
 * 标了 `supplemental` 的记录来自公告补录（分红表缺条），没有可靠报告期，只进
 * TTM，不进年度汇总与分红趋势。
 * @param {ReadonlyArray<object>} rows - 东财分红记录：reportDate / perShare / exDate / progress / plan / supplemental。
 * @param {ReadonlyArray<object>} performance - 业绩记录：reportDate / eps。
 * @param {number} price - 现价，用于现价股息率与目标价。
 * @param {number} cost - 持仓成本，用于成本股息率。
 * @param {number} targetYieldPct - 目标股息率（%）。
 * @param {string} todayIso - 今天，YYYY-MM-DD。
 * @returns {object | null} 汇总结论；没有分红记录时为 null。
 */
export function summarizeStockDividends(rows, performance, price, cost, targetYieldPct, todayIso) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const implemented = rows.filter(row => row.perShare !== null && row.exDate !== null && /实施/.test(row.progress ?? ''))
  // 补录记录来自公告而非分红表，没有可靠报告期：只进 TTM，不进年度汇总，
  // 否则一次特别分红会把经常性股息率算高。
  const scheduled = implemented.filter(row => row.supplemental !== true)

  const ttm = implemented
    .filter(row => withinDays(row.exDate, todayIso, -365, 0))
    .reduce((sum, row) => sum + row.perShare, 0)

  const years = new Map()
  for (const row of scheduled) {
    const year = Number(row.reportDate.slice(0, 4))
    if (!Number.isFinite(year)) continue
    years.set(year, (years.get(year) ?? 0) + row.perShare)
  }
  const annualYears = rows
    .filter(row => typeof row.reportDate === 'string' && row.reportDate.endsWith('12-31'))
    .map(row => Number(row.reportDate.slice(0, 4)))
    .filter(year => years.has(year))
  const latestYear = annualYears.length > 0 ? Math.max(...annualYears) : null
  const annualDps = latestYear === null ? round4(ttm) : round4(years.get(latestYear))
  const annualYearLabel = latestYear === null ? '近12个月' : `${latestYear}年度`
  const annualEps = Array.isArray(performance)
    ? num(performance.find(item => item.reportDate === `${latestYear}-12-31`)?.eps)
    : null

  const completeYears = annualYears.sort((a, b) => b - a).slice(0, 5)
  const latestAnnual = completeYears.length > 0 ? years.get(completeYears[0]) : null
  const previousAnnual = completeYears.length > 1 ? years.get(completeYears[1]) : null
  const annualTrendPct = latestAnnual !== null && previousAnnual !== null && previousAnnual > 0
    ? round2(((latestAnnual - previousAnnual) / previousAnnual) * 100)
    : null

  const pending = rows
    .filter(row => row.exDate !== null && row.exDate >= todayIso && !/实施/.test(row.progress ?? ''))
    .sort((a, b) => a.exDate.localeCompare(b.exDate))

  return {
    latestYear,
    annualLabel: annualYearLabel,
    annualDps,
    ttmDps: round4(ttm),
    yieldPct: price > 0 ? round2((annualDps / price) * 100) : null,
    costYieldPct: cost > 0 ? round2((annualDps / cost) * 100) : null,
    ttmYieldPct: price > 0 ? round2((ttm / price) * 100) : null,
    payoutPct: annualEps !== null && annualEps > 0 ? round2((annualDps / annualEps) * 100) : null,
    annualTrendPct,
    dividendYears: completeYears.length,
    targetPrice: targetYieldPct > 0 ? round2(annualDps / (targetYieldPct / 100)) : null,
    targetYieldPct,
    nextPlan: pending.length > 0
      ? { exDate: pending[0].exDate, plan: pending[0].plan, perShare: pending[0].perShare }
      : null,
    recent: scheduled.slice(0, 4).map(row => ({
      period: row.reportDate.slice(0, 7),
      perShare: round4(row.perShare),
      exDate: row.exDate,
      plan: row.plan,
    })),
    supplemental: rows
      .filter(row => row.supplemental === true)
      .map(row => ({
        perShare: round4(row.perShare),
        exDate: row.exDate,
        plan: row.plan,
        title: row.title ?? null,
      })),
  }
}

/**
 * 判断公告标题是不是「分派实施」类公告。
 *
 * 只认已经实施的分配：预案、董事会/股东会决议、法律意见、回购与增减持都不算，
 * 「调整每股分红金额」这类修订公告也不是实施本身。
 * @param {string} title - 公告标题。
 * @returns {boolean} 是分派实施公告时为 true。
 */
export function isDistributionNotice(title) {
  if (typeof title !== 'string' || title.length === 0) return false
  if (!/(权益分派|利润分配|分红|分派|派息)/.test(title)) return false
  if (!title.includes('实施')) return false
  return !/(回购|增持|减持|预案|法律意见|说明会|调研|投资者|更正|调整|修订|决议)/.test(title)
}

/**
 * 找出「公告说已实施分派、分红表里却没有对应记录」的缺口。
 *
 * 东方财富的 RPT_SHAREBONUS_DET 只收录定期报告的分红，特别分红这类临时分派
 * 可能整条缺失，导致 TTM 与年度分红都偏低。这里按公告日期匹配已实施记录的
 * 除息日（0～60 天后）或公告日（±10 天），两条都不沾才算缺口。
 * @param {ReadonlyArray<object>} dividends - 分红记录：perShare / exDate / noticeDate。
 * @param {ReadonlyArray<object>} announcements - 公告：title / date / artCode / url。
 * @returns {ReadonlyArray<object>} 缺口公告，按公告日期升序。
 */
export function findDividendGaps(dividends, announcements) {
  if (!Array.isArray(announcements) || announcements.length === 0) return []
  const records = Array.isArray(dividends) ? dividends : []
  const gaps = []
  for (const item of announcements) {
    if (item === null || item === undefined) continue
    const title = String(item.title ?? '')
    if (!isDistributionNotice(title)) continue
    const date = String(item.date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const matched = records.some(record => {
      if (record === null || record === undefined) return false
      const byExDate = typeof record.exDate === 'string'
        && withinDays(date, record.exDate, 0, 60)
      const byNoticeDate = typeof record.noticeDate === 'string'
        && Math.abs(daysBetween(date, record.noticeDate) ?? Number.POSITIVE_INFINITY) <= 10
      return byExDate || byNoticeDate
    })
    if (!matched) gaps.push({ title, date, artCode: item.artCode ?? null, url: item.url ?? null })
  }
  return gaps.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 从分派实施公告正文里取每 10 股派现金额与除权除息日。
 *
 * 正文里通常先出现方案金额，后出现扣税后的金额；这里取第一处「每 10 股派」，
 * 遇到只有「10 派 X 元」写法时退回该写法。
 * @param {string} text - 公告正文（已剥 HTML）。
 * @returns {{ perShare: number, exDate: string | null } | null} 解析结果；取不到每股金额时为 null。
 */
export function parseDividendNotice(text) {
  if (typeof text !== 'string' || text.length === 0) return null
  const flat = text.replace(/\s+/g, ' ')
  const perTen = flat.match(/每\s*10\s*股\s*(?:派发?|派息|派送)?(?:现金红利|现金)?\s*([\d.]+)\s*元/)
    ?? flat.match(/10\s*股\s*派\s*([\d.]+)\s*元/)
    ?? flat.match(/10\s*派\s*([\d.]+)\s*元/)
  const perShare = perTen === null ? null : round4(Number(perTen[1]) / 10)
  if (perShare === null || !Number.isFinite(perShare) || perShare <= 0) return null
  const ex = flat.match(/除(?:权除息|息)日为?\s*[:：]?\s*(\d{4})\s*[年\-/]\s*(\d{1,2})\s*[月\-/]\s*(\d{1,2})\s*日?/)
  const exDate = ex === null
    ? null
    : `${ex[1]}-${String(ex[2]).padStart(2, '0')}-${String(ex[3]).padStart(2, '0')}`
  return { perShare, exDate }
}

/**
 * 汇总场内基金分红。
 *
 * 基金的分红节奏和股票不同（可能按月分，也可能几年不分），所以现价股息率与
 * 目标价用**最近一个完整年度**已除息的分红；该年度还没有分配记录时退回**近
 * 12 个月**。分红趋势只比较两个完整年度，避免拿未过完的当年去比上一年整年。
 * @param {ReadonlyArray<object>} records - 基金分红：year / exDate / perShare。
 * @param {number} price - 现价。
 * @param {number} cost - 持仓成本。
 * @param {number} targetYieldPct - 目标股息率（%）。
 * @param {string} todayIso - 今天，YYYY-MM-DD。
 * @returns {object} 汇总结论；没有记录时年化数字全为 0。
 */
export function summarizeFundDividend(records, price, cost, targetYieldPct, todayIso) {
  const empty = {
    latestYear: null,
    annualLabel: '无分红记录',
    annualDps: 0,
    ttmDps: 0,
    yieldPct: 0,
    costYieldPct: 0,
    ttmYieldPct: 0,
    payoutPct: null,
    annualTrendPct: null,
    dividendYears: 0,
    targetPrice: null,
    targetYieldPct,
    recent: [],
    nextPlan: null,
  }
  if (!Array.isArray(records) || records.length === 0) return empty

  const byYear = new Map()
  for (const record of records) byYear.set(record.year, (byYear.get(record.year) ?? 0) + record.perShare)
  const years = [...byYear.keys()].sort((a, b) => b - a)
  const ttm = round4(records
    .filter(record => {
      const days = daysBetween(todayIso, record.exDate)
      return days !== null && days <= 0 && days >= -365
    })
    .reduce((sum, record) => sum + record.perShare, 0))

  const thisYear = Number(todayIso.slice(0, 4))
  const completeYears = years.filter(year => year < thisYear)
  const latestComplete = completeYears[0] ?? null
  const previous = completeYears[1] ?? null
  const annualTrendPct = latestComplete !== null && previous !== null && (byYear.get(previous) ?? 0) > 0
    ? round2((((byYear.get(latestComplete) ?? 0) - byYear.get(previous)) / byYear.get(previous)) * 100)
    : null
  const annualDps = latestComplete === null ? ttm : round4(byYear.get(latestComplete))
  const annualLabel = latestComplete === null ? '近12个月' : `${latestComplete}年`

  return {
    latestYear: latestComplete,
    annualLabel,
    annualDps,
    ttmDps: ttm,
    yieldPct: price > 0 ? round2((annualDps / price) * 100) : null,
    costYieldPct: cost > 0 ? round2((annualDps / cost) * 100) : null,
    ttmYieldPct: price > 0 ? round2((ttm / price) * 100) : null,
    payoutPct: null,
    annualTrendPct,
    dividendYears: years.length,
    targetPrice: targetYieldPct > 0 && annualDps > 0 ? round2(annualDps / (targetYieldPct / 100)) : null,
    targetYieldPct,
    recent: records.slice(0, 4).map(record => ({
      period: record.exDate.slice(0, 7),
      perShare: record.perShare,
      exDate: record.exDate,
      plan: `每10份派现金 ${round4(record.perShare * 10)} 元`,
    })),
    nextPlan: null,
  }
}

/**
 * 判断天天基金分红页是否属于该基金、以及是否确认无分红。
 *
 * 东财会把别的基金的分红区块串进页面（实测 561580 的页面里出现过 159824 的
 * 「暂无分红」）。串页时若照字面按「暂无分红」处理，一个正常分红的基金会被
 * 静默算成 0% 股息率，所以归属判断单独拆出来。
 * @param {string} html - 分红页正文。
 * @param {string} code - 请求的基金代码。
 * @returns {'records'|'empty'|'foreign-page'|'foreign-block'} `records` 可解析分红表；`empty` 确认本基金无分红；`foreign-*` 页面不可信，调用方应按取数失败处理。
 */
export function classifyFundDividendPage(html, code) {
  const title = html.match(/<title>[^<]*?\((\d{6})\)[^<]*?<\/title>/)
  if (title === null || title[1] !== code) return 'foreign-page'
  const label = html.match(/<label class="left">\d{4}年度\s*<a href='[^']*?\/(\d+)\.html'>[^<]*<\/a>\s*暂无分红<\/label>/)
  if (label === null) return 'records'
  return label[1] === code ? 'empty' : 'foreign-block'
}

/**
 * 按行业汇总权重，降序返回，供组合集中度检查。
 * @param {ReadonlyArray<object>} rows - 已经算过 weightPct 与 sector 的标的。
 * @returns {Array<{name: string, weightPct: number}>} 各行业权重（%）。
 */
export function sectorWeights(rows) {
  const bySector = new Map()
  for (const row of rows) {
    const name = row.sector ?? '未分类'
    bySector.set(name, (bySector.get(name) ?? 0) + row.weightPct)
  }
  return [...bySector.entries()]
    .map(([name, weightPct]) => ({ name, weightPct: round2(weightPct) }))
    .sort((a, b) => b.weightPct - a.weightPct)
}

/**
 * 算权重并给每只标的打提醒。
 *
 * 权重必须在这里算完，提醒才能读到它：超上限的提醒依赖 weightPct，调用方
 * 不要自己先算一遍再传进来。
 * @param {object[]} rows - 已取好行情的标的。
 * @param {object} config - 阈值与 overrides。
 * @param {number | null} totalAssets - 账户总资产；null 表示未设置。
 * @param {string} todayIso - 今天，YYYY-MM-DD。
 * @returns {{holdingsValue: number, weightBase: string}} 持仓市值与权重口径。
 */
export function finalizeRows(rows, config, totalAssets, todayIso) {
  const holdingsValue = round2(rows.reduce((sum, row) => sum + row.value, 0))
  const weightBase = totalAssets === null ? holdingsValue : totalAssets
  for (const row of rows) row.weightPct = weightBase > 0 ? (row.value / weightBase) * 100 : 0
  for (const row of rows) attachFlags(row, config, todayIso)
  return { holdingsValue, weightBase: totalAssets === null ? '持仓市值' : '总资产' }
}

/**
 * 按阈值给一只标的加提醒。
 * @param {object} row - 单只标的的行情、分红、财报与权重。
 * @param {object} settings - config.json 的阈值。
 * @param {string} todayIso - 今天，YYYY-MM-DD。
 * @returns {void}
 */
export function attachFlags(row, settings, todayIso) {
  const flags = row.flags
  const repair = row.repair === true
  if (repair) flags.push('价值修复类，按退出条件判断')
  if (row.pct !== null && row.pct !== undefined && row.pct <= -4) flags.push(`今日大跌 ${row.pct.toFixed(2)}%`)
  if (row.pct !== null && row.pct !== undefined && row.pct >= 4) flags.push(`今日大涨 +${row.pct.toFixed(2)}%`)
  if (row.performance?.netProfitYoY !== null && row.performance?.netProfitYoY !== undefined && row.performance.netProfitYoY <= -10) {
    flags.push(`净利同比 ${row.performance.netProfitYoY.toFixed(1)}%`)
  }
  if (row.dividend?.payoutPct !== null && row.dividend?.payoutPct !== undefined && row.dividend.payoutPct >= 90) {
    flags.push(`派息率 ${row.dividend.payoutPct.toFixed(0)}%`)
  }
  // 不分红的基金本来就不该用收息阈值衡量；修复类持仓同理。
  const noDistribution = row.kind === 'ETF' && (row.dividend?.dividendYears ?? 0) === 0
  if (!repair && !noDistribution
    && row.dividend?.yieldPct !== null && row.dividend?.yieldPct !== undefined
    && row.dividend.yieldPct < settings.trimYieldPct) {
    flags.push(`股息率低于 ${settings.trimYieldPct}%`)
  }
  if (row.dividend?.annualTrendPct !== null && row.dividend?.annualTrendPct !== undefined && row.dividend.annualTrendPct <= -10) {
    flags.push(`分红同比 ${row.dividend.annualTrendPct.toFixed(1)}%`)
  }
  if (!repair
    && row.dividend?.targetPrice !== null && row.dividend?.targetPrice !== undefined
    && row.price > 0 && row.price <= row.dividend.targetPrice) {
    row.buyZone = true
  }
  if (row.weightPct > settings.maxSingleWeightPct) {
    flags.push(`权重 ${row.weightPct.toFixed(1)}% 超 ${settings.maxSingleWeightPct}% 上限`)
  }
  if (row.dividend?.nextPlan !== null && row.dividend?.nextPlan !== undefined) {
    const days = daysBetween(todayIso, row.dividend.nextPlan.exDate)
    if (days !== null && days >= 0 && days <= 7) flags.push(`${days} 天后除息`)
  }
}

/**
 * 东财行情里的时间戳（`20261021161459`）转 ISO。
 * @param {string | null | undefined} raw - 接口原值。
 * @returns {string | null} `2026-10-21T16:14:59`，无法解析时为 null。
 */
export function quoteTimeIso(raw) {
  if (typeof raw !== 'string' || !/^\d{14}$/.test(raw)) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`
}

function withinDays(date, todayIso, from, to) {
  const days = daysBetween(todayIso, date)
  if (days === null) return false
  return days >= from && days <= to
}

function num(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function round4(value) {
  return Math.round(value * 10000) / 10000
}
