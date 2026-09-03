import * as XLSX from 'xlsx'
import { mapHeader } from '../domain/aliases'
import { defaultFields, defaultMeta, defaultRiskRules } from '../domain/defaults'
import { nextNumericId } from '../domain/ids'
import type {
  Dependency,
  FieldDef,
  FieldType,
  Phase,
  Project,
  RiskKind,
  RiskRule,
  RuleScope,
  Severity,
  StandardKey,
  Task,
} from '../domain/types'
import { cellToISO } from '../engine/dates'
import { recompute } from '../engine/recompute'
import { taskByWbsOrId } from '../engine/tree'

const RISK_KINDS = new Set<RiskKind>([
  'missing_field',
  'date_inverted',
  'overdue',
  'stale_progress',
  'predecessor_overlap',
  'parent_not_covering',
  'duration_mismatch',
  'threshold',
])

function sheetToAoa(wb: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = wb.Sheets[name]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][]
}

function cellText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (value instanceof Date) return cellToISO(value)
  return String(value).trim()
}

function yes(value: unknown): boolean {
  const t = cellText(value)
  return t === '是' || t.toLowerCase() === 'true' || t === '1' || t === 'Y'
}

function inferType(label: string, standard: StandardKey | 'id' | null): FieldType {
  if (standard === 'start' || standard === 'end') return 'date'
  if (standard === 'duration') return 'number'
  if (standard === 'progress') return 'percent'
  if (standard === 'phaseId' || standard === 'status') return 'select'
  if (/日期|date/.test(label.toLowerCase())) return 'date'
  return 'text'
}

export function workbookToProject(wb: XLSX.WorkBook, today?: string): Project {
  const metaRows = sheetToAoa(wb, '项目信息')
  const extra: Record<string, string> = {}
  const known = new Set(['项目名称', '项目经理', '项目开始', '备注', '按前置推期'])
  let name = '导入项目'
  let manager = ''
  let start = ''
  let notes = ''
  let autoSchedule = false
  for (const row of metaRows) {
    const key = cellText(row[0])
    const value = cellText(row[1])
    if (key === '项目名称') name = value || name
    else if (key === '项目经理') manager = value
    else if (key === '项目开始') start = cellToISO(row[1]) || value
    else if (key === '备注') notes = value
    else if (key === '按前置推期') autoSchedule = yes(row[1])
    else if (key && !known.has(key)) extra[key] = value
  }

  const phaseSheet = sheetToAoa(wb, '阶段')
  const phases: Phase[] = []
  for (let i = 1; i < phaseSheet.length; i += 1) {
    const row = phaseSheet[i]
    const id = cellText(row[0]) || String(i)
    const phaseName = cellText(row[1]) || `阶段${i}`
    const order = Number(row[2]) || i
    if (!id && !phaseName) continue
    phases.push({ id, name: phaseName, order })
  }

  const wbs = sheetToAoa(wb, 'WBS')
  if (wbs.length === 0) {
    throw new Error('Excel 中缺少 WBS 表，或表头为空')
  }
  const header = (wbs[0] ?? []).map((h) => cellText(h))
  const fields: FieldDef[] = []
  const colMap: Array<{ index: number; kind: 'id' | 'parentId' | 'field'; field?: FieldDef }> = []

  header.forEach((label, index) => {
    if (!label) return
    const mapped = mapHeader(label)
    if (mapped === 'id' || label === 'id') {
      colMap.push({ index, kind: 'id' })
      return
    }
    if (label === 'parentId' || label === '父级' || label === '上级') {
      colMap.push({ index, kind: 'parentId' })
      return
    }
    const standard = mapped ?? undefined
    const existing = defaultFields().find((f) => f.standard === standard || f.label === label)
    const field: FieldDef = existing
      ? { ...existing, label }
      : {
          key: standard ?? `col_${index}`,
          label,
          type: inferType(label, mapped),
          standard,
        }
    if (!fields.some((f) => f.key === field.key)) fields.push(field)
    colMap.push({ index, kind: 'field', field })
  })

  if (fields.length === 0) {
    throw new Error('WBS 表没有可识别的列')
  }

  const usedIds = new Set<string>()
  const tasks: Task[] = []

  for (let r = 1; r < wbs.length; r += 1) {
    const row = wbs[r]
    if (!row || row.every((c) => cellText(c) === '')) continue
    let id = ''
    let parentId: string | null = null
    const task: Task = {
      id: '',
      parentId: null,
      phaseId: phases[0]?.id ?? 'p1',
      name: '',
      wbsCode: '',
      owner: '',
      start: '',
      end: '',
      duration: 0,
      progress: 0,
      status: '未开始',
      extras: {},
    }

    for (const col of colMap) {
      const raw = row[col.index]
      if (col.kind === 'id') {
        id = cellText(raw)
        continue
      }
      if (col.kind === 'parentId') {
        const p = cellText(raw)
        parentId = p || null
        continue
      }
      const field = col.field
      if (!field) continue
      applyCell(task, field, raw)
    }

    if (!id) id = nextNumericId([...usedIds, ...tasks.map((t) => t.id)])
    if (usedIds.has(id)) id = nextNumericId([...usedIds])
    usedIds.add(id)
    task.id = id
    task.parentId = parentId
    tasks.push(task)
  }

  if (phases.length === 0) {
    const names = [...new Set(tasks.map((t) => t.phaseId).filter(Boolean))]
    names.forEach((n, i) => {
      phases.push({ id: `p${i + 1}`, name: n, order: i + 1 })
    })
    const nameToId = new Map(phases.map((p) => [p.name, p.id]))
    for (const task of tasks) {
      task.phaseId = nameToId.get(task.phaseId) ?? phases[0]?.id ?? 'p1'
    }
  } else {
    const byName = new Map(phases.map((p) => [p.name, p.id]))
    for (const task of tasks) {
      task.phaseId = byName.get(task.phaseId) ?? (phases.some((p) => p.id === task.phaseId) ? task.phaseId : phases[0].id)
    }
  }

  const depsSheet = sheetToAoa(wb, '依赖')
  const dependencies: Dependency[] = []
  for (let i = 1; i < depsSheet.length; i += 1) {
    const row = depsSheet[i]
    const source = cellText(row[1])
    const target = cellText(row[2])
    if (!source || !target) continue
    const sourceTask = taskByWbsOrId(tasks, source)
    const targetTask = taskByWbsOrId(tasks, target)
    if (!sourceTask || !targetTask) continue
    dependencies.push({
      id: cellText(row[0]) || `d${i}`,
      sourceId: sourceTask.id,
      targetId: targetTask.id,
      type: 'FS',
    })
  }

  const rulesSheet = sheetToAoa(wb, '风险规则')
  let riskRules: RiskRule[] = []
  for (let i = 1; i < rulesSheet.length; i += 1) {
    const row = rulesSheet[i]
    const kind = cellText(row[2]) as RiskKind
    if (!RISK_KINDS.has(kind)) continue
    let params: Record<string, string | number> = {}
    const rawParams = cellText(row[7])
    if (rawParams) {
      try {
        params = JSON.parse(rawParams) as Record<string, string | number>
      } catch {
        params = {}
      }
    }
    riskRules.push({
      id: cellText(row[0]) || `r${i}`,
      name: cellText(row[1]) || kind,
      kind,
      enabled: row[3] === '' ? true : yes(row[3]),
      severity: (cellText(row[4]) as Severity) || 'medium',
      scope: (cellText(row[5]) as RuleScope) || 'all',
      phaseId: cellText(row[6]) || undefined,
      params,
    })
  }
  if (riskRules.length === 0) riskRules = defaultRiskRules()

  const project: Project = {
    meta: defaultMeta({ name, manager, start, notes, autoSchedule, extra }),
    schema: { fields },
    phases,
    tasks,
    dependencies,
    riskRules,
    riskFindings: [],
  }
  return attachPendingPreds(recompute(project, { today }))
}

