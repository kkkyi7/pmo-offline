import type { Project, Task } from '../domain/types'

export function childrenOf(tasks: Task[], parentId: string | null): Task[] {
  return tasks.filter((t) => t.parentId === parentId)
}

export function hasChildren(tasks: Task[], id: string): boolean {
  return tasks.some((t) => t.parentId === id)
}

export function descendantsOf(tasks: Task[], id: string): Task[] {
  const out: Task[] = []
  const walk = (pid: string) => {
    for (const child of childrenOf(tasks, pid)) {
      out.push(child)
      walk(child.id)
    }
  }
  walk(id)
  return out
}

export function walkTree(tasks: Task[], visit: (task: Task, depth: number) => void): void {
  const walk = (parentId: string | null, depth: number) => {
    for (const task of childrenOf(tasks, parentId)) {
      visit(task, depth)
      walk(task.id, depth + 1)
    }
  }
  walk(null, 0)
}

export function flattenTree(tasks: Task[]): Task[] {
  const out: Task[] = []
  walkTree(tasks, (task) => {
    out.push(task)
  })
  return out
}

export function depthOf(tasks: Task[], id: string): number {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  let depth = 0
  let cur = byId.get(id)
  const seen = new Set<string>()
  while (cur?.parentId) {
    if (seen.has(cur.id)) break
    seen.add(cur.id)
    depth += 1
    cur = byId.get(cur.parentId)
  }
  return depth
}

export function predecessorsOf(project: Project, taskId: string): string[] {
  return project.dependencies.filter((d) => d.targetId === taskId).map((d) => d.sourceId)
}

export function taskByWbsOrId(tasks: Task[], token: string): Task | undefined {
  const key = token.trim()
  if (!key) return undefined
  return tasks.find((t) => t.wbsCode === key || t.id === key)
}
