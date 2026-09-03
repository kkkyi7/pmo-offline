import { useMemo, useRef, useState } from 'react'
import { holidayShortName } from '../../domain/cnHolidays'
import { GANTT_WEEK_MODE_OPTIONS, type PlanTask, type RiskFinding } from '../../domain/workspace'
import { addDays, diffDays, parseISO, toISO } from '../../engine/dates'
import { taskCodeCol, taskNameCol } from '../../engine/ganttEdit'
import { barCaption, buildGanttRows, collapseGanttRows, type GanttRole } from '../../engine/ganttTree'
import { buildWeekTicks, formatWeekLabel, normalizeGanttWeekMode, resolveGanttAnchor, weekModeLocksCrossMonth } from '../../engine/ganttWeeks'
import { shiftTaskSpan } from '../../engine/ganttDrag'
import { isWeekend, networkDays } from '../../engine/workdays'
import { useActiveScenario, useWorkspaceStore } from '../../store/workspaceStore'

type Scale = 'day' | 'month' | 'year'

const ROW = 28
const NAME_W = 420
const SEQ_W = 80
const DAY_W: Record<Scale, number> = { day: 36, month: 10, year: 4 }
const HEAD_H: Record<Scale, number> = { day: 88, month: 66, year: 44 }
const DOW = ['日', '一', '二', '三', '四', '五', '六']

function daysBetween(a: string, b: string): number {
  return diffDays(a, b) ?? 0
}

function worst(findings: RiskFinding[]): RiskFinding['severity'] | null {
  if (findings.some((f) => f.severity === 'high')) return 'high'
  if (findings.some((f) => f.severity === 'medium')) return 'medium'
  if (findings.some((f) => f.severity === 'low')) return 'low'
  return null
}

function barClass(task: PlanTask, findings: RiskFinding[]): string {
  const risk = worst(findings)
  const bits = ['bar', `lv${task.level}`, task.source, `role-${taskRoleClass(task)}`]
  if (task.status === '已完成') bits.push('done')
  else if (task.status === '进行中') bits.push('doing')
  if (risk) bits.push(`risk-${risk}`)
  if (task.milestone) bits.push('milestone')
  return bits.join(' ')
}

function taskRoleClass(task: PlanTask): GanttRole {
  if (task.source === 'wbs' && !task.code) return 'activity'
  if (task.level === 1) return 'phase'
  if (task.level === 2) return 'scene'
  return 'task'
}

function planTaskId(task: PlanTask): string {
  return task.id.endsWith(':act') ? (task.parentId ?? task.id) : task.id
}

