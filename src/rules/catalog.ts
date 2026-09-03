import type { PlanTask, RiskFinding, RiskRule, Scenario, Severity } from '../domain/workspace'
import { parseISO } from '../engine/dates'
import { childrenOf, isLeaf, taskByCode } from '../engine/deriveTasks'
import { cellText, parseExcelDate } from '../engine/excelDate'
import { isNonWorkday, isWeekend } from '../engine/workdays'
import { WBS_COLS } from '../domain/workspace'
import { codeText, getCell } from '../engine/sheets'

function num(rule: RiskRule, key: string, fallback: number): number {
  const v = rule.params[key]
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function hit(rule: RiskRule, taskId: string, message: string): RiskFinding {
  return {
    id: `${rule.id}:${taskId}`,
    ruleId: rule.id,
    taskId,
    severity: rule.severity,
    message,
  }
}

function label(task: PlanTask): string {
  return task.code ? `${task.code} ${task.name}` : task.name
}

export const RISK_CATALOG: RiskRule[] = [
  {
    id: 'overdue_open',
    name: '过期仍未完成',
    summary: '计划结束日已经过了，状态还不是「已完成」。',
    how: '打开后，扫描每条有计划结束日的任务。结束日早于今天、且状态不是已完成，就报警。实施里最常见的进度滞后信号。',
    enabled: true,
    severity: 'high',
    params: {},
  },
  {
    id: 'in_progress_past_end',
    name: '进行中但已过结束日',
    summary: '状态写成进行中，计划结束却已经过了。',
    how: '比上一条更狠：专门抓「口头在做、日历上该结束了」的行。适合周例会点名。',
    enabled: true,
    severity: 'high',
    params: {},
  },
  {
    id: 'start_passed_not_started',
    name: '开始日已过仍未动手',
    summary: '计划开始已经过了，状态还是未完成，也没有实际开始。',
    how: '看主计划开始日。今天已经晚于开始日，状态仍是未完成，就认为还没真正开工。',
    enabled: true,
    severity: 'high',
    params: {},
  },
  {
    id: 'no_owner',
    name: '叶子任务没有主责',
    summary: '最底层任务没写主责，出了问题没人接。',
    how: '只检查没有子任务的行。主责列为空就报警。阶段汇总行不必人人都填。',
    enabled: true,
    severity: 'high',
    params: {},
  },
  {
    id: 'no_plan_start',
    name: '叶子任务没有计划开始',
    summary: '底层任务没有开始日，排期是空的。',
    how: '没有子任务、也没有计划开始日。甘特上不会出现这条，但计划是缺的。',
    enabled: true,
    severity: 'medium',
    params: {},
  },
  {
    id: 'no_plan_span',
    name: '有开始但没有天数/结束',
    summary: '写了开始，却没有计划天数也没有结束日，公式推不出来。',
    how: '开始日有值，计划天数≤0 且结束日为空。先补天数，公式会自动算出结束。',
    enabled: true,
    severity: 'medium',
    params: {},
  },
  {
    id: 'end_before_start',
    name: '结束早于开始',
    summary: '日期填反了。',
    how: '计划结束 < 计划开始。通常是手改日期或导入串列。',
    enabled: true,
    severity: 'high',
    params: {},
  },
  {
    id: 'pred_missing',
    name: '前置任务找不到',
    summary: '前置列写了编号，主计划里没有这一行。',
    how: '把前置当编号（如 1.2.3）去主计划匹配。匹配不到说明断链或写错号。',
    enabled: true,
    severity: 'medium',
    params: {},
  },
  {
    id: 'pred_overlap',
    name: '开始早于前置结束',
    summary: '还没等前置做完，后置就开工了。',
    how: '若前置任务有结束日，本任务开始日 ≤ 前置结束日，就认为搭接过早。并行要自己判断是否误报。',
    enabled: true,
    severity: 'medium',
    params: {},
  },
  {
    id: 'chain_no_prev_end',
    name: '勾了前后置但上一行没有结束日',
    summary: '写了「是」，上一行却推不出结束日，本行开始会空。',
    how: '对应模版「是否与上个任务为前后置关系」。上一行要先有计划结束，接力才成立。',
    enabled: true,
    severity: 'medium',
    params: {},
  },
  {
    id: 'milestone_no_date',
    name: '里程碑没有日期',
    summary: '标了里程碑，但开始/结束都空。',
    how: '里程碑列是「是 / √ / ★」且两个计划日期都空。里程碑在甘特上应能看见菱形。',
    enabled: true,
    severity: 'high',
    params: {},
  },
  {
    id: 'milestone_no_deliverable',
    name: '里程碑没有关键交付物',
    summary: '里程碑不绑定交付物，验收时对不齐。',
    how: '里程碑行为真，关键交付物为空。',
    enabled: true,
    severity: 'medium',
    params: {},
  },
  {
    id: 'parent_not_cover',
    name: '阶段盖不住子任务',
    summary: '父级起止包不住子任务，阶段日期是假的。',
    how: '子任务开始早于父级开始，或子任务结束晚于父级结束。先改子任务，或拉开父级。',
    enabled: true,
    severity: 'medium',
    params: {},
  },
  {
    id: 'leaf_too_long',
    name: '叶子工期过粗',
    summary: '底层一条任务跨太久，周会跟不住。',
    how: '没有子任务且计划天数大于阈值（默认 15 个工作日）。请拆成更短的 WBS。参数 maxDays 可改。',
    enabled: true,
    severity: 'low',
    params: { maxDays: 15 },
  },
  {
    id: 'date_on_holiday',
    name: '计划日期落在节假日/周末',
    summary: '开始或结束不是工作日。',
    how: '对照周末和「法定节假日」表。公式开着时一般不会出现；手改日期后容易出现。',
    enabled: true,
    severity: 'low',
    params: {},
  },
  {
    id: 'phase_no_dates',
    name: '一级阶段没有计划日期',
    summary: '阶段行是空壳，甘特上没有阶段条。',
    how: '只看一级（阶段）行，开始和结束都空。',
    enabled: true,
    severity: 'medium',
    params: {},
  },
  {
    id: 'in_progress_no_actual',
    name: '进行中但 WBS 没有实际开始',
    summary: '主计划写了进行中，对应阶段 WBS 还没填实际开始。',
    how: '用编号去阶段 WBS 找同行。状态是进行中/已完成，实际开始仍空。',
    enabled: true,
    severity: 'medium',
    params: {},
  },
  {
    id: 'done_no_actual_end',
    name: '已完成但 WBS 没有实际完成',
    summary: '勾了已完成，实际完成日是空的，无法复盘工期。',
    how: '主计划或对应 WBS 状态为已完成，WBS 实际完成日为空。',
    enabled: true,
    severity: 'low',
    params: {},
  },
  {
    id: 'master_wbs_mismatch',
    name: '主计划与阶段 WBS 日期不一致',
    summary: '同一编号两边计划开始或结束对不上。',
    how: '按编号对齐后，任一侧有日期且相差超过容差天数（默认 0）。改一边后请开「主计划↔WBS 回写」。',
    enabled: true,
    severity: 'medium',
    params: { toleranceDays: 0 },
  },
  {
    id: 'actual_start_late',
    name: '实际开工晚于计划',
    summary: 'WBS 实际开始比计划开始晚超过 N 天。',
    how: '两边都有开始日时，实际 − 计划 > delayDays（默认 3 个自然日）。用来抓启动拖延。',
    enabled: true,
    severity: 'medium',
    params: { delayDays: 3 },
  },
]

function wbsRowsForCode(scenario: Scenario, code: string): Array<{ sheet: string; row: number; start: string; end: string; actualStart: string; actualEnd: string; status: string }> {
  const out: Array<{ sheet: string; row: number; start: string; end: string; actualStart: string; actualEnd: string; status: string }> = []
  if (!code) return out
  const C = WBS_COLS
  for (const sheet of scenario.sheets.filter((s) => s.kind === 'wbs')) {
    for (let row = 2; row < sheet.aoa.length; row += 1) {
      const found = codeText(getCell(sheet, row, C.l3)) || codeText(getCell(sheet, row, C.l2))
      if (found !== code) continue
      out.push({
        sheet: sheet.name,
        row,
        start: parseExcelDate(getCell(sheet, row, C.start)),
        end: parseExcelDate(getCell(sheet, row, C.end)),
        actualStart: parseExcelDate(getCell(sheet, row, C.actualStart)),
        actualEnd: parseExcelDate(getCell(sheet, row, C.actualEnd)),
        status: cellText(getCell(sheet, row, C.status)),
      })
    }
  }
  return out
}

function evaluateRule(scenario: Scenario, rule: RiskRule, task: PlanTask, today: string): RiskFinding | null {
  const holidays = new Set(scenario.holidays)
  switch (rule.id) {
    case 'overdue_open':
      if (!task.end || task.end >= today || task.status === '已完成') return null
      return hit(rule, task.id, `${label(task)} 计划结束 ${task.end}，今天仍是「${task.status || '未完成'}」`)
    case 'in_progress_past_end':
      if (task.status !== '进行中' || !task.end || task.end >= today) return null
      return hit(rule, task.id, `${label(task)} 状态进行中，但计划结束 ${task.end} 已过`)
    case 'start_passed_not_started':
      if (!task.start || task.start >= today) return null
      if (task.status === '已完成' || task.status === '进行中') return null
      return hit(rule, task.id, `${label(task)} 计划 ${task.start} 开始，现在还是「${task.status || '未完成'}」`)
    case 'no_owner':
      if (!isLeaf(scenario.tasks, task.id) || task.owner) return null
      return hit(rule, task.id, `${label(task)} 没有主责`)
    case 'no_plan_start':
      if (!isLeaf(scenario.tasks, task.id) || task.start) return null
      return hit(rule, task.id, `${label(task)} 没有计划开始`)
    case 'no_plan_span':
      if (!task.start || task.end || task.days > 0) return null
      return hit(rule, task.id, `${label(task)} 有开始日，但没有计划天数和结束日`)
    case 'end_before_start':
      if (!task.start || !task.end || task.end >= task.start) return null
      return hit(rule, task.id, `${label(task)} 结束 ${task.end} 早于开始 ${task.start}`)
    case 'pred_missing': {
      if (!task.pred) return null
      const tokens = task.pred.split(/[,，;；\s]+/).map((s) => s.trim()).filter(Boolean)
      if (tokens.length === 0) return null
      const missing = tokens.filter((tok) => !taskByCode(scenario.tasks, tok))
      if (missing.length === 0) return null
      return hit(rule, task.id, `${label(task)} 的前置「${missing.join('、')}」在主计划里找不到`)
    }
    case 'pred_overlap': {
      if (!task.pred || !task.start) return null
      const tokens = task.pred.split(/[,，;；\s]+/).map((s) => s.trim()).filter(Boolean)
      for (const tok of tokens) {
        const pred = taskByCode(scenario.tasks, tok)
        if (pred?.end && task.start <= pred.end) {
          return hit(rule, task.id, `${label(task)} 开始 ${task.start}，不晚于前置 ${label(pred)} 的结束 ${pred.end}`)
        }
      }
      return null
    }
    case 'chain_no_prev_end': {
      if (!task.chain) return null
      const prev = scenario.tasks.find((t) => t.sheet === task.sheet && t.row === task.row - 1)
      if (prev?.end) return null
      return hit(rule, task.id, `${label(task)} 勾了前后置，但上一行没有计划结束`)
    }
    case 'milestone_no_date':
      if (!task.milestone || task.start || task.end) return null
      return hit(rule, task.id, `${label(task)} 是里程碑，但没有计划日期`)
    case 'milestone_no_deliverable':
      if (!task.milestone || task.deliverable) return null
      return hit(rule, task.id, `${label(task)} 是里程碑，但没有关键交付物`)
    case 'parent_not_cover': {
      const kids = childrenOf(scenario.tasks, task.id).filter((k) => k.start || k.end)
      if (!task.start || !task.end || kids.length === 0) return null
      const early = kids.find((k) => k.start && k.start < task.start)
      if (early) return hit(rule, task.id, `${label(task)} 开始 ${task.start}，盖不住 ${label(early)} 的 ${early.start}`)
      const late = kids.find((k) => k.end && k.end > task.end)
      if (late) return hit(rule, task.id, `${label(task)} 结束 ${task.end}，盖不住 ${label(late)} 的 ${late.end}`)
      return null
    }
    case 'leaf_too_long':
      if (!isLeaf(scenario.tasks, task.id) || task.days <= num(rule, 'maxDays', 15)) return null
      return hit(rule, task.id, `${label(task)} 计划 ${task.days} 个工作日，超过 ${num(rule, 'maxDays', 15)} 天，建议拆分`)
    case 'date_on_holiday': {
      const bad = [task.start, task.end].filter((d) => d && isNonWorkday(d, holidays))
      if (bad.length === 0) return null
      const kind = bad.some((d) => d && isWeekend(d)) ? '周末' : '节假日'
      return hit(rule, task.id, `${label(task)} 的 ${bad.join('、')} 落在${kind}`)
    }
    case 'phase_no_dates':
      if (task.level !== 1 || task.start || task.end) return null
      return hit(rule, task.id, `阶段「${task.name}」没有计划起止`)
    case 'in_progress_no_actual': {
      if (task.status !== '进行中' && task.status !== '已完成') return null
      const rows = wbsRowsForCode(scenario, task.code)
      if (rows.length === 0) return null
      if (rows.some((r) => r.actualStart)) return null
      return hit(rule, task.id, `${label(task)} 已在推进，对应 WBS 还没有实际开始`)
    }
    case 'done_no_actual_end': {
      if (task.status !== '已完成') return null
      const rows = wbsRowsForCode(scenario, task.code)
      if (rows.length === 0) return null
      if (rows.some((r) => r.actualEnd)) return null
      return hit(rule, task.id, `${label(task)} 已完成，对应 WBS 没有实际完成日`)
    }
    case 'master_wbs_mismatch': {
      const rows = wbsRowsForCode(scenario, task.code)
      if (!task.start && !task.end) return null
      const tol = num(rule, 'toleranceDays', 0)
      for (const r of rows) {
        if (task.start && r.start && Math.abs(dayDiff(task.start, r.start)) > tol) {
          return hit(rule, task.id, `${label(task)} 主计划开始 ${task.start}，${r.sheet} 是 ${r.start}`)
        }
        if (task.end && r.end && Math.abs(dayDiff(task.end, r.end)) > tol) {
          return hit(rule, task.id, `${label(task)} 主计划结束 ${task.end}，${r.sheet} 是 ${r.end}`)
        }
      }
      return null
    }
    case 'actual_start_late': {
      const delay = num(rule, 'delayDays', 3)
      for (const r of wbsRowsForCode(scenario, task.code)) {
        if (!r.start || !r.actualStart) continue
        const late = dayDiff(r.start, r.actualStart)
        if (late > delay) {
          return hit(rule, task.id, `${label(task)} 实际开始 ${r.actualStart}，比计划 ${r.start} 晚 ${late} 天`)
        }
      }
      return null
    }
    default:
      return null
  }
}

function dayDiff(a: string, b: string): number {
  const x = parseISO(a)
  const y = parseISO(b)
  if (!x || !y) return 0
  return Math.round((y.getTime() - x.getTime()) / 86_400_000)
}

export function mergeRiskRules(existing?: RiskRule[]): RiskRule[] {
  const map = new Map((existing ?? []).map((r) => [r.id, r]))
  return RISK_CATALOG.map((base) => {
    const prev = map.get(base.id)
    if (!prev) return { ...base, params: { ...base.params } }
    return {
      ...base,
      enabled: prev.enabled,
      severity: prev.severity,
      params: { ...base.params, ...prev.params },
    }
  })
}

export function scanScenario(scenario: Scenario, today: string): RiskFinding[] {
  const findings: RiskFinding[] = []
  for (const rule of scenario.riskRules) {
    if (!rule.enabled) continue
    for (const task of scenario.tasks) {
      if (task.source === 'wbs' && task.level === 3) continue
      const item = evaluateRule(scenario, rule, task, today)
      if (item) findings.push(item)
    }
  }
  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.taskId.localeCompare(b.taskId))
}
