import { asNumber, getFieldValue, isBlank } from '../domain/access'
import type { CompareOp, Project, RiskFinding, RiskRule, Task } from '../domain/types'
import { durationFromRange, parseISO } from '../engine/dates'
import { hasChildren, predecessorsOf } from '../engine/tree'

function inScope(project: Project, rule: RiskRule, task: Task): boolean {
  if (!rule.enabled) return false
  if (rule.scope === 'leaves' && hasChildren(project.tasks, task.id)) return false
  if (rule.scope === 'phase' && rule.phaseId && task.phaseId !== rule.phaseId) return false
  return true
}

function finding(rule: RiskRule, task: Task, message: string): RiskFinding {
  return {
    id: `${rule.id}:${task.id}`,
    ruleId: rule.id,
    taskId: task.id,
    severity: rule.severity,
    message,
  }
}

function fieldLabel(project: Project, key: string): string {
  return project.schema.fields.find((f) => f.key === key)?.label ?? key
}

function compare(left: number, op: CompareOp, right: number): boolean {
  switch (op) {
    case '>':
      return left > right
    case '<':
      return left < right
    case '>=':
      return left >= right
    case '<=':
      return left <= right
    default:
      return left === right
  }
}

export function evaluateRule(project: Project, rule: RiskRule, today: string): RiskFinding[] {
  const out: RiskFinding[] = []
  for (const task of project.tasks) {
    if (!inScope(project, rule, task)) continue
    const hit = evaluateKind(project, rule, task, today)
    if (hit) out.push(hit)
  }
  return out
}

function evaluateKind(
  project: Project,
  rule: RiskRule,
  task: Task,
  today: string,
): RiskFinding | null {
  switch (rule.kind) {
    case 'missing_field': {
      const key = String(rule.params.field ?? 'name')
      const field = project.schema.fields.find((f) => f.key === key)
      const value = field ? getFieldValue(project, task, field) : task.extras[key]
      if (!isBlank(value)) return null
      return finding(rule, task, `${task.wbsCode || task.name} 缺少「${fieldLabel(project, key)}」`)
    }
    case 'date_inverted': {
      if (!parseISO(task.start) || !parseISO(task.end)) return null
      if (task.end >= task.start) return null
      return finding(rule, task, `${task.wbsCode} 结束日期早于开始日期`)
    }
    case 'overdue': {
      const threshold = asNumber(rule.params.progressBelow) ?? 100
      if (!parseISO(task.end) || task.end >= today) return null
      if (task.progress >= threshold) return null
      return finding(rule, task, `${task.wbsCode} 已过结束日且进度 ${task.progress}% < ${threshold}%`)
    }
    case 'stale_progress': {
      const threshold = asNumber(rule.params.progressBelow) ?? 80
      const status = String(rule.params.status ?? '进行中')
      if (task.status !== status) return null
      if (task.progress >= threshold) return null
      return finding(rule, task, `${task.wbsCode} 状态为${status}但进度仅 ${task.progress}%`)
    }
    case 'predecessor_overlap': {
      for (const sourceId of predecessorsOf(project, task.id)) {
        const source = project.tasks.find((t) => t.id === sourceId)
        if (!source || !parseISO(source.end) || !parseISO(task.start)) continue
        if (task.start <= source.end) {
          return finding(
            rule,
            task,
            `${task.wbsCode} 开始于 ${task.start}，早于或等于前置 ${source.wbsCode} 的结束 ${source.end}`,
          )
        }
      }
      return null
    }
    case 'parent_not_covering': {
      if (!hasChildren(project.tasks, task.id)) return null
      if (!parseISO(task.start) || !parseISO(task.end)) return null
      const kids = project.tasks.filter((t) => t.parentId === task.id)
      for (const child of kids) {
        if (parseISO(child.start) && child.start < task.start) {
          return finding(rule, task, `${task.wbsCode} 未覆盖子任务 ${child.wbsCode} 的开始`)
        }
        if (parseISO(child.end) && child.end > task.end) {
          return finding(rule, task, `${task.wbsCode} 未覆盖子任务 ${child.wbsCode} 的结束`)
        }
      }
      return null
    }
    case 'duration_mismatch': {
      if (hasChildren(project.tasks, task.id)) return null
      if (!parseISO(task.start) || !parseISO(task.end) || !task.duration) return null
      const actual = durationFromRange(task.start, task.end)
      const tolerance = asNumber(rule.params.toleranceDays) ?? 0
      if (Math.abs(actual - task.duration) <= tolerance) return null
      return finding(rule, task, `${task.wbsCode} 工期 ${task.duration} 天与起止差 ${actual} 天不一致`)
    }
    case 'threshold': {
      const key = String(rule.params.field ?? 'duration')
      const op = (String(rule.params.op ?? '>') as CompareOp)
      const right = asNumber(rule.params.value)
      if (right === null) return null
      const field = project.schema.fields.find((f) => f.key === key)
      const raw = field ? getFieldValue(project, task, field) : task.extras[key]
      const left = asNumber(raw)
      if (left === null) return null
      if (!compare(left, op, right)) return null
      return finding(rule, task, `${task.wbsCode} ${fieldLabel(project, key)} ${left} ${op} ${right}`)
    }
    default:
      return null
  }
}

export function scanRisks(project: Project, today: string): RiskFinding[] {
  const findings: RiskFinding[] = []
  for (const rule of project.riskRules) {
    findings.push(...evaluateRule(project, rule, today))
  }
  return findings
}
