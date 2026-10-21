#!/usr/bin/env node
/**
 * 收息组合数据汇总。
 *
 * 读取持仓插件（dsh-ths-holdings）当前生效的持仓快照，补上实时行情、
 * 分红记录、最新财报、预约披露日和近期公告，输出一张供决策使用的
 * Markdown 表 + 一份完整 JSON。所有外部数据都来自公开接口，失败的部分
 * 只降级不中断，并在结果里标出来。
 *
 * 用法：
 *   node dividend-dossier.mjs [--file <持仓快照>] [--json] [--no-news] [--out <文件>]
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { finalizeRows, quoteTimeIso, sectorWeights, summarizeFundDividend, summarizeStockDividends } from './shared/analysis.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = dirname(SCRIPT_DIR)
const EM_DATA = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const EM_QUOTE = 'https://push2.eastmoney.com/api/qt/stock/get'
const EM_ANN = 'https://np-anotice-stock.eastmoney.com/api/security/ann'
const QUOTE_URL = 'http://qt.gtimg.cn/q='
const FUND_DIV_PAGE = 'https://fundf10.eastmoney.com/fhsp_'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const DAY_MS = 86_400_000

/** 默认决策阈值；config.json 可覆盖。 */
const DEFAULT_CONFIG = {
  targetYieldPct: 4.5,
  minYieldToBuyPct: 4.0,
  trimYieldPct: 2.5,
  maxSingleWeightPct: 15,
  maxIndustryWeightPct: 35,
  cashReservePct: 10,
  overrides: {},
  repairCodes: [],
}

const args = parseArgs(process.argv.slice(2))
const config = await loadConfig()
const dshHome = resolveDshHome()
const snapshotPath = args.file === undefined ? await resolvePositionsFile(dshHome) : resolve(args.file)
const snapshot = await loadSnapshot(snapshotPath)
const totalAssets = await readTotalAssets(dshHome)

if (snapshot.positions.length === 0) {
  console.error(`持仓快照里没有持仓：${snapshotPath}`)
  process.exit(2)
}

const todayIso = nowShanghaiIso().slice(0, 10)
const quotes = await fetchQuotes(snapshot.positions.map(position => position.code))
const rows = await mapPool(snapshot.positions, 3, position => enrich(position, quotes.byCode.get(position.code), quotes.failure))

const totals = rows.reduce((acc, row) => ({
  value: acc.value + row.value,
  cost: acc.cost + row.qty * row.cost,
}), { value: 0, cost: 0 })
// Weights are shares of the account when its total is known, and shares of the
// invested value otherwise; finalizeRows also attaches the flag that depends on
// the weight, so the two can never drift apart.
const { weightBase } = finalizeRows(rows, config, totalAssets, todayIso)
const sectors = sectorWeights(rows)

const cash = totalAssets === null ? null : round2(totalAssets - totals.value)
const cashPct = totalAssets !== null && totalAssets > 0 ? round2((cash / totalAssets) * 100) : null
const warnings = []
if (cashPct !== null && cashPct < config.cashReservePct) {
  warnings.push(`可用资金 ${cashPct}% 低于计划的 ${config.cashReservePct}%，新增买入前要先留出现金`)
}
if (cash !== null && cash < 0) warnings.push(`可用资金为负 ¥${fmt(Math.abs(cash))}：总资产小于持仓市值`)
const unpriced = rows.filter(row => !Number.isFinite(row.price)).length
if (cash !== null && unpriced > 0) warnings.push(`有 ${unpriced} 只标的没有行情价，未计入持仓市值，可用资金可能偏高`)
if (quotes.latestTime !== null && quotes.latestTime.slice(0, 10) !== todayIso) {
  warnings.push(`行情时间是 ${quotes.latestTime.slice(0, 10)}，不是今天的：本报告按最近一次报价计算`)
}
for (const sector of sectors) {
  if (sector.weightPct > config.maxIndustryWeightPct) {
    warnings.push(`行业集中：${sector.name} ${sector.weightPct}%（上限 ${config.maxIndustryWeightPct}%）`)
  }
}

