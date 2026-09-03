import {
  DEFAULT_FORMULA_RULES,
  DEFAULT_GANTT_WEEK_MODE,
  type FormulaRule,
  type Scenario,
  type SheetData,
} from '../domain/workspace'
import { todayISO } from './dates'
import { deriveAllTasks } from './deriveTasks'
import { normalizeGanttWeekMode } from './ganttWeeks'
import { applyFormulas, type FormulaLock } from './formulas'
import { normalizeSheets } from './normalize'
import { extractHolidays } from './sheets'
import { mergeRiskRules, scanScenario } from '../rules/catalog'

export function refreshScenario(
  scenario: Scenario,
  today = todayISO(),
  locks?: FormulaLock[],
): Scenario {
  const prepared = normalizeSheets(scenario.sheets)
  const holidays = extractHolidays(prepared)
  const sheets = applyFormulas(prepared, scenario.formulaRules, holidays, locks)
  const tasks = deriveAllTasks(sheets)
  const next: Scenario = {
    ...scenario,
    sheets,
    holidays,
    tasks,
    riskRules: mergeRiskRules(scenario.riskRules),
    findings: [],
    scanDate: scenario.scanDate || today,
    ganttAnchor: scenario.ganttAnchor ?? '',
    ganttWeekMode: normalizeGanttWeekMode(scenario.ganttWeekMode),
    ganttWeekCrossMonth: scenario.ganttWeekCrossMonth ?? false,
  }
  next.findings = scanScenario(next, next.scanDate || today)
  return next
}

export function buildScenario(input: {
  id?: string
  name: string
  note?: string
  sheets: SheetData[]
  formulaRules?: FormulaRule[]
}): Scenario {
  return refreshScenario({
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    note: input.note ?? '',
    sheets: normalizeSheets(input.sheets),
    formulaRules: input.formulaRules ?? DEFAULT_FORMULA_RULES.map((r) => ({ ...r })),
    riskRules: mergeRiskRules(),
    holidays: [],
    tasks: [],
    findings: [],
    scanDate: todayISO(),
    ganttAnchor: '',
    ganttWeekMode: DEFAULT_GANTT_WEEK_MODE,
    ganttWeekCrossMonth: false,
  })
}

export function cloneScenario(source: Scenario, name: string): Scenario {
  return refreshScenario({
    ...structuredClone(source),
    id: crypto.randomUUID(),
    name,
    note: source.note ? `${source.note}（复制）` : '由场景复制，用于 what-if',
  })
}
