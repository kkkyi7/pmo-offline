import type { Workspace } from '../domain/workspace'
import { refreshScenario } from '../engine/scenario'

interface FilePickerAccept {
  [mime: string]: string[]
}

interface SavePickerOptions {
  suggestedName?: string
  types?: Array<{ description: string; accept: FilePickerAccept }>
}

interface OpenPickerOptions {
  multiple?: boolean
  types?: Array<{ description: string; accept: FilePickerAccept }>
}

interface FilePickerWindow {
  showSaveFilePicker?: (options?: SavePickerOptions) => Promise<FileSystemFileHandle>
  showOpenFilePicker?: (options?: OpenPickerOptions) => Promise<FileSystemFileHandle[]>
}

export function downloadJson(workspace: Workspace, filename?: string): void {
  const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `${workspace.projectName || '项目'}.pmo.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function saveJsonWithPicker(workspace: Workspace): Promise<boolean> {
  const w = window as unknown as FilePickerWindow
  if (!w.showSaveFilePicker) {
    downloadJson(workspace)
    return false
  }
  const handle = await w.showSaveFilePicker({
    suggestedName: `${workspace.projectName || '项目'}.pmo.json`,
    types: [{ description: 'PMO 工作区', accept: { 'application/json': ['.json', '.pmo.json'] } }],
  })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(workspace, null, 2))
  await writable.close()
  return true
}

export function parseWorkspaceJson(text: string): Workspace {
  const data = JSON.parse(text) as Workspace
  if (data.version !== 2 || !Array.isArray(data.scenarios)) {
    throw new Error('这不是本工具的工作区文件（需要 version 2 的 .pmo.json）')
  }
  return {
    ...data,
    scenarios: data.scenarios.map((s) => refreshScenario(s)),
  }
}

export function downloadBuffer(data: ArrayBuffer, filename: string, mime: string): void {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