export function GanttView() {
  const scenario = useActiveScenario()
  const ganttScale = useWorkspaceStore((s) => s.ganttScale)
  const setGanttScale = useWorkspaceStore((s) => s.setGanttScale)
  const applyGanttTask = useWorkspaceStore((s) => s.applyGanttTask)
  const updateCell = useWorkspaceStore((s) => s.updateCell)
  const setGanttAnchor = useWorkspaceStore((s) => s.setGanttAnchor)
  const setGanttWeekMode = useWorkspaceStore((s) => s.setGanttWeekMode)
  const setGanttWeekCrossMonth = useWorkspaceStore((s) => s.setGanttWeekCrossMonth)
  const selectedTaskId = useWorkspaceStore((s) => s.selectedTaskId)
  const setSelectedTask = useWorkspaceStore((s) => s.setSelectedTask)
  const setTab = useWorkspaceStore((s) => s.setTab)
  const setActiveSheet = useWorkspaceStore((s) => s.setActiveSheet)
  const [filter, setFilter] = useState('all')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [edit, setEdit] = useState<{ id: string; field: 'name' | 'code'; value: string } | null>(null)
  const skipCommit = useRef(false)
  const [drag, setDrag] = useState<{
    id: string
    mode: 'move' | 'start' | 'end'
    originX: number
    start: string
    end: string
    liveStart: string
    liveEnd: string
  } | null>(null)

  const groups = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, PlanTask[]>()
    for (const task of scenario.tasks) {
      if (!map.has(task.group)) {
        map.set(task.group, [])
        order.push(task.group)
      }
      map.get(task.group)?.push(task)
    }
    return order.map((name) => ({ name, tasks: map.get(name) ?? [] }))
  }, [scenario.tasks])

  const allCount = useMemo(() => buildGanttRows(scenario.tasks, 'all').length, [scenario.tasks])

  const visible = useMemo(
    () => collapseGanttRows(buildGanttRows(scenario.tasks, filter), collapsed),
    [collapsed, filter, scenario.tasks],
  )

  const byTask = useMemo(() => {
    const map = new Map<string, RiskFinding[]>()
    for (const f of scenario.findings) {
      const list = map.get(f.taskId) ?? []
      list.push(f)
      map.set(f.taskId, list)
    }
    return map
  }, [scenario.findings])

  const dated = scenario.tasks.filter((t) => parseISO(t.start) && parseISO(t.end))
  const weekMode = normalizeGanttWeekMode(scenario.ganttWeekMode)
  const weekCrossLocked = weekModeLocksCrossMonth(weekMode)
  const weekCrossMonth = weekCrossLocked || Boolean(scenario.ganttWeekCrossMonth)
  const ganttAnchor = useMemo(
    () => resolveGanttAnchor(scenario.ganttAnchor, dated.map((t) => t.start)),
    [dated, scenario.ganttAnchor],
  )
  const range = useMemo(() => {
    const starts = dated.map((t) => t.start).sort()
    const ends = dated.map((t) => t.end).sort()
    const first = starts[0] ?? toISO(new Date())
    const last = ends[ends.length - 1] ?? toISO(new Date())
    const padStart = addDays(first, -3)
    const start =
      ganttAnchor && ganttAnchor < padStart && (daysBetween(ganttAnchor, first) ?? 0) <= 400
        ? ganttAnchor
        : padStart
    const end = addDays(last, 10)
    return { start, end, days: Math.max(1, daysBetween(start, end) + 1) }
  }, [dated, ganttAnchor])

  const px = DAY_W[ganttScale]
  const headH = HEAD_H[ganttScale]
  const width = range.days * px
  const today = toISO(new Date())
  const todayLeft = daysBetween(range.start, today) * px
  const holidays = useMemo(() => new Set(scenario.holidays), [scenario.holidays])

  const days = useMemo(() => {
    const out: Array<{
      iso: string
      left: number
      weekend: boolean
      holiday: boolean
      holidayName: string
      date: Date
    }> = []
    for (let i = 0; i < range.days; i += 1) {
      const iso = addDays(range.start, i)
      const date = parseISO(iso)
      if (!date) continue
      const holiday = holidays.has(iso)
      out.push({
        iso,
        left: i * px,
        weekend: isWeekend(iso),
        holiday,
        holidayName: holidayShortName(iso),
        date,
      })
    }
    return out
  }, [holidays, px, range.days, range.start])

  const monthTicks = useMemo(() => {
    const out: Array<{ left: number; width: number; label: string }> = []
    let i = 0
    while (i < days.length) {
      const cur = days[i]
      let span = 1
      while (i + span < days.length) {
        const next = days[i + span]
        const sameYear = next.date.getFullYear() === cur.date.getFullYear()
        const sameMonth = sameYear && next.date.getMonth() === cur.date.getMonth()
        if (ganttScale === 'year' ? !sameYear : !sameMonth) break
        span += 1
      }
      out.push({
        left: cur.left,
        width: span * px,
        label:
          ganttScale === 'year'
            ? `${cur.date.getFullYear()}年`
            : `${cur.date.getFullYear()}年${cur.date.getMonth() + 1}月`,
      })
      i += span
    }
    return out
  }, [days, ganttScale, px])

  const weekTicks = useMemo(() => {
    if (ganttScale === 'year') return []
    const ticks = buildWeekTicks(
      days.map((d) => d.iso),
      ganttAnchor,
      weekMode,
      weekCrossMonth,
    )
    const leftOf = new Map(days.map((d) => [d.iso, d.left]))
    return ticks.map((tick) => ({
      left: leftOf.get(tick.start) ?? 0,
      width: tick.days * px,
      label: formatWeekLabel(tick.week),
    }))
  }, [days, ganttAnchor, ganttScale, px, weekCrossMonth, weekMode])

  const dateTicks = useMemo(() => {
    if (ganttScale === 'year') {
      return days
        .filter((d, i) => i === 0 || d.date.getDate() === 1)
        .map((d) => ({
          left: d.left,
          label: `${d.date.getMonth() + 1}月`,
          major: d.date.getMonth() === 0,
          rest: d.weekend || d.holiday,
        }))
    }
    return days
      .filter((d) => ganttScale === 'day' || d.date.getDate() === 1 || d.date.getDay() === 1 || d.left === 0)
      .map((d) => ({
        left: d.left,
        label: `${d.date.getMonth() + 1}/${d.date.getDate()}`,
        major: d.date.getDate() === 1 || d.date.getDay() === 1,
        rest: d.weekend || d.holiday,
      }))
  }, [days, ganttScale])

  const milestoneDates = useMemo(() => {
    const set = new Set<string>()
    for (const task of scenario.tasks) {
      if (!task.milestone) continue
      if (task.start) set.add(task.start)
      else if (task.end) set.add(task.end)
    }
    return days.filter((d) => set.has(d.iso))
  }, [days, scenario.tasks])

  const previewDates = (clientX: number) => {
    if (!drag) return null
    return shiftTaskSpan(drag.start, drag.end, drag.mode, Math.round((clientX - drag.originX) / px))
  }

  const jumpPlan = (task: PlanTask) => {
    setSelectedTask(planTaskId(task))
    setActiveSheet(task.sheet)
    setTab('plan')
  }

  const toggleCollapse = (key: string) => {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  }

  const commitEdit = () => {
    if (skipCommit.current) {
      skipCommit.current = false
      setEdit(null)
      return
    }
    if (!edit) return
    const task = scenario.tasks.find((t) => t.id === edit.id)
    const col = edit.field === 'name' ? (task ? taskNameCol(task) : null) : task ? taskCodeCol(task) : null
    if (task && col !== null && task[edit.field] !== edit.value) {
      updateCell(task.sheet, task.row, col, edit.value)
    }
    setEdit(null)
  }

  return (
    <section className="panel gantt-panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">板块三</p>
          <h2>甘特图</h2>
          <p className="hint">
            「全部」按编号把 WBS 挂到主计划下。序号和任务名可改，会写回计划表。周序号从基准日连到计划结束。
          </p>
        </div>
        <div className="gantt-tools">
          <label className="gantt-anchor">
            基准日
            <input
              type="date"
              value={ganttAnchor}
              onChange={(e) => setGanttAnchor(e.target.value)}
            />
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const first = dated.map((t) => t.start).sort()[0]
                if (first) setGanttAnchor(first)
              }}
            >
              最早开工
            </button>
          </label>
          <div className="scale-switch week-mode">
            {GANTT_WEEK_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                title={opt.hint}
                className={weekMode === opt.id ? 'active' : undefined}
                onClick={() => setGanttWeekMode(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label
            className={`gantt-cross-month ${weekCrossLocked ? 'is-locked' : ''}`}
            title={
              weekCrossLocked
                ? '自然周本身跨月，此开关不可改，也不会改存储值。'
                : '打开后，月/7天或月/自然周可以跨过月底连成一周。'
            }
          >
            <span className="switch">
              <input
                type="checkbox"
                checked={weekCrossMonth}
                disabled={weekCrossLocked}
                onChange={(e) => setGanttWeekCrossMonth(e.target.checked)}
              />
              <span />
            </span>
            周可跨月
          </label>
          <div className="scale-switch">
            {(['day', 'month', 'year'] as Scale[]).map((scale) => (
              <button
                key={scale}
                type="button"
                className={ganttScale === scale ? 'active' : undefined}
                onClick={() => setGanttScale(scale)}
              >
                {scale === 'day' ? '日' : scale === 'month' ? '月' : '年'}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="gantt-filters">
        <button type="button" className={filter === 'all' ? 'active' : undefined} onClick={() => setFilter('all')}>
          全部 {allCount}
        </button>
        {groups.map((g) => (
          <button
            key={g.name}
            type="button"
            className={filter === g.name ? 'active' : undefined}
            onClick={() => setFilter(g.name)}
          >
            {g.name} {g.tasks.length}
          </button>
        ))}
      </div>
      <div className="gantt-legend">
        <span className="lg lv1">阶段</span>
        <span className="lg lv2">场景 / 任务</span>
        <span className="lg lv3">WBS 活动</span>
        <span className="lg weekend">周末</span>
        <span className="lg holiday">节假日</span>
        <span className="lg milestone">里程碑</span>
        <span className="lg risk-high">高风险</span>
      </div>
      <div
        className="gantt-body gantt-sheet"
        onMouseMove={(e) => {
          const next = previewDates(e.clientX)
          if (!drag || !next) return
          setDrag({ ...drag, liveStart: next.start, liveEnd: next.end })
        }}
        onMouseUp={() => {
          if (!drag) return
          if (drag.liveStart !== drag.start || drag.liveEnd !== drag.end) {
            applyGanttTask(drag.id, drag.liveStart, drag.liveEnd)
          }
          setDrag(null)
        }}
        onMouseLeave={() => {
          if (!drag) return
          if (drag.liveStart !== drag.start || drag.liveEnd !== drag.end) {
            applyGanttTask(drag.id, drag.liveStart, drag.liveEnd)
          }
          setDrag(null)
        }}
      >
        <div
          className="gantt-grid"
          style={{
            width: NAME_W + width,
            ['--gantt-name-w' as string]: `${NAME_W}px`,
            ['--gantt-seq-w' as string]: `${SEQ_W}px`,
            ['--gantt-row-h' as string]: `${ROW}px`,
            ['--gantt-head-h' as string]: `${headH}px`,
            ['--gantt-day-w' as string]: `${px}px`,
          }}
        >
          <div className="gantt-head-stack">
            <div className="gantt-corner">
              <b>序号</b>
              <span>阶段 / 子任务</span>
            </div>
            <div className={`gantt-head gantt-${ganttScale}`} style={{ width }}>
              <div className="gantt-axis gantt-months">
                {monthTicks.map((t) => (
                  <b key={`m-${t.left}`} style={{ left: t.left, width: t.width }}>
                    {t.label}
                  </b>
                ))}
              </div>
              {weekTicks.length ? (
                <div className="gantt-axis gantt-weeks">
                  {weekTicks.map((t) => (
                    <b key={`w-${t.left}`} style={{ left: t.left, width: t.width }}>
                      {t.label}
                    </b>
                  ))}
                </div>
              ) : null}
              <div className="gantt-axis gantt-dates">
                {dateTicks.map((t) => (
                  <i
                    key={`d-${t.left}-${t.label}`}
                    className={`${t.major ? 'major' : ''} ${t.rest ? 'rest' : ''}`}
                    style={{ left: t.left, width: ganttScale === 'day' ? px : undefined }}
                  >
                    {t.label}
                  </i>
                ))}
              </div>
              {ganttScale === 'day' ? (
                <div className="gantt-axis gantt-dows">
                  {days.map((d) => (
                    <i
                      key={`dow-${d.iso}`}
                      className={`${d.weekend ? 'weekend' : ''} ${d.holiday ? 'holiday' : ''}`}
                      style={{ left: d.left, width: px }}
                    >
                      {d.holidayName || DOW[d.date.getDay()]}
                    </i>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="gantt-rows" style={{ minHeight: visible.length * ROW }}>
            <div className="gantt-bands" style={{ left: NAME_W, width, height: visible.length * ROW }}>
              {days.map((d) =>
                d.holiday || d.weekend ? (
                  <span
                    key={`${d.holiday ? 'h' : 'w'}-${d.iso}`}
                    className={`cal-band ${d.holiday ? 'holiday' : 'weekend'}`}
                    style={{ left: d.left, width: px }}
                  />
                ) : null,
              )}
              {milestoneDates.map((d) => (
                <span key={`ml-${d.iso}`} className="ms-line" style={{ left: d.left + px / 2 }} />
              ))}
              {todayLeft >= 0 && todayLeft <= width ? <div className="today-line" style={{ left: todayLeft }} /> : null}
            </div>

            {visible.map((row) => {
              if (row.kind === 'section') {
                return (
                  <div key={`h-${row.name}`} className="gantt-pair section">
                    <button
                      type="button"
                      className="gantt-section"
                      onClick={() => toggleCollapse(row.name)}
                    >
                      <i>{collapsed[row.name] ? '▸' : '▾'}</i>
                      <strong>{row.name}</strong>
                      <em>{row.count} 条</em>
                    </button>
                    <div className="gantt-row section-row" style={{ width }} />
                  </div>
                )
              }

              const task = row.task
              const live = drag?.id === task.id ? { start: drag.liveStart, end: drag.liveEnd } : task
              const has = Boolean(parseISO(live.start) && parseISO(live.end))
              const findings = byTask.get(planTaskId(task)) ?? byTask.get(task.id) ?? []
              const left = has ? daysBetween(range.start, live.start) * px : 0
              const barW = has ? Math.max(px, (daysBetween(live.start, live.end) + 1) * px) : 0
              const workdays = has ? networkDays(live.start, live.end, holidays) || task.days : task.days
              const selected = selectedTaskId === task.id || selectedTaskId === planTaskId(task)
              const canFold = row.role === 'phase' || row.role === 'scene'
              return (
                <div key={task.id} className={`gantt-pair role-${row.role} depth-${row.depth} ${task.milestone ? 'milestone' : ''}`}>
                  <div
                    className={`gantt-name lv${task.level} ${task.source} role-${row.role} ${task.milestone ? 'milestone' : ''} ${selected ? 'selected' : ''}`}
                    onClick={() => {
                      if (canFold) toggleCollapse(task.id)
                      setSelectedTask(planTaskId(task))
                    }}
                    onDoubleClick={() => jumpPlan(task)}
                    title="双击回到计划表对应行"
                  >
                    <b className="gantt-seq">
                      {taskCodeCol(task) === null ? (
                        <em className="gantt-seq-text">{row.seq || ''}</em>
                      ) : (
                        <input
                          className="gantt-edit-code"
                          value={edit?.id === task.id && edit.field === 'code' ? edit.value : task.code}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onFocus={() => setEdit({ id: task.id, field: 'code', value: task.code })}
                          onChange={(e) => setEdit({ id: task.id, field: 'code', value: e.target.value })}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') {
                              skipCommit.current = true
                              setEdit(null)
                              e.currentTarget.blur()
                            }
                          }}
                          title="改序号，写回计划表"
                        />
                      )}
                      {canFold ? <i>{collapsed[task.id] ? '▸' : '▾'}</i> : null}
                    </b>
                    <span className="gantt-title" style={{ paddingLeft: row.depth * 14 }}>
                      <input
                        className="gantt-edit-name"
                        value={edit?.id === task.id && edit.field === 'name' ? edit.value : task.name}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onFocus={() => setEdit({ id: task.id, field: 'name', value: task.name })}
                        onChange={(e) => setEdit({ id: task.id, field: 'name', value: e.target.value })}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                          if (e.key === 'Escape') {
                            skipCommit.current = true
                            setEdit(null)
                            e.currentTarget.blur()
                          }
                        }}
                        title="改任务名，写回计划表"
                      />
                      {task.milestone ? <em className="ms-tag" title="里程碑">★</em> : null}
                    </span>
                    {findings.length ? (
                      <button
                        type="button"
                        className={`risk-dot ${worst(findings)}`}
                        title={findings.map((f) => f.message).join('\n')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedTask(planTaskId(task))
                          setTab('risks')
                        }}
                      >
                        {findings.length}
                      </button>
                    ) : null}
                  </div>
                  <div className={`gantt-row role-${row.role}`} style={{ width }}>
                    {has ? (
                      <div
                        className={`${barClass(task, findings)} ${selected ? 'selected' : ''}`}
                        style={{ left, width: barW }}
                        title={[
                          `${task.group} · ${task.name.trim()}`,
                          `${live.start} → ${live.end} · ${workdays || ''}工作日`,
                          task.milestone ? '里程碑' : '',
                          ...findings.map((f) => `· ${f.message}`),
                        ]
                          .filter(Boolean)
                          .join('\n')}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setSelectedTask(planTaskId(task))
                          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                          const mode =
                            e.clientX - rect.left < 8 ? 'start' : rect.right - e.clientX < 8 ? 'end' : 'move'
                          setDrag({
                            id: task.id,
                            mode,
                            originX: e.clientX,
                            start: task.start,
                            end: task.end,
                            liveStart: task.start,
                            liveEnd: task.end,
                          })
                        }}
                      >
                        <span className="bar-label">{barCaption(task.name, workdays)}</span>
                        {task.milestone ? <i className="diamond" /> : null}
                        {findings.length ? <b className={`flag ${worst(findings)}`}>{findings.length}</b> : null}
                      </div>
                    ) : task.milestone ? (
                      <div
                        className="ms-pending"
                        title={[`${task.group} · ${task.name.trim()}`, '里程碑 · 还没有计划日期', ...findings.map((f) => `· ${f.message}`)].join('\n')}
                      >
                        <i className="diamond" />
                        <span>里程碑 · 待定日期</span>
                      </div>
                    ) : (
                      <em className="no-date">无日期</em>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
