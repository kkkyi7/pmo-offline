import { nextNumericId } from '../domain/ids'
import type { DateHintField, Dependency, Project, RiskRule, Task } from '../domain/types'
import { taskByWbsOrId } from './tree'
import { childrenOf, descendantsOf, flattenTree, hasChildren } from './tree'

export function patchTask(
  project: Project,
  taskId: string,
  patch: Partial<Task> & { extras?: Record<string, string | number> },
): Project {
  return {
    ...project,
    tasks: project.tasks.map((t) => {
      if (t.id !== taskId) return t
      return {
        ...t,
        ...patch,
        extras: patch.extras ? { ...t.extras, ...patch.extras } : t.extras,
      }
    }),
  }
}

export function setPredecessors(project: Project, taskId: string, text: string): Project {
  const rest = project.dependencies.filter((d) => d.targetId !== taskId)
  const added: Dependency[] = []
  for (const token of text.split(/[,，;；\s]+/).filter(Boolean)) {
    const source = taskByWbsOrId(project.tasks, token)
    if (!source || source.id === taskId) continue
    if (added.some((d) => d.sourceId === source.id)) continue
    added.push({
      id: nextNumericId([...rest, ...added].map((d) => d.id)),
      sourceId: source.id,
      targetId: taskId,
      type: 'FS',
    })
  }
  return { ...project, dependencies: [...rest, ...added] }
}

export function addTask(project: Project, selectedId: string | null, phaseId: string): Project {
  const id = nextNumericId(project.tasks.map((t) => t.id))
  const selected = selectedId ? project.tasks.find((t) => t.id === selectedId) : undefined
  const task: Task = {
    id,
    parentId: selected?.parentId ?? null,
    phaseId: selected?.phaseId ?? phaseId,
    name: '新任务',
    wbsCode: '',
    owner: '',
    start: selected?.start || project.meta.start || '',
    end: '',
    duration: 5,
    progress: 0,
    status: '未开始',
    extras: {},
  }
  const tasks = [...project.tasks]
  if (selected) {
    const idx = tasks.findIndex((t) => t.id === selected.id)
    tasks.splice(idx + 1 + descendantsOf(tasks, selected.id).length, 0, task)
  } else {
    tasks.push(task)
  }
  return { ...project, tasks }
}

export function deleteTasks(project: Project, taskId: string): Project {
  const remove = new Set([taskId, ...descendantsOf(project.tasks, taskId).map((t) => t.id)])
  return {
    ...project,
    tasks: project.tasks.filter((t) => !remove.has(t.id)),
    dependencies: project.dependencies.filter((d) => !remove.has(d.sourceId) && !remove.has(d.targetId)),
  }
}

export function indentTask(project: Project, taskId: string): Project {
  const ordered = flattenTree(project.tasks)
  const index = ordered.findIndex((t) => t.id === taskId)
  if (index <= 0) return project
  const task = ordered[index]
  const prev = ordered[index - 1]
  if (prev.parentId === task.parentId) {
    return {
      ...project,
      tasks: project.tasks.map((t) => (t.id === taskId ? { ...t, parentId: prev.id, phaseId: prev.phaseId } : t)),
    }
  }
  if (prev.parentId && prev.parentId !== task.id) {
    return {
      ...project,
      tasks: project.tasks.map((t) => (t.id === taskId ? { ...t, parentId: prev.parentId } : t)),
    }
  }
  return project
}

export function outdentTask(project: Project, taskId: string): Project {
  const task = project.tasks.find((t) => t.id === taskId)
  if (!task?.parentId) return project
  const parent = project.tasks.find((t) => t.id === task.parentId)
  if (!parent) return project
  return {
    ...project,
    tasks: project.tasks.map((t) => (t.id === taskId ? { ...t, parentId: parent.parentId } : t)),
  }
}

export function moveSibling(project: Project, taskId: string, dir: -1 | 1): Project {
  const task = project.tasks.find((t) => t.id === taskId)
  if (!task) return project
  const siblings = childrenOf(project.tasks, task.parentId)
  const i = siblings.findIndex((t) => t.id === taskId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= siblings.length) return project
  const a = siblings[i].id
  const b = siblings[j].id
  const tasks = [...project.tasks]
  const ia = tasks.findIndex((t) => t.id === a)
  const ib = tasks.findIndex((t) => t.id === b)
  const tmp = tasks[ia]
  tasks[ia] = tasks[ib]
  tasks[ib] = tmp
  return { ...project, tasks }
}

export function moveToPhase(project: Project, taskId: string, phaseId: string): Project {
  const ids = new Set([taskId, ...descendantsOf(project.tasks, taskId).map((t) => t.id)])
  return {
    ...project,
    tasks: project.tasks.map((t) => (ids.has(t.id) ? { ...t, phaseId } : t)),
  }
}

export function hintField(key: string): DateHintField | undefined {
  if (key === 'start') return 'start'
  if (key === 'end') return 'end'
  if (key === 'duration') return 'duration'
  return undefined
}

export function canHaveChildren(project: Project, taskId: string): boolean {
  return hasChildren(project.tasks, taskId)
}

export function upsertRule(project: Project, rule: RiskRule): Project {
  const exists = project.riskRules.some((r) => r.id === rule.id)
  return {
    ...project,
    riskRules: exists
      ? project.riskRules.map((r) => (r.id === rule.id ? rule : r))
      : [...project.riskRules, rule],
  }
}

export function deleteRule(project: Project, ruleId: string): Project {
  return { ...project, riskRules: project.riskRules.filter((r) => r.id !== ruleId) }
}

export function addPhase(project: Project, name: string): Project {
  const id = nextNumericId(project.phases.map((p) => p.id.replace(/\D/g, '') || p.id))
  const phaseId = project.phases.some((p) => p.id === `p${id}`) ? id : `p${id}`
  return {
    ...project,
    phases: [...project.phases, { id: phaseId, name, order: project.phases.length + 1 }],
  }
}
