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
import { classifyFundDividendPage, finalizeRows, findDividendGaps, parseDividendNotice, quoteTimeIso, sectorWeights, summarizeFundDividend, summarizeStockDividends, summarizeTargets } from './shared/analysis.mjs'
import { decodeEntities } from './shared/text.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = dirname(SCRIPT_DIR)
const EM_DATA = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const EM_QUOTE = 'https://push2.eastmoney.com/api/qt/stock/get'
const EM_ANN = 'https://np-anotice-stock.eastmoney.com/api/security/ann'
const EM_BODY = 'https://np-cnotice-stock.eastmoney.com/api/content/ann'
const QUOTE_URL = 'http://qt.gtimg.cn/q='
const FUND_DIV_PAGE = 'https://fundf10.eastmoney.com/fhsp_'
const THS_RESEARCH = 'https://basic.10jqka.com.cn/'
const EM_REPORT = 'https://reportapi.eastmoney.com/report/list'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const DAY_MS = 86_400_000

/** 同花顺 F10 的研报摘要块：标题 + 发布时间 + 来源券商。 */
const THS_BLOCK = /<h1 class="cont_title">([\s\S]*?)<\/h1>\s*<h2 class="sub_cont_title">\s*发布时间：([\d-]+)\s*来源：([^<]*)<\/h2>/g
/** 正文里的目标价写法：目标价 78.95 元 / 目标价为 78.95 元 / 对应目标价 78.95 元。 */
const THS_TARGET = /目标价\s*(?:为|给予|至|约|在|是)?\s*([\d.]+)\s*元/

/** 默认决策阈值；config.json 可覆盖。 */
const DEFAULT_CONFIG = {
  targetYieldPct: 4.5,
  minYieldToBuyPct: 4.0,
  trimYieldPct: 2.5,
  maxSingleWeightPct: 15,
  maxIndustryWeightPct: 35,
  cashReservePct: 10,
  takeProfitPct: 30,
  nearTargetRatio: 0.95,
  minAnalystCount: 2,
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
    analyst: null,
    announcements: [],
    errors: [],
    flags: [],
    buyZone: false,
    sellZone: false,
    gainHigh: false,
  }
  if (!Number.isFinite(price)) {
    row.errors.push('无行情')
    if (quoteFailure !== null) row.errors.push(`行情接口: ${quoteFailure}`)
  }

  if (isFund) {
    await attachFundDividend(row, targetYieldPct)
  } else {
    const [dividends, performance, appointment, announcements, sector, targets] = await Promise.all([
      emDividends(position.code).catch(error => ({ error })),
      emPerformance(position.code).catch(error => ({ error })),
      emAppointment(position.code).catch(error => ({ error })),
      args.news ? emAnnouncements(position.code).catch(error => ({ error })) : Promise.resolve([]),
      emSector(position.code).catch(error => ({ error })),
      fetchAnalystTargets(position.code).catch(error => ({ error })),
    ])
    if (dividends.error !== undefined) row.errors.push(`分红: ${describe(dividends.error)}`)
    if (performance.error !== undefined) row.errors.push(`财报: ${describe(performance.error)}`)
    if (appointment.error !== undefined) row.errors.push(`披露日程: ${describe(appointment.error)}`)
    if (Array.isArray(announcements)) row.announcements = announcements
    else row.errors.push(`公告: ${describe(announcements.error)}`)
    row.sector = sector.error === undefined ? (sector ?? '未分类') : '未分类'
    if (targets.error !== undefined) {
      row.errors.push(`机构目标价: ${describe(targets.error)}`)
    } else {
      row.analyst = summarizeTargets(targets.samples, price, todayIso, {
        minAnalystCount: config.minAnalystCount,
      })
      if (targets.problems.length > 0) row.errors.push(`机构目标价: ${targets.problems.join('；')}，样本可能不全`)
    }

    row.dividend = summarizeStockDividends(dividends, performance, price, position.cost, targetYieldPct, todayIso)
    row.performance = summarizePerformance(performance)
    row.appointment = appointment.error === undefined ? summarizeAppointment(appointment) : null
    if (Array.isArray(dividends)) {
      const reconciled = await reconcileDividendGaps(row, dividends, performance, price, position.cost, targetYieldPct)
      if (reconciled !== null) row.dividend = reconciled
    }
  }

  return row
}

