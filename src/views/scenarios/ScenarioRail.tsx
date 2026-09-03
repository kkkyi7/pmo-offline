import { useWorkspaceStore } from '../../store/workspaceStore'

export function ScenarioRail() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const setActiveScenario = useWorkspaceStore((s) => s.setActiveScenario)
  const renameScenario = useWorkspaceStore((s) => s.renameScenario)
  const noteScenario = useWorkspaceStore((s) => s.noteScenario)
  const copyScenario = useWorkspaceStore((s) => s.copyScenario)
  const addScenario = useWorkspaceStore((s) => s.addScenario)
  const deleteScenario = useWorkspaceStore((s) => s.deleteScenario)

  return (
    <aside className="rail">
      <div className="rail-head">
        <p className="eyebrow">板块一</p>
        <h2>场景</h2>
        <p className="hint">选中后，计划、甘特、风险都只看这一份数据。复制场景 = 连表带规则全部拷走，用来做 what-if。</p>
      </div>
      <div className="scenario-list">
        {workspace.scenarios.map((s) => {
          const active = s.id === workspace.activeId
          return (
            <article key={s.id} className={active ? 'scenario-card active' : 'scenario-card'}>
              <button type="button" className="scenario-pick" onClick={() => setActiveScenario(s.id)}>
                <strong>{s.name}</strong>
                <span>
                  {s.tasks.length} 条任务 · {s.findings.length} 条风险
                </span>
              </button>
              {active ? (
                <div className="scenario-edit">
                  <input
                    value={s.name}
                    onChange={(e) => renameScenario(s.id, e.target.value)}
                    aria-label="场景名称"
                  />
                  <textarea
                    value={s.note}
                    rows={2}
                    placeholder="场景说明，例如：压缩需求分析两周"
                    onChange={(e) => noteScenario(s.id, e.target.value)}
                  />
                  <div className="row-actions">
                    <button type="button" onClick={() => copyScenario(s.id)}>
                      复制做 what-if
                    </button>
                    <button
                      type="button"
                      className="ghost danger"
                      disabled={workspace.scenarios.length <= 1}
                      onClick={() => deleteScenario(s.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
      <button type="button" className="add-scene" onClick={addScenario}>
        + 从模版新建场景
      </button>
    </aside>
  )
}
