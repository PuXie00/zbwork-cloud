const SHANGHAI = 'Asia/Shanghai'

export type ShanghaiClock = {
  date: string
  minutes: number
}

export function shanghaiClock(now: Date): ShanghaiClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  const hour = Number(pick('hour'))
  const minute = Number(pick('minute'))
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    minutes: hour * 60 + minute,
  }
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day + days))
  const y = utc.getUTCFullYear()
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function assertDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式应为 YYYY-MM-DD')
  const [year, month, day] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new Error('日期无效')
  }
  return date
}

export function parseHm(value: string, fallback: string): number {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!matched) {
    if (value === fallback) throw new Error(`时刻无效：${value}`)
    return parseHm(fallback, fallback)
  }
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour > 23 || minute > 59) {
    if (value === fallback) throw new Error(`时刻无效：${value}`)
    return parseHm(fallback, fallback)
  }
  return hour * 60 + minute
}

export function assertHm(value: string): string {
  parseHm(value, value)
  const [hour, minute] = value.split(':')
  return `${hour.padStart(2, '0')}:${minute}`
}

export function formatMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
