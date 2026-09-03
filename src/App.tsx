import { useEffect, useRef } from 'react'
import { parseWorkbookFile, sheetsToArrayBuffer, workspaceToArrayBuffer } from './excel/v07io'
import { templateSheets } from './sample/workspace'
import { loadDraft } from './persist/idb'
import { downloadBuffer, parseWorkspaceJson, saveJsonWithPicker } from './persist/files'
import { useActiveScenario, useWorkspaceStore } from './store/workspaceStore'
import { PrintReport } from './views/export/PrintReport'
import { GanttView } from './views/gantt/GanttView'
import { SheetView } from './views/plan/SheetView'
import { RiskView } from './views/risks/RiskView'
import { ScenarioRail } from './views/scenarios/ScenarioRail'

export default function App() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const tab = useWorkspaceStore((s) => s.tab)
  const setTab = useWorkspaceStore((s) => s.setTab)
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const setProjectName = useWorkspaceStore((s) => s.setProjectName)
  const importAsScenario = useWorkspaceStore((s) => s.importAsScenario)
  const scenario = useActiveScenario()
  const xlsxRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadDraft().then((draft) => {
      if (draft?.scenarios?.length) loadWorkspace(draft)
    })
  }, [loadWorkspace])

  const exportExcel = () => {
    downloadBuffer(
      workspaceToArrayBuffer(workspace),
      `${workspace.projectName}-${scenario.name}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">PMO</span>
          <div>
            <input
              className="project-name"
              value={workspace.projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
            <p>
              {scenario.name} · {scenario.tasks.length} 条任务 · {scenario.findings.length} 条风险
            </p>
          </div>
        </div>
        <nav className="tabs">
          <button type="button" className={tab === 'plan' ? 'active' : undefined} onClick={() => setTab('plan')}>
            计划表
          </button>
          <button type="button" className={tab === 'gantt' ? 'active' : undefined} onClick={() => setTab('gantt')}>
            甘特图
          </button>
          <button type="button" className={tab === 'risks' ? 'active' : undefined} onClick={() => setTab('risks')}>
            风险
            {scenario.findings.length ? <i>{scenario.findings.length}</i> : null}
          </button>
        </nav>
        <div className="file-actions">
          <button type="button" onClick={() => xlsxRef.current?.click()}>
            导入 Excel
          </button>
          <button type="button" className="primary" onClick={exportExcel}>
            导出 Excel
          </button>
          <button type="button" onClick={() => window.print()}>
            导出 PDF
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void saveJsonWithPicker(workspace)
            }}
          >
            保存工作区
          </button>
          <button type="button" className="ghost" onClick={() => jsonRef.current?.click()}>
            打开工作区
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              downloadBuffer(
                sheetsToArrayBuffer(templateSheets()),
                '项目实施主计划&WBS-V0.7.xlsx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              )
            }}
          >
            下载模版
          </button>
          <input
            ref={xlsxRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              void parseWorkbookFile(file)
                .then((sheets) => importAsScenario(sheets, file.name.replace(/\.xlsx?$/i, '')))
                .catch((err: unknown) => {
                  window.alert(err instanceof Error ? err.message : '导入失败')
                })
            }}
          />
          <input
            ref={jsonRef}
            type="file"
            accept=".json,.pmo.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              void file.text().then((text) => {
                try {
                  loadWorkspace(parseWorkspaceJson(text))
                } catch (err) {
                  window.alert(err instanceof Error ? err.message : '打开失败')
                }
              })
            }}
          />
        </div>
      </header>
      <div className="workspace">
        <ScenarioRail />
        <main>
          {tab === 'plan' ? <SheetView /> : null}
          {tab === 'gantt' ? <GanttView /> : null}
          {tab === 'risks' ? <RiskView /> : null}
        </main>
      </div>
      <PrintReport />
    </div>
  )
}
