import { MASTER_COLS, WBS_COLS, type PlanTask, type SheetData, type SheetKind } from '../domain/workspace'
import { cellText, parseExcelDate, yesValue } from './excelDate'
import { codeText, sheetByKind } from './sheets'

export function dateCols(kind: SheetKind): { start: number; end: number; days: number } | null {
  if (kind === 'master') return { start: MASTER_COLS.start, end: MASTER_COLS.end, days: MASTER_COLS.days }
  if (kind === 'wbs') return { start: WBS_COLS.start, end: WBS_COLS.end, days: WBS_COLS.days }
  return null
}

function daysOf(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 0 ? value : 0
  const n = Number(cellText(value))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function deriveMasterTasks(sheets: SheetData[]): PlanTask[] {
  const master = sheetByKind(sheets, 'master')
  if (!master) return []
  const tasks: PlanTask[] = []
  let phase = ''
  let lastL1: string | null = null
  let lastL2: string | null = null
  const C = MASTER_COLS

  for (let row = 2; row < master.aoa.length; row += 1) {
    const line = master.aoa[row] ?? []
    const name = cellText(line[C.name])
    const l3 = codeText(line[C.l3])
    const l2 = codeText(line[C.l2])
    const l1 = codeText(line[C.l1])
    if (!name && !l1 && !l2 && !l3) continue

    let level: 1 | 2 | 3 = 3
    let code = ''
    let parentId: string | null = null
    if (l1) {
      level = 1
      code = l1
      phase = name || phase
      lastL1 = `${master.name}:${row}`
      lastL2 = null
    } else if (l2) {
      level = 2
      code = l2
      parentId = lastL1
      lastL2 = `${master.name}:${row}`
    } else {
      level = 3
      code = l3
      parentId = lastL2 ?? lastL1
    }
    if (!name) continue

    tasks.push({
      id: `${master.name}:${row}`,
      sheet: master.name,
      source: 'master',
      group: master.name,
      row,
      code,
      name,
      level,
      phase,
      start: parseExcelDate(line[C.start]),
      end: parseExcelDate(line[C.end]),
      days: daysOf(line[C.days]),
      status: cellText(line[C.status]) || '未完成',
      owner: cellText(line[C.owner]),
      pred: cellText(line[C.pred]),
      chain: yesValue(line[C.chain]),
      milestone: yesValue(line[C.milestone]),
      deliverable: cellText(line[C.deliverable]),
      parentId,
    })
  }
  return tasks
}

export function deriveWbsTasks(sheet: SheetData): PlanTask[] {
  if (sheet.kind !== 'wbs') return []
  const C = WBS_COLS
  const tasks: PlanTask[] = []
  let lastL2: string | null = null
  let lastL3: string | null = null
  const phase = sheet.name.replace(/WBS$/, '')

  for (let row = 2; row < sheet.aoa.length; row += 1) {
    const line = sheet.aoa[row] ?? []
    const name = cellText(line[C.name])
    const wbs = cellText(line[C.wbs])
    const l2 = codeText(line[C.l2])
    const l3 = codeText(line[C.l3])
    const label = name || wbs
    if (!label && !l2 && !l3) continue
    if (!label) continue

    let level: 1 | 2 | 3 = 3
    let code = l3 || l2
    let parentId: string | null = null
    if (l2) {
      level = 1
      code = l2
      lastL2 = `${sheet.name}:${row}`
      lastL3 = null
    } else if (l3) {
      level = 2
      code = l3
      parentId = lastL2
      lastL3 = `${sheet.name}:${row}`
    } else {
      level = 3
      parentId = lastL3 ?? lastL2
    }

    const start = parseExcelDate(line[C.start])
    const end = parseExcelDate(line[C.end])
    const days = daysOf(line[C.days])
    const status = cellText(line[C.status]) || '未完成'
    const owner = cellText(line[C.owner])
    const chain = yesValue(line[C.chain])
    const milestone = yesValue(line[C.milestone])
    const deliverable = cellText(line[C.deliverable])
    const id = `${sheet.name}:${row}`

    tasks.push({
      id,
      sheet: sheet.name,
      source: 'wbs',
      group: sheet.name,
      row,
      code,
      name: label,
      level,
      phase,
      start,
      end,
      days,
      status,
      owner,
      pred: '',
      chain,
      milestone,
      deliverable,
      parentId,
    })

    if (l3 && name && wbs) {
      tasks.push({
        id: `${id}:act`,
        sheet: sheet.name,
        source: 'wbs',
        group: sheet.name,
        row,
        code: '',
        name: wbs,
        level: 3,
        phase,
        start,
        end,
        days,
        status,
        owner,
        pred: '',
        chain,
        milestone,
        deliverable,
        parentId: id,
      })
    }
  }
  return tasks
}

export function deriveAllTasks(sheets: SheetData[]): PlanTask[] {
  const master = deriveMasterTasks(sheets)
  const wbs = sheets.filter((s) => s.kind === 'wbs').flatMap(deriveWbsTasks)
  return [...master, ...wbs]
}

export function taskByCode(tasks: PlanTask[], code: string): PlanTask | undefined {
  const key = code.trim()
  if (!key) return undefined
  return (
    tasks.find((t) => t.source === 'master' && (t.code === key || t.name === key)) ??
    tasks.find((t) => t.code === key || t.name === key)
  )
}

export function childrenOf(tasks: PlanTask[], id: string): PlanTask[] {
  return tasks.filter((t) => t.parentId === id)
}

export function isLeaf(tasks: PlanTask[], id: string): boolean {
  return !tasks.some((t) => t.parentId === id)
}
