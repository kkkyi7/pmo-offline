import { useActiveScenario, useWorkspaceStore } from '../../store/workspaceStore'

export function PrintReport() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const scenario = useActiveScenario()
  const dated = scenario.tasks.filter((t) => t.start && t.end)

  return (
    <section className="print-report" aria-hidden>
      <h1>{workspace.projectName}</h1>
      <p>
        场景：{scenario.name}　导出日期：{new Date().toISOString().slice(0, 10)}　任务 {scenario.tasks.length}　风险{' '}
        {scenario.findings.length}
      </p>
      {scenario.note ? <p>说明：{scenario.note}</p> : null}

      <h2>主计划</h2>
      <table>
        <thead>
          <tr>
            <th>编号</th>
            <th>名称</th>
            <th>层级</th>
            <th>状态</th>
            <th>开始</th>
            <th>结束</th>
            <th>天数</th>
            <th>主责</th>
            <th>风险</th>
          </tr>
        </thead>
        <tbody>
          {scenario.tasks.map((t) => {
            const n = scenario.findings.filter((f) => f.taskId === t.id).length
            return (
              <tr key={t.id}>
                <td>{t.code}</td>
                <td>{t.name}</td>
                <td>{t.level}</td>
                <td>{t.status}</td>
                <td>{t.start}</td>
                <td>{t.end}</td>
                <td>{t.days || ''}</td>
                <td>{t.owner}</td>
                <td>{n || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2>有日期的任务（甘特摘要）</h2>
      <table>
        <thead>
          <tr>
            <th>编号</th>
            <th>名称</th>
            <th>开始</th>
            <th>结束</th>
          </tr>
        </thead>
        <tbody>
          {dated.map((t) => (
            <tr key={t.id}>
              <td>{t.code}</td>
              <td>{t.name}</td>
              <td>{t.start}</td>
              <td>{t.end}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>风险扫描</h2>
      {scenario.findings.length === 0 ? (
        <p>无命中。</p>
      ) : (
        <ol>
          {scenario.findings.map((f) => (
            <li key={f.id}>
              [{f.severity}] {f.message}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
