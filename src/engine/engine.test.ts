import { describe, expect, it } from 'vitest'
import { defaultFields, defaultRiskRules } from '../domain/defaults'
import type { Project, Task } from '../domain/types'
import { scanRisks } from '../rules/builtins'
import { shiftTaskSpan } from './ganttDrag'
import { recompute } from './recompute'

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    parentId: null,
    phaseId: 'p1',
    name: partial.name ?? `T${partial.id}`,
    wbsCode: '',
    owner: partial.owner ?? 'A',
    start: partial.start ?? '',
    end: partial.end ?? '',
    duration: partial.duration ?? 0,
    progress: partial.progress ?? 0,
    status: partial.status ?? '未开始',
    extras: {},
    ...partial,
  }
}

function project(tasks: Task[], extra: Partial<Project> = {}): Project {
  return {
    meta: {
      name: '测试',
      manager: '',
      start: '2026-01-01',
      notes: '',
      autoSchedule: false,
      extra: {},
    },
    schema: { fields: defaultFields() },
    phases: [{ id: 'p1', name: '启动', order: 1 }],
    tasks,
    dependencies: [],
    riskRules: defaultRiskRules(),
    riskFindings: [],
    ...extra,
  }
}

describe('recompute', () => {
  it('assigns hierarchical WBS codes', () => {
    const next = recompute(
      project([
        task({ id: '1', name: '父' }),
        task({ id: '2', parentId: '1', name: '子1', start: '2026-01-01', duration: 2 }),
        task({ id: '3', parentId: '1', name: '子2', start: '2026-01-03', duration: 2 }),
      ]),
      { today: '2026-08-31' },
    )
    expect(next.tasks.map((t) => t.wbsCode)).toEqual(['1', '1.1', '1.2'])
  })

  it('fills end from start + duration', () => {
    const next = recompute(project([task({ id: '1', start: '2026-01-01', duration: 3 })]), {
      today: '2026-08-31',
    })
    expect(next.tasks[0].end).toBe('2026-01-03')
  })

  it('recomputes end when duration is the hint', () => {
    const next = recompute(
      project([task({ id: '1', start: '2026-01-01', end: '2026-01-03', duration: 5 })]),
      { today: '2026-08-31', dateHint: { taskId: '1', field: 'duration' } },
    )
    expect(next.tasks[0].end).toBe('2026-01-05')
    expect(next.tasks[0].duration).toBe(5)
  })

  it('recomputes duration when end is the hint', () => {
    const next = recompute(
      project([task({ id: '1', start: '2026-01-01', end: '2026-01-10', duration: 3 })]),
      { today: '2026-08-31', dateHint: { taskId: '1', field: 'end' } },
    )
    expect(next.tasks[0].duration).toBe(10)
  })

  it('rolls parent dates and progress from children', () => {
    const next = recompute(
      project([
        task({ id: '1', name: '父', progress: 0 }),
        task({
          id: '2',
          parentId: '1',
          start: '2026-01-01',
          duration: 2,
          progress: 100,
        }),
        task({
          id: '3',
          parentId: '1',
          start: '2026-01-05',
          duration: 2,
          progress: 0,
        }),
      ]),
      { today: '2026-08-31' },
    )
    const parent = next.tasks.find((t) => t.id === '1')!
    expect(parent.start).toBe('2026-01-01')
    expect(parent.end).toBe('2026-01-06')
    expect(parent.progress).toBe(50)
  })

  it('pushes FS successors when autoSchedule is on', () => {
    const next = recompute(
      project(
        [
          task({ id: '1', start: '2026-01-01', duration: 3 }),
          task({ id: '2', start: '2026-01-02', duration: 2 }),
        ],
        {
          meta: {
            name: '测试',
            manager: '',
            start: '2026-01-01',
            notes: '',
            autoSchedule: true,
            extra: {},
          },
          dependencies: [{ id: 'd1', sourceId: '1', targetId: '2', type: 'FS' }],
        },
      ),
      { today: '2026-08-31' },
    )
    const succ = next.tasks.find((t) => t.id === '2')!
    expect(succ.start).toBe('2026-01-04')
    expect(succ.end).toBe('2026-01-05')
  })
})

describe('gantt drag math', () => {
  it('moves a bar by whole days', () => {
    expect(shiftTaskSpan('2026-07-01', '2026-07-03', 'move', 2)).toEqual({
      start: '2026-07-03',
      end: '2026-07-05',
    })
  })

  it('resizes the end without crossing start', () => {
    expect(shiftTaskSpan('2026-07-01', '2026-07-05', 'end', -10)).toEqual({
      start: '2026-07-01',
      end: '2026-07-01',
    })
  })
})

