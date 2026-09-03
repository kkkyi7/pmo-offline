import { addDays } from './dates'

export type DragMode = 'move' | 'start' | 'end'

export function shiftTaskSpan(
  start: string,
  end: string,
  mode: DragMode,
  deltaDays: number,
): { start: string; end: string } {
  if (mode === 'move') {
    return { start: addDays(start, deltaDays), end: addDays(end, deltaDays) }
  }
  if (mode === 'end') {
    const next = addDays(end, deltaDays)
    return { start, end: next >= start ? next : start }
  }
  const next = addDays(start, deltaDays)
  return { start: next <= end ? next : end, end }
}
