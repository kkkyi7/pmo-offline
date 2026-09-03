import { flexRender } from '@tanstack/react-table'
import {
  getCoreRowModel,
  legacyCreateColumnHelper,
  useLegacyTable,
} from '@tanstack/react-table/legacy'
import { getFieldValue } from '../../domain/access'
import { STATUS_OPTIONS } from '../../domain/defaults'
import type { FieldDef, Project, Task } from '../../domain/types'
import { depthOf, flattenTree } from '../../engine/tree'
import { useProjectStore } from '../../store/projectStore'

const helper = legacyCreateColumnHelper<Task>()

function CellEditor({
  project,
  task,
  field,
}: {
  project: Project
  task: Task
  field: FieldDef
}) {
  const updateTaskField = useProjectStore((s) => s.updateTaskField)
  const value = getFieldValue(project, task, field)
  const depth = field.standard === 'name' ? depthOf(project.tasks, task.id) : 0

  if (field.standard === 'wbsCode') {
    return <span className="mono">{String(value)}</span>
  }

  if (field.standard === 'phaseId') {
    return (
      <select
        value={task.phaseId}
        onChange={(e) => updateTaskField(task.id, field.key, e.target.value)}
      >
        {project.phases.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    )
  }

  if (field.standard === 'status' || field.type === 'select') {
    const options = field.options ?? STATUS_OPTIONS
    return (
      <select
        value={String(value)}
        onChange={(e) => updateTaskField(task.id, field.key, e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'date' || field.standard === 'start' || field.standard === 'end') {
    return (
      <input
        type="date"
        value={String(value)}
        onChange={(e) => updateTaskField(task.id, field.key, e.target.value)}
      />
    )
  }

  if (field.type === 'number' || field.type === 'percent' || field.standard === 'duration' || field.standard === 'progress') {
    return (
      <input
        type="number"
        min={field.type === 'percent' || field.standard === 'progress' ? 0 : undefined}
        max={field.type === 'percent' || field.standard === 'progress' ? 100 : undefined}
        value={value === '' ? '' : Number(value)}
        onChange={(e) => updateTaskField(task.id, field.key, e.target.value === '' ? 0 : Number(e.target.value))}
      />
    )
  }

  return (
    <input
      type="text"
      style={depth ? { paddingLeft: `${8 + depth * 16}px` } : undefined}
      value={String(value)}
      onChange={(e) => updateTaskField(task.id, field.key, e.target.value)}
    />
  )
}

export function WbsTable() {
  const project = useProjectStore((s) => s.project)
  const phaseFilter = useProjectStore((s) => s.phaseFilter)
  const selectedTaskId = useProjectStore((s) => s.selectedTaskId)
  const setSelectedTask = useProjectStore((s) => s.setSelectedTask)

  const data = flattenTree(project.tasks).filter((t) => phaseFilter === 'all' || t.phaseId === phaseFilter)

  const columns = project.schema.fields.map((field) =>
    helper.accessor((row) => getFieldValue(project, row, field), {
      id: field.key,
      header: field.label,
      cell: (info) => <CellEditor project={project} task={info.row.original} field={field} />,
    }),
  )

  const table = useLegacyTable({
    data,
    columns: columns as never,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  })

  return (
    <div className="table-wrap">
      <table className="wbs">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={row.id === selectedTaskId ? 'selected' : undefined}
              onClick={() => setSelectedTask(row.id)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
