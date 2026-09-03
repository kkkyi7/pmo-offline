import { FORMULA_HELP, MASTER_COLS, WBS_COLS, type SheetData } from '../../domain/workspace'
import { cellText, parseExcelDate } from '../../engine/excelDate'
import { a1 } from '../../engine/sheets'
import { useActiveScenario, useWorkspaceStore } from '../../store/workspaceStore'

interface ColDef {
  col: number
  label: string
  width: number
  type?: 'text' | 'date' | 'number' | 'status'
}

const MASTER_COLS_UI: ColDef[] = [
  { col: MASTER_COLS.l1, label: '一级阶段', width: 86 },
  { col: MASTER_COLS.l2, label: '二级场景', width: 86 },
  { col: MASTER_COLS.l3, label: '三级任务', width: 86 },
  { col: MASTER_COLS.name, label: '任务名称', width: 200 },
  { col: MASTER_COLS.succ, label: '后置', width: 70 },
  { col: MASTER_COLS.pred, label: '前置', width: 70 },
  { col: MASTER_COLS.status, label: '状态', width: 88, type: 'status' },
  { col: MASTER_COLS.note, label: '进度备注', width: 140 },
  { col: MASTER_COLS.milestone, label: '里程碑', width: 64 },
  { col: MASTER_COLS.reviewB, label: '乙方评审', width: 72 },
  { col: MASTER_COLS.reviewA, label: '甲方评审', width: 72 },
  { col: MASTER_COLS.pmo, label: 'PMO', width: 56 },
  { col: MASTER_COLS.start, label: '计划开始', width: 124, type: 'date' },
  { col: MASTER_COLS.end, label: '计划结束', width: 124, type: 'date' },
  { col: MASTER_COLS.days, label: '计划天数', width: 80, type: 'number' },
  { col: MASTER_COLS.chain, label: '前后置', width: 72 },
  { col: MASTER_COLS.owner, label: '主责', width: 90 },
  { col: MASTER_COLS.support, label: '协助', width: 90 },
  { col: MASTER_COLS.deliverable, label: '关键交付物', width: 180 },
]

const WBS_COLS_UI: ColDef[] = [
  { col: WBS_COLS.l2, label: '二级场景', width: 86 },
  { col: WBS_COLS.l3, label: '三级任务', width: 86 },
  { col: WBS_COLS.name, label: '任务名称', width: 180 },
  { col: WBS_COLS.wbs, label: 'WBS', width: 160 },
  { col: WBS_COLS.desc, label: '说明', width: 140 },
  { col: WBS_COLS.milestone, label: '里程碑', width: 64 },
  { col: WBS_COLS.reviewB, label: '乙方评审', width: 72 },
  { col: WBS_COLS.reviewA, label: '甲方评审', width: 72 },
  { col: WBS_COLS.pmo, label: 'PMO', width: 56 },
  { col: WBS_COLS.start, label: '计划开始', width: 124, type: 'date' },
  { col: WBS_COLS.end, label: '计划结束', width: 124, type: 'date' },
  { col: WBS_COLS.days, label: '计划天数', width: 80, type: 'number' },
  { col: WBS_COLS.chain, label: '前后置', width: 72 },
  { col: WBS_COLS.actualStart, label: '实际开始', width: 124, type: 'date' },
  { col: WBS_COLS.actualEnd, label: '实际完成', width: 124, type: 'date' },
  { col: WBS_COLS.actualDays, label: '实际天数', width: 80, type: 'number' },
  { col: WBS_COLS.owner, label: '主责', width: 90 },
  { col: WBS_COLS.support, label: '协助', width: 90 },
  { col: WBS_COLS.status, label: '状态', width: 88, type: 'status' },
  { col: WBS_COLS.note, label: '进度备注', width: 140 },
  { col: WBS_COLS.deliverable, label: '交付物', width: 160 },
]

function colsFor(sheet: SheetData): ColDef[] {
  if (sheet.kind === 'master') return MASTER_COLS_UI
  if (sheet.kind === 'wbs') return WBS_COLS_UI
  const width = sheet.kind === 'milestone' ? 72 : 120
  const count = Math.max(1, ...sheet.aoa.map((r) => r.length))
  return Array.from({ length: count }, (_, i) => ({
    col: i,
    label: cellText(sheet.aoa[0]?.[i]) || `列${i + 1}`,
    width,
    type: 'text' as const,
  }))
}

function displayValue(value: unknown, type?: ColDef['type']): string {
  if (type === 'date') return parseExcelDate(value)
  if (value === undefined || value === null) return ''
  return String(value)
}

