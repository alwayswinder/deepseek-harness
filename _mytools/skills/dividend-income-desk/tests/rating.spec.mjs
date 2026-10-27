import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/rate-holdings.mjs', import.meta.url))

function row(overrides) {
  return {
    code: '600001',
    name: '样例',
    kind: '股票',
    price: 10,
    pnlPct: 5,
    weightPct: 5,
    pb: 0.8,
    dividend: { yieldPct: 6, payoutPct: 50, annualTrendPct: 2 },
    performance: { netProfitYoY: 10, eps: 0.5, deductEps: 0.5, oneOffPct: 5, history: [] },
    analyst: { status: 'ok', premiumPct: 30 },
    announcements: [],
    flags: [],
    repair: false,
    ...overrides,
  }
}

function run(rows, extraArgs = []) {
  const dir = mkdtempSync(join(tmpdir(), 'rating-'))
  const file = join(dir, 'dossier.json')
  writeFileSync(file, JSON.stringify({
    config: { minYieldToBuyPct: 4, maxSingleWeightPct: 15, rating: {} },
    rows,
  }))
  return execFileSync(process.execPath, [script, '--file', file, ...extraArgs], { encoding: 'utf8' })
}

test('五档评级：高分给加仓，治理事件给卖出，低息封顶到持有', () => {
  const output = run([
    row({ code: '600001', name: '稳健高息' }),
    row({
      code: '600002',
      name: '治理风险',
      announcements: [{ title: '关于高级管理人员被实施留置的公告' }],
    }),
    row({
      code: '600003',
      name: '低息',
      dividend: { yieldPct: 2, payoutPct: 40, annualTrendPct: 0 },
      performance: { netProfitYoY: 0, eps: 0.5, deductEps: 0.5, oneOffPct: 0, history: [] },
      analyst: { status: 'ok', premiumPct: 10 },
    }),
  ])

  assert.match(output, /\| 加仓 \| 600001 \|/)
  assert.match(output, /\| 卖出 \| 600002 \|/)
  assert.match(output, /\| 持有 \| 600003 \|/)
})

test('止盈触发会把高分标的压到减仓', () => {
  const output = run([
    row({ code: '600004', name: '浮盈到线', pnlPct: 35 }),
  ])
  assert.match(output, /\| 减仓 \| 600004 \|/)
})

test('周期底部候选经 --cycle 传入后，评级至少持有', () => {
  const depressed = row({
    code: '600005',
    name: '周期底',
    pb: 0.5,
    dividend: { yieldPct: 5, payoutPct: 50, annualTrendPct: 0 },
    performance: { netProfitYoY: -40, eps: 0.5, deductEps: 0.5, oneOffPct: 0, history: [] },
  })
  const without = run([depressed])
  assert.match(without, /\| 观察 \| 600005 \|/)
  const withCycle = run([depressed], ['--cycle', '600005'])
  assert.match(withCycle, /\| 持有 \| 600005 \|/)
})