function applyCell(task: Task, field: FieldDef, raw: unknown): void {
  const text = cellText(raw)
  switch (field.standard) {
    case 'name':
      task.name = text
      break
    case 'wbsCode':
      task.wbsCode = text
      break
    case 'phaseId':
      task.phaseId = text
      break
    case 'owner':
      task.owner = text
      break
    case 'start':
      task.start = cellToISO(raw) || text
      break
    case 'end':
      task.end = cellToISO(raw) || text
      break
    case 'duration':
      task.duration = Number(raw) || Number(text) || 0
      break
    case 'progress':
      task.progress = Number(String(text).replace('%', '')) || 0
      break
    case 'predecessors':
      if (text) task.extras.__pred = text
      break
    case 'status':
      task.status = text || '未开始'
      break
    default:
      if (field.type === 'number' || field.type === 'percent') {
        task.extras[field.key] = Number(String(text).replace('%', '')) || 0
      } else if (field.type === 'date') {
        task.extras[field.key] = cellToISO(raw) || text
      } else {
        task.extras[field.key] = text
      }
  }
}

export function parseWorkbookBuffer(data: ArrayBuffer, today?: string): Project {
  const wb = XLSX.read(data, { type: 'array', cellDates: true })
  return workbookToProject(wb, today)
}

function attachPendingPreds(project: Project): Project {
  const extraDeps: Dependency[] = []
  const tasks = project.tasks.map((t) => ({ ...t, extras: { ...t.extras } }))
  for (const task of tasks) {
    const text = task.extras.__pred
    if (typeof text !== 'string' || !text) {
      delete task.extras.__pred
      continue
    }
    for (const token of text.split(/[,，;；\s]+/).filter(Boolean)) {
      const source = taskByWbsOrId(project.tasks, token)
      if (!source || source.id === task.id) continue
      if (project.dependencies.some((d) => d.sourceId === source.id && d.targetId === task.id)) continue
      extraDeps.push({
        id: `d${project.dependencies.length + extraDeps.length + 1}`,
        sourceId: source.id,
        targetId: task.id,
        type: 'FS',
      })
    }
    delete task.extras.__pred
  }
  const next = { ...project, tasks }
  if (extraDeps.length === 0) return next
  return recompute({ ...next, dependencies: [...project.dependencies, ...extraDeps] })
}

export async function parseWorkbookFile(file: File, today?: string): Promise<Project> {
  const buf = await file.arrayBuffer()
  return parseWorkbookBuffer(buf, today)
}
