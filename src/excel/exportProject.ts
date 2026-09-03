import * as XLSX from 'xlsx'
import { getFieldValue } from '../domain/access'
import type { Project } from '../domain/types'

export function projectToWorkbook(project: Project): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  const metaRows: Array<[string, string]> = [
    ['项目名称', project.meta.name],
    ['项目经理', project.meta.manager],
    ['项目开始', project.meta.start],
    ['备注', project.meta.notes],
    ['按前置推期', project.meta.autoSchedule ? '是' : '否'],
  ]
  for (const [k, v] of Object.entries(project.meta.extra)) {
    metaRows.push([k, v])
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaRows), '项目信息')

  const phaseRows = [
    ['id', '阶段', '顺序'],
    ...project.phases.map((p) => [p.id, p.name, p.order]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(phaseRows), '阶段')

  const headers = ['id', 'parentId', ...project.schema.fields.map((f) => f.label)]
  const wbsRows: Array<Array<string | number>> = [headers]
  for (const task of project.tasks) {
    const row: Array<string | number> = [task.id, task.parentId ?? '']
    for (const field of project.schema.fields) {
      row.push(getFieldValue(project, task, field))
    }
    wbsRows.push(row)
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wbsRows), 'WBS')

  const depRows = [
    ['id', '前置任务', '后置任务', '类型'],
    ...project.dependencies.map((d) => [d.id, d.sourceId, d.targetId, d.type]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(depRows), '依赖')

  const ruleRows = [
    ['id', '名称', '类型', '启用', '严重度', '范围', '阶段', '参数JSON'],
    ...project.riskRules.map((r) => [
      r.id,
      r.name,
      r.kind,
      r.enabled ? '是' : '否',
      r.severity,
      r.scope,
      r.phaseId ?? '',
      JSON.stringify(r.params),
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ruleRows), '风险规则')

  const findingRows = [
    ['id', '规则', '任务', 'WBS', '严重度', '说明'],
    ...project.riskFindings.map((f) => {
      const task = project.tasks.find((t) => t.id === f.taskId)
      const rule = project.riskRules.find((r) => r.id === f.ruleId)
      return [f.id, rule?.name ?? f.ruleId, task?.name ?? f.taskId, task?.wbsCode ?? '', f.severity, f.message]
    }),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(findingRows), '风险结果')

  return wb
}

export function projectToArrayBuffer(project: Project): ArrayBuffer {
  const wb = projectToWorkbook(project)
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

export function downloadXlsx(project: Project, filename?: string): void {
  const buf = projectToArrayBuffer(project)
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `${project.meta.name || '项目'}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