describe('risk rules', () => {
  it('flags missing owner on leaves', () => {
    const next = recompute(project([task({ id: '1', owner: '', start: '2026-09-01', duration: 2 })]), {
      today: '2026-08-31',
    })
    expect(next.riskFindings.some((f) => f.ruleId === 'r2' && f.taskId === '1')).toBe(true)
  })

  it('flags inverted dates', () => {
    const next = recompute(
      project([task({ id: '1', start: '2026-01-10', end: '2026-01-01', duration: 1 })]),
      { today: '2026-08-31', dateHint: { taskId: '1', field: 'end' } },
    )
    expect(next.riskFindings.some((f) => f.ruleId === 'r3')).toBe(true)
  })

  it('flags overdue incomplete tasks', () => {
    const next = recompute(
      project([task({ id: '1', start: '2026-07-01', duration: 5, progress: 20, status: '进行中' })]),
      { today: '2026-08-31' },
    )
    expect(next.riskFindings.some((f) => f.ruleId === 'r4')).toBe(true)
  })

  it('flags stale progress', () => {
    const next = recompute(
      project([
        task({
          id: '1',
          start: '2026-09-01',
          duration: 5,
          progress: 10,
          status: '进行中',
        }),
      ]),
      { today: '2026-08-31' },
    )
    expect(next.riskFindings.some((f) => f.ruleId === 'r5')).toBe(true)
  })

  it('flags predecessor overlap', () => {
    const next = recompute(
      project(
        [
          task({ id: '1', start: '2026-09-01', duration: 5 }),
          task({ id: '2', start: '2026-09-02', duration: 2 }),
        ],
        { dependencies: [{ id: 'd1', sourceId: '1', targetId: '2', type: 'FS' }] },
      ),
      { today: '2026-08-31' },
    )
    expect(next.riskFindings.some((f) => f.ruleId === 'r6' && f.taskId === '2')).toBe(true)
  })

  it('flags duration mismatch when all three fields disagree', () => {
    const next = recompute(
      project([task({ id: '1', start: '2026-09-01', end: '2026-09-10', duration: 2 })]),
      { today: '2026-08-31' },
    )
    expect(next.riskFindings.some((f) => f.ruleId === 'r8')).toBe(true)
  })

  it('flags parent range that does not cover children', () => {
    const next = recompute(
      project([
        task({ id: '1', start: '2026-09-01', end: '2026-09-02', duration: 2 }),
        task({ id: '2', parentId: '1', start: '2026-09-01', end: '2026-09-10', duration: 10 }),
      ]),
      { today: '2026-08-31' },
    )
    // rollup fixes the parent; the rule is a safety net and should be quiet after recompute
    expect(next.tasks.find((t) => t.id === '1')?.end).toBe('2026-09-10')
    expect(next.riskFindings.some((f) => f.ruleId === 'r7')).toBe(false)
  })

  it('detects parent_not_covering before rollup', () => {
    const raw = project([
      task({ id: '1', start: '2026-09-01', end: '2026-09-02', duration: 2 }),
      task({ id: '2', parentId: '1', start: '2026-09-01', end: '2026-09-10', duration: 10 }),
    ])
    const hits = scanRisks(raw, '2026-08-31')
    expect(hits.some((f) => f.ruleId === 'r7')).toBe(true)
  })

  it('flags threshold on long duration', () => {
    const next = recompute(project([task({ id: '1', start: '2026-09-01', duration: 25 })]), {
      today: '2026-08-31',
    })
    expect(next.riskFindings.some((f) => f.ruleId === 'r9')).toBe(true)
  })

  it('reacts to overdue threshold changes', () => {
    const base = project([
      task({ id: '1', start: '2026-07-01', duration: 3, progress: 90, status: '进行中' }),
    ])
    const high = recompute(base, { today: '2026-08-31' })
    expect(high.riskFindings.some((f) => f.ruleId === 'r4')).toBe(true)
    const relaxed = recompute(
      {
        ...base,
        riskRules: base.riskRules.map((r) =>
          r.id === 'r4' ? { ...r, params: { progressBelow: 80 } } : r,
        ),
      },
      { today: '2026-08-31' },
    )
    expect(relaxed.riskFindings.some((f) => f.ruleId === 'r4')).toBe(false)
  })
})