const report = {
  generatedAt: shanghaiNow(),
  quoteTime: quotes.latestTime,
  dshHome,
  snapshot: {
    file: snapshotPath,
    exportedAt: snapshot.exportedAt,
    updatedAt: snapshot.updatedAt,
    staleDays: snapshot.updatedAt === undefined ? null : daysSince(snapshot.updatedAt),
  },
  totals: {
    value: round2(totals.value),
    cost: round2(totals.cost),
    pnl: round2(totals.value - totals.cost),
    pnlPct: totals.cost > 0 ? round2(((totals.value - totals.cost) / totals.cost) * 100) : null,
    totalAssets,
    cash,
    cashPct,
    weightBase,
  },
  warnings,
  sectors,
  config,
  rows,
}

if (args.json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const markdown = renderMarkdown(report)
  console.log(markdown)
  if (args.out !== undefined) {
    await mkdir(dirname(resolve(args.out)), { recursive: true })
    await writeFile(resolve(args.out), markdown, 'utf8')
  }
}

// ---------------------------------------------------------------- 输入解析

function parseArgs(argv) {
  const parsed = { json: false, news: true, file: undefined, out: undefined }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--json') parsed.json = true
    else if (arg === '--no-news') parsed.news = false
    else if (arg === '--file') parsed.file = argumentValue(argv, ++index, '--file')
    else if (arg === '--out') parsed.out = argumentValue(argv, ++index, '--out')
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node dividend-dossier.mjs [--file <持仓快照>] [--json] [--no-news] [--out <文件>]')
      process.exit(0)
    } else {
      console.error(`未知参数: ${arg}`)
      process.exit(2)
    }
  }
  return parsed
}

function argumentValue(argv, index, flag) {
  const value = argv[index]
  if (value === undefined || value.startsWith('--')) {
    console.error(`${flag} 需要一个值`)
    process.exit(2)
  }
  return value
}

async function loadConfig() {
  let raw
  try {
    raw = await readFile(join(SKILL_DIR, 'config.json'), 'utf8')
  } catch {
    // 这台机器没有 config.json：用脚本里的默认阈值。
    return { ...DEFAULT_CONFIG }
  }
  try {
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      overrides: parsed.overrides ?? {},
      repairCodes: Array.isArray(parsed.repairCodes) ? parsed.repairCodes : [],
    }
  } catch (error) {
    // 文件存在但读不懂：说一声再退回默认值，不要让个人阈值静默失效。
    console.error(`config.json 解析失败，本次使用默认阈值：${describe(error)}`)
    return { ...DEFAULT_CONFIG }
  }
}

/** 与 harness 的 resolveDshHome 一致：空白回退 ~/.dsh，展开开头的 ~，转绝对路径。 */
function resolveDshHome() {
  const raw = (process.env.DSH_HOME ?? '').trim()
  if (raw.length === 0) return join(homedir(), '.dsh')
  const expanded = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw
  return resolve(expanded)
}

/** 插件页面选定的位置优先，其次是 profile 配置的默认位置。 */
async function resolvePositionsFile(home) {
  try {
    const location = JSON.parse(await readFile(join(home, 'ths-holdings.location.json'), 'utf8'))
    if (typeof location.positionsFile === 'string' && location.positionsFile.trim().length > 0) {
      return resolve(location.positionsFile.trim())
    }
  } catch {
    // 这台机器没选过位置，用默认路径。
  }
  return join(home, 'ths-holdings', 'positions.json')
}