export function SheetView() {
  const scenario = useActiveScenario()
  const activeSheet = useWorkspaceStore((s) => s.activeSheet)
  const setActiveSheet = useWorkspaceStore((s) => s.setActiveSheet)
  const updateCell = useWorkspaceStore((s) => s.updateCell)
  const toggleFormula = useWorkspaceStore((s) => s.toggleFormula)
  const selectedTaskId = useWorkspaceStore((s) => s.selectedTaskId)
  const setSelectedTask = useWorkspaceStore((s) => s.setSelectedTask)
  const addSheetRow = useWorkspaceStore((s) => s.addSheetRow)
  const sheet = scenario.sheets.find((s) => s.name === activeSheet) ?? scenario.sheets[0]
  if (!sheet) return <p className="empty">当前场景没有表</p>
  const cols = colsFor(sheet)
  const startRow = sheet.kind === 'holiday' || sheet.kind === 'other' ? 1 : 2

  return (
    <section className="panel plan-panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">板块二</p>
          <h2>计划表</h2>
          <p className="hint">和 Excel 一样按 sheet 分开。改单元格、加行会写回当前场景，甘特和风险跟着变。</p>
        </div>
        <div className="row-actions">
          <button type="button" onClick={() => addSheetRow(sheet.name)}>
            在末尾加一行
          </button>
          <button
            type="button"
            disabled={!selectedTaskId?.startsWith(`${sheet.name}:`)}
            onClick={() => {
              const raw = selectedTaskId ?? ''
              const m = /^(.+):(\d+)(?::act)?$/.exec(raw)
              if (m && m[1] === sheet.name) {
                const row = Number(m[2])
                if (Number.isFinite(row)) addSheetRow(sheet.name, row)
              }
            }}
          >
            在选中行下方插入
          </button>
        </div>
      </header>
      <div className="sheet-tabs">
        {scenario.sheets.map((s) => (
          <button
            key={s.name}
            type="button"
            className={s.name === sheet.name ? 'active' : undefined}
            onClick={() => setActiveSheet(s.name)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="formula-bar">
        {scenario.formulaRules.map((rule) => {
          const help = FORMULA_HELP[rule.id]
          return (
            <label key={rule.id} className={rule.enabled ? 'formula-chip on' : 'formula-chip'} title={help.text}>
              <input type="checkbox" checked={rule.enabled} onChange={() => toggleFormula(rule.id)} />
              <span>
                <b>{help.title}</b>
                <small>{help.text}</small>
              </span>
            </label>
          )
        })}
      </div>
      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="row-num">#</th>
              {cols.map((c) => (
                <th key={c.col} style={{ minWidth: c.width }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.aoa.slice(startRow).map((line, offset) => {
              const row = startRow + offset
              const taskId = `${sheet.name}:${row}`
              const selected = taskId === selectedTaskId
              return (
                <tr
                  key={row}
                  className={selected ? 'selected' : undefined}
                  onClick={() => setSelectedTask(taskId)}
                >
                  <td className="row-num">{row + 1}</td>
                  {cols.map((c) => {
                    const raw = line[c.col]
                    const value = displayValue(raw, c.type)
                    const formula = sheet.formulas[a1(row, c.col)]
                    return (
                      <td key={c.col} title={formula ? `Excel 公式：${formula}` : undefined}>
                        {c.type === 'status' ? (
                          <select
                            value={value || '未完成'}
                            onChange={(e) =>
                              updateCell(sheet.name, row, c.col, e.target.value, {
                                sheet: sheet.name,
                                row,
                                fields: [],
                              })
                            }
                          >
                            <option>未完成</option>
                            <option>进行中</option>
                            <option>已完成</option>
                          </select>
                        ) : c.type === 'date' ? (
                          <input
                            type="date"
                            value={value}
                            onChange={(e) => {
                              const isStart =
                                (sheet.kind === 'master' && c.col === MASTER_COLS.start) ||
                                (sheet.kind === 'wbs' && c.col === WBS_COLS.start)
                              const isEnd =
                                (sheet.kind === 'master' && c.col === MASTER_COLS.end) ||
                                (sheet.kind === 'wbs' && c.col === WBS_COLS.end)
                              const lock = isStart || isEnd
                                ? { sheet: sheet.name, row, fields: [isEnd ? ('end' as const) : ('start' as const)] }
                                : { sheet: sheet.name, row, fields: [] }
                              updateCell(sheet.name, row, c.col, e.target.value, lock)
                            }}
                          />
                        ) : (
                          <input
                            type={c.type === 'number' ? 'number' : 'text'}
                            value={value}
                            onChange={(e) => {
                              const isDays =
                                (sheet.kind === 'master' && c.col === MASTER_COLS.days) ||
                                (sheet.kind === 'wbs' && c.col === WBS_COLS.days)
                              const lock = isDays
                                ? { sheet: sheet.name, row, fields: ['days' as const] }
                                : { sheet: sheet.name, row, fields: [] }
                              const next = c.type === 'number' ? Number(e.target.value) || 0 : e.target.value
                              updateCell(sheet.name, row, c.col, next, lock)
                            }}
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
