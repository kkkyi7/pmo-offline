import type { StandardKey } from './types'

const ALIAS_TO_STANDARD: Record<string, StandardKey | 'id'> = {
  id: 'id',
  编号: 'id',
  任务id: 'id',
  任务名称: 'name',
  名称: 'name',
  任务: 'name',
  name: 'name',
  task: 'name',
  wbs: 'wbsCode',
  wbs编码: 'wbsCode',
  wbs码: 'wbsCode',
  编码: 'wbsCode',
  阶段: 'phaseId',
  phase: 'phaseId',
  负责人: 'owner',
  责任人: 'owner',
  owner: 'owner',
  开始: 'start',
  开始日期: 'start',
  start: 'start',
  结束: 'end',
  结束日期: 'end',
  完成日期: 'end',
  end: 'end',
  finish: 'end',
  工期: 'duration',
  '工期(天)': 'duration',
  工期天: 'duration',
  duration: 'duration',
  进度: 'progress',
  '进度%': 'progress',
  progress: 'progress',
  前置: 'predecessors',
  前置任务: 'predecessors',
  predecessors: 'predecessors',
  状态: 'status',
  status: 'status',
}

export function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '')
}

export function mapHeader(raw: string): StandardKey | 'id' | null {
  const key = normalizeHeader(raw)
  return ALIAS_TO_STANDARD[key] ?? null
}