/** 插件页写入的总资产；文件不存在或值不可用时视为未设置。 */
async function readTotalAssets(home) {
  try {
    const parsed = JSON.parse(await readFile(join(home, 'ths-holdings.assets.json'), 'utf8'))
    const value = Number(parsed.totalAssets)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

async function loadSnapshot(file) {
  const raw = await readFile(file, 'utf8')
  const document = JSON.parse(raw)
  const positions = Array.isArray(document.positions) ? document.positions : []
  return {
    exportedAt: typeof document.exported_at === 'string' ? document.exported_at : undefined,
    updatedAt: typeof document.updated_at === 'string' ? document.updated_at : undefined,
    positions: positions
      .map(position => ({
        code: String(position.code ?? '').trim(),
        name: String(position.name ?? '').trim(),
        qty: Number(position.qty),
        cost: Number(position.cost),
      }))
      .filter(position => /^\d{6}$/.test(position.code) && Number.isFinite(position.qty) && position.qty > 0),
  }
}

// ---------------------------------------------------------------- 行情

function quoteId(code) {
  const head = code[0]
  if (head === '4' || head === '8') return `bj${code}`
  if (head === '0' || head === '1' || head === '2' || head === '3') return `sz${code}`
  return `sh${code}`
}

async function fetchQuotes(codes) {
  const ids = [...new Set(codes.map(quoteId))]
  const byCode = new Map()
  let failure = null
  for (const batch of chunk(ids, 60)) {
    try {
      const response = await fetchWithTimeout(`${QUOTE_URL}${batch.join(',')}`, {
        headers: { Referer: 'http://qt.gtimg.cn/', 'User-Agent': UA },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      const text = new TextDecoder('gb18030').decode(buffer)
      for (const line of text.split(';')) {
        const match = line.match(/v_([a-z]{2}\d{6})="([^"]*)"/)
        if (match === null) continue
        const fields = match[2].split('~')
        const code = fields[2]
        if (!/^\d{6}$/.test(code ?? '')) continue
        byCode.set(code, {
          name: fields[1] ?? '',
          time: fields[30] ?? '',
          price: num(fields[3]),
          prevClose: num(fields[4]),
          open: num(fields[5]),
          high: num(fields[33]),
          low: num(fields[34]),
          pct: num(fields[32]),
          pe: num(fields[39]),
          pb: num(fields[46]),
          marketCapYi: num(fields[45]),
          amountWan: num(fields[37]),
        })
      }
    } catch (error) {
      failure ??= describe(error)
    }
  }
  let latestTime = null
  for (const quote of byCode.values()) {
    const time = quoteTimeIso(quote.time)
    if (time !== null && (latestTime === null || time > latestTime)) latestTime = time
  }
  return { byCode, failure, latestTime }
}

// ---------------------------------------------------------------- 单只标的

async function enrich(position, quote, quoteFailure) {
  const isFund = isEtfCode(position.code)
  const price = quote?.price ?? Number.NaN
  const value = Number.isFinite(price) ? price * position.qty : 0
  const override = config.overrides[position.code] ?? {}
  const targetYieldPct = num(override.targetYieldPct) ?? config.targetYieldPct

  const row = {
    code: position.code,
    name: position.name.length > 0 ? position.name : (quote?.name ?? ''),
    qty: position.qty,
    cost: position.cost,
    kind: isFund ? 'ETF' : '股票',
    sector: isFund ? 'ETF/基金' : null,
    repair: config.repairCodes.includes(position.code),
    price,
    prevClose: quote?.prevClose ?? null,
    pct: quote?.pct ?? null,
    pe: quote?.pe ?? null,
    pb: quote?.pb ?? null,
    value: round2(value),
    pnlPct: price > 0 && position.cost > 0 ? round2(((price - position.cost) / position.cost) * 100) : null,
    weightPct: 0,
    quoteTime: quoteTimeIso(quote?.time),
    dividend: null,
    performance: null,
    appointment: null,
    announcements: [],
    errors: [],
    flags: [],
    buyZone: false,
  }
  if (!Number.isFinite(price)) {
    row.errors.push('无行情')
    if (quoteFailure !== null) row.errors.push(`行情接口: ${quoteFailure}`)
  }

  if (isFund) {
    await attachFundDividend(row, targetYieldPct)
  } else {
    const [dividends, performance, appointment, announcements, sector] = await Promise.all([
      emDividends(position.code).catch(error => ({ error })),
      emPerformance(position.code).catch(error => ({ error })),
      emAppointment(position.code).catch(error => ({ error })),
      args.news ? emAnnouncements(position.code).catch(error => ({ error })) : Promise.resolve([]),
      emSector(position.code).catch(error => ({ error })),
    ])
    if (dividends.error !== undefined) row.errors.push(`分红: ${describe(dividends.error)}`)
    if (performance.error !== undefined) row.errors.push(`财报: ${describe(performance.error)}`)
    if (appointment.error !== undefined) row.errors.push(`披露日程: ${describe(appointment.error)}`)
    if (Array.isArray(announcements)) row.announcements = announcements
    else row.errors.push(`公告: ${describe(announcements.error)}`)
    row.sector = sector.error === undefined ? (sector ?? '未分类') : '未分类'

    row.dividend = summarizeStockDividends(dividends, performance, price, position.cost, targetYieldPct, todayIso)
    row.performance = summarizePerformance(performance)
    row.appointment = appointment.error === undefined ? summarizeAppointment(appointment) : null
  }

  return row
}

function isEtfCode(code) {
  return code.startsWith('5') || code.startsWith('15') || code.startsWith('16') || code.startsWith('18')
}

// ---------------------------------------------------------------- 股票：分红与财报

async function emDividends(code) {
  const body = await getJson(`${EM_DATA}?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=${encodeURIComponent(`(SECURITY_CODE="${code}")`)}&pageNumber=1&pageSize=40&sortColumns=REPORT_DATE&sortTypes=-1&source=WEB&client=WEB`)
  return (body?.result?.data ?? []).map(record => ({
    reportDate: record.REPORT_DATE?.slice(0, 10) ?? '',
    perShare: num(record.PRETAX_BONUS_RMB) === null ? null : num(record.PRETAX_BONUS_RMB) / 10,
    exDate: record.EX_DIVIDEND_DATE?.slice(0, 10) ?? null,
    recordDate: record.EQUITY_RECORD_DATE?.slice(0, 10) ?? null,
    progress: record.ASSIGN_PROGRESS ?? '',
    plan: record.IMPL_PLAN_PROFILE ?? '',
    noticeDate: record.NOTICE_DATE?.slice(0, 10) ?? null,
  }))
}

async function emSector(code) {
  // Eastmoney keys Shanghai by market 1 and Shenzhen/Beijing by 0.
  const market = '569'.includes(code[0]) ? 1 : 0
  const body = await getJson(`${EM_QUOTE}?secid=${market}.${code}&fields=f127`)
  const sector = body?.data?.f127
  return typeof sector === 'string' && sector.trim().length > 0 ? sector.trim() : null
}

async function emPerformance(code) {
  const body = await getJson(`${EM_DATA}?reportName=RPT_LICO_FN_CPD&columns=ALL&filter=${encodeURIComponent(`(SECURITY_CODE="${code}")`)}&pageNumber=1&pageSize=6&sortColumns=REPORTDATE&sortTypes=-1&source=WEB&client=WEB`)
  return (body?.result?.data ?? []).map(record => ({
    reportDate: record.REPORTDATE?.slice(0, 10) ?? '',
    revenue: num(record.TOTAL_OPERATE_INCOME),
    revenueYoY: num(record.YSTZ),
    netProfit: num(record.PARENT_NETPROFIT),
    netProfitYoY: num(record.SJLTZ),
    roe: num(record.WEIGHTAVG_ROE),
    eps: num(record.BASIC_EPS),
    bps: num(record.BPS),
    grossMargin: num(record.XSMLL),
  }))
}

async function emAppointment(code) {
  const body = await getJson(`${EM_DATA}?reportName=RPT_PUBLIC_BS_APPOIN&columns=ALL&filter=${encodeURIComponent(`(SECURITY_CODE="${code}")`)}&pageNumber=1&pageSize=6&sortColumns=APPOINT_PUBLISH_DATE&sortTypes=-1&source=WEB&client=WEB`)
  return (body?.result?.data ?? []).map(record => ({
    reportDate: record.REPORT_DATE?.slice(0, 10) ?? '',
    reportName: record.REPORT_TYPE_NAME ?? '',
    appointed: record.APPOINT_PUBLISH_DATE?.slice(0, 10) ?? null,
    actual: record.ACTUAL_PUBLISH_DATE?.slice(0, 10) ?? null,
  }))
}

function summarizePerformance(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const [latest] = rows
  return {
    reportDate: latest.reportDate,
    revenue: latest.revenue,
    revenueYoY: latest.revenueYoY,
    netProfit: latest.netProfit,
    netProfitYoY: latest.netProfitYoY,
    roe: latest.roe,
    eps: latest.eps,
    bps: latest.bps,
    grossMargin: latest.grossMargin,
    history: rows.slice(0, 4).map(item => ({
      reportDate: item.reportDate,
      revenueYoY: item.revenueYoY,
      netProfitYoY: item.netProfitYoY,
    })),
  }
}

function summarizeAppointment(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const upcoming = rows
    .filter(row => row.actual === null && row.appointed !== null)
    .sort((a, b) => a.appointed.localeCompare(b.appointed))
  if (upcoming.length > 0) return { next: upcoming[0].appointed, reportName: upcoming[0].reportName, published: false }
  const [latest] = rows
  return { next: latest.actual, reportName: latest.reportName, published: latest.actual !== null }
}

// ---------------------------------------------------------------- ETF：基金分红

async function attachFundDividend(row, targetYieldPct) {
  let html
  try {
    const response = await fetchWithTimeout(`${FUND_DIV_PAGE}${row.code}.html`, { headers: { 'User-Agent': UA } })
    html = await response.text()
  } catch (error) {
    row.errors.push(`基金分红: ${describe(error)}`)
    return
  }
  if (/暂无分红/.test(html)) {
    row.dividend = summarizeFundDividend([], row.price, row.cost, targetYieldPct, todayIso)
    return
  }
  const table = html.match(/<table class='w782[\s\S]*?<\/table>/)
  if (table === null) {
    row.errors.push('基金分红: 页面结构无法解析')
    return
  }
  const records = []
  for (const match of table[0].matchAll(/<tr><td>(\d{4})年<\/td><td>([\d-]+)<\/td><td>([\d-]+)<\/td><td>[^<]*?([\d.]+)元<\/td><td>([\d-]+)<\/td><\/tr>/g)) {
    records.push({
      year: Number(match[1]),
      recordDate: match[2],
      exDate: match[3],
      perShare: round4(Number(match[4]) / 10),
      payDate: match[5],
    })
  }
  row.dividend = summarizeFundDividend(records, row.price, row.cost, targetYieldPct, todayIso)
}

// ---------------------------------------------------------------- 输出

function renderMarkdown(report) {
  const lines = []
  const stamp = report.generatedAt
  lines.push(`# 持仓与收息数据 · ${stamp.slice(0, 16).replace('T', ' ')}（Asia/Shanghai）`)
  lines.push('')
  lines.push(`- 持仓文件：\`${report.snapshot.file}\``)
  lines.push(`- 快照时间：导出 ${report.snapshot.exportedAt ?? '未知'} / 编辑 ${report.snapshot.updatedAt ?? '未知'}${report.snapshot.staleDays === null ? '' : `（${report.snapshot.staleDays} 天前）`}`)
  lines.push(`- 行情时间：${report.quoteTime === null ? '未取到' : `${report.quoteTime.slice(0, 10)} ${report.quoteTime.slice(11, 19)}`}`)
  lines.push(`- 合计市值：¥${fmt(report.totals.value)}，成本：¥${fmt(report.totals.cost)}，浮动：${sign(report.totals.pnl)}¥${fmt(Math.abs(report.totals.pnl))}（${report.totals.pnlPct === null ? '—' : `${sign(report.totals.pnlPct)}${fmt(Math.abs(report.totals.pnlPct))}%`}）`)
  lines.push(report.totals.totalAssets === null
    ? '- 可用资金：未设置总资产（插件页 → 持仓管理 → 总资产，或运行 scripts/set-assets.mjs --total <金额>）'
    : `- 账户：总资产 ¥${fmt(report.totals.totalAssets)}，持仓 ¥${fmt(report.totals.value)}，可用资金 ¥${fmt(report.totals.cash)}（${report.totals.cashPct}%）`)
  lines.push(`- 权重口径：${report.totals.weightBase}`)
  lines.push(`- 决策阈值（config.json）：目标股息率 ${report.config.targetYieldPct}%，加仓下限 ${report.config.minYieldToBuyPct}%，减仓下限 ${report.config.trimYieldPct}%，单只上限 ${report.config.maxSingleWeightPct}%，计划现金 ${report.config.cashReservePct}%${report.config.repairCodes.length === 0 ? '' : `；价值修复类（不套股息率阈值）：${report.config.repairCodes.join('、')}`}`)
  for (const warning of report.warnings) lines.push(`- ⚠ ${warning}`)
  lines.push('')
  lines.push('## 持仓与行情')
  lines.push('')
  lines.push('| 代码 | 名称 | 类别 | 数量 | 成本 | 现价 | 今日% | 市值 | 浮盈% | 权重% |')
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const row of [...report.rows].sort((a, b) => b.weightPct - a.weightPct)) {
    lines.push(`| ${row.code} | ${row.name} | ${row.kind} | ${fmtQty(row.qty)} | ${numText(row.cost)} | ${numText(row.price)} | ${pctText(row.pct)} | ${fmt(row.value)} | ${pctText(row.pnlPct)} | ${row.weightPct.toFixed(1)} |`)
  }
  lines.push('')
  lines.push('## 行业权重')
  lines.push('')
  lines.push('| 行业 | 权重% |')
  lines.push('| --- | ---: |')
  for (const sector of report.sectors) {
    const over = sector.weightPct > report.config.maxIndustryWeightPct ? ' ⚠' : ''
    lines.push(`| ${sector.name}${over} | ${sector.weightPct.toFixed(1)} |`)
  }
  lines.push('')
  lines.push('## 收息与基本面')
  lines.push('')
  lines.push('| 代码 | 名称 | 每股分红 | 现价股息率 | 成本股息率 | 派息率 | 目标价 | 最新报告 | 营收同比 | 净利同比 | ROE | 下次披露 | 提醒 |')
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |')
  for (const row of [...report.rows].sort((a, b) => b.weightPct - a.weightPct)) {
    const div = row.dividend
    const perf = row.performance
    const next = row.appointment === null ? '—' : `${row.appointment.next ?? '—'}${row.appointment.published ? '' : '（预约）'}`
    lines.push([
      row.code,
      row.name,
      div === null ? '—' : `${numText(div.annualDps)}（${div.annualLabel}）`,
      div === null ? '—' : pctText(div.yieldPct),
      div === null ? '—' : pctText(div.costYieldPct),
      div?.payoutPct === null || div === null ? '—' : `${fmt(div.payoutPct)}%`,
      div?.targetPrice === null || div === null ? '—' : numText(div.targetPrice),
      perf === null ? '—' : perf.reportDate,
      perf === null ? '—' : pctText(perf.revenueYoY),
      perf === null ? '—' : pctText(perf.netProfitYoY),
      perf === null ? '—' : pctText(perf.roe),
      next,
      row.flags.length === 0 ? '' : row.flags.join('；'),
    ].map(cell => String(cell).replaceAll('|', '/')).join(' | ').replace(/^/, '| ').concat(' |'))
  }
  lines.push('')

  const attention = report.rows.filter(row => row.flags.length > 0 || row.errors.length > 0)
  if (attention.length > 0) {
    lines.push('## 需要解释或决策的标的')
    lines.push('')
    for (const row of attention) {
      const parts = []
      if (row.flags.length > 0) parts.push(row.flags.join('；'))
      if (row.errors.length > 0) parts.push(`数据问题：${row.errors.join('；')}`)
      lines.push(`- **${row.code} ${row.name}**：${parts.join('。')}`)
    }
    lines.push('')
  }

  const buyZone = report.rows.filter(row => row.buyZone === true && row.dividend?.yieldPct !== null && row.dividend?.yieldPct !== undefined)
  if (buyZone.length > 0) {
    lines.push('## 进入目标价区间（股息率 ≥ 目标）')
    lines.push('')
    for (const row of buyZone.sort((a, b) => b.dividend.yieldPct - a.dividend.yieldPct)) {
      lines.push(`- **${row.code} ${row.name}**：现价 ${numText(row.price)}，目标价 ${numText(row.dividend.targetPrice)}，现价股息率 ${row.dividend.yieldPct}%，成本股息率 ${row.dividend.costYieldPct}%`)
    }
    lines.push('')
  }

  lines.push('## 明细')
  lines.push('')
  for (const row of [...report.rows].sort((a, b) => b.weightPct - a.weightPct)) {
    lines.push(`### ${row.code} ${row.name}（${row.kind}）`)
    if (row.dividend !== null && row.dividend.recent.length > 0) {
      lines.push(`- 近年分红：${row.dividend.recent.map(item => `${item.period} 每股 ${item.perShare} 元（除息 ${item.exDate}）`).join('；')}`)
    } else if (row.kind === 'ETF') {
      lines.push('- 近年分红：无记录（基金未分配收益计入净值）')
    }
    if (row.dividend?.nextPlan != null) lines.push(`- 待实施：${row.dividend.nextPlan.plan}（除息 ${row.dividend.nextPlan.exDate}）`)
    if (row.performance !== null) {
      const history = row.performance.history
        .map(item => `${item.reportDate.slice(0, 7)} 营收 ${pctText(item.revenueYoY)} / 净利 ${pctText(item.netProfitYoY)}`)
        .join('；')
      lines.push(`- 财报：最近 ${row.performance.reportDate}，ROE ${pctText(row.performance.roe)}，EPS ${numText(row.performance.eps)}；${history}`)
    }
    if (row.appointment !== null) lines.push(`- 披露日程：${row.appointment.next ?? '—'} ${row.appointment.published ? '（已披露）' : '（预约）'}`)
    if (row.announcements.length > 0) {
      lines.push(`- 近期公告：${row.announcements.slice(0, 4).map(item => `[\`${item.title}\`](${item.url})（${item.date}）`).join('；')}`)
    }
    if (row.errors.length > 0) lines.push(`- 数据问题：${row.errors.join('；')}`)
    lines.push('')
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------- 工具

async function getJson(url) {
  const response = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json()
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

async function emAnnouncements(code) {
  const body = await getJson(`${EM_ANN}?sr=-1&page_size=6&page_index=1&ann_type=A&client_source=web&stock_list=${code}`)
  return (body?.data?.list ?? []).map(item => ({
    title: String(item.title ?? item.title_ch ?? '').trim(),
    date: String(item.notice_date ?? item.display_time ?? '').slice(0, 10),
    url: `https://data.eastmoney.com/notices/detail/${code}/${item.art_code}.html`,
  })).filter(item => item.title.length > 0)
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

function chunk(items, size) {
  const out = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

function nowShanghaiIso() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date()).replace(' ', 'T')
}

function shanghaiNow() {
  return nowShanghaiIso()
}

function daysSince(iso) {
  const value = Date.parse(iso)
  return Number.isFinite(value) ? Math.max(0, Math.floor((Date.now() - value) / DAY_MS)) : null
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

function fmt(value) {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtQty(value) {
  return Number.isInteger(value) ? String(value) : String(round4(value))
}

function numText(value) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : String(value)
}

function pctText(value) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function sign(value) {
  return value > 0 ? '+' : value < 0 ? '-' : ''
}

function describe(error) {
  return String(error?.message ?? error)
}
