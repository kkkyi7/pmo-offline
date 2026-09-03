import { describe, expect, it } from 'vitest'
import v07 from '../sample/v07.json'
import { maxISO } from './dates'
import {
  buildWeekTicks,
  eachDay,
  lastWeekNumber,
  mondayOf,
  resolveGanttAnchor,
  segmentStart,
  weekNumberOf,
} from './ganttWeeks'
import { buildScenario } from './scenario'
import { kindOfSheet } from './sheets'

const raw = v07 as {
  names: string[]
  sheets: Record<string, { aoa: unknown[][]; formulas: Record<string, string> }>
}

function sampleSheets() {
  return raw.names.map((name) => ({
    name,
    kind: kindOfSheet(name),
    aoa: raw.sheets[name].aoa.map((row) => row.slice()),
    formulas: { ...raw.sheets[name].formulas },
  }))
}

describe('gantt week numbering', () => {
  it('uses Monday as the start of a natural week', () => {
    expect(mondayOf('2026-09-02')).toBe('2026-08-31')
    expect(segmentStart('2026-09-02', 'natural_week')).toBe('2026-08-31')
  })

  it('numbers natural weeks from the week that contains the anchor', () => {
    expect(weekNumberOf('2026-08-31', '2026-09-02', 'natural_week')).toBe(1)
    expect(weekNumberOf('2026-09-06', '2026-09-02', 'natural_week')).toBe(1)
    expect(weekNumberOf('2026-09-07', '2026-09-02', 'natural_week')).toBe(2)
    expect(weekNumberOf('2026-08-30', '2026-09-02', 'natural_week')).toBeNull()
  })

  it('splits a calendar month into 7-day blocks', () => {
    expect(segmentStart('2026-09-02', 'month_7day')).toBe('2026-09-01')
    expect(weekNumberOf('2026-09-07', '2026-09-02', 'month_7day')).toBe(1)
    expect(weekNumberOf('2026-09-08', '2026-09-02', 'month_7day')).toBe(2)
    expect(weekNumberOf('2026-09-29', '2026-09-02', 'month_7day')).toBe(5)
    expect(weekNumberOf('2026-10-01', '2026-09-02', 'month_7day')).toBe(6)
  })

  it('clips natural weeks at month boundaries', () => {
    expect(segmentStart('2026-09-02', 'month_week')).toBe('2026-09-01')
    expect(weekNumberOf('2026-09-01', '2026-09-02', 'month_week')).toBe(1)
    expect(weekNumberOf('2026-09-06', '2026-09-02', 'month_week')).toBe(1)
    expect(weekNumberOf('2026-09-07', '2026-09-02', 'month_week')).toBe(2)
    expect(weekNumberOf('2026-08-31', '2026-09-02', 'month_week')).toBeNull()
  })

  it('runs W1 through the last plan week without restarting each month', () => {
    const ticks = buildWeekTicks(eachDay('2026-09-01', '2027-02-07'), '2026-09-02', 'natural_week')
    const labeled = ticks.filter((t) => t.week)
    expect(labeled[0]?.week).toBe(1)
    expect(labeled[0]?.start).toBe('2026-09-01')
    expect(labeled.map((t) => t.week)).toEqual(
      labeled.map((_, i) => i + 1),
    )
    expect(lastWeekNumber('2027-02-07', '2026-09-02', 'natural_week')).toBe(23)
    expect(labeled.at(-1)?.week).toBe(23)
  })

  it('lets month_7day cross a month boundary from the anchor bucket', () => {
    expect(weekNumberOf('2026-09-29', '2026-09-02', 'month_7day', true)).toBe(5)
    expect(weekNumberOf('2026-10-01', '2026-09-02', 'month_7day', true)).toBe(5)
    expect(weekNumberOf('2026-10-01', '2026-09-02', 'month_7day', false)).toBe(6)
    const ticks = buildWeekTicks(eachDay('2026-09-29', '2026-10-01'), '2026-09-02', 'month_7day', true)
    expect(ticks).toHaveLength(1)
    expect(ticks[0]?.week).toBe(5)
  })

  it('treats month_week + crossMonth as a natural week', () => {
    expect(weekNumberOf('2026-08-31', '2026-09-02', 'month_week', true)).toBe(1)
    expect(weekNumberOf('2026-08-31', '2026-09-02', 'natural_week')).toBe(1)
    expect(segmentStart('2026-09-02', 'month_week', true)).toBe('2026-08-31')
  })

  it('keeps natural_week the same whether crossMonth is on or off', () => {
    const days = eachDay('2026-08-31', '2026-09-14')
    expect(buildWeekTicks(days, '2026-09-02', 'natural_week', true)).toEqual(
      buildWeekTicks(days, '2026-09-02', 'natural_week', false),
    )
    expect(weekNumberOf('2026-09-07', '2026-09-02', 'natural_week', true)).toBe(
      weekNumberOf('2026-09-07', '2026-09-02', 'natural_week', false),
    )
  })

  it('numbers the sample plan from the earliest start without repeating W1', () => {
    const scenario = buildScenario({ name: '样例', sheets: sampleSheets() })
    const starts = scenario.tasks.map((t) => t.start)
    const ends = scenario.tasks.map((t) => t.end)
    const anchor = resolveGanttAnchor('', starts)
    expect(anchor).toBe('2023-09-03')
    const last = maxISO(ends)
    const ticks = buildWeekTicks(eachDay(anchor, last), anchor, 'natural_week')
    const weeks = ticks.map((t) => t.week).filter((n): n is number => n !== null)
    expect(weeks[0]).toBe(1)
    expect(weeks).toEqual(weeks.map((_, i) => i + 1))
    expect(weekNumberOf('2023-10-01', anchor, 'month_7day')).toBeGreaterThan(1)
    expect(scenario.ganttWeekCrossMonth).toBe(false)
  })
})
