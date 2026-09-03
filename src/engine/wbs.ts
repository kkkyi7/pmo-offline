import type { Task } from '../domain/types'
import { childrenOf } from './tree'

export function assignWbsCodes(tasks: Task[]): Task[] {
  const next = tasks.map((t) => ({ ...t }))
  const byId = new Map(next.map((t) => [t.id, t]))

  const walk = (parentId: string | null, prefix: string) => {
    const siblings = childrenOf(next, parentId)
    siblings.forEach((task, index) => {
      const code = prefix ? `${prefix}.${index + 1}` : String(index + 1)
      const target = byId.get(task.id)
      if (target) target.wbsCode = code
      walk(task.id, code)
    })
  }

  walk(null, '')
  return next
}
