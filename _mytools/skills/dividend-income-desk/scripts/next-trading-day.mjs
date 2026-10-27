#!/usr/bin/env node
/**
 * 算下一个（或接下来几个）交易日。
 *
 * 交易日只按周末排除，不查法定节假日；长假前后请自行核对交易所休市通知。
 * 同时给出当前处于哪个时段（盘前 / 集合竞价 / 盘中 / 收盘后），供“未来近期”的方案
 * 决定时间窗口与取价口径。
 *
 * 用法：node next-trading-day.mjs [--from YYYY-MM-DD] [--count 1] [--json]
 */

import { isWeekend, nextTradingDays, sessionPhase, weekdayOf } from './shared/calendar.mjs'

const args = parseArgs(process.argv.slice(2))
const from = args.from ?? todayShanghai()
const now = nowShanghai()
const next = nextTradingDays(from, args.count)
const phase = isWeekend(from) ? '周末休市' : sessionPhase(now)

const result = {
  from,
  weekday: weekdayOf(from),
  now,
  phase,
  next,
  assumption: '只跳过周末，不核对法定节假日；长假前后需要自行确认交易所休市安排。',
}

if (args.json) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`基准日：${result.from}（${result.weekday}，Asia/Shanghai 当前 ${result.now.slice(11)}，${phase}）`)
  for (const item of next) console.log(`下一交易日：${item.date}（${item.weekday}）`)
  console.log(`口径：${result.assumption}`)
}

function parseArgs(argv) {
  const parsed = { from: undefined, count: 1, json: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--from') parsed.from = argv[++index]
    else if (arg === '--count') parsed.count = Number(argv[++index])
    else if (arg === '--json') parsed.json = true
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node next-trading-day.mjs [--from YYYY-MM-DD] [--count 1] [--json]')
      console.log('交易日只跳过周末，不查法定节假日。')
      process.exit(0)
    } else {
      console.error(`未知参数: ${arg}`)
      process.exit(2)
    }
  }
  if (parsed.from !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.from)) {
    console.error('--from 需要 YYYY-MM-DD')
    process.exit(2)
  }
  if (!Number.isInteger(parsed.count) || parsed.count < 1 || parsed.count > 10) {
    console.error('--count 需要 1 到 10 之间的整数')
    process.exit(2)
  }
  return parsed
}

function todayShanghai() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function nowShanghai() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()).replace(' ', 'T')
}
