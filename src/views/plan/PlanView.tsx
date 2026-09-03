import { useProjectStore } from '../../store/projectStore'
import { WbsTable } from './WbsTable'

export function PlanView() {
  const project = useProjectStore((s) => s.project)
  const phaseFilter = useProjectStore((s) => s.phaseFilter)
  const setPhaseFilter = useProjectStore((s) => s.setPhaseFilter)
  const patchMeta = useProjectStore((s) => s.patchMeta)
  const addNewTask = useProjectStore((s) => s.addNewTask)
  const removeSelected = useProjectStore((s) => s.removeSelected)
  const indentSelected = useProjectStore((s) => s.indentSelected)
  const outdentSelected = useProjectStore((s) => s.outdentSelected)
  const moveSelected = useProjectStore((s) => s.moveSelected)
  const createPhase = useProjectStore((s) => s.createPhase)

  return (
    <section className="panel">
      <div className="meta-grid">
        <label>
          项目名称
          <input
            value={project.meta.name}
            onChange={(e) => patchMeta({ name: e.target.value })}
          />
        </label>
        <label>
          项目经理
          <input
            value={project.meta.manager}
            onChange={(e) => patchMeta({ manager: e.target.value })}
          />
        </label>
        <label>
          项目开始
          <input
            type="date"
            value={project.meta.start}
            onChange={(e) => patchMeta({ start: e.target.value })}
          />
        </label>
        <label className="wide">
          备注
          <input
            value={project.meta.notes}
            onChange={(e) => patchMeta({ notes: e.target.value })}
          />
        </label>
      </div>

      <div className="toolbar">
        <div className="tabs">
          <button
            type="button"
            className={phaseFilter === 'all' ? 'active' : undefined}
            onClick={() => setPhaseFilter('all')}
          >
            全部
          </button>
          {project.phases.map((p) => (
            <button
              key={p.id}
              type="button"
              className={phaseFilter === p.id ? 'active' : undefined}
              onClick={() => setPhaseFilter(p.id)}
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const name = window.prompt('新阶段名称')
              if (name?.trim()) createPhase(name.trim())
            }}
          >
            + 阶段
          </button>
        </div>
        <div className="row-actions">
          <button type="button" onClick={addNewTask}>
            新增任务
          </button>
          <button type="button" onClick={removeSelected}>
            删除
          </button>
          <button type="button" onClick={outdentSelected}>
            升级
          </button>
          <button type="button" onClick={indentSelected}>
            降级
          </button>
          <button type="button" onClick={() => moveSelected(-1)}>
            上移
          </button>
          <button type="button" onClick={() => moveSelected(1)}>
            下移
          </button>
        </div>
      </div>

      <WbsTable />
    </section>
  )
}
