import { MASTER_COLS, WBS_COLS, type SheetData } from '../domain/workspace'
import { parseExcelDate } from './excelDate'
import { mergeHolidaySheet, setCell } from './sheets'

function convertCols(sheet: SheetData, startRow: number, cols: number[]): void {
  for (let row = startRow; row < sheet.aoa.length; row += 1) {
    for (const col of cols) {
      const iso = parseExcelDate(sheet.aoa[row]?.[col])
      if (iso) setCell(sheet, row, col, iso)
      else if (typeof sheet.aoa[row]?.[col] === 'number' && (sheet.aoa[row][col] as number) < 200) {
        setCell(sheet, row, col, '')
      }
    }
  }
}

export function normalizeSheets(sheets: SheetData[]): SheetData[] {
  const converted = sheets.map((sheet) => {
    const next: SheetData = {
      ...sheet,
      aoa: sheet.aoa.map((row) => row.slice()),
      formulas: { ...sheet.formulas },
    }
    if (next.kind === 'master') {
      convertCols(next, 2, [MASTER_COLS.start, MASTER_COLS.end])
    }
    if (next.kind === 'wbs') {
      convertCols(next, 2, [WBS_COLS.start, WBS_COLS.end, WBS_COLS.actualStart, WBS_COLS.actualEnd])
    }
    if (next.kind === 'holiday' || next.kind === 'milestone') {
      for (let row = 0; row < next.aoa.length; row += 1) {
        const line = next.aoa[row] ?? []
        for (let col = 0; col < line.length; col += 1) {
          const iso = parseExcelDate(line[col])
          if (iso) setCell(next, row, col, iso)
        }
      }
    }
    return next
  })
  return mergeHolidaySheet(converted)
}
