import { useMemo, useState } from 'react'
import { renderPlanDoc, renderRiskDoc, renderWbsDoc } from '../../docs/fill'
import { useProjectStore } from '../../store/projectStore'

type DocKind = 'plan' | 'wbs' | 'risk'

export function DocsView() {
  const project = useProjectStore((s) => s.project)
  const [kind, setKind] = useState<DocKind>('plan')
  const text = useMemo(() => {
    if (kind === 'wbs') return renderWbsDoc(project)
    if (kind === 'risk') return renderRiskDoc(project)
    return renderPlanDoc(project)
  }, [kind, project])

  return (
    <section className="panel">
      <div className="toolbar">
        <div className="tabs">
          <button type="button" className={kind === 'plan' ? 'active' : undefined} onClick={() => setKind('plan')}>
            项目计划
          </button>
          <button type="button" className={kind === 'wbs' ? 'active' : undefined} onClick={() => setKind('wbs')}>
            阶段 WBS
          </button>
          <button type="button" className={kind === 'risk' ? 'active' : undefined} onClick={() => setKind('risk')}>
            风险清单
          </button>
        </div>
        <button type="button" onClick={() => window.print()}>
          打印 / 另存 PDF
        </button>
      </div>
      <pre className="doc">{text}</pre>
    </section>
  )
}
