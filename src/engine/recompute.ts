import type { Project, RecomputeOptions } from '../domain/types'
import { todayISO } from './dates'
import { scanRisks } from '../rules/builtins'
import { applyDateHint, applyFsSchedule, fillIncompleteLeaves, rollupParents } from './schedule'
import { flattenTree } from './tree'
import { assignWbsCodes } from './wbs'

export function recompute(project: Project, options: RecomputeOptions = {}): Project {
  const today = options.today ?? todayISO()
  let tasks = assignWbsCodes(project.tasks)
  tasks = applyDateHint(tasks, options.dateHint)
  tasks = fillIncompleteLeaves(tasks)
  const scheduled = applyFsSchedule({ ...project, tasks })
  tasks = rollupParents(scheduled)
  tasks = flattenTree(tasks)
  const next: Project = {
    ...project,
    tasks,
    riskFindings: [],
  }
  next.riskFindings = scanRisks(next, today)
  return next
}
