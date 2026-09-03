import * as XLSX from 'xlsx'
import type { SheetData, Workspace } from '../domain/workspace'
import { kindOfSheet } from '../engine/sheets'
import { parseISO } from '../engine/dates'

export const V07_HINTS = ['主计划', '里程碑计划']

export function isV07Workbook(wb: XLSX.WorkBook): boolean {
  const names = wb.SheetNames
  return names.includes('主计划') && names.some((n) => n.includes('WBS'))
}

function aoaOf(wb: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = wb.Sheets[name]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][]
}

function formulasOf(wb: XLSX.WorkBook, name: string): Record<string, string> {
  const sheet = wb.Sheets[name]
  if (!sheet) return {}
  const out: Record<string, string> = {}
  for (const addr of Object.keys(sheet)) {
    if (addr.startsWith('!')) continue
    const cell = sheet[addr] as { f?: string } | undefined
    if (cell?.f) out[addr] = cell.f
  }
  return out
}

export function workbookToSheets(wb: XLSX.WorkBook): SheetData[] {
  return wb.SheetNames.filter((name) => !name.startsWith('说明')).map((name) => ({
    name,
    kind: kindOfSheet(name),
    aoa: aoaOf(wb, name),
    formulas: formulasOf(wb, name),
  }))
}

function cellForExport(value: unknown): unknown {
  if (typeof value === 'string') {
    const d = parseISO(value)
    if (d) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
    }
  }
  return value === '' ? '' : value
}

export function sheetsToWorkbook(sheets: SheetData[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const aoa = sheet.aoa.map((row) => row.map(cellForExport))
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    for (const [addr, formula] of Object.entries(sheet.formulas)) {
      const existing = (ws[addr] as Record<string, unknown> | undefined) ?? {}
      ws[addr] = { ...existing, f: formula }
    }
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }
  return wb
}

export function sheetsToArrayBuffer(sheets: SheetData[]): ArrayBuffer {
  return XLSX.write(sheetsToWorkbook(sheets), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

export function workspaceToArrayBuffer(workspace: Workspace): ArrayBuffer {
  const scenario = workspace.scenarios.find((s) => s.id === workspace.activeId) ?? workspace.scenarios[0]
  if (!scenario) throw new Error('没有可导出的场景')
  const wb = sheetsToWorkbook(scenario.sheets)
  const meta = XLSX.utils.aoa_to_sheet([
    ['项目名称', workspace.projectName],
    ['场景', scenario.name],
    ['场景说明', scenario.note],
    ['导出说明', '此工作簿按「项目实施主计划&WBS」模版分 sheet。公式已保留，可在 Excel 中继续计算。'],
  ])
  XLSX.utils.book_append_sheet(wb, meta, '导出说明')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

export function parseWorkbookBuffer(buffer: ArrayBuffer): SheetData[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, cellFormula: true })
  if (!isV07Workbook(wb)) {
    throw new Error(
      `表头/工作表对不上。请使用模版「项目实施主计划&WBS」（至少要有「主计划」和任意「*WBS」sheet）。当前工作表：${wb.SheetNames.join('、') || '空'}`,
    )
  }
  return workbookToSheets(wb)
}

export async function parseWorkbookFile(file: File): Promise<SheetData[]> {
  return parseWorkbookBuffer(await file.arrayBuffer())
}
