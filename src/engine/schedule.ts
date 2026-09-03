import type { DateHint, Project, Task } from '../domain/types'
import { addDays, durationFromRange, endFromDuration, parseISO } from './dates'
import { childrenOf, hasChildren } from './tree'

export function applyDateHint(tasks: Task[], hint?: DateHint): Task[] {
  if (!hint) return tasks
  return tasks.map((task) => {
    if (task.id !== hint.taskId || hasChildren(tasks, task.id)) return task
    return syncLeafDates(task, hint.field)
  })
}

export function syncLeafDates(task: Task, field: DateHint['field']): Task {
  const next = { ...task }
  if (field === 'duration') {
    if (parseISO(next.start) && next.duration > 0) {
      next.end = endFromDuration(next.start, next.duration)
    } else if (parseISO(next.end) && next.duration > 0) {
      next.start = addDays(next.end, -(Math.max(1, Math.round(next.duration)) - 1))
    }
    return next
  }
  if (field === 'start') {
    if (parseISO(next.start) && next.duration > 0) {
      next.end = endFromDuration(next.start, next.duration)
    } else if (parseISO(next.start) && parseISO(next.end)) {
      next.duration = Math.max(1, durationFromRange(next.start, next.end))
    }
    return next
  }
  if (parseISO(next.start) && parseISO(next.end)) {
    next.duration = Math.max(1, durationFromRange(next.start, next.end))
  } else if (parseISO(next.end) && next.duration > 0) {
    next.start = addDays(next.end, -(Math.max(1, Math.round(next.duration)) - 1))
  }
  return next
}

export function fillIncompleteLeaves(tasks: Task[]): Task[] {
  return tasks.map((task) => {
    if (hasChildren(tasks, task.id)) return task
    const hasStart = Boolean(parseISO(task.start))
    const hasEnd = Boolean(parseISO(task.end))
    if (hasStart && hasEnd && task.duration > 0) return task
    if (hasStart && hasEnd) {
      return { ...task, duration: Math.max(1, durationFromRange(task.start, task.end)) }
    }
    if (hasStart && task.duration > 0) {
      return { ...task, end: endFromDuration(task.start, task.duration) }
    }
    if (hasEnd && task.duration > 0) {
      return { ...task, start: addDays(task.end, -(Math.max(1, Math.round(task.duration)) - 1)) }
    }
    return task
  })
}

export function applyFsSchedule(project: Project): Task[] {
  if (!project.meta.autoSchedule) return project.tasks
  const tasks = project.tasks.map((t) => ({ ...t }))
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const incoming = new Map<string, string[]>()
  for (const dep of project.dependencies) {
    if (dep.type !== 'FS') continue
    const list = incoming.get(dep.targetId) ?? []
    list.push(dep.sourceId)
    incoming.set(dep.targetId, list)
  }

  for (let i = 0; i < tasks.length + 2; i += 1) {
    let changed = false
    for (const [targetId, sources] of incoming) {
      const target = byId.get(targetId)
      if (!target || hasChildren(tasks, targetId)) continue
      let minStart = ''
      for (const sourceId of sources) {
        const source = byId.get(sourceId)
        if (!source || !parseISO(source.end)) continue
        const nextStart = addDays(source.end, 1)
        if (!minStart || nextStart > minStart) minStart = nextStart
      }
      if (!minStart) continue
      if (!parseISO(target.start) || target.start < minStart) {
        target.start = minStart
        if (target.duration > 0) target.end = endFromDuration(target.start, target.duration)
        changed = true
      }
    }
    if (!changed) break
  }
  return tasks
}

export function rollupParents(tasks: Task[]): Task[] {
  const next = tasks.map((t) => ({ ...t }))
  const byId = new Map(next.map((t) => [t.id, t]))
  const parents = next.filter((t) => hasChildren(next, t.id)).map((t) => t.id)

  const depth = (id: string): number => {
    let n = 0
    let cur = byId.get(id)
    const seen = new Set<string>()
    while (cur?.parentId) {
      if (seen.has(cur.id)) break
      seen.add(cur.id)
      n += 1
      cur = byId.get(cur.parentId)
    }
    return n
  }

  parents.sort((a, b) => depth(b) - depth(a))

  for (const id of parents) {
    const parent = byId.get(id)
    if (!parent) continue
    const kids = childrenOf(next, id)
    const starts = kids.map((k) => k.start).filter((s) => parseISO(s))
    const ends = kids.map((k) => k.end).filter((s) => parseISO(s))
    if (starts.length) parent.start = starts.reduce((a, b) => (a < b ? a : b))
    if (ends.length) parent.end = ends.reduce((a, b) => (a > b ? a : b))
    if (parseISO(parent.start) && parseISO(parent.end)) {
      parent.duration = Math.max(1, durationFromRange(parent.start, parent.end))
    }
    const weights = kids.map((k) => Math.max(1, k.duration || 1))
    const weightSum = weights.reduce((a, b) => a + b, 0)
    parent.progress = Math.round(
      kids.reduce((sum, k, i) => sum + k.progress * weights[i], 0) / weightSum,
    )
  }
  return next
}
