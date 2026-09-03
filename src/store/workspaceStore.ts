import { create } from 'zustand'
import type { FormulaKind, GanttWeekMode, RiskRule, Workspace } from '../domain/workspace'
import { todayISO } from '../engine/dates'
import { dateCols } from '../engine/deriveTasks'
import { linkedTasksForEdit, writeLinkedSheetValue } from '../engine/ganttEdit'
import { workdaysBetween } from '../engine/workdays'
import { buildScenario, cloneScenario, refreshScenario } from '../engine/scenario'
import type { FormulaLock } from '../engine/formulas'
import { ensureRow, setCell } from '../engine/sheets'
import { saveDraft } from '../persist/idb'
import { defaultWorkspace, templateSheets } from '../sample/workspace'

export type MainTab = 'plan' | 'gantt' | 'risks'
export type GanttScale = 'day' | 'month' | 'year'

interface WorkspaceState {
  workspace: Workspace
  tab: MainTab
  ganttScale: GanttScale
  selectedTaskId: string | null
  activeSheet: string
  apply: (workspace: Workspace) => void
  loadWorkspace: (workspace: Workspace) => void
  setTab: (tab: MainTab) => void
  setGanttScale: (scale: GanttScale) => void
  setSelectedTask: (id: string | null) => void
  setActiveSheet: (name: string) => void
  setProjectName: (name: string) => void
  setActiveScenario: (id: string) => void
  renameScenario: (id: string, name: string) => void
  noteScenario: (id: string, note: string) => void
  copyScenario: (id: string) => void
  addScenario: () => void
  deleteScenario: (id: string) => void
  replaceActiveSheets: (sheets: Workspace['scenarios'][0]['sheets'], name?: string) => void
  importAsScenario: (sheets: Workspace['scenarios'][0]['sheets'], name: string) => void
  updateCell: (sheetName: string, row: number, col: number, value: unknown, lock?: FormulaLock) => void
  addSheetRow: (sheetName: string, afterRow?: number) => void
  toggleFormula: (id: FormulaKind) => void
  updateRule: (rule: RiskRule) => void
  setScanDate: (iso: string) => void
  setGanttAnchor: (iso: string) => void
  setGanttWeekMode: (mode: GanttWeekMode) => void
  setGanttWeekCrossMonth: (on: boolean) => void
  applyGanttTask: (taskId: string, start: string, end: string) => void
}

function persist(workspace: Workspace): void {
  void saveDraft(workspace)
}

