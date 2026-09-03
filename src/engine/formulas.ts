import {
  MASTER_COLS,
  WBS_COLS,
  type FormulaRule,
  type SheetData,
} from '../domain/workspace'
import { cellText, parseExcelDate, yesValue } from './excelDate'
import { childrenOf, dateCols, deriveAllTasks, deriveMasterTasks } from './deriveTasks'
import { networkDays, workdayIntl, workdaysBetween } from './workdays'
import { codeText, getCell, normalizeTaskCode, rollupStatus, setCell } from './sheets'

export interface FormulaLock {
  sheet: string
  row: number
  fields?: Array<'start' | 'end' | 'days'>
}

function enabled(rules: FormulaRule[], id: FormulaRule['id']): boolean {
  return rules.find((r) => r.id === id)?.enabled !== false
}

function lockedField(
  locks: FormulaLock[] | undefined,
  sheet: string,
  row: number,
  field: 'start' | 'end',
): boolean {
  return Boolean(
    locks?.some((l) => {
      if (l.sheet !== sheet || l.row !== row) return false
      return !l.fields || l.fields.includes(field)
    }),
  )
}

function applyChainAndWorkday(
  sheet: SheetData,
  startCol: number,
  endCol: number,
  daysCol: number,
  chainCol: number,
  holidays: ReadonlySet<string>,
  rules: FormulaRule[],
  locks?: FormulaLock[],
): void {
  const doChain = enabled(rules, 'chain_start')
  const doEnd = enabled(rules, 'workday_end')
  for (let row = 2; row < sheet.aoa.length; row += 1) {
    const prevEnd = parseExcelDate(getCell(sheet, row - 1, endCol))
    if (
      doChain &&
      !lockedField(locks, sheet.name, row, 'start') &&
      yesValue(getCell(sheet, row, chainCol)) &&
      prevEnd
    ) {
      setCell(sheet, row, startCol, prevEnd)
    }
    if (doEnd && !lockedField(locks, sheet.name, row, 'end')) {
      const start = parseExcelDate(getCell(sheet, row, startCol))
      const daysRaw = getCell(sheet, row, daysCol)
      const days = typeof daysRaw === 'number' ? daysRaw : Number(cellText(daysRaw))
      if (start && days > 0) setCell(sheet, row, endCol, workdayIntl(start, days, holidays))
    } else if (doEnd && lockedField(locks, sheet.name, row, 'end')) {
      const start = parseExcelDate(getCell(sheet, row, startCol))
      const end = parseExcelDate(getCell(sheet, row, endCol))
      if (start && end) {
        const days = workdaysBetween(start, end, holidays) || 1
        setCell(sheet, row, daysCol, days)
      }
    }
  }
}

function applyNetworkDays(sheet: SheetData, holidays: ReadonlySet<string>): void {
  const C = WBS_COLS
  for (let row = 2; row < sheet.aoa.length; row += 1) {
    const a = parseExcelDate(getCell(sheet, row, C.actualStart))
    const b = parseExcelDate(getCell(sheet, row, C.actualEnd))
    if (a && b) setCell(sheet, row, C.actualDays, networkDays(a, b, holidays))
  }
}

function applyMasterRollup(sheet: SheetData): void {
  const tasks = deriveMasterTasks([sheet])
  for (const task of tasks) {
    const kids = childrenOf(tasks, task.id)
    if (kids.length === 0) continue
    setCell(sheet, task.row, MASTER_COLS.status, rollupStatus(kids.map((k) => k.status)))
  }
}

function applyWbsRollup(sheet: SheetData): void {
  const C = WBS_COLS
  for (let row = 2; row < sheet.aoa.length; row += 1) {
    const l2 = codeText(getCell(sheet, row, C.l2))
    if (!l2) continue
    const statuses: string[] = []
    for (let r = row + 1; r < sheet.aoa.length; r += 1) {
      if (codeText(getCell(sheet, r, C.l2))) break
      const status = cellText(getCell(sheet, r, C.status))
      if (status) statuses.push(status)
    }
    if (statuses.length) setCell(sheet, row, C.status, rollupStatus(statuses))
  }
}

function applySheetSync(sheets: SheetData[], locks?: FormulaLock[]): void {
  const master = sheets.find((s) => s.kind === 'master')
  if (!master) return
  const tasks = deriveAllTasks(sheets)
  const byCode = new Map<string, typeof tasks>()
  for (const task of tasks) {
    const key = normalizeTaskCode(task.code)
    if (!key) continue
    const list = byCode.get(key) ?? []
    list.push(task)
    byCode.set(key, list)
  }

  for (const group of byCode.values()) {
    if (group.length < 2) continue
    const locked = group.find((t) =>
      locks?.some((l) => l.sheet === t.sheet && l.row === t.row),
    )
    const source = locked ?? group.find((t) => t.source === 'master') ?? group[0]
    if (!source.start && !source.end && source.days <= 0) continue
    for (const member of group) {
      if (member.id === source.id) continue
      const sheet = sheets.find((s) => s.name === member.sheet)
      const cols = sheet ? dateCols(sheet.kind) : null
      if (!sheet || !cols) continue
      if (source.start) setCell(sheet, member.row, cols.start, source.start)
      if (source.end) setCell(sheet, member.row, cols.end, source.end)
      if (source.days > 0) setCell(sheet, member.row, cols.days, source.days)
    }
  }

  const C = WBS_COLS
  const M = MASTER_COLS
  for (const task of tasks.filter((t) => t.source === 'master' && t.level === 3 && t.code)) {
    const statuses: string[] = []
    for (const wbs of sheets.filter((s) => s.kind === 'wbs')) {
      for (let row = 2; row < wbs.aoa.length; row += 1) {
        const code = codeText(getCell(wbs, row, C.l3)) || codeText(getCell(wbs, row, C.l2))
        if (normalizeTaskCode(code) !== normalizeTaskCode(task.code)) continue
        const status = cellText(getCell(wbs, row, C.status))
        if (status) statuses.push(status)
      }
    }
    if (statuses.length) setCell(master, task.row, M.status, rollupStatus(statuses))
  }
}

export function applyFormulas(
  sheets: SheetData[],
  rules: FormulaRule[],
  holidays: readonly string[],
  locks?: FormulaLock[],
): SheetData[] {
  const holidaySet = new Set(holidays)
  const next = sheets.map((s) => ({
    ...s,
    aoa: s.aoa.map((row) => row.slice()),
    formulas: { ...s.formulas },
  }))

  for (const sheet of next) {
    if (sheet.kind === 'master') {
      applyChainAndWorkday(
        sheet,
        MASTER_COLS.start,
        MASTER_COLS.end,
        MASTER_COLS.days,
        MASTER_COLS.chain,
        holidaySet,
        rules,
        locks,
      )
    }
    if (sheet.kind === 'wbs') {
      applyChainAndWorkday(
        sheet,
        WBS_COLS.start,
        WBS_COLS.end,
        WBS_COLS.days,
        WBS_COLS.chain,
        holidaySet,
        rules,
        locks,
      )
      if (enabled(rules, 'network_days')) applyNetworkDays(sheet, holidaySet)
    }
  }

  if (enabled(rules, 'sheet_sync')) applySheetSync(next, locks)

  if (enabled(rules, 'status_rollup')) {
    const master = next.find((s) => s.kind === 'master')
    if (master) applyMasterRollup(master)
    for (const wbs of next.filter((s) => s.kind === 'wbs')) applyWbsRollup(wbs)
  }

  return next
}
