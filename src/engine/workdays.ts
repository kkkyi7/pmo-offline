import { addDays, parseISO } from './dates'

export function isWeekend(iso: string): boolean {
  const d = parseISO(iso)
  if (!d) return false
  const day = d.getDay()
  return day === 0 || day === 6
}

export function isNonWorkday(iso: string, holidays: ReadonlySet<string>): boolean {
  return isWeekend(iso) || holidays.has(iso)
}

/** Excel WORKDAY.INTL(start, days, 1): days working days after start, skipping Sat/Sun + holidays. */
export function workdayIntl(start: string, days: number, holidays: ReadonlySet<string>): string {
  if (!parseISO(start) || !Number.isFinite(days) || days === 0) return days === 0 ? start : ''
  let left = Math.abs(Math.round(days))
  let cur = start
  const step = days > 0 ? 1 : -1
  while (left > 0) {
    cur = addDays(cur, step)
    if (!isNonWorkday(cur, holidays)) left -= 1
  }
  return cur
}

/** Excel NETWORKDAYS(start, end): inclusive working days. */
export function networkDays(start: string, end: string, holidays: ReadonlySet<string>): number {
  if (!parseISO(start) || !parseISO(end)) return 0
  let a = start
  let b = end
  if (a > b) {
    a = end
    b = start
  }
  let n = 0
  let cur = a
  while (cur <= b) {
    if (!isNonWorkday(cur, holidays)) n += 1
    cur = addDays(cur, 1)
  }
  return n
}

/** Number of working days after start up to and including end, exactly invertible with workdayIntl(start, days). */
export function workdaysBetween(start: string, end: string, holidays: ReadonlySet<string>): number {
  if (!parseISO(start) || !parseISO(end) || start >= end) return 0
  let n = 0
  let cur = start
  while (cur < end) {
    cur = addDays(cur, 1)
    if (!isNonWorkday(cur, holidays)) n += 1
  }
  return n
}
