import { describe, expect, it } from 'vitest'
import { dueReminders } from '../electron/workbench/reminders'
import { addDays, shanghaiClock } from '../electron/workbench/time'

const base = {
  clock: { date: '2026-09-27', minutes: 16 * 60 },
  writeFirst: '16:00',
  writeSecond: '17:00',
  reviewAt: '10:00',
  todaySaved: false,
  yesterdayExists: false,
  yesterdayReviewed: false,
  fired: new Set<string>(),
}

describe('提醒', () => {
  it('15:59 不提醒写入', () => {
    expect(dueReminders({ ...base, clock: { date: '2026-09-27', minutes: 15 * 60 + 59 } })).toEqual([])
  })

  it('16:00 未保存只提醒第一次', () => {
    expect(dueReminders(base).map(item => item.slot)).toEqual(['write_first'])
  })

  it('16:00 已保存不再提醒', () => {
    expect(dueReminders({ ...base, todaySaved: true })).toEqual([])
  })

  it('17:00 仍未保存时补上第二次，已错过的第一次也会出现', () => {
    const slots = dueReminders({ ...base, clock: { date: '2026-09-27', minutes: 17 * 60 } }).map(item => item.slot)
    expect(slots).toEqual(['write_first', 'write_second'])
  })

  it('第一次已响过且仍未保存时，17:00 只响第二次', () => {
    const slots = dueReminders({
      ...base,
      clock: { date: '2026-09-27', minutes: 17 * 60 },
      fired: new Set(['2026-09-27:write_first']),
    }).map(item => item.slot)
    expect(slots).toEqual(['write_second'])
  })

  it('保存之后 17:00 不提醒', () => {
    expect(dueReminders({
      ...base,
      clock: { date: '2026-09-27', minutes: 17 * 60 },
      todaySaved: true,
    })).toEqual([])
  })

  it('10:00 有昨日记录且未查看时提醒回看', () => {
    const due = dueReminders({
      ...base,
      clock: { date: '2026-09-28', minutes: 10 * 60 },
      yesterdayExists: true,
    })
    expect(due.map(item => item.slot)).toEqual(['review'])
    expect(due[0].page).toBe('home')
  })

  it('09:59 不显示回看提醒', () => {
    expect(dueReminders({
      ...base,
      clock: { date: '2026-09-28', minutes: 9 * 60 + 59 },
      yesterdayExists: true,
    })).toEqual([])
  })

  it('没有昨日记录时不编造回看提醒', () => {
    expect(dueReminders({
      ...base,
      clock: { date: '2026-09-28', minutes: 10 * 60 },
      yesterdayExists: false,
    })).toEqual([])
  })

  it('已查看后不再提醒', () => {
    expect(dueReminders({
      ...base,
      clock: { date: '2026-09-28', minutes: 11 * 60 },
      yesterdayExists: true,
      yesterdayReviewed: true,
    })).toEqual([])
  })
})

describe('上海时间', () => {
  it('把 UTC 08:00 换成上海 16:00', () => {
    expect(shanghaiClock(new Date('2026-09-27T08:00:00.000Z'))).toEqual({
      date: '2026-09-27',
      minutes: 16 * 60,
    })
  })

  it('按日历减一天', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
