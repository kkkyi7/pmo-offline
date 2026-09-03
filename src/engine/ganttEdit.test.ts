import { describe, expect, it } from 'vitest'
import { MASTER_COLS, WBS_COLS } from '../domain/workspace'
import { applyGanttText, linkedTasks, writeLinkedSheetValue } from './ganttEdit'
import { applyFormulas } from './formulas'
import { deriveAllTasks } from './deriveTasks'
import { buildScenario } from './scenario'

function pairSheets() {
  return [
    {
      name: '主计划',
      kind: 'master' as const,
      aoa: [
        [],
        [],
        ['', '', '5.1.5', '主计划名', '', '', '未完成', '', '', '', '', '', '2026-09-01', '2026-09-03', 3, '', '', '', ''],
      ],
      formulas: {},
    },
    {
      name: '上线运行WBS',
      kind: 'wbs' as const,
      aoa: [
        [],
        [],
        ['', '5.1.5', 'WBS名', '', '', '', '', '', '', '2026-09-01', '2026-09-03', 3, '', '', '', '', '', '', '未完成', '', ''],
      ],
      formulas: {},
    },
  ]
}

describe('gantt text / code edits', () => {
  it('writes name to every code-matched sheet row', () => {
    const scenario = buildScenario({ name: '编', sheets: pairSheets() })
    const master = scenario.tasks.find((t) => t.source === 'master' && t.code === '5.1.5')
    expect(master).toBeTruthy()
    if (!master) return
    const sheets = applyGanttText(scenario.sheets, scenario.tasks, master.id, 'name', '新名字')
    expect(sheets[0]?.aoa[2]?.[MASTER_COLS.name]).toBe('新名字')
    expect(sheets[1]?.aoa[2]?.[WBS_COLS.name]).toBe('新名字')
  })

  it('writes code to every code-matched sheet row', () => {
    const scenario = buildScenario({ name: '编', sheets: pairSheets() })
    const wbs = scenario.tasks.find((t) => t.source === 'wbs' && t.code === '5.1.5')
    expect(wbs).toBeTruthy()
    if (!wbs) return
    const sheets = writeLinkedSheetValue(scenario.sheets, scenario.tasks, wbs.sheet, wbs.row, WBS_COLS.l3, '5.1.9')
    expect(sheets[0]?.aoa[2]?.[MASTER_COLS.l3]).toBe('5.1.9')
    expect(sheets[1]?.aoa[2]?.[WBS_COLS.l3]).toBe('5.1.9')
  })

  it('does not invent extra plan rows when linking a 1-to-1 pair', () => {
    const scenario = buildScenario({ name: '编', sheets: pairSheets() })
    const master = scenario.tasks.find((t) => t.source === 'master' && t.code === '5.1.5')
    expect(master).toBeTruthy()
    if (!master) return
    expect(linkedTasks(scenario.tasks, master)).toHaveLength(2)
    expect(scenario.sheets[0]?.aoa.length).toBe(3)
    expect(scenario.sheets[1]?.aoa.length).toBe(3)
  })

  it('copies dates across sheets by code during sheet_sync', () => {
    const sheets = pairSheets()
    sheets[1].aoa[2][WBS_COLS.start] = ''
    sheets[1].aoa[2][WBS_COLS.end] = ''
    sheets[1].aoa[2][WBS_COLS.days] = ''
    const next = applyFormulas(
      sheets,
      [
        { id: 'workday_end', enabled: false },
        { id: 'chain_start', enabled: false },
        { id: 'network_days', enabled: false },
        { id: 'status_rollup', enabled: false },
        { id: 'sheet_sync', enabled: true },
      ],
      [],
    )
    expect(next[1]?.aoa[2]?.[WBS_COLS.start]).toBe('2026-09-01')
    expect(next[1]?.aoa[2]?.[WBS_COLS.end]).toBe('2026-09-03')
    expect(next[1]?.aoa[2]?.[WBS_COLS.days]).toBe(3)
    const tasks = deriveAllTasks(next)
    expect(tasks.filter((t) => t.code === '5.1.5').every((t) => t.start === '2026-09-01')).toBe(true)
  })
})
