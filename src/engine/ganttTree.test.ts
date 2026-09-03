import { describe, expect, it } from 'vitest'
import v07 from '../sample/v07.json'
import { kindOfSheet } from './sheets'
import { buildScenario } from './scenario'
import {
  barCaption,
  buildGanttRows,
  collapseGanttRows,
  matchMasterTask,
} from './ganttTree'

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

describe('gantt tree', () => {
  it('nests WBS activities under the matching master row in 全部', () => {
    const scenario = buildScenario({ name: '全', sheets: sampleSheets() })
    const rows = buildGanttRows(scenario.tasks, 'all')
    expect(rows.some((r) => r.kind === 'section')).toBe(false)
    expect(rows[0]?.kind === 'task' && rows[0].task.name).toBe('项目准备')
    const tasks = rows.filter((r) => r.kind === 'task')

    const names = tasks.map((r) => r.task.name.trim())
    const host = names.indexOf('内部启动准备')
    expect(host).toBeGreaterThan(0)
    expect(tasks[host]?.task.source).toBe('master')
    expect(tasks[host]?.task.code).toBe('1.1.1')
    expect(tasks[host + 1]?.task.source).toBe('wbs')
    expect(tasks[host + 1]?.task.code).toBe('1.1.1')
    expect(tasks[host + 1]?.task.name.trim()).toBe('内部启动准备')
    expect(names.slice(host + 2, host + 5)).toEqual(['选择团队成员', '组织售前交接会', '制度模板裁剪'])
    expect(names.filter((n) => n === '内部启动准备')).toHaveLength(2)
  })

  it('matches master and WBS only by code, never by Chinese name', () => {
    const master = [
      {
        id: 'm1',
        sheet: '主计划',
        source: 'master' as const,
        group: '主计划',
        row: 1,
        code: '2.2.2',
        name: '蓝图设计报告制定',
        level: 3 as const,
        phase: '需求分析',
        start: '',
        end: '',
        days: 0,
        status: '未完成',
        owner: '',
        pred: '',
        chain: false,
        milestone: false,
        deliverable: '',
        parentId: null,
      },
    ]
    const wbs = {
      ...master[0],
      id: 'w1',
      sheet: '需求分析WBS',
      source: 'wbs' as const,
      group: '需求分析WBS',
      name: '关于用户培训考核',
    }
    expect(matchMasterTask(master, wbs)?.id).toBe('m1')
    expect(
      matchMasterTask(master, {
        ...wbs,
        id: 'w2',
        code: '',
        name: '蓝图设计报告制定',
      }),
    ).toBeUndefined()
    expect(
      matchMasterTask(master, {
        ...wbs,
        id: 'w3',
        code: ' 2．2.2 ',
        name: '完全不同的名字',
      })?.id,
    ).toBe('m1')
  })

  it('still shows both master and WBS rows when a code has only one WBS counterpart', () => {
    const master = {
      id: '主计划:3',
      sheet: '主计划',
      source: 'master' as const,
      group: '主计划',
      row: 3,
      code: '5.1.5',
      name: '主计划任务',
      level: 3 as const,
      phase: '上线运行',
      start: '2026-09-01',
      end: '2026-09-03',
      days: 3,
      status: '未完成',
      owner: '',
      pred: '',
      chain: false,
      milestone: false,
      deliverable: '',
      parentId: null,
    }
    const wbs = {
      ...master,
      id: '上线运行WBS:8',
      sheet: '上线运行WBS',
      source: 'wbs' as const,
      group: '上线运行WBS',
      row: 8,
      name: 'WBS 同编号',
      level: 2 as const,
    }
    const rows = buildGanttRows([master, wbs], 'all')
    const tasks = rows.filter((r) => r.kind === 'task')
    expect(tasks).toHaveLength(2)
    expect(tasks[0]?.task.source).toBe('master')
    expect(tasks[1]?.task.source).toBe('wbs')
    expect(tasks.map((r) => r.task.code)).toEqual(['5.1.5', '5.1.5'])
  })

  it('keeps a single sheet as its own list', () => {
    const scenario = buildScenario({ name: '全', sheets: sampleSheets() })
    const rows = buildGanttRows(scenario.tasks, '项目准备WBS')
    expect(rows[0]).toMatchObject({ kind: 'section', name: '项目准备WBS' })
    expect(rows.some((r) => r.kind === 'task' && r.task.source === 'master')).toBe(false)
    expect(rows.some((r) => r.kind === 'task' && r.task.name.trim() === '选择团队成员')).toBe(true)
  })

  it('collapses a phase and hides nested rows', () => {
    const scenario = buildScenario({ name: '全', sheets: sampleSheets() })
    const rows = buildGanttRows(scenario.tasks, 'all')
    const phase = rows.find((r) => r.kind === 'task' && r.task.name === '项目准备')
    expect(phase?.kind).toBe('task')
    if (phase?.kind !== 'task') return
    const collapsed = collapseGanttRows(rows, { [phase.task.id]: true })
    expect(collapsed.some((r) => r.kind === 'task' && r.task.name.trim() === '内部启动准备')).toBe(false)
    expect(collapsed.some((r) => r.kind === 'task' && r.task.name === '需求分析')).toBe(true)
  })

  it('writes bar text as name plus workdays', () => {
    expect(barCaption('项目启动', 15)).toBe('项目启动 15天')
    expect(barCaption(' 内部启动准备 ', 3)).toBe('内部启动准备 3天')
  })
})