// 分红表缺条时按公告补录：公告说已实施分派、东财 RPT_SHAREBONUS_DET 里却没有
// 这条记录（典型是特别分红），TTM 会偏低。补录只进 TTM，年度口径保持分红表原样。
async function reconcileDividendGaps(row, dividends, performance, price, cost, targetYieldPct) {
  const gaps = findDividendGaps(dividends, row.announcements)
  if (gaps.length === 0) return null
  const supplements = []
  for (const gap of gaps.slice(0, 2)) {
    if (gap.artCode === null || gap.artCode === '') {
      row.errors.push(`分红缺口: 《${gap.title}》（${gap.date}）在分红表中无对应记录，公告没有正文编号，未补录`)
      continue
    }
    let parsed
    try {
      parsed = parseDividendNotice(await emAnnouncementBody(gap.artCode))
    } catch (error) {
      row.errors.push(`分红缺口: 《${gap.title}》（${gap.date}）在分红表中无对应记录，取公告正文失败（${describe(error)}），未补录`)
      continue
    }
    if (parsed === null) {
      row.errors.push(`分红缺口: 《${gap.title}》（${gap.date}）在分红表中无对应记录，正文未取到「每 10 股派 X 元」，未补录`)
      continue
    }
    const exDate = parsed.exDate ?? gap.date
    supplements.push({
      reportDate: null,
      perShare: parsed.perShare,
      // 除息日还没到的不算已付：写成「股东大会通过」才会进 nextPlan 而不是 TTM。
      exDate,
      progress: exDate <= todayIso ? '实施分配' : '股东大会通过',
      plan: `10派${round4(parsed.perShare * 10)}元`,
      noticeDate: gap.date,
      supplemental: true,
      title: gap.title,
    })
    row.errors.push(`分红缺口: 公告《${gap.title}》（${gap.date}）为每 10 股派 ${round4(parsed.perShare * 10)} 元、除息 ${exDate}，分红表里没有这条记录；已按公告补录${exDate <= todayIso ? '，仅计入 TTM' : '，列在待实施'}`)
  }
  if (supplements.length === 0) return null
  return summarizeStockDividends([...dividends, ...supplements], performance, price, cost, targetYieldPct, todayIso)
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
    deductEps: num(record.DEDUCT_BASIC_EPS),
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

// ---------------------------------------------------------------- 机构目标价

/**
 * 合并两个来源的机构目标价：同花顺 F10 研报摘要 + 东财研报列表。
 *
 * 两边都失败才算失败；一边成功就用那一边，并在每条样本上标 `source`。
 * @param {string} code - 6 位代码。
 * @returns {Promise<Array<{org: string, date: string, target: number, source: string}>>} 目标价样本。
 */
async function fetchAnalystTargets(code) {
  const [ths, em] = await Promise.allSettled([thsTargets(code), emTargets(code)])
  const samples = []
  const problems = []
  if (ths.status === 'fulfilled') samples.push(...ths.value)
  else problems.push(`同花顺 ${describe(ths.reason)}`)
  if (em.status === 'fulfilled') samples.push(...em.value)
  else problems.push(`东财 ${describe(em.reason)}`)
  if (samples.length === 0 && problems.length === 2) throw new Error(problems.join('；'))
  return { samples, problems }
}

/**
 * 同花顺的请求串行化并留间隔：3 并发 × 多接口时它会把页面换成验证页。
 *
 * 队列挂在函数对象上而不是模块顶层变量：本文件在函数声明之前就先跑了主流程，
 * 顶层 `let` 在那一刻还在 TDZ 里。
 * @param {() => Promise<any>} task - 要执行的请求。
 * @returns {Promise<any>} 请求结果。
 */
function thsThrottle(task) {
  const queue = (thsThrottle.queue ??= { tail: Promise.resolve() })
  const run = queue.tail.then(task, task)
  queue.tail = run.then(
    () => new Promise(resolve => setTimeout(resolve, 250)),
    () => new Promise(resolve => setTimeout(resolve, 250)),
  )
  return run
}

/**
 * 同花顺 F10 研报页：正文里「目标价 X 元」的写法比东财的结构化字段覆盖率高。
 * @param {string} code - 6 位代码。
 * @returns {Promise<Array<object>>} 目标价样本。
 */
async function thsTargets(code) {
  const url = `${THS_RESEARCH}${code}/worth.html`
  let html = await thsThrottle(() => getText(url, 'gbk', { Referer: THS_RESEARCH }))
  let heads = [...html.matchAll(THS_BLOCK)]
  if (heads.length === 0) {
    // 被反爬拦下的典型表现是 200 + 极短页面：等一会儿重试一次。
    await new Promise(resolve => setTimeout(resolve, 900))
    html = await thsThrottle(() => getText(url, 'gbk', { Referer: THS_RESEARCH }))
    heads = [...html.matchAll(THS_BLOCK)]
  }
  if (heads.length === 0) throw new Error('研报页结构无法解析（可能被反爬拦截）')
  const out = []
  for (let index = 0; index < heads.length; index++) {
    const head = heads[index]
    const start = head.index + head[0].length
    const end = index + 1 < heads.length ? heads[index + 1].index : html.length
    const text = html.slice(start, end).replace(/<[^>]+>/g, ' ')
    const hit = text.match(THS_TARGET)
    if (hit === null) continue
    const target = Number(hit[1])
    if (!Number.isFinite(target) || target <= 0) continue
    out.push({ org: head[3].trim(), date: head[2].trim(), target, source: '同花顺' })
  }
  return out
}

/**
 * 东财研报列表：只有部分研报带结构化目标价（`indvAimPriceT`），覆盖稀疏但稳定。
 * @param {string} code - 6 位代码。
 * @returns {Promise<Array<object>>} 目标价样本。
 */
async function emTargets(code) {
  const begin = shiftDate(todayIso, -365)
  const url = `${EM_REPORT}?industryCode=*&pageSize=50&industry=*&rating=&ratingChange=&beginTime=${begin}&endTime=${todayIso}&pageNo=1&fields=&qType=0&orgCode=&code=${code}&rcode=&p=1&pageNum=1&pageNumber=1`
  const body = await getJson(url, { Referer: 'https://data.eastmoney.com/report/' })
  return (body?.data ?? [])
    .map(item => ({
      org: String(item.orgSName ?? '').trim(),
      date: String(item.publishDate ?? '').slice(0, 10),
      target: num(item.indvAimPriceT),
      source: '东财研报',
    }))
    .filter(item => item.target !== null && item.target > 0)
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
    deductEps: latest.deductEps,
    // 归母与扣非的差额占比：绝对值越大，说明当期利润被一次性损益扭曲得越多，
    // 归母同比就不能单独拿来判断经营好坏（负数表示扣非高于归母，即一次性为负）。
    oneOffPct: oneOffShare(latest.eps, latest.deductEps),
    bps: latest.bps,
    grossMargin: latest.grossMargin,
    history: rows.slice(0, 4).map(item => ({
      reportDate: item.reportDate,
      revenueYoY: item.revenueYoY,
      netProfitYoY: item.netProfitYoY,
      oneOffPct: oneOffShare(item.eps, item.deductEps),
    })),
  }
}

