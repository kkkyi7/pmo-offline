import type { SheetData, Workspace } from '../domain/workspace'
import { buildScenario, refreshScenario } from '../engine/scenario'
import { kindOfSheet } from '../engine/sheets'
import v07 from './v07.json'

interface V07File {
  names: string[]
  sheets: Record<string, { aoa: unknown[][]; formulas: Record<string, string> }>
}

const raw = v07 as V07File

export function templateSheets(): SheetData[] {
  return raw.names.map((name) => ({
    name,
    kind: kindOfSheet(name),
    aoa: (raw.sheets[name]?.aoa ?? []).map((row) => row.slice()),
    formulas: { ...(raw.sheets[name]?.formulas ?? {}) },
  }))
}

export function defaultWorkspace(): Workspace {
  const baseline = refreshScenario({
    ...buildScenario({
      name: '基准计划',
      note: '当前正式计划。复制一份再改日期，就是 what-if。模版日期是 2023 年，扫描基准日先按当时看；改成今天就会出现过期项。',
      sheets: templateSheets(),
    }),
    scanDate: '2023-09-15',
  }, '2023-09-15')
  return {
    version: 2,
    projectName: '项目实施主计划',
    activeId: baseline.id,
    scenarios: [baseline],
  }
}
