import type { PlanTask } from '../domain/workspace'
import { normalizeTaskCode } from './sheets'

export type GanttRole = 'phase' | 'scene' | 'task' | 'activity'

export type GanttRow =
  | { kind: 'section'; name: string; count: number }
  | {
      kind: 'task'
      task: PlanTask
      depth: number
      role: GanttRole
      seq: string
    }

export function taskRole(task: PlanTask): GanttRole {
  if (task.source === 'wbs' && !task.code) return 'activity'
  if (task.level === 1) return 'phase'
  if (task.level === 2) return 'scene'
  return 'task'
}

export function matchMasterTask(master: PlanTask[], wbs: PlanTask): PlanTask | undefined {
  const code = normalizeTaskCode(wbs.code)
  if (!code) return undefined
  return master.find((m) => normalizeTaskCode(m.code) === code)
}

function childrenOf(tasks: PlanTask[], parentId: string | null): PlanTask[] {
  return tasks.filter((t) => t.parentId === parentId)
}

function makeTaskRow(task: PlanTask, depth: number): Extract<GanttRow, { kind: 'task' }> {
  return {
    kind: 'task',
    task,
    depth,
    role: taskRole(task),
    seq: task.code.trim(),
  }
}

function expandWbs(
  wbs: PlanTask[],
  parentId: string,
  depth: number,
  absorbed: Set<string>,
  placed: Set<string>,
): Extract<GanttRow, { kind: 'task' }>[] {
  const rows: Extract<GanttRow, { kind: 'task' }>[] = []
  for (const child of childrenOf(wbs, parentId)) {
    if (absorbed.has(child.id) || placed.has(child.id)) continue
    rows.push(makeTaskRow(child, depth))
    placed.add(child.id)
    rows.push(...expandWbs(wbs, child.id, depth + 1, absorbed, placed))
  }
  return rows
}

function leftoverRoots(wbs: PlanTask[], absorbed: Set<string>, placed: Set<string>, phase: string): PlanTask[] {
  return wbs.filter((task) => {
    if (task.phase !== phase || absorbed.has(task.id) || placed.has(task.id)) return false
    if (!task.parentId) return true
    const parentPlaced = placed.has(task.parentId) || absorbed.has(task.parentId)
    const parentMissing = !wbs.some((item) => item.id === task.parentId)
    return parentPlaced || parentMissing
  })
}

export function buildMergedGanttRows(tasks: PlanTask[]): Extract<GanttRow, { kind: 'task' }>[] {
  const master = tasks.filter((t) => t.source === 'master')
  const wbs = tasks.filter((t) => t.source === 'wbs')
  const absorbed = new Set<string>()
  const wbsToMaster = new Map<string, string>()
  for (const item of wbs) {
    const host = matchMasterTask(master, item)
    if (!host) continue
    absorbed.add(item.id)
    wbsToMaster.set(item.id, host.id)
  }

  const rows: Extract<GanttRow, { kind: 'task' }>[] = []
  const placed = new Set<string>()

  const walk = (parentId: string | null, depth: number) => {
    for (const item of childrenOf(master, parentId)) {
      rows.push(makeTaskRow(item, depth))
      placed.add(item.id)
      for (const matched of wbs.filter((w) => wbsToMaster.get(w.id) === item.id)) {
        if (!placed.has(matched.id)) {
          rows.push(makeTaskRow(matched, depth + 1))
          placed.add(matched.id)
        }
        rows.push(...expandWbs(wbs, matched.id, depth + 2, absorbed, placed))
      }
      walk(item.id, depth + 1)
      if (item.level === 1) {
        for (const extra of leftoverRoots(wbs, absorbed, placed, item.name)) {
          rows.push(makeTaskRow(extra, depth + 1))
          placed.add(extra.id)
          rows.push(...expandWbs(wbs, extra.id, depth + 2, absorbed, placed))
        }
      }
    }
  }

  walk(null, 0)

  const leftovers = wbs.filter((task) => !absorbed.has(task.id) && !placed.has(task.id))
  const leftoverSeen = new Set<string>()
  for (const task of leftovers) {
    if (leftoverSeen.has(task.id)) continue
    if (task.parentId && leftovers.some((item) => item.id === task.parentId)) continue
    leftoverSeen.add(task.id)
    rows.push(makeTaskRow(task, 0))
    placed.add(task.id)
    const nested = expandWbs(wbs, task.id, 1, absorbed, placed)
    for (const row of nested) leftoverSeen.add(row.task.id)
    rows.push(...nested)
  }
  return rows
}

export function buildSheetGanttRows(tasks: PlanTask[], group: string): GanttRow[] {
  const list = tasks.filter((t) => t.group === group)
  return [
    { kind: 'section', name: group, count: list.length },
    ...list.map((task) => makeTaskRow(task, Math.max(0, task.level - 1))),
  ]
}

export function buildGanttRows(tasks: PlanTask[], filter: string): GanttRow[] {
  if (filter === 'all') return buildMergedGanttRows(tasks)
  return buildSheetGanttRows(tasks, filter)
}

export function collapseGanttRows(rows: GanttRow[], collapsed: Record<string, boolean>): GanttRow[] {
  const out: GanttRow[] = []
  let skipDepth = Number.POSITIVE_INFINITY
  for (const row of rows) {
    if (row.kind === 'section') {
      out.push(row)
      skipDepth = collapsed[row.name] ? -1 : Number.POSITIVE_INFINITY
      continue
    }
    if (row.depth > skipDepth) continue
    out.push(row)
    const key = row.task.id
    if ((row.role === 'phase' || row.role === 'scene') && collapsed[key]) skipDepth = row.depth
    else skipDepth = Number.POSITIVE_INFINITY
  }
  return out
}

export function barCaption(name: string, workdays: number): string {
  const label = name.trim() || '未命名'
  if (workdays <= 0) return label
  return `${label} ${workdays}天`
}
