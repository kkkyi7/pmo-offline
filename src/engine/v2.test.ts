import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorkbookBuffer, sheetsToWorkbook } from '../excel/v07io'
import { RISK_CATALOG } from '../rules/catalog'
import v07 from '../sample/v07.json'
import { parseExcelDate } from './excelDate'
import { applyFormulas } from './formulas'
import { buildScenario, cloneScenario } from './scenario'
import { kindOfSheet } from './sheets'
import { extractHolidays } from './sheets'
import { workdayIntl, workdaysBetween } from './workdays'

const raw = v07 as {
  names: string[]
  sheets: Record<string, { aoa: unknown[][]; formulas: Record<string, string> }>
}

function sampleSheets() {
  return raw.names.map((name) => ({
    name,
    kind: kindOfSheet(name),
    aoa: raw.sheets[name].aoa.map((row) => row.slice()),
    formulas: { ...raw.sheets[name].formulas },
  }))
}

describe('excel dates and workdays', () => {
  it('reads M/D/YY and rejects Excel zero dates', () => {
    expect(parseExcelDate('9/3/23')).toBe('2023-09-03')
    expect(parseExcelDate(45172)).toBe('2023-09-03')
    expect(parseExcelDate(45172.5)).toBe('2023-09-03')
    expect(parseExcelDate('1/0/00')).toBe('')
    expect(parseExcelDate(0)).toBe('')
  })

  it('parses YYYY/MM/DD, YYYY.MM.DD, YYYY-M-D and Chinese date formats', () => {
    expect(parseExcelDate('2023/9/1')).toBe('2023-09-01')
    expect(parseExcelDate('2023/09/01')).toBe('2023-09-01')
    expect(parseExcelDate('2023-9-1')).toBe('2023-09-01')
    expect(parseExcelDate('2023.9.1')).toBe('2023-09-01')
    expect(parseExcelDate('2023.09.01')).toBe('2023-09-01')
    expect(parseExcelDate('2023年9月1日')).toBe('2023-09-01')
  })

  it('workdaysBetween is exactly invertible with workdayIntl', () => {
    const holidays = new Set(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07'])
    const start = '2026-09-28'
    const days = 5
    const end = workdayIntl(start, days, holidays)
    expect(workdaysBetween(start, end, holidays)).toBe(days)
    expect(workdayIntl(start, workdaysBetween(start, end, holidays), holidays)).toBe(end)
  })

  it('matches the template WORKDAY.INTL examples', () => {
    expect(workdayIntl('2023-09-03', 5, new Set())).toBe('2023-09-08')
    expect(workdayIntl('2023-09-03', 22, new Set())).toBe('2023-10-03')
  })

  it('skips 2026 National Day from the official notice', () => {
    const scenario = buildScenario({ name: '假日', sheets: sampleSheets() })
    const holidays = new Set(scenario.holidays)
    expect(holidays.has('2026-10-01')).toBe(true)
    expect(holidays.has('2026-10-07')).toBe(true)
    expect(holidays.has('2026-10-10')).toBe(false)
    expect(workdayIntl('2026-09-30', 1, holidays)).toBe('2026-10-08')
  })

  it('includes 2027 statutory days and skips Dragon Boat on Wednesday', () => {
    const scenario = buildScenario({ name: '假日', sheets: sampleSheets() })
    const holidays = new Set(scenario.holidays)
    expect(holidays.has('2027-06-09')).toBe(true)
    expect(holidays.has('2027-06-10')).toBe(false)
    expect(workdayIntl('2027-06-08', 1, holidays)).toBe('2027-06-10')
    expect(extractHolidays(scenario.sheets).includes('2027-02-05')).toBe(true)
  })
})

describe('v0.7 workbook import', () => {
  it('imports the user template sheets without header mapping', () => {
    const wb = XLSX.utils.book_new()
    for (const name of raw.names) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(raw.sheets[name].aoa), name)
    }
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const sheets = parseWorkbookBuffer(buf)
    expect(sheets.map((s) => s.name)).toEqual(raw.names)
    const scenario = buildScenario({ name: '导入', sheets })
    expect(scenario.tasks.some((t) => t.name === '项目准备')).toBe(true)
    expect(scenario.tasks.some((t) => t.code === '1.1.1')).toBe(true)
    expect(scenario.sheets.some((s) => s.name === '项目准备WBS')).toBe(true)
  })

  it('imports the real V0.7 xlsx the user provided', () => {
    const localTemplate = resolve(process.cwd(), 'templates/项目实施主计划&WBS-V0.7.xlsx')
    const downloadPath = 'C:/Users/hf/Downloads/项目实施主计划&WBS-V0.7.xlsx'
    const targetPath = existsSync(localTemplate) ? localTemplate : downloadPath
    const buf = readFileSync(targetPath)
    const sheets = parseWorkbookBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    expect(sheets.map((s) => s.name)).toEqual(raw.names)
    const scenario = buildScenario({ name: '用户模版', sheets })
    expect(scenario.tasks.find((t) => t.name === '项目准备')?.start).toBe('2023-09-03')
  })

  it('preserves exact dates during workbook export and re-import', () => {
    const sheets = sampleSheets()
    const wb = sheetsToWorkbook(sheets)
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const reimported = parseWorkbookBuffer(buf)
    const s1 = buildScenario({ name: 'original', sheets })
    const s2 = buildScenario({ name: 'reimported', sheets: reimported })
    const t1 = s1.tasks.find((t) => t.name === '项目准备')
    const t2 = s2.tasks.find((t) => t.name === '项目准备')
    expect(t2?.start).toBe(t1?.start)
    expect(t2?.end).toBe(t1?.end)
  })
})

