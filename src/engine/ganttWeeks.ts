import {
  DEFAULT_GANTT_WEEK_MODE,
  type GanttWeekMode,
} from '../domain/workspace'
import { addDays, diffDays, minISO, parseISO, todayISO } from './dates'

export interface WeekTick {
  start: string
  end: string
  week: number | null
  days: number
}

export function isGanttWeekMode(value: unknown): value is GanttWeekMode {
  return value === 'natural_week' || value === 'month_7day' || value === 'month_week'
}

export function normalizeGanttWeekMode(value: unknown): GanttWeekMode {
  return isGanttWeekMode(value) ? value : DEFAULT_GANTT_WEEK_MODE
}

export function weekModeLocksCrossMonth(mode: GanttWeekMode): boolean {
  return mode === 'natural_week'
}

export function resolveGanttAnchor(stored: string, taskStarts: readonly string[]): string {
  if (parseISO(stored)) return stored
  return minISO([...taskStarts]) || todayISO()
}

function ymd(iso: string): { y: number; m: number; d: number } | null {
  const date = parseISO(iso)
  if (!date) return null
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function mondayOf(iso: string): string {
  const date = parseISO(iso)
  if (!date) return iso
  const back = date.getDay() === 0 ? 6 : date.getDay() - 1
  return addDays(iso, -back)
}

export function monthStartOf(iso: string): string {
  const parts = ymd(iso)
  if (!parts) return iso
  return `${parts.y}-${pad2(parts.m)}-01`
}

function month7Start(iso: string): string {
  const parts = ymd(iso)
  if (!parts) return iso
  const startDay = Math.floor((parts.d - 1) / 7) * 7 + 1
  return `${parts.y}-${pad2(parts.m)}-${pad2(startDay)}`
}

/** 自然周本身跨月；月/自然周打开跨月后按自然周切。 */
function usesNaturalWeek(mode: GanttWeekMode, crossMonth: boolean): boolean {
  return mode === 'natural_week' || (mode === 'month_week' && crossMonth)
}

export function weekOrigin(anchor: string, mode: GanttWeekMode, crossMonth = false): string {
  if (usesNaturalWeek(mode, crossMonth)) return mondayOf(anchor)
  if (mode === 'month_7day') return month7Start(anchor)
  const monday = mondayOf(anchor)
  const monthStart = monthStartOf(anchor)
  return monday > monthStart ? monday : monthStart
}

export function segmentStart(iso: string, mode: GanttWeekMode, crossMonth = false, anchor = iso): string {
  if (usesNaturalWeek(mode, crossMonth)) return mondayOf(iso)
  if (mode === 'month_7day' && !crossMonth) return month7Start(iso)
  if (mode === 'month_7day' && crossMonth) {
    const origin = month7Start(anchor)
    const diff = diffDays(origin, iso)
    if (diff === null) return iso
    return addDays(origin, Math.floor(diff / 7) * 7)
  }
  const monday = mondayOf(iso)
  const monthStart = monthStartOf(iso)
  return monday > monthStart ? monday : monthStart
}

export function segmentKey(iso: string, mode: GanttWeekMode, crossMonth = false, anchor = iso): string {
  const parts = ymd(iso)
  if (!parts) return iso
  if (usesNaturalWeek(mode, crossMonth)) return mondayOf(iso)
  if (mode === 'month_7day' && !crossMonth) return `${parts.y}-${pad2(parts.m)}-${Math.floor((parts.d - 1) / 7)}`
  if (mode === 'month_7day' && crossMonth) {
    const origin = month7Start(anchor)
    const diff = diffDays(origin, iso)
    return `r7:${diff === null ? iso : Math.floor(diff / 7)}`
  }
  return `${parts.y}-${pad2(parts.m)}-${mondayOf(iso)}`
}

export function weekNumberOf(
  iso: string,
  anchor: string,
  mode: GanttWeekMode,
  crossMonth = false,
): number | null {
  if (!parseISO(iso) || !parseISO(anchor)) return null
  const origin = weekOrigin(anchor, mode, crossMonth)
  if (iso < origin) return null
  let week = 1
  let cur = origin
  while (cur < iso) {
    const next = addDays(cur, 1)
    if (segmentKey(cur, mode, crossMonth, anchor) !== segmentKey(next, mode, crossMonth, anchor)) week += 1
    cur = next
  }
  return week
}

export function buildWeekTicks(
  isos: readonly string[],
  anchor: string,
  mode: GanttWeekMode,
  crossMonth = false,
): WeekTick[] {
  if (isos.length === 0) return []
  const resolved = parseISO(anchor) ? anchor : isos[0]
  const out: WeekTick[] = []
  let i = 0
  while (i < isos.length) {
    const start = isos[i]
    const week = weekNumberOf(start, resolved, mode, crossMonth)
    let j = i + 1
    while (j < isos.length && weekNumberOf(isos[j], resolved, mode, crossMonth) === week) j += 1
    out.push({ start, end: isos[j - 1], week, days: j - i })
    i = j
  }
  return out
}

export function eachDay(start: string, end: string): string[] {
  if (!parseISO(start) || !parseISO(end) || start > end) return []
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

export function lastWeekNumber(end: string, anchor: string, mode: GanttWeekMode, crossMonth = false): number {
  return weekNumberOf(end, anchor, mode, crossMonth) ?? 0
}

export function formatWeekLabel(week: number | null): string {
  return week ? `W${week}` : ''
}
