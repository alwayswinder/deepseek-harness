#!/usr/bin/env node
/**
 * 持仓评级：把 `dividend-dossier.mjs --json` 的输出按统一评分卡打成五档评级。
 *
 * 用法：
 *   node scripts/dividend-dossier.mjs --json --no-news > dossier.json
 *   node scripts/rate-holdings.mjs --file dossier.json
 *
 * 评分卡（满分 100）：
 *   分红可持续 20 / 盈利趋势 20 / 估值与息率 20 / 价格空间 20 / 风险 20
 *
 * 五档：加仓 ≥75、持有 60–74、观察 45–59、减仓 30–44、卖出 <30。
 * 缺数据的维度一律给中位分（10/20），不猜方向；周期底部候选经 --cycle 传入，评级至少「持有」。
 * 封顶规则（优先于分数）：
 *   治理事件 → 卖出（浮亏深于 sellBufferGainPct 降为减仓）；止盈触发 → 至少减仓；
 *   盈利 ≤5 分 → 最高观察；息率低于下限 → 最高持有；权重达上限 → 最高持有；ETF → 最高持有。
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const file = getArg('--file')
if (!file) {
  console.error('用法: node rate-holdings.mjs --file <dossier.json>')
  process.exit(2)
}

const report = JSON.parse(await readFile(resolve(file), 'utf8'))
const here = dirname(fileURLToPath(import.meta.url))
let fileConfig = {}
try {
  fileConfig = JSON.parse(await readFile(join(here, '..', 'config.json'), 'utf8'))
} catch {
  // 没有 config.json 时用内置默认值
}
// dossier 里的 config 是它运行时读到的快照，可能比磁盘上的旧；磁盘优先，快照只补缺。
const cfg = { ...(fileConfig.rating ?? {}), ...(report.config?.rating ?? {}) }
const minYieldCfg = report.config?.minYieldToBuyPct ?? fileConfig.minYieldToBuyPct
const maxWeightCfg = report.config?.maxSingleWeightPct ?? fileConfig.maxSingleWeightPct
const addMin = cfg.addMinScore ?? 75
const holdMin = cfg.holdMinScore ?? 60
const watchMin = cfg.watchMinScore ?? 45
const reduceMin = cfg.reduceMinScore ?? 30
const sellBuffer = cfg.sellBufferGainPct ?? -15

const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))

function governanceHits(row) {
  const text = (row.announcements ?? []).map(a => a.title ?? '').join(' ')
  const hits = []
  if (/留置|立案/.test(text)) hits.push('高管留置/立案')
  if (/行政处罚|处罚决定/.test(text)) hits.push('行政处罚')
  // 公告只取最近 6 条，较早的治理事件靠 config 的 governanceCodes 兜底。
  if ((cfg.governanceCodes ?? []).includes(row.code)) hits.push('已登记治理风险')
  return hits
}

function dividendScore(row) {
  const d = row.dividend ?? {}
  const p = row.performance ?? {}
  const payout = num(d.payoutPct)
  let score = 10
  if (payout !== null) {
    if (payout > 90) score = 6
    else if (payout >= 70) score = 12
    else if (payout >= 30) score = 20
    else score = 14
  }
  const trend = num(d.annualTrendPct)
  if (trend !== null && trend <= -10) score -= 6
  const np = num(p.netProfitYoY)
  if (np !== null && np < -100) score = Math.min(score, 4)
  return clamp(score, 0, 20)
}

function earningsScore(row) {
  const p = row.performance ?? {}
  const yoy = num(p.netProfitYoY)
  let score = 10
  if (yoy !== null) {
    if (yoy >= 10) score = 20
    else if (yoy >= 0) score = 16
    else if (yoy >= -10) score = 12
    else if (yoy >= -20) score = 8
    else score = 3
  }
  // 扣非明显好于归母：一次性拖累，回补一点
  const eps = num(p.eps)
  const deduct = num(p.deductEps)
  if (eps !== null && deduct !== null && deduct > eps && num(p.oneOffPct) !== null && Math.abs(p.oneOffPct) >= 30) {
    score += 3
  }
  // 加速恶化：最近一期降幅比上一期扩大 ≥5 个百分点
  const history = p.history ?? []
  const latest = num(history[0]?.netProfitYoY)
  const prev = num(history[1]?.netProfitYoY)
  if (latest !== null && prev !== null && latest < prev - 5) score -= 4
  return clamp(score, 0, 20)
}

function valuationScore(row) {
  const d = row.dividend ?? {}
  const y = num(d.yieldPct)
  const pb = num(row.pb)
  let score
  if (y === null) score = 10
  else if (y >= 5.5) score = 20
  else if (y >= 4.5) score = 16
  else if (y >= 3.5) score = 12
  else if (y >= 2.5) score = 8
  else score = 4
  if (pb !== null && pb > 3) score -= 4
  if (pb !== null && pb > 0 && pb < 1) score += 2
  return clamp(score, 0, 20)
}

function priceScore(row) {
  const a = row.analyst ?? {}
  const gain = num(row.pnlPct)
  let score = 10
  const premium = num(a.premiumPct) // 现价距目标价中位，正数表示还有空间
  if (a.status === 'ok' && premium !== null) {
    if (premium >= 25) score = 20
    else if (premium >= 15) score = 16
    else if (premium >= 5) score = 12
    else if (premium >= 0) score = 6
    else score = 0
  } else {
    score = 10 // 无目标价或样本不足：缺数据按中位分，不给方向性判断
  }
  if (gain !== null && gain >= 30) score -= 4
  return clamp(score, 0, 20)
}

function riskScore(row) {
  const hits = governanceHits(row)
  const flags = (row.flags ?? []).join(' ')
  let score = 20
  if (hits.length > 0) score = 4
  else if (/数据问题|分红缺口/.test(flags)) score = 10
  return clamp(score, 0, 20)
}

function ratingOf(row) {
  const parts = {
    分红: dividendScore(row),
    盈利: earningsScore(row),
    估值: valuationScore(row),
    价格: priceScore(row),
    风险: riskScore(row),
  }
  const score = parts.分红 + parts.盈利 + parts.估值 + parts.价格 + parts.风险
  const gain = num(row.pnlPct)
  const hits = governanceHits(row)
  const reasons = []

  let rating
  if (score >= addMin) rating = '加仓'
  else if (score >= holdMin) rating = '持有'
  else if (score >= watchMin) rating = '观察'
  else if (score >= reduceMin) rating = '减仓'
  else rating = '卖出'

  // 覆盖规则 1：治理事件
  if (hits.length > 0) {
    rating = gain !== null && gain <= sellBuffer ? '减仓' : '卖出'
    reasons.push(hits.join('、'))
  }
  // 覆盖规则 2：止盈触发，至少减仓（自己算一遍，不依赖 dossier 的标记）
  const takeProfit = num(fileConfig.takeProfitPct) ?? 30
  const nearTarget = num(fileConfig.nearTargetRatio) ?? 0.85
  const gainHigh = row.gainHigh === true || (gain !== null && gain >= takeProfit)
  const ratio = num(row.analyst?.ratio)
  const sellZone = row.sellZone === true || (ratio !== null && ratio >= nearTarget)
  if ((gainHigh || sellZone) && (rating === '加仓' || rating === '持有')) {
    rating = '减仓'
    reasons.push(gainHigh ? `浮盈到 ${takeProfit}% 线` : '接近机构目标价')
  }
  // 覆盖规则 3：无股息、无目标的 ETF 最高只能「持有」
  if (row.kind === 'ETF' && rating === '加仓') rating = '持有'

  // 封顶规则：分数不能盖过硬约束
  const rank = { 卖出: 0, 减仓: 1, 观察: 2, 持有: 3, 加仓: 4 }
  const cap = (value, max) => (rank[value] > rank[max] ? max : value)
  if (parts.盈利 <= 5) {
    rating = cap(rating, '观察')
    reasons.push('盈利已明显恶化')
  }
  const yieldPct = num(row.dividend?.yieldPct)
  const minYield = num(minYieldCfg) ?? 4
  const repair = row.repair === true
  if (row.kind !== 'ETF' && !repair && (yieldPct === null || yieldPct < minYield)) {
    rating = cap(rating, '持有')
    reasons.push('现价股息率低于加仓下限')
  }
  const maxWeight = num(maxWeightCfg) ?? 15
  const weight = num(row.weightPct)
  if (weight !== null && weight >= maxWeight) {
    rating = cap(rating, '持有')
    reasons.push('已达单只权重上限')
  }

  // 周期底部候选（人工按五问判定后经 --cycle 传入）：至少「持有」
  const cycleCodes = (getArg('--cycle', '') ?? '').split(',').map(code => code.trim()).filter(Boolean)
  if (cycleCodes.includes(row.code) && rating === '观察') {
    rating = '持有'
    reasons.push('周期底部候选')
  }

  return { ...parts, score, rating, reasons }
}

const rows = (report.rows ?? []).map(row => ({
  code: row.code,
  name: row.name,
  kind: row.kind,
  price: row.price,
  gain: num(row.pnlPct),
  weight: num(row.weightPct),
  dividendYield: num(row.dividend?.yieldPct),
  result: ratingOf(row),
}))

rows.sort((a, b) => b.result.score - a.result.score)

console.log(`# 持仓评级 · ${new Date().toISOString().slice(0, 10)}`)
console.log('')
console.log('| 评级 | 代码 | 名称 | 现价 | 浮盈% | 股息率% | 分红 | 盈利 | 估值 | 价格 | 风险 | 综合分 |')
console.log('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
for (const r of rows) {
  const g = r.gain === null ? '—' : r.gain.toFixed(1)
  const y = r.dividendYield === null ? '—' : r.dividendYield.toFixed(2)
  const q = r.result
  console.log(`| ${q.rating} | ${r.code} | ${r.name} | ${r.price ?? '—'} | ${g} | ${y} | ${q.分红} | ${q.盈利} | ${q.估值} | ${q.价格} | ${q.风险} | ${q.score} |`)
}

const count = rows.reduce((acc, r) => {
  acc[r.result.rating] = (acc[r.result.rating] ?? 0) + 1
  return acc
}, {})
console.log('')
console.log(`统计：${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(' · ')}`)

const covered = rows.filter(r => r.result.reasons.length > 0)
if (covered.length > 0) {
  console.log('')
  console.log('覆盖规则：')
  for (const r of covered) console.log(`- ${r.name}：${r.result.reasons.join('；')}`)
}
