export type FieldType = 'text' | 'number' | 'date' | 'percent' | 'select'

export type StandardKey =
  | 'name'
  | 'wbsCode'
  | 'phaseId'
  | 'owner'
  | 'start'
  | 'end'
  | 'duration'
  | 'progress'
  | 'predecessors'
  | 'status'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  standard?: StandardKey
  required?: boolean
  options?: string[]
}

export interface ProjectMeta {
  name: string
  manager: string
  start: string
  notes: string
  autoSchedule: boolean
  extra: Record<string, string>
}

export interface Phase {
  id: string
  name: string
  order: number
}

export interface Task {
  id: string
  parentId: string | null
  phaseId: string
  name: string
  wbsCode: string
  owner: string
  start: string
  end: string
  duration: number
  progress: number
  status: string
  extras: Record<string, string | number>
}

export interface Dependency {
  id: string
  sourceId: string
  targetId: string
  type: 'FS'
}

export type RiskKind =
  | 'missing_field'
  | 'date_inverted'
  | 'overdue'
  | 'stale_progress'
  | 'predecessor_overlap'
  | 'parent_not_covering'
  | 'duration_mismatch'
  | 'threshold'

export type Severity = 'low' | 'medium' | 'high'

export type CompareOp = '>' | '<' | '>=' | '<=' | '='

export type RuleScope = 'all' | 'leaves' | 'phase'

export interface RiskRule {
  id: string
  name: string
  kind: RiskKind
  enabled: boolean
  severity: Severity
  scope: RuleScope
  phaseId?: string
  params: Record<string, string | number>
}

export interface RiskFinding {
  id: string
  ruleId: string
  taskId: string
  severity: Severity
  message: string
}

export interface ProjectSchema {
  fields: FieldDef[]
}

export interface Project {
  meta: ProjectMeta
  schema: ProjectSchema
  phases: Phase[]
  tasks: Task[]
  dependencies: Dependency[]
  riskRules: RiskRule[]
  riskFindings: RiskFinding[]
}

export type DateHintField = 'start' | 'end' | 'duration'

export interface DateHint {
  taskId: string
  field: DateHintField
}

export interface RecomputeOptions {
  today?: string
  dateHint?: DateHint
}
