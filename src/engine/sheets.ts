import { CN_HOLIDAYS } from '../domain/cnHolidays'
import type { SheetData, SheetKind } from '../domain/workspace'
import { cellText, parseExcelDate } from './excelDate'

export function kindOfSheet(name: string): SheetKind {
  if (name === '主计划') return 'master'
  if (name === '里程碑计划') return 'milestone'
  if (name === '法定节假日') return 'holiday'
  if (name.includes('WBS')) return 'wbs'
  return 'other'
}

export function cloneAoa(aoa: unknown[][]): unknown[][] {
  return aoa.map((row) => row.slice())
}

export function cloneSheets(sheets: SheetData[]): SheetData[] {
  return sheets.map((s) => ({
    ...s,
    aoa: cloneAoa(s.aoa),
    formulas: { ...s.formulas },
  }))
}

export function findSheet(sheets: SheetData[], name: string): SheetData | undefined {
  return sheets.find((s) => s.name === name)
}

export function sheetByKind(sheets: SheetData[], kind: SheetKind): SheetData | undefined {
  return sheets.find((s) => s.kind === kind)
}

export function ensureRow(aoa: unknown[][], row: number, cols: number): unknown[] {
  while (aoa.length <= row) aoa.push([])
  const line = aoa[row] ?? (aoa[row] = [])
  while (line.length < cols) line.push('')
  return line
}

export function setCell(sheet: SheetData, row: number, col: number, value: unknown): void {
  const line = ensureRow(sheet.aoa, row, col + 1)
  line[col] = value
}

export function getCell(sheet: SheetData, row: number, col: number): unknown {
  return sheet.aoa[row]?.[col]
}

export function extractHolidays(sheets: SheetData[]): string[] {
  const holiday = sheetByKind(sheets, 'holiday')
  if (!holiday) return [...CN_HOLIDAYS.map((h) => h.date)].sort()
  const out = new Set<string>()
  for (const row of holiday.aoa.slice(1)) {
    for (const cell of row) {
      const iso = parseExcelDate(cell)
      if (iso) out.add(iso)
    }
  }
  for (const h of CN_HOLIDAYS) out.add(h.date)
  return [...out].sort()
}

export function mergeHolidaySheet(sheets: SheetData[]): SheetData[] {
  const holiday = sheetByKind(sheets, 'holiday')
  const seen = new Set<string>()
  const base: SheetData = holiday
    ? { ...holiday, aoa: holiday.aoa.map((row) => row.slice()) }
    : { name: '法定节假日', kind: 'holiday', aoa: [['年份', '节日', '日期', '依据']], formulas: {} }

  for (const row of base.aoa.slice(1)) {
    for (const cell of row) {
      const iso = parseExcelDate(cell)
      if (iso) seen.add(iso)
    }
  }

  const missing = CN_HOLIDAYS.filter((h) => !seen.has(h.date))
  if (missing.length === 0 && holiday) return sheets
  if (base.aoa.length === 0) base.aoa.push(['年份', '节日', '日期', '依据'])
  for (const h of missing) base.aoa.push([h.year, h.name, h.date, h.source])

  const idx = sheets.findIndex((s) => s.kind === 'holiday')
  if (idx < 0) return [...sheets, base]
  return sheets.map((s, i) => (i === idx ? base : s))
}

export function codeText(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (value === '★' || value === '*') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value * 1000) / 1000
    return String(rounded)
  }
  return cellText(value)
}

export function normalizeTaskCode(code: string): string {
  return code.trim().replace(/\s+/g, '').replace(/．/g, '.')
}

export function a1(row: number, col: number): string {
  let n = col + 1
  let letters = ''
  while (n > 0) {
    const m = (n - 1) % 26
    letters = String.fromCharCode(65 + m) + letters
    n = Math.floor((n - 1) / 26)
  }
  return `${letters}${row + 1}`
}

export function rollupStatus(statuses: string[]): string {
  const cleaned = statuses.map((s) => s.trim()).filter(Boolean)
  if (cleaned.length === 0) return ''
  if (cleaned.every((s) => s === '未完成')) return '未完成'
  if (cleaned.every((s) => s === '已完成')) return '已完成'
  return '进行中'
}
