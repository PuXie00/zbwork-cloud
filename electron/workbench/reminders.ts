import { formatMinutes, parseHm, type ShanghaiClock } from './time'

export type ReminderSlot = 'write_first' | 'write_second' | 'review'

export type DueReminder = {
  slot: ReminderSlot
  fireKey: string
  title: string
  body: string
  page: 'record' | 'home'
}

export function dueReminders(input: {
  clock: ShanghaiClock
  writeFirst: string
  writeSecond: string
  reviewAt: string
  todaySaved: boolean
  yesterdayExists: boolean
  yesterdayReviewed: boolean
  fired: ReadonlySet<string>
}): DueReminder[] {
  const { clock } = input
  const due: DueReminder[] = []
  const reviewAt = parseHm(input.reviewAt, '10:00')
  const writeFirst = parseHm(input.writeFirst, '16:00')
  const writeSecond = parseHm(input.writeSecond, '17:00')

  if (
    clock.minutes >= reviewAt
    && input.yesterdayExists
    && !input.yesterdayReviewed
    && !input.fired.has(`${clock.date}:review`)
  ) {
    due.push({
      slot: 'review',
      fireKey: `${clock.date}:review`,
      title: '查看昨日工作记录',
      body: '昨日记录还没看过。打开工作台首页即可查看。',
      page: 'home',
    })
  }

  if (!input.todaySaved && clock.minutes >= writeFirst && !input.fired.has(`${clock.date}:write_first`)) {
    due.push({
      slot: 'write_first',
      fireKey: `${clock.date}:write_first`,
      title: '写入今日工作记录',
      body: `已到 ${formatMinutes(writeFirst)}。把今天的跟进、报价和未回事项记下来。`,
      page: 'record',
    })
  }

  if (!input.todaySaved && clock.minutes >= writeSecond && !input.fired.has(`${clock.date}:write_second`)) {
    due.push({
      slot: 'write_second',
      fireKey: `${clock.date}:write_second`,
      title: '写入今日工作记录',
      body: `已到 ${formatMinutes(writeSecond)}，今天的工作记录还没保存。`,
      page: 'record',
    })
  }

  return due
}
