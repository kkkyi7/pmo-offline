import { PLAN_TEMPLATE, RISK_TEMPLATE, WBS_TEMPLATE } from './templates'
import type { Project } from '../domain/types'

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => vars[key.trim()] ?? '')
}

function phaseSummary(project: Project): string {
  return project.phases
    .map((phase) => {
      const tasks = project.tasks.filter((t) => t.phaseId === phase.id)
      const leaves = tasks.filter((t) => !project.tasks.some((c) => c.parentId === t.id))
      const starts = leaves.map((t) => t.start).filter(Boolean)
      const ends = leaves.map((t) => t.end).filter(Boolean)
      const start = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : '—'
      const end = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : '—'
      return `- ${phase.name}：${tasks.length} 条任务，${start} ~ ${end}`
    })
    .join('\n')
}

function phaseWbs(project: Project): string {
  return project.phases
    .map((phase) => {
      const lines = project.tasks
        .filter((t) => t.phaseId === phase.id)
        .map((t) => `- ${t.wbsCode} ${t.name}  ${t.start || '—'} ~ ${t.end || '—'}  ${t.progress}%  ${t.owner || '未指定'}`)
      return `## ${phase.name}\n\n${lines.join('\n') || '- （无任务）'}`
    })
    .join('\n\n')
}

function riskList(project: Project): string {
  if (project.riskFindings.length === 0) return '当前没有触发的风险。'
  return project.riskFindings
    .map((f) => {
      const task = project.tasks.find((t) => t.id === f.taskId)
      const rule = project.riskRules.find((r) => r.id === f.ruleId)
      return `- [${f.severity}] ${task?.wbsCode ?? ''} ${task?.name ?? f.taskId} · ${rule?.name ?? f.ruleId}：${f.message}`
    })
    .join('\n')
}

export function docVars(project: Project): Record<string, string> {
  const vars: Record<string, string> = {
    项目名称: project.meta.name,
    项目经理: project.meta.manager || '未指定',
    项目开始: project.meta.start || '未定',
    备注: project.meta.notes || '（无）',
    任务数: String(project.tasks.length),
    阶段数: String(project.phases.length),
    风险数: String(project.riskFindings.length),
    按前置推期: project.meta.autoSchedule ? '开' : '关',
    阶段摘要: phaseSummary(project),
    阶段WBS: phaseWbs(project),
    风险清单: riskList(project),
  }
  for (const [k, v] of Object.entries(project.meta.extra)) {
    vars[k] = v
  }
  return vars
}

export function renderPlanDoc(project: Project): string {
  return fill(PLAN_TEMPLATE, docVars(project))
}

export function renderWbsDoc(project: Project): string {
  return fill(WBS_TEMPLATE, docVars(project))
}

export function renderRiskDoc(project: Project): string {
  return fill(RISK_TEMPLATE, docVars(project))
}