describe('formulas and scenarios', () => {
  it('chains start dates and fills workday ends', () => {
    const sheets = [
      {
        name: '主计划',
        kind: 'master' as const,
        aoa: [
          [],
          [],
          ['1', '', '', 'A', '', '', '未完成', '', '', '', '', '', '2026-09-01', '', 2, '', '', '', ''],
          ['', '1.1', '', 'B', '', '', '未完成', '', '', '', '', '', '', '', 3, '是', '', '', ''],
        ],
        formulas: {},
      },
    ]
    const next = applyFormulas(sheets, [
      { id: 'workday_end', enabled: true },
      { id: 'chain_start', enabled: true },
      { id: 'network_days', enabled: false },
      { id: 'status_rollup', enabled: false },
      { id: 'sheet_sync', enabled: false },
    ], [])
    expect(next[0].aoa[2][13]).toBe('2026-09-03')
    expect(next[0].aoa[3][12]).toBe('2026-09-03')
    expect(next[0].aoa[3][13]).toBe('2026-09-08')
  })

  it('puts master and WBS rows on the same task list', () => {
    const scenario = buildScenario({ name: '全', sheets: sampleSheets() })
    expect(scenario.tasks.some((t) => t.source === 'master' && t.name === '项目准备')).toBe(true)
    expect(scenario.tasks.some((t) => t.source === 'wbs' && t.group === '项目准备WBS')).toBe(true)
    expect(scenario.tasks.filter((t) => t.source === 'wbs').length).toBeGreaterThan(10)
  })

  it('copies a scenario without sharing sheet rows', () => {
    const a = buildScenario({ name: '基准', sheets: sampleSheets() })
    const b = cloneScenario(a, 'what-if')
    b.sheets[1].aoa[2][3] = '被改过'
    expect(a.sheets[1].aoa[2][3]).not.toBe('被改过')
    expect(a.id).not.toBe(b.id)
  })
})

describe('risk catalog', () => {
  it('ships practical rules with explanations', () => {
    expect(RISK_CATALOG.length).toBeGreaterThanOrEqual(18)
    expect(RISK_CATALOG.every((r) => r.how.length > 12 && r.summary.length > 4)).toBe(true)
  })

  it('flags overdue open tasks', () => {
    const scenario = buildScenario({
      name: 'r',
      sheets: [
        {
          name: '主计划',
          kind: 'master',
          aoa: [
            [],
            [],
            ['1', '', '', '过期任务', '', '', '未完成', '', '', '', '', '', '2026-07-01', '2026-07-10', 8, '', '张三', '', ''],
          ],
          formulas: {},
        },
      ],
    })
    const hit = scenario.findings.find((f) => f.ruleId === 'overdue_open')
    expect(hit).toBeTruthy()
  })

  it('supports comma-separated multiple predecessors', () => {
    const scenario = buildScenario({
      name: 'preds',
      sheets: [
        {
          name: '主计划',
          kind: 'master',
          aoa: [
            [],
            [],
            ['', '', '1.1.1', '前置1', '', '', '未完成', '', '', '', '', '', '2026-09-01', '2026-09-03', 2, '', '', '', ''],
            ['', '', '1.1.2', '前置2', '', '', '未完成', '', '', '', '', '', '2026-09-01', '2026-09-04', 3, '', '', '', ''],
            ['', '', '1.1.3', '后置任务', '', '1.1.1, 1.1.2', '未完成', '', '', '', '', '', '2026-09-07', '2026-09-09', 2, '', '', '', ''],
          ],
          formulas: {},
        },
      ],
    })
    // 1.1.3 starts 2026-09-07 (Monday), which is after 1.1.1 (end 09-03) and 1.1.2 (end 09-04).
    // Both predecessors exist and neither overlaps.
    expect(scenario.findings.some((f) => f.ruleId === 'pred_missing' && f.taskId.includes(':4'))).toBe(false)
    expect(scenario.findings.some((f) => f.ruleId === 'pred_overlap' && f.taskId.includes(':4'))).toBe(false)

    // Now test overlapping with one of the predecessors (starts 2026-09-04 <= 1.1.2 end 09-04)
    const overlapScenario = buildScenario({
      name: 'overlap',
      sheets: [
        {
          name: '主计划',
          kind: 'master',
          aoa: [
            [],
            [],
            ['', '', '1.1.1', '前置1', '', '', '未完成', '', '', '', '', '', '2026-09-01', '2026-09-03', 2, '', '', '', ''],
            ['', '', '1.1.2', '前置2', '', '', '未完成', '', '', '', '', '', '2026-09-01', '2026-09-04', 3, '', '', '', ''],
            ['', '', '1.1.3', '后置任务', '', '1.1.1, 1.1.2', '未完成', '', '', '', '', '', '2026-09-04', '2026-09-08', 2, '', '', '', ''],
          ],
          formulas: {},
        },
      ],
    })
    expect(overlapScenario.findings.some((f) => f.ruleId === 'pred_overlap' && f.taskId.includes(':4'))).toBe(true)
  })
})
