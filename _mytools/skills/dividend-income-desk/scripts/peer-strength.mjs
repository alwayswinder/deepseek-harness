#!/usr/bin/env node
/**
 * 相对强度：把每只持仓的扣非同比和同行中位比一比，判断“加速下滑”是行业性的还是个体性的。
 *
 * 用法：
 *   node scripts/peer-strength.mjs            # Markdown 表
 *   node scripts/peer-strength.mjs --json     # 结构化，便于下游
 *
 * 口径：优先用扣非同比（KCFJCXSYJLRTZ），缺失时退回归母同比（PARENTNETPROFITTZ）。
 * 同行清单在 config.json 的 riskReview.peers，阈值是 riskReview.relativeStrengthMinPct。
 * 结论：
 *   优于同行中位 ≥ 阈值 → 行业性下滑（不因“加速”单独降级）
 *   差于同行中位 ≥ 阈值 → 个体恶化（不能拿环境当借口）
 *   中间                 → 同步
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, '..', 'config.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))
const review = config.riskReview ?? {}
const peers = review.peers ?? {}
const minDelta = Number.isFinite(Number(review.relativeStrengthMinPct))
  ? Number(review.relativeStrengthMinPct)
  : 10
const minPeerCount = Number.isFinite(Number(review.minPeerCount))
  ? Number(review.minPeerCount)
  : 3
const asJson = process.argv.includes('--json')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function secucode(code) {
  if (/^(6|9)/.test(code)) return `${code}.SH`
  return `${code}.SZ`
}

async function fetchYoy(code) {
  const url = 'https://datacenter.eastmoney.com/securities/api/data/v1/get'
    + '?reportName=RPT_F10_FINANCE_MAINFINADATA'
    + '&columns=SECUCODE,SECURITY_NAME_ABBR,REPORT_DATE,PARENTNETPROFITTZ,KCFJCXSYJLRTZ,KCFJCXSYJLR'
    + `&filter=(SECUCODE%3D%22${secucode(code)}%22)`
    + '&pageNumber=1&pageSize=1&sortTypes=-1&sortColumns=REPORT_DATE&source=HSF10&client=PC'
  const response = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://emweb.securities.eastmoney.com/' } })
  const payload = await response.json()
  const row = payload?.result?.data?.[0]
  if (!row) return null
  const deduct = Number(row.KCFJCXSYJLRTZ)
  const net = Number(row.PARENTNETPROFITTZ)
  const deductProfit = Number(row.KCFJCXSYJLR)
  return {
    code,
    name: row.SECURITY_NAME_ABBR,
    reportDate: String(row.REPORT_DATE).slice(0, 10),
    yoy: Number.isFinite(deduct) ? deduct : (Number.isFinite(net) ? net : null),
    deductProfit: Number.isFinite(deductProfit) ? deductProfit : null,
    basis: Number.isFinite(deduct) ? '扣非' : '归母',
  }
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const rows = []
for (const [code, peerCodes] of Object.entries(peers)) {
  const own = await fetchYoy(code)
  const peerRows = []
  for (const peer of peerCodes) {
    const item = await fetchYoy(peer)
    if (item !== null) peerRows.push(item)
  }
  if (own === null || own.yoy === null) {
    rows.push({ code, name: own?.name ?? code, yoy: null, basis: own?.basis, reportDate: own?.reportDate, peerMedian: null, delta: null, verdict: '数据不足' })
    continue
  }
  const values = peerRows.map(item => item.yoy).filter(value => Number.isFinite(value))
  const peerMedian = median(values)
  const delta = peerMedian === null ? null : Number((own.yoy - peerMedian).toFixed(1))
  const lossValues = peerRows.filter(item => item.deductProfit !== null)
  const lossPct = lossValues.length === 0
    ? null
    : Math.round((lossValues.filter(item => item.deductProfit < 0).length / lossValues.length) * 100)
  let verdict = '数据不足'
  if (delta !== null) {
    if (peerRows.length < minPeerCount) verdict = '同行样本不足'
    else if (delta >= minDelta) verdict = '行业性下滑'
    else if (delta <= -minDelta) verdict = '个体恶化'
    else verdict = '与行业同步'
  }
  rows.push({
    code,
    name: own.name,
    reportDate: own.reportDate,
    basis: own.basis,
    yoy: Number(own.yoy.toFixed(1)),
    peerCodes: peerRows.map(item => `${item.name} ${item.yoy.toFixed(1)}`),
    peerMedian: peerMedian === null ? null : Number(peerMedian.toFixed(1)),
    peerLossPct: lossPct,
    delta,
    verdict,
  })
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.log('# 相对强度（扣非同比，缺失用归母）')
  console.log('')
  console.log('| 代码 | 名称 | 同比% | 同行中位% | 差值 | 同行亏损面 | 结论 | 报告期 |')
  console.log('| --- | --- | ---: | ---: | ---: | ---: | --- | --- |')
  for (const row of rows) {
    const delta = row.delta === null ? '—' : `${row.delta > 0 ? '+' : ''}${row.delta}`
    const loss = row.peerLossPct === null || row.peerLossPct === undefined ? '—' : `${row.peerLossPct}%`
    console.log(`| ${row.code} | ${row.name} | ${row.yoy ?? '—'} | ${row.peerMedian ?? '—'} | ${delta} | ${loss} | ${row.verdict} | ${row.reportDate ?? '—'} |`)
  }
  console.log('')
  console.log(`阈值：优于/差于同行中位 ${minDelta} 个百分点。同行口径可能混用中报与三季报，结论前先看报告期。`)
  const industries = rows.filter(row => row.verdict === '行业性下滑').map(row => row.name)
  if (industries.length > 0) console.log(`行业性下滑（“加速”不单独降级）：${industries.join('、')}`)
  const individual = rows.filter(row => row.verdict === '个体恶化').map(row => row.name)
  if (individual.length > 0) console.log(`个体恶化（照旧降级）：${individual.join('、')}`)
}
