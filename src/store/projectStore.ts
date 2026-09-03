import { create } from 'zustand'
import type { DateHint, Project, ProjectMeta, RiskRule, Task } from '../domain/types'
import { recompute } from '../engine/recompute'
import {
  addPhase,
  addTask,
  deleteRule,
  deleteTasks,
  hintField,
  indentTask,
  moveSibling,
  moveToPhase,
  outdentTask,
  patchTask,
  setPredecessors,
  upsertRule,
} from '../engine/mutations'
import { todayISO } from '../engine/dates'
import { sampleProject } from '../sample/sampleProject'
import { saveDraft } from '../persist/idb'

export type MainTab = 'plan' | 'gantt' | 'risks' | 'docs'
export type GanttScale = 'day' | 'week' | 'month'

interface ProjectState {
  project: Project
  selectedTaskId: string | null
  phaseFilter: string
  tab: MainTab
  ganttScale: GanttScale
  ganttRev: number
  dirty: boolean
  apply: (next: Project, hint?: DateHint, bumpGantt?: boolean) => void
  loadProject: (project: Project) => void
  setTab: (tab: MainTab) => void
  setPhaseFilter: (id: string) => void
  setSelectedTask: (id: string | null) => void
  setGanttScale: (scale: GanttScale) => void
  patchMeta: (patch: Partial<ProjectMeta>) => void
  updateTaskField: (taskId: string, fieldKey: string, value: string | number) => void
  addNewTask: () => void
  removeSelected: () => void
  indentSelected: () => void
  outdentSelected: () => void
  moveSelected: (dir: -1 | 1) => void
  updateRule: (rule: RiskRule) => void
  removeRule: (ruleId: string) => void
  createPhase: (name: string) => void
  applyGanttTask: (taskId: string, start: string, end: string, progress?: number) => void
}

function persist(project: Project): void {
  void saveDraft(project)
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: sampleProject(),
  selectedTaskId: null,
  phaseFilter: 'all',
  tab: 'plan',
  ganttScale: 'week',
  ganttRev: 0,
  dirty: false,

  apply: (next, hint, bumpGantt = true) => {
    const project = recompute(next, { today: todayISO(), dateHint: hint })
    set({
      project,
      dirty: true,
      ganttRev: bumpGantt ? get().ganttRev + 1 : get().ganttRev,
    })
    persist(project)
  },

  loadProject: (incoming) => {
    const project = recompute(incoming, { today: todayISO() })
    set({
      project,
      selectedTaskId: null,
      phaseFilter: 'all',
      dirty: false,
      ganttRev: get().ganttRev + 1,
    })
    persist(project)
  },

  setTab: (tab) => set({ tab }),
  setPhaseFilter: (phaseFilter) => set({ phaseFilter }),
  setSelectedTask: (selectedTaskId) => set({ selectedTaskId }),
  setGanttScale: (ganttScale) => set({ ganttScale }),

  patchMeta: (patch) => {
    const { project, apply } = get()
    apply({ ...project, meta: { ...project.meta, ...patch, extra: { ...project.meta.extra, ...patch.extra } } })
  },

  updateTaskField: (taskId, fieldKey, value) => {
    const { project, apply } = get()
    const field = project.schema.fields.find((f) => f.key === fieldKey)
    if (!field) return
    if (field.standard === 'predecessors') {
      apply(setPredecessors(project, taskId, String(value)))
      return
    }
    if (field.standard === 'phaseId') {
      const phase = project.phases.find((p) => p.name === String(value) || p.id === String(value))
      if (phase) apply(moveToPhase(project, taskId, phase.id))
      return
    }
    const patch: Partial<Task> & { extras?: Record<string, string | number> } = {}
    switch (field.standard) {
      case 'name':
        patch.name = String(value)
        break
      case 'owner':
        patch.owner = String(value)
        break
      case 'start':
        patch.start = String(value)
        break
      case 'end':
        patch.end = String(value)
        break
      case 'duration':
        patch.duration = Number(value) || 0
        break
      case 'progress':
        patch.progress = Math.min(100, Math.max(0, Number(value) || 0))
        break
      case 'status':
        patch.status = String(value)
        break
      case 'wbsCode':
        return
      default:
        patch.extras = { [field.key]: value }
    }
    apply(patchTask(project, taskId, patch), hintField(field.standard ?? '') ? { taskId, field: hintField(field.standard ?? '')! } : undefined)
  },

  addNewTask: () => {
    const { project, selectedTaskId, phaseFilter, apply } = get()
    const phaseId = phaseFilter === 'all' ? project.phases[0]?.id ?? 'p1' : phaseFilter
    apply(addTask(project, selectedTaskId, phaseId))
  },

  removeSelected: () => {
    const { project, selectedTaskId, apply } = get()
    if (!selectedTaskId) return
    apply(deleteTasks(project, selectedTaskId))
    set({ selectedTaskId: null })
  },

  indentSelected: () => {
    const { project, selectedTaskId, apply } = get()
    if (!selectedTaskId) return
    apply(indentTask(project, selectedTaskId))
  },

  outdentSelected: () => {
    const { project, selectedTaskId, apply } = get()
    if (!selectedTaskId) return
    apply(outdentTask(project, selectedTaskId))
  },

  moveSelected: (dir) => {
    const { project, selectedTaskId, apply } = get()
    if (!selectedTaskId) return
    apply(moveSibling(project, selectedTaskId, dir))
  },

  updateRule: (rule) => {
    const { project, apply } = get()
    apply(upsertRule(project, rule))
  },

  removeRule: (ruleId) => {
    const { project, apply } = get()
    apply(deleteRule(project, ruleId))
  },

  createPhase: (name) => {
    const { project, apply } = get()
    apply(addPhase(project, name))
  },

  applyGanttTask: (taskId, start, end, progress) => {
    const { project, apply } = get()
    apply(patchTask(project, taskId, { start, end, progress: progress ?? project.tasks.find((t) => t.id === taskId)?.progress }), {
      taskId,
      field: 'end',
    })
  },
}))
