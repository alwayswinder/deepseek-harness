/**
 * 分红汇总与提醒的固定数据用例。
 *
 * 这些数字来自 2026-10 的真实接口快照（002027 的季度分红、515180 的年度分红、
 * 561580 的月分红），改了口径就能看出哪一条结论变了。
 *
 * 运行：node --test tests
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  finalizeRows, quoteTimeIso, sectorWeights, summarizeFundDividend, summarizeStockDividends,
} from '../scripts/shared/analysis.mjs'

const TODAY = '2026-10-21'
const CONFIG = { trimYieldPct: 2.5, maxSingleWeightPct: 15, repairCodes: [] }

/** 002027 分众传媒：2025 年内三次分配，2026 中期一次；另有一条未实施预案。 */
const STOCK_ROWS = [
  { reportDate: '2026-06-30', perShare: 0.05, exDate: '2026-09-04', progress: '实施分配', plan: '10派0.5元' },
  { reportDate: '2025-12-31', perShare: 0.19, exDate: '2026-07-09', progress: '实施分配', plan: '10派1.9元' },
  { reportDate: '2025-09-30', perShare: 0.05, exDate: '2025-11-25', progress: '实施分配', plan: '10派0.5元' },
  { reportDate: '2025-06-30', perShare: 0.1, exDate: '2025-10-17', progress: '实施分配', plan: '10派1元' },
  { reportDate: '2024-12-31', perShare: 0.23, exDate: '2025-08-22', progress: '实施分配', plan: '10派2.3元' },
  { reportDate: '2024-06-30', perShare: 0.1, exDate: '2024-09-26', progress: '实施分配', plan: '10派1元' },
  { reportDate: '2026-09-30', perShare: 0.12, exDate: '2026-10-26', progress: '股东大会通过', plan: '10派1.2元' },
]

const STOCK_PERFORMANCE = [
  { reportDate: '2026-06-30', eps: 0.2166 },
  { reportDate: '2025-12-31', eps: 0.204 },
  { reportDate: '2024-12-31', eps: 0.3 },
]

describe('summarizeStockDividends', () => {
  const summary = summarizeStockDividends(STOCK_ROWS, STOCK_PERFORMANCE, 5.12, 4.83, 4.5, TODAY)

  it('sums every implemented period of the latest complete year', () => {
    assert.equal(summary.latestYear, 2025)
    assert.equal(summary.annualDps, 0.34)
    assert.equal(summary.annualLabel, '2025年度')
  })

  it('derives yield, payout and target price from that annual figure', () => {
    assert.equal(summary.yieldPct, 6.64)
    assert.equal(summary.costYieldPct, 7.04)
    assert.equal(summary.payoutPct, 166.67)
    assert.equal(summary.targetPrice, 7.56)
  })

  it('measures trailing twelve months by ex-date', () => {
    // 2025-10-17 的 0.1 元已超出 365 天，不计入 TTM。
    assert.equal(summary.ttmDps, 0.29)
  })

  it('compares the two latest complete years', () => {
    assert.equal(summary.annualTrendPct, 3.03)
    assert.equal(summary.dividendYears, 2)
  })

  it('keeps an unimplemented plan as nextPlan, not as paid dividend', () => {
    assert.deepEqual(summary.nextPlan, { exDate: '2026-10-26', plan: '10派1.2元', perShare: 0.12 })
    assert.equal(summary.recent[0].period, '2026-06')
  })
})

describe('summarizeFundDividend', () => {
  /** 515180：每年 10 月分一次，TTM 恰好横跨两次，不能把两次都算成年度股息。 */
  const yearly = [
    { year: 2026, exDate: '2026-10-16', perShare: 0.061 },
    { year: 2025, exDate: '2025-10-21', perShare: 0.061 },
    { year: 2024, exDate: '2024-10-18', perShare: 0.063 },
    { year: 2023, exDate: '2023-10-24', perShare: 0.062 },
  ]

  it('uses the latest complete year, not the trailing twelve months', () => {
    const summary = summarizeFundDividend(yearly, 1.359, 1.348, 4.5, TODAY)
    assert.equal(summary.annualLabel, '2025年')
    assert.equal(summary.annualDps, 0.061)
    assert.equal(summary.ttmDps, 0.122)
    assert.equal(summary.yieldPct, 4.49)
    assert.equal(summary.targetPrice, 1.36)
  })

  it('compares complete years only, so a partial year is not a dividend cut', () => {
    // 561580：2026 年到 10 月为止只分了 0.06，2025 全年 0.095，2024 全年 0.095。
    const monthly = [
      { year: 2026, exDate: '2026-10-19', perShare: 0.005 },
      { year: 2026, exDate: '2026-09-14', perShare: 0.005 },
      { year: 2025, exDate: '2025-12-15', perShare: 0.05 },
      { year: 2025, exDate: '2025-06-16', perShare: 0.045 },
      { year: 2024, exDate: '2024-12-16', perShare: 0.05 },
      { year: 2024, exDate: '2024-06-17', perShare: 0.045 },
    ]
    const summary = summarizeFundDividend(monthly, 1.271, 1.215, 4.5, TODAY)
    assert.equal(summary.annualDps, 0.095)
    assert.equal(summary.annualTrendPct, 0)
    assert.equal(summary.recent[0].period, '2026-10')
  })

  it('reports zero for a fund that never distributed', () => {
    const summary = summarizeFundDividend([], 1, 1, 4.5, TODAY)
    assert.equal(summary.annualLabel, '无分红记录')
    assert.equal(summary.annualDps, 0)
    assert.equal(summary.yieldPct, 0)
    assert.equal(summary.targetPrice, null)
  })
})

