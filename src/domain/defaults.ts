import type { FieldDef, Project, ProjectMeta, RiskRule } from './types'

export const STATUS_OPTIONS = ['未开始', '进行中', '已完成', '已暂停']

export function defaultFields(): FieldDef[] {
  return [
    { key: 'wbsCode', label: 'WBS', type: 'text', standard: 'wbsCode' },
    { key: 'name', label: '任务名称', type: 'text', standard: 'name', required: true },
    { key: 'phaseId', label: '阶段', type: 'select', standard: 'phaseId' },
    { key: 'owner', label: '负责人', type: 'text', standard: 'owner' },
    { key: 'start', label: '开始', type: 'date', standard: 'start' },
    { key: 'end', label: '结束', type: 'date', standard: 'end' },
    { key: 'duration', label: '工期', type: 'number', standard: 'duration' },
    { key: 'progress', label: '进度', type: 'percent', standard: 'progress' },
    { key: 'predecessors', label: '前置', type: 'text', standard: 'predecessors' },
    { key: 'status', label: '状态', type: 'select', standard: 'status', options: STATUS_OPTIONS },
    { key: 'deliverable', label: '交付物', type: 'text' },
  ]
}

export function defaultMeta(partial: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    name: '未命名项目',
    manager: '',
    start: '',
    notes: '',
    autoSchedule: false,
    extra: {},
    ...partial,
  }
}

export function defaultRiskRules(): RiskRule[] {
  return [
    {
      id: 'r1',
      name: '任务名称必填',
      kind: 'missing_field',
      enabled: true,
      severity: 'high',
      scope: 'all',
      params: { field: 'name' },
    },
    {
      id: 'r2',
      name: '负责人必填',
      kind: 'missing_field',
      enabled: true,
      severity: 'medium',
      scope: 'leaves',
      params: { field: 'owner' },
    },
    {
      id: 'r3',
      name: '结束早于开始',
      kind: 'date_inverted',
      enabled: true,
      severity: 'high',
      scope: 'all',
      params: {},
    },
    {
      id: 'r4',
      name: '已过期未完成',
      kind: 'overdue',
      enabled: true,
      severity: 'high',
      scope: 'leaves',
      params: { progressBelow: 100 },
    },
    {
      id: 'r5',
      name: '进行中进度偏低',
      kind: 'stale_progress',
      enabled: true,
      severity: 'medium',
      scope: 'leaves',
      params: { progressBelow: 30, status: '进行中' },
    },
    {
      id: 'r6',
      name: '前置任务重叠',
      kind: 'predecessor_overlap',
      enabled: true,
      severity: 'high',
      scope: 'leaves',
      params: {},
    },
    {
      id: 'r7',
      name: '父任务未覆盖子任务',
      kind: 'parent_not_covering',
      enabled: true,
      severity: 'medium',
      scope: 'all',
      params: {},
    },
    {
      id: 'r8',
      name: '工期与起止不一致',
      kind: 'duration_mismatch',
      enabled: true,
      severity: 'low',
      scope: 'leaves',
      params: { toleranceDays: 0 },
    },
    {
      id: 'r9',
      name: '工期超过 20 天',
      kind: 'threshold',
      enabled: true,
      severity: 'low',
      scope: 'leaves',
      params: { field: 'duration', op: '>', value: 20 },
    },
  ]
}

export function emptyProject(): Project {
  return {
    meta: defaultMeta(),
    schema: { fields: defaultFields() },
    phases: [
      { id: 'p1', name: '启动', order: 1 },
      { id: 'p2', name: '实施', order: 2 },
      { id: 'p3', name: '收尾', order: 3 },
    ],
    tasks: [
      {
        id: '1',
        parentId: null,
        phaseId: 'p1',
        name: '启动阶段',
        wbsCode: '',
        owner: '',
        start: '',
        end: '',
        duration: 0,
        progress: 0,
        status: '未开始',
        extras: {},
      },
    ],
    dependencies: [],
    riskRules: defaultRiskRules(),
    riskFindings: [],
  }
}
