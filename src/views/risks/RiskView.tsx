import { useState } from 'react'
import type { RiskRule } from '../../domain/workspace'
import { RISK_CATALOG } from '../../rules/catalog'
import { useActiveScenario, useWorkspaceStore } from '../../store/workspaceStore'

export function RiskView() {
  const scenario = useActiveScenario()
  const updateRule = useWorkspaceStore((s) => s.updateRule)
  const setScanDate = useWorkspaceStore((s) => s.setScanDate)
  const selectedTaskId = useWorkspaceStore((s) => s.selectedTaskId)
  const setSelectedTask = useWorkspaceStore((s) => s.setSelectedTask)
  const setTab = useWorkspaceStore((s) => s.setTab)
  const [openId, setOpenId] = useState<string>(RISK_CATALOG[0]?.id ?? '')

  const selectedFindings = scenario.findings.filter((f) => f.taskId === selectedTaskId)

  return (
    <section className="panel risk-panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">板块四</p>
          <h2>风险规则与扫描</h2>
          <p className="hint">
            每条规则都写了「查什么、怎么用」。打开即扫当前场景。命中的点会同步打在甘特条上。
          </p>
        </div>
        <div className="risk-summary">
          <label>
            扫描基准日
            <input
              type="date"
              value={scenario.scanDate}
              onChange={(e) => setScanDate(e.target.value)}
            />
          </label>
          <strong>{scenario.findings.filter((f) => f.severity === 'high').length}</strong> 高
          <strong>{scenario.findings.filter((f) => f.severity === 'medium').length}</strong> 中
          <strong>{scenario.findings.filter((f) => f.severity === 'low').length}</strong> 低
        </div>
      </header>
      <div className="risk-grid">
        <div className="risk-rules">
          {scenario.riskRules.map((rule) => (
            <article key={rule.id} className={openId === rule.id ? 'rule-card open' : 'rule-card'}>
              <header>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={() => updateRule({ ...rule, enabled: !rule.enabled })}
                  />
                  <span />
                </label>
                <button type="button" className="rule-title" onClick={() => setOpenId(rule.id)}>
                  <b>{rule.name}</b>
                  <small>{rule.summary}</small>
                </button>
                <select
                  value={rule.severity}
                  onChange={(e) => updateRule({ ...rule, severity: e.target.value as RiskRule['severity'] })}
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </header>
              {openId === rule.id ? (
                <div className="rule-body">
                  <p>{rule.how}</p>
                  {Object.keys(rule.params).length ? (
                    <div className="param-row">
                      {Object.entries(rule.params).map(([key, value]) => (
                        <label key={key}>
                          {key === 'maxDays'
                            ? '最长工作日'
                            : key === 'delayDays'
                              ? '晚于计划天数'
                              : key === 'toleranceDays'
                                ? '日期容差（天）'
                                : key}
                          <input
                            type="number"
                            value={Number(value)}
                            onChange={(e) =>
                              updateRule({
                                ...rule,
                                params: { ...rule.params, [key]: Number(e.target.value) || 0 },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
        <div className="risk-hits">
          <h3>扫描结果 {scenario.findings.length}</h3>
          {selectedFindings.length ? (
            <p className="hint">当前选中任务：{selectedFindings.length} 条</p>
          ) : null}
          {scenario.findings.length === 0 ? <p className="empty">当前规则下没有命中。把阈值调严，或补全日期后再看。</p> : null}
          <ol>
            {scenario.findings.map((f) => {
              const rule = scenario.riskRules.find((r) => r.id === f.ruleId)
              const task = scenario.tasks.find((t) => t.id === f.taskId)
              return (
                <li key={f.id} className={f.taskId === selectedTaskId ? 'selected' : undefined}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTask(f.taskId)
                      setTab('gantt')
                    }}
                  >
                    <i className={`sev ${f.severity}`}>{f.severity === 'high' ? '高' : f.severity === 'medium' ? '中' : '低'}</i>
                    <div>
                      <b>{rule?.name ?? f.ruleId}</b>
                      <span>{f.message}</span>
                      <small>
                        点这里跳到甘特 · {task?.phase || ''} {task?.code}
                      </small>
                    </div>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