describe('sectorWeights', () => {
  it('groups the account weights by sector, heaviest first', () => {
    const rows = [
      { sector: '银行Ⅱ', weightPct: 2 },
      { sector: 'ETF/基金', weightPct: 24 },
      { sector: '银行Ⅱ', weightPct: 1.5 },
      { weightPct: 0.5 },
    ]
    assert.deepEqual(sectorWeights(rows), [
      { name: 'ETF/基金', weightPct: 24 },
      { name: '银行Ⅱ', weightPct: 3.5 },
      { name: '未分类', weightPct: 0.5 },
    ])
  })
})

describe('finalizeRows', () => {
  /** 一只最小化的标的，字段与 dossier 的 row 对齐。 */
  function row(overrides) {
    return {
      code: '600000', kind: '股票', price: 10, value: 10_000, pct: 0,
      repair: false, flags: [], buyZone: false,
      dividend: { yieldPct: 5, annualTrendPct: null, dividendYears: 5, targetPrice: 8, nextPlan: null, payoutPct: 40 },
      performance: null,
      ...overrides,
    }
  }

  it('flags a holding above the single-position cap', () => {
    const rows = [row({ code: '601166', value: 73_360 }), row({ code: '600941', value: 9_659 })]
    finalizeRows(rows, CONFIG, 100_000, TODAY)
    assert.equal(rows[0].weightPct, 73.36)
    assert.match(rows[0].flags.join('；'), /权重 73\.4% 超 15% 上限/)
    assert.equal(rows[1].flags.length, 0)
  })

  it('marks a repair holding instead of applying the yield thresholds', () => {
    const rows = [row({ code: '601888', repair: true, dividend: { yieldPct: 1.43, annualTrendPct: null, dividendYears: 5, targetPrice: 15.56, nextPlan: null, payoutPct: 40 } })]
    finalizeRows(rows, CONFIG, 1_000_000, TODAY)
    assert.equal(rows[0].buyZone, false)
    assert.equal(rows[0].flags.includes('价值修复类，按退出条件判断'), true)
    assert.equal(rows[0].flags.join('；').includes('股息率低于'), false)
  })

  it('does not apply the yield threshold to a fund that never distributed', () => {
    const rows = [row({ kind: 'ETF', dividend: { yieldPct: 0, annualTrendPct: null, dividendYears: 0, targetPrice: null, nextPlan: null, payoutPct: null } })]
    finalizeRows(rows, CONFIG, 1_000_000, TODAY)
    assert.equal(rows[0].flags.join('；').includes('股息率低于'), false)
  })

  it('flags an ex-dividend date within the next week', () => {
    const rows = [row({ dividend: { yieldPct: 5, annualTrendPct: null, dividendYears: 5, targetPrice: 8, nextPlan: { exDate: '2026-10-26', plan: '10派1元', perShare: 0.1 }, payoutPct: 40 } })]
    finalizeRows(rows, CONFIG, 1_000_000, TODAY)
    assert.equal(rows[0].flags.includes('5 天后除息'), true)
  })
})

describe('quoteTimeIso', () => {
  it('converts the exchange timestamp', () => {
    assert.equal(quoteTimeIso('20261021161459'), '2026-10-21T16:14:59')
  })

  it('rejects anything else', () => {
    assert.equal(quoteTimeIso(''), null)
    assert.equal(quoteTimeIso(null), null)
    assert.equal(quoteTimeIso('2026-10-21'), null)
  })
})
