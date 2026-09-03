import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blankTemplateProject, sampleProject } from '../sample/sampleProject'
import { projectToArrayBuffer } from './exportProject'
import { parseWorkbookBuffer } from './importProject'

describe('excel roundtrip', () => {
  it('keeps custom columns and task names', () => {
    const src = sampleProject()
    src.tasks[1].extras.deliverable = '范围说明书-修订'
    const buf = projectToArrayBuffer(src)
    const back = parseWorkbookBuffer(buf, '2026-08-31')
    expect(back.meta.name).toBe(src.meta.name)
    expect(back.phases.map((p) => p.name)).toEqual(src.phases.map((p) => p.name))
    expect(back.schema.fields.some((f) => f.key === 'deliverable' || f.label === '交付物')).toBe(true)
    const t2 = back.tasks.find((t) => t.name === src.tasks[1].name)
    expect(t2?.extras.deliverable ?? '').toBe('范围说明书-修订')
    expect(back.dependencies.length).toBeGreaterThan(0)
    expect(back.riskRules.length).toBeGreaterThan(0)
  })

  it('writes template workbooks', () => {
    const dir = resolve(process.cwd(), 'templates')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, '默认项目模板.xlsx'), Buffer.from(projectToArrayBuffer(blankTemplateProject())))
    writeFileSync(resolve(dir, '示例项目.xlsx'), Buffer.from(projectToArrayBuffer(sampleProject())))
    expect(true).toBe(true)
  })
})
