import { MASTER_COLS, WBS_COLS, type PlanTask, type SheetData } from '../domain/workspace'
import { cloneSheets, normalizeTaskCode, setCell } from './sheets'

export function taskNameCol(task: PlanTask): number {
  if (task.source === 'master') return MASTER_COLS.name
  if (task.id.endsWith(':act')) return WBS_COLS.wbs
  return WBS_COLS.name
}

export function taskCodeCol(task: PlanTask): number | null {
  if (task.source === 'master') {
    if (task.level === 1) return MASTER_COLS.l1
    if (task.level === 2) return MASTER_COLS.l2
    return MASTER_COLS.l3
  }
  if (task.id.endsWith(':act') || !normalizeTaskCode(task.code)) return null
  if (task.level === 1) return WBS_COLS.l2
  if (task.level === 2) return WBS_COLS.l3
  return null
}

export function linkedTasks(tasks: readonly PlanTask[], task: PlanTask): PlanTask[] {
  const code = normalizeTaskCode(task.code)
  if (!code) return [task]
  const peers = tasks.filter((t) => normalizeTaskCode(t.code) === code && !t.id.endsWith(':act'))
  return peers.length ? peers : [task]
}

export function linkedTasksForEdit(tasks: readonly PlanTask[], task: PlanTask): PlanTask[] {
  if (normalizeTaskCode(task.code)) return linkedTasks(tasks, task)
  const host = tasks.find(
    (t) =>
      t.sheet === task.sheet &&
      t.row === task.row &&
      normalizeTaskCode(t.code) &&
      !t.id.endsWith(':act'),
  )
  return host ? linkedTasks(tasks, host) : [task]
}

export function applyGanttText(
  sheets: SheetData[],
  tasks: readonly PlanTask[],
  taskId: string,
  field: 'name' | 'code',
  value: string,
): SheetData[] {
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return sheets
  const next = cloneSheets(sheets)

  if (field === 'name') {
    const targets = task.id.endsWith(':act') ? [task] : linkedTasks(tasks, task)
    for (const item of targets) {
      const sheet = next.find((s) => s.name === item.sheet)
      if (!sheet) continue
      setCell(sheet, item.row, taskNameCol(item), value)
    }
    return next
  }

  if (taskCodeCol(task) === null) return sheets
  for (const item of linkedTasks(tasks, task)) {
    const sheet = next.find((s) => s.name === item.sheet)
    const col = taskCodeCol(item)
    if (!sheet || col === null) continue
    setCell(sheet, item.row, col, value)
  }
  return next
}

export function writeLinkedSheetValue(
  sheets: SheetData[],
  tasks: readonly PlanTask[],
  sheetName: string,
  row: number,
  col: number,
  value: unknown,
): SheetData[] {
  const hits = tasks.filter((t) => t.sheet === sheetName && t.row === row)
  const nameHit = hits.find((t) => taskNameCol(t) === col)
  const codeHit = hits.find((t) => taskCodeCol(t) === col)
  if (nameHit) return applyGanttText(sheets, tasks, nameHit.id, 'name', String(value ?? ''))
  if (codeHit) return applyGanttText(sheets, tasks, codeHit.id, 'code', String(value ?? ''))
  const next = cloneSheets(sheets)
  const sheet = next.find((s) => s.name === sheetName)
  if (sheet) setCell(sheet, row, col, value)
  return next
}
