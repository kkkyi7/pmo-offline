export type SheetKind = 'master' | 'wbs' | 'milestone' | 'holiday' | 'other'

export type FormulaKind =
  | 'workday_end'
  | 'chain_start'
  | 'network_days'
  | 'status_rollup'
  | 'sheet_sync'

export interface FormulaRule {
  id: FormulaKind
  enabled: boolean
}

export type Severity = 'high' | 'medium' | 'low'

export type GanttWeekMode = 'natural_week' | 'month_7day' | 'month_week'

export const DEFAULT_GANTT_WEEK_MODE: GanttWeekMode = 'natural_week'

export const GANTT_WEEK_MODE_OPTIONS: Array<{ id: GanttWeekMode; label: string; hint: string }> = [
  { id: 'natural_week', label: '自然周', hint: '周一到周日。本身会跨月，「周可跨月」用不上。' },
  { id: 'month_7day', label: '月/7天', hint: '按 7 天一段。关掉跨月则每月 1–7、8–14… 月底断开；打开则月底余天和下月初连在一起。' },
  { id: 'month_week', label: '月/自然周', hint: '按周一到周日切。关掉跨月则月底断开；打开则和自然周一样可以跨月。' },
]

export interface RiskRule {
  id: string
  name: string
  summary: string
  how: string
  enabled: boolean
  severity: Severity
  params: Record<string, string | number>
}

export interface RiskFinding {
  id: string
  ruleId: string
  taskId: string
  severity: Severity
  message: string
}

export interface SheetData {
  name: string
  kind: SheetKind
  aoa: unknown[][]
  formulas: Record<string, string>
}

export interface PlanTask {
  id: string
  sheet: string
  source: 'master' | 'wbs'
  group: string
  row: number
  code: string
  name: string
  level: 1 | 2 | 3
  phase: string
  start: string
  end: string
  days: number
  status: string
  owner: string
  pred: string
  chain: boolean
  milestone: boolean
  deliverable: string
  parentId: string | null
}

export interface Scenario {
  id: string
  name: string
  note: string
  sheets: SheetData[]
  formulaRules: FormulaRule[]
  riskRules: RiskRule[]
  holidays: string[]
  tasks: PlanTask[]
  findings: RiskFinding[]
  scanDate: string
  ganttAnchor: string
  ganttWeekMode: GanttWeekMode
  ganttWeekCrossMonth: boolean
}

export interface Workspace {
  version: 2
  projectName: string
  activeId: string
  scenarios: Scenario[]
}

export const MASTER_COLS = {
  l1: 0,
  l2: 1,
  l3: 2,
  name: 3,
  succ: 4,
  pred: 5,
  status: 6,
  note: 7,
  milestone: 8,
  reviewB: 9,
  reviewA: 10,
  pmo: 11,
  start: 12,
  end: 13,
  days: 14,
  chain: 15,
  owner: 16,
  support: 17,
  deliverable: 18,
} as const

export const WBS_COLS = {
  l2: 0,
  l3: 1,
  name: 2,
  wbs: 3,
  desc: 4,
  milestone: 5,
  reviewB: 6,
  reviewA: 7,
  pmo: 8,
  start: 9,
  end: 10,
  days: 11,
  chain: 12,
  actualStart: 13,
  actualEnd: 14,
  actualDays: 15,
  owner: 16,
  support: 17,
  status: 18,
  note: 19,
  deliverable: 20,
} as const

export const DEFAULT_FORMULA_RULES: FormulaRule[] = [
  { id: 'workday_end', enabled: true },
  { id: 'chain_start', enabled: true },
  { id: 'network_days', enabled: true },
  { id: 'status_rollup', enabled: true },
  { id: 'sheet_sync', enabled: true },
]

export const FORMULA_HELP: Record<FormulaKind, { title: string; text: string }> = {
  workday_end: {
    title: '计划结束 = 开始 + 工作日',
    text: '和模版里的 WORKDAY.INTL 一样：用计划开始和计划天数，跳过周末与「法定节假日」表，回填计划结束。',
  },
  chain_start: {
    title: '前后置接力',
    text: '「是否与上个任务为前后置关系」填「是」时，本行计划开始 = 上一行计划结束。对应模版 IF(P="是", N上一行)。',
  },
  network_days: {
    title: '实际天数 = 工作日差',
    text: '阶段 WBS 里若有实际开始和实际完成，用 NETWORKDAYS 回填实际天数。',
  },
  status_rollup: {
    title: '父级状态汇总',
    text: '子任务全未完成→未完成，全已完成→已完成，否则进行中。主计划一级/二级行会按后续子行汇总。',
  },
  sheet_sync: {
    title: '主计划 ↔ 阶段 WBS 回写',
    text: '按编号（如 1.2.3）对齐，不看中文名。甘特或表格改了日期、名称或编号，主计划和对应 WBS 互相回写；WBS 状态仍回写主计划。',
  },
}
