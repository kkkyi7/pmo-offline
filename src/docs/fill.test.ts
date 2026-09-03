import { describe, expect, it } from 'vitest'
import { sampleProject } from '../sample/sampleProject'
import { renderPlanDoc, renderRiskDoc, renderWbsDoc } from './fill'

describe('document templates', () => {
  it('fills placeholders from the project', () => {
    const p = sampleProject()
    const plan = renderPlanDoc(p)
    expect(plan).toContain(p.meta.name)
    expect(plan).toContain('启动')
    expect(renderWbsDoc(p)).toContain('1.1')
    expect(renderRiskDoc(p)).toContain('风险清单')
  })
})