function mapActive(workspace: Workspace, fn: (s: Workspace['scenarios'][0]) => Workspace['scenarios'][0]): Workspace {
  return {
    ...workspace,
    scenarios: workspace.scenarios.map((s) => (s.id === workspace.activeId ? fn(s) : s)),
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: defaultWorkspace(),
  tab: 'plan',
  ganttScale: 'day',
  selectedTaskId: null,
  activeSheet: '主计划',

  apply: (workspace) => {
    set({ workspace })
    persist(workspace)
  },

  loadWorkspace: (workspace) => {
    const next = {
      ...workspace,
      scenarios: workspace.scenarios.map((s) => refreshScenario(s)),
    }
    const activeScenario = next.scenarios.find((s) => s.id === next.activeId) ?? next.scenarios[0]
    const defaultSheet =
      activeScenario?.sheets.find((s) => s.kind === 'master')?.name ??
      activeScenario?.sheets[0]?.name ??
      '主计划'
    set({
      workspace: next,
      selectedTaskId: null,
      activeSheet: defaultSheet,
    })
    persist(next)
  },

  setTab: (tab) => set({ tab }),
  setGanttScale: (ganttScale) => set({ ganttScale }),
  setSelectedTask: (selectedTaskId) => set({ selectedTaskId }),
  setActiveSheet: (activeSheet) => set({ activeSheet }),

  setProjectName: (name) => {
    const workspace = { ...get().workspace, projectName: name }
    get().apply(workspace)
  },

  setActiveScenario: (id) => {
    const workspace = { ...get().workspace, activeId: id }
    const scenario = workspace.scenarios.find((s) => s.id === id)
    set({
      workspace,
      selectedTaskId: null,
      activeSheet: scenario?.sheets.find((s) => s.kind === 'master')?.name ?? scenario?.sheets[0]?.name ?? '主计划',
    })
    persist(workspace)
  },

  renameScenario: (id, name) => {
    const workspace = {
      ...get().workspace,
      scenarios: get().workspace.scenarios.map((s) => (s.id === id ? { ...s, name } : s)),
    }
    get().apply(workspace)
  },

  noteScenario: (id, note) => {
    const workspace = {
      ...get().workspace,
      scenarios: get().workspace.scenarios.map((s) => (s.id === id ? { ...s, note } : s)),
    }
    get().apply(workspace)
  },

  copyScenario: (id) => {
    const source = get().workspace.scenarios.find((s) => s.id === id)
    if (!source) return
    const copy = cloneScenario(source, `${source.name} · what-if`)
    const workspace = {
      ...get().workspace,
      activeId: copy.id,
      scenarios: [...get().workspace.scenarios, copy],
    }
    set({ workspace, selectedTaskId: null })
    persist(workspace)
  },

  addScenario: () => {
    const n = get().workspace.scenarios.length + 1
    const created = buildScenario({
      name: `场景 ${n}`,
      note: '从模版新建，与其它场景隔离。',
      sheets: templateSheets(),
    })
    const workspace = {
      ...get().workspace,
      activeId: created.id,
      scenarios: [...get().workspace.scenarios, created],
    }
    set({ workspace, selectedTaskId: null, activeSheet: '主计划' })
    persist(workspace)
  },

  deleteScenario: (id) => {
    const { workspace } = get()
    if (workspace.scenarios.length <= 1) return
    const scenarios = workspace.scenarios.filter((s) => s.id !== id)
    const activeId = workspace.activeId === id ? scenarios[0].id : workspace.activeId
    const nextScenario = scenarios.find((s) => s.id === activeId)
    const activeSheet =
      nextScenario?.sheets.find((s) => s.kind === 'master')?.name ??
      nextScenario?.sheets[0]?.name ??
      '主计划'
    get().apply({ ...workspace, scenarios, activeId })
    if (workspace.activeId === id) set({ selectedTaskId: null, activeSheet })
  },

  replaceActiveSheets: (sheets, name) => {
    const { workspace } = get()
    const workspaceNext = mapActive(workspace, (s) =>
      refreshScenario({
        ...s,
        name: name ?? s.name,
        sheets,
      }),
    )
    get().apply(workspaceNext)
  },

  importAsScenario: (sheets, name) => {
    const created = buildScenario({ name, note: '从 Excel 导入', sheets })
    const workspace = {
      ...get().workspace,
      activeId: created.id,
      scenarios: [...get().workspace.scenarios, created],
    }
    set({ workspace, selectedTaskId: null, activeSheet: '主计划' })
    persist(workspace)
  },

  addSheetRow: (sheetName, afterRow) => {
    const { workspace } = get()
    get().apply(
      mapActive(workspace, (s) => {
        const sheets = s.sheets.map((sheet) => {
          if (sheet.name !== sheetName) return sheet
          const cols = Math.max(8, ...sheet.aoa.map((r) => r.length), sheet.kind === 'wbs' ? 21 : 19)
          const empty = Array.from({ length: cols }, () => '')
          if (sheet.kind === 'master' || sheet.kind === 'wbs') empty[sheet.kind === 'master' ? 6 : 18] = '未完成'
          const aoa = sheet.aoa.map((r) => r.slice())
          const at = afterRow === undefined ? aoa.length : afterRow + 1
          aoa.splice(at, 0, empty)
          ensureRow(aoa, at, cols)
          return { ...sheet, aoa }
        })
        return refreshScenario({ ...s, sheets })
      }),
    )
  },

  updateCell: (sheetName, row, col, value, lock) => {
    const { workspace } = get()
    const next = mapActive(workspace, (s) => {
      const sheets = writeLinkedSheetValue(s.sheets, s.tasks, sheetName, row, col, value)
      return refreshScenario({ ...s, sheets }, todayISO(), lock ? [lock] : undefined)
    })
    get().apply(next)
  },

  setScanDate: (iso) => {
    const { workspace } = get()
    get().apply(
      mapActive(workspace, (s) => refreshScenario({ ...s, scanDate: iso }, iso)),
    )
  },

  setGanttAnchor: (iso) => {
    const { workspace } = get()
    get().apply(mapActive(workspace, (s) => ({ ...s, ganttAnchor: iso })))
  },

  setGanttWeekMode: (mode) => {
    const { workspace } = get()
    get().apply(mapActive(workspace, (s) => ({ ...s, ganttWeekMode: mode })))
  },

  setGanttWeekCrossMonth: (on) => {
    const { workspace } = get()
    get().apply(mapActive(workspace, (s) => ({ ...s, ganttWeekCrossMonth: on })))
  },

  toggleFormula: (id) => {
    const { workspace } = get()
    get().apply(
      mapActive(workspace, (s) =>
        refreshScenario({
          ...s,
          formulaRules: s.formulaRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
        }),
      ),
    )
  },

  updateRule: (rule) => {
    const { workspace } = get()
    get().apply(
      mapActive(workspace, (s) =>
        refreshScenario({
          ...s,
          riskRules: s.riskRules.map((r) => (r.id === rule.id ? rule : r)),
        }),
      ),
    )
  },

  applyGanttTask: (taskId, start, end) => {
    const { workspace } = get()
    const scenario = workspace.scenarios.find((s) => s.id === workspace.activeId)
    const task = scenario?.tasks.find((t) => t.id === taskId)
    if (!scenario || !task) return
    const peers = linkedTasksForEdit(scenario.tasks, task)
    const holidays = new Set(scenario.holidays)
    const days = workdaysBetween(start, end, holidays) || 1
    get().apply(
      mapActive(workspace, (s) => {
        const sheets = s.sheets.map((sheet) => {
          const members = peers.filter((t) => t.sheet === sheet.name)
          if (!members.length) return sheet
          const cols = dateCols(sheet.kind)
          if (!cols) return sheet
          const clone = { ...sheet, aoa: sheet.aoa.map((r) => r.slice()) }
          for (const member of members) {
            setCell(clone, member.row, cols.start, start)
            setCell(clone, member.row, cols.end, end)
            setCell(clone, member.row, cols.days, days)
          }
          return clone
        })
        return refreshScenario({ ...s, sheets }, todayISO(),
          peers.map((t) => ({ sheet: t.sheet, row: t.row, fields: ['start', 'end'] as const })),
        )
      }),
    )
  },
}))

export function useActiveScenario() {
  return useWorkspaceStore((s) => s.workspace.scenarios.find((x) => x.id === s.workspace.activeId) ?? s.workspace.scenarios[0])
}