/**
 * 一次性损益占归母净利的比例（%）。
 *
 * A 股定期报告的「扣非」只剔除准则列举的非经常性损益，像补缴以前年度税款
 * 这类直接计入所得税费用的项目仍留在扣非里，所以这个比例是**下限**，不是
 * 全部一次性影响。返回 null 表示扣非数据缺失，不能当 0。
 * @param {number | null} eps - 基本每股收益。
 * @param {number | null} deductEps - 扣非每股收益。
 * @returns {number | null} 一次性损益占归母的比例（%）。
 */
function oneOffShare(eps, deductEps) {
  if (eps === null || eps === undefined || deductEps === null || deductEps === undefined) return null
  if (!Number.isFinite(eps) || !Number.isFinite(deductEps) || eps === 0) return null
  return round2(((eps - deductEps) / Math.abs(eps)) * 100)
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
  const page = classifyFundDividendPage(html, row.code)
  if (page === 'foreign-page' || page === 'foreign-block') {
    row.errors.push(`基金分红: 东财返回的页面混入了其他基金的分红数据（${page}），本次未采用`)
    return
  }
  if (page === 'empty') {
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
  lines.push(`- 决策阈值（config.json）：目标股息率 ${report.config.targetYieldPct}%，加仓下限 ${report.config.minYieldToBuyPct}%，收益率下限 ${report.config.trimYieldPct}%，单只上限 ${report.config.maxSingleWeightPct}%，计划现金 ${report.config.cashReservePct}%，浮盈提醒线 ${report.config.takeProfitPct}%，接近目标价 ${Math.round(report.config.nearTargetRatio * 100)}%（至少 ${report.config.minAnalystCount} 家机构）${report.config.repairCodes.length === 0 ? '' : `；价值修复类（不套股息率阈值）：${report.config.repairCodes.join('、')}`}`)
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
  lines.push('| 代码 | 名称 | 每股分红 | 现价股息率 | 成本股息率 | TTM 股息率 | 派息率 | 目标价 | 最新报告 | 营收同比 | 净利同比 | 一次性占比 | PB | ROE | 下次披露 | 提醒 |')
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |')
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
      div === null ? '—' : pctText(div.ttmYieldPct),
      div?.payoutPct === null || div === null ? '—' : `${fmt(div.payoutPct)}%`,
      div?.targetPrice === null || div === null ? '—' : numText(div.targetPrice),
      perf === null ? '—' : perf.reportDate,
      perf === null ? '—' : pctText(perf.revenueYoY),
      perf === null ? '—' : pctText(perf.netProfitYoY),
      perf === null || perf.oneOffPct === null || perf.oneOffPct === undefined ? '—' : `${perf.oneOffPct > 0 ? '+' : ''}${perf.oneOffPct.toFixed(0)}%`,
      row.pb === null || row.pb === undefined ? '—' : numText(row.pb),
      perf === null ? '—' : pctText(perf.roe),
      next,
      row.flags.length === 0 ? '' : row.flags.join('；'),
    ].map(cell => String(cell).replaceAll('|', '/')).join(' | ').replace(/^/, '| ').concat(' |'))
  }
  lines.push('')

  lines.push('## 浮盈与机构目标价')
  lines.push('')
  lines.push('| 代码 | 名称 | 现价 | 成本 | 浮盈% | 机构目标价中位 | 区间 | 家数 | 距目标价 | 状态 |')
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |')
  for (const row of [...report.rows].sort((a, b) => (b.pnlPct ?? -999) - (a.pnlPct ?? -999))) {
    const analyst = row.analyst
    const status = row.sellZone === true
      ? (analyst.ratio >= 1 ? '⚠ 已超目标价' : '⚠ 接近目标价')
      : (row.gainHigh === true ? '浮盈达线' : (analyst === null || analyst.status === 'none' ? '无机构目标价' : (analyst.status === 'thin' ? '样本不足' : '')))
    lines.push([
      row.code,
      row.name,
      numText(row.price),
      numText(row.cost),
      pctText(row.pnlPct),
      analyst === null || analyst.median === null ? '—' : numText(analyst.median),
      analyst === null || analyst.min === null ? '—' : `${numText(analyst.min)}–${numText(analyst.max)}`,
      analyst === null ? '—' : String(analyst.orgCount),
      analyst === null || analyst.premiumPct === null ? '—' : pctText(analyst.premiumPct),
      status,
    ].map(cell => String(cell).replaceAll('|', '/')).join(' | ').replace(/^/, '| ').concat(' |'))
  }
  lines.push('')

  const review = report.rows.filter(row => row.sellZone === true || row.gainHigh === true)
  lines.push('## 止盈复核')
  lines.push('')
  if (review.length === 0) {
    lines.push('- 本轮没有标的触及浮盈提醒线或机构目标价，无需止盈操作。')
  } else {
    for (const row of review.sort((a, b) => (b.pnlPct ?? 0) - (a.pnlPct ?? 0))) {
      const reasons = []
      if (row.gainHigh === true) reasons.push(`浮盈 ${pctText(row.pnlPct)}（线 ${report.config.takeProfitPct}%）`)
      if (row.sellZone === true) {
        reasons.push(`现价 ${numText(row.price)} 为机构目标价中位 ${numText(row.analyst.median)} 的 ${Math.round(row.analyst.ratio * 100)}%（${row.analyst.orgCount} 家）`)
      }
      lines.push(`- **${row.code} ${row.name}**：${reasons.join('；')}；持有 ${fmtQty(row.qty)} 股，市值 ¥${fmt(row.value)}`)
    }
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
      lines.push(row.dividend === null
        ? '- 近年分红：本次未取到（接口异常），不按「无分红」处理'
        : '- 近年分红：无记录（基金未分配收益计入净值）')
    }
    if (row.dividend?.supplemental?.length > 0) {
      const today = report.generatedAt.slice(0, 10)
      lines.push(`- 分红补录：${row.dividend.supplemental.map(item => `《${item.title ?? '公告'}》每股 ${item.perShare} 元（除息 ${item.exDate}${item.exDate > today ? '，待除息' : ''}）`).join('；')}（分红表无此记录，已按公告补录）`)
      if (row.dividend.ttmDps !== row.dividend.annualDps) {
        lines.push(`- 收息口径：年度 ${numText(row.dividend.annualDps)} 元（${pctText(row.dividend.yieldPct)}），近 12 个月 ${numText(row.dividend.ttmDps)} 元（${pctText(row.dividend.ttmYieldPct)}）`)
      }
    }
    if (row.dividend?.nextPlan != null) lines.push(`- 待实施：${row.dividend.nextPlan.plan}（除息 ${row.dividend.nextPlan.exDate}）`)
    if (row.performance !== null) {
      const perf = row.performance
      const history = perf.history
        .map(item => `${item.reportDate.slice(0, 7)} 营收 ${pctText(item.revenueYoY)} / 净利 ${pctText(item.netProfitYoY)}${item.oneOffPct === null || item.oneOffPct === undefined ? '' : `（非经常性 ${item.oneOffPct.toFixed(0)}%）`}`)
        .join('；')
      const oneOff = perf.oneOffPct === null || perf.oneOffPct === undefined
        ? '扣非数据缺失'
        : `非经常性损益占归母 ${perf.oneOffPct.toFixed(0)}%`
      lines.push(`- 财报：最近 ${perf.reportDate}，ROE ${pctText(perf.roe)}，EPS ${numText(perf.eps)}，扣非EPS ${numText(perf.deductEps)}（${oneOff}）；${history}`)
    }
    if (row.appointment !== null) lines.push(`- 披露日程：${row.appointment.next ?? '—'} ${row.appointment.published ? '（已披露）' : '（预约）'}`)
    if (row.announcements.length > 0) {
      lines.push(`- 近期公告：${row.announcements.slice(0, 4).map(item => `[\`${item.title}\`](${item.url})（${item.date}）`).join('；')}`)
    }
    if (row.analyst !== null && row.analyst.status !== 'none') {
      const analyst = row.analyst
      const samples = analyst.sample.slice(0, 5)
        .map(item => `${item.org} ${numText(item.target)}（${item.date}，${item.source}）`)
        .join('；')
      lines.push(`- 机构目标价：中位 ${numText(analyst.median)}，${analyst.orgCount} 家，区间 ${numText(analyst.min)}–${numText(analyst.max)}，距现价 ${pctText(analyst.premiumPct)}${analyst.status === 'thin' ? '（样本不足，只作参考）' : ''}；${samples}`)
    }
    if (row.errors.length > 0) lines.push(`- 数据问题：${row.errors.join('；')}`)
    lines.push('')
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------- 工具

async function getJson(url, headers = {}) {
  const response = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, ...headers } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json()
}

/** 抓 GBK/UTF-8 页面并解码；同花顺 F10 是 GBK，直接用 .text() 会乱码。 */
async function getText(url, encoding = 'utf-8', headers = {}) {
  const response = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, ...headers } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return new TextDecoder(encoding).decode(await response.arrayBuffer())
}

/** YYYY-MM-DD 加减天数，用于拼研报的查询区间。 */
function shiftDate(iso, days) {
  const base = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(base)) return iso
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10)
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

async function emAnnouncements(code) {
  const body = await getJson(`${EM_ANN}?sr=-1&page_size=6&page_index=1&ann_type=A&client_source=web&stock_list=${code}`)
  return (body?.data?.list ?? []).map(item => ({
    title: String(item.title ?? item.title_ch ?? '').trim(),
    date: String(item.notice_date ?? item.display_time ?? '').slice(0, 10),
    artCode: String(item.art_code ?? ''),
    url: `https://data.eastmoney.com/notices/detail/${code}/${item.art_code}.html`,
  })).filter(item => item.title.length > 0)
}

async function emAnnouncementBody(artCode) {
  const body = await getJson(`${EM_BODY}?art_code=${encodeURIComponent(artCode)}&client_source=web&page_index=1`)
  const content = body?.data?.notice_content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(`公告 ${artCode} 没有正文`)
  }
  return decodeEntities(content.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
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
