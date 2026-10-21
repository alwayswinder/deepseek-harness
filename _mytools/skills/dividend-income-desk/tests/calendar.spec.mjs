/**
 * 交易日与交易时段的固定数据用例。
 *
 * 日历口径：只跳过周末，不查法定节假日。
 *
 * 运行：node --test tests
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextTradingDays, sessionPhase, weekdayOf } from '../scripts/shared/calendar.mjs'

describe('nextTradingDays', () => {
  it('skips the weekend after Friday', () => {
    assert.deepEqual(nextTradingDays('2026-10-23', 3), [
      { date: '2026-10-26', weekday: '周一' },
      { date: '2026-10-27', weekday: '周二' },
      { date: '2026-10-28', weekday: '周三' },
    ])
  })

  it('starts after the base day, not on it', () => {
    assert.deepEqual(nextTradingDays('2026-10-21', 2), [
      { date: '2026-10-22', weekday: '周四' },
      { date: '2026-10-23', weekday: '周五' },
    ])
  })

  it('works from a weekend base day', () => {
    assert.deepEqual(nextTradingDays('2026-10-24', 1), [{ date: '2026-10-26', weekday: '周一' }])
  })

  it('names the weekday', () => {
    assert.equal(weekdayOf('2026-10-21'), '周三')
  })
})

describe('sessionPhase', () => {
  it('splits the trading day at the auction and close', () => {
    assert.equal(sessionPhase('2026-10-21T08:00'), '盘前（9:15 前）')
    assert.equal(sessionPhase('2026-10-21T09:15'), '集合竞价（9:15–9:25）')
    assert.equal(sessionPhase('2026-10-21T09:20'), '集合竞价（9:15–9:25）')
    assert.equal(sessionPhase('2026-10-21T09:25'), '盘中（9:25–15:00）')
    assert.equal(sessionPhase('2026-10-21T14:59'), '盘中（9:25–15:00）')
    assert.equal(sessionPhase('2026-10-21T15:00'), '收盘后（15:00 后）')
    assert.equal(sessionPhase('2026-10-21T18:55'), '收盘后（15:00 后）')
  })

  it('says so when the time cannot be read', () => {
    assert.equal(sessionPhase('2026-10-21'), '未知')
  })
})
