import type { FieldDef, Phase, Project, Task } from './types'
import { predecessorsOf } from '../engine/tree'

export function phaseName(project: Project, phaseId: string): string {
  return project.phases.find((p) => p.id === phaseId)?.name ?? phaseId
}

export function phaseByName(project: Project, name: string): Phase | undefined {
  const trimmed = name.trim()
  return project.phases.find((p) => p.name === trimmed || p.id === trimmed)
}

export function getFieldValue(project: Project, task: Task, field: FieldDef): string | number {
  switch (field.standard) {
    case 'name':
      return task.name
    case 'wbsCode':
      return task.wbsCode
    case 'phaseId':
      return phaseName(project, task.phaseId)
    case 'owner':
      return task.owner
    case 'start':
      return task.start
    case 'end':
      return task.end
    case 'duration':
      return task.duration
    case 'progress':
      return task.progress
    case 'predecessors':
      return formatPredecessors(project, task.id)
    case 'status':
      return task.status
    default:
      return task.extras[field.key] ?? ''
  }
}

export function formatPredecessors(project: Project, taskId: string): string {
  const preds = predecessorsOf(project, taskId)
  return preds
    .map((id) => {
      const t = project.tasks.find((x) => x.id === id)
      return t?.wbsCode || id
    })
    .join(', ')
}

export function isBlank(value: string | number | undefined | null): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'number') return Number.isNaN(value)
  return String(value).trim() === ''
}

export function asNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace('%', '').trim())
  return Number.isFinite(n) ? n : null
}
