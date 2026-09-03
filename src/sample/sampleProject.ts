import { defaultFields, defaultRiskRules } from '../domain/defaults'
import type { Dependency, Project, Task } from '../domain/types'
import { recompute } from '../engine/recompute'

function t(
  id: string,
  parentId: string | null,
  phaseId: string,
  name: string,
  owner: string,
  start: string,
  duration: number,
  progress: number,
  status: string,
  deliverable = '',
): Task {
  return {
    id,
    parentId,
    phaseId,
    name,
    wbsCode: '',
    owner,
    start,
    end: '',
    duration,
    progress,
    status,
    extras: deliverable ? { deliverable } : {},
  }
}

function fs(id: string, sourceId: string, targetId: string): Dependency {
  return { id, sourceId, targetId, type: 'FS' }
}

export function rawSampleProject(): Project {
  const tasks: Task[] = [
    t('1', null, 'p1', '启动', '王敏', '2026-07-01', 21, 80, '进行中', '启动包'),
    t('2', '1', 'p1', '立项与范围', '王敏', '2026-07-01', 7, 100, '已完成', '范围说明书'),
    t('3', '1', 'p1', '干系人确认', '李强', '2026-07-08', 5, 60, '进行中', '干系人清单'),
    t('4', '1', 'p1', '环境与账号', '赵磊', '2026-07-10', 8, 20, '进行中'),
    t('5', null, 'p2', '实施', '陈洁', '2026-07-20', 45, 25, '进行中', '实施包'),
    t('6', '5', 'p2', '主数据准备', '陈洁', '2026-07-20', 10, 40, '进行中', '物料主数据'),
    t('7', '6', 'p2', '物料编码清洗', '周宁', '2026-07-20', 6, 50, '进行中'),
    t('8', '6', 'p2', 'BOM 核对', '周宁', '2026-07-26', 5, 10, '进行中'),
    t('9', '5', 'p2', '工艺路线', '孙悦', '2026-08-01', 8, 0, '未开始', '工艺路线表'),
    t('10', '5', 'p2', '排程规则', '孙悦', '2026-08-10', 7, 0, '未开始', '规则清单'),
    t('11', '5', 'p2', '联调与试跑', '陈洁', '2026-08-18', 12, 0, '未开始'),
    t('12', null, 'p3', '上线收尾', '王敏', '2026-09-01', 20, 0, '未开始', '上线报告'),
    t('13', '12', 'p3', '培训', '李强', '2026-09-01', 5, 0, '未开始', '培训记录'),
    t('14', '12', 'p3', '切换窗口', '赵磊', '2026-09-08', 3, 0, '未开始'),
    t('15', '12', 'p3', '稳定观察', '陈洁', '2026-09-12', 10, 0, '未开始'),
  ]

  for (let i = 0; i < 30; i += 1) {
    const n = 16 + i
    const week = Math.floor(i / 6)
    const day = 1 + (i % 6) * 2
    const month = week < 3 ? '08' : '09'
    const startDay = String(Math.min(28, day + week)).padStart(2, '0')
    tasks.push(
      t(
        String(n),
        '11',
        'p2',
        `试跑场景 ${i + 1}`,
        i % 5 === 0 ? '' : ['周宁', '孙悦', '陈洁', '赵磊'][i % 4],
        `2026-${month}-${startDay}`,
        2 + (i % 3),
        i < 4 ? 15 : 0,
        i < 4 ? '进行中' : '未开始',
        i % 7 === 0 ? `场景说明 ${i + 1}` : '',
      ),
    )
  }

  return {
    meta: {
      name: 'APS 上线实施示例',
      manager: '王敏',
      start: '2026-07-01',
      notes: '内置示例。改表格或拖甘特条，计划和风险会一起变。',
      autoSchedule: false,
      extra: { 客户: '示例工厂', 版本: 'MVP' },
    },
    schema: { fields: defaultFields() },
    phases: [
      { id: 'p1', name: '启动', order: 1 },
      { id: 'p2', name: '实施', order: 2 },
      { id: 'p3', name: '上线收尾', order: 3 },
    ],
    tasks,
    dependencies: [
      fs('d1', '2', '3'),
      fs('d2', '3', '4'),
      fs('d3', '4', '6'),
      fs('d4', '7', '8'),
      fs('d5', '8', '9'),
      fs('d6', '9', '10'),
      fs('d7', '10', '11'),
      fs('d8', '11', '13'),
      fs('d9', '13', '14'),
      fs('d10', '14', '15'),
    ],
    riskRules: defaultRiskRules(),
    riskFindings: [],
  }
}

export function sampleProject(): Project {
  return recompute(rawSampleProject(), { today: '2026-08-31' })
}

export function blankTemplateProject(): Project {
  const raw = {
    meta: {
      name: '新项目',
      manager: '',
      start: '',
      notes: '',
      autoSchedule: false,
      extra: {},
    },
    schema: { fields: defaultFields() },
    phases: [
      { id: 'p1', name: '启动', order: 1 },
      { id: 'p2', name: '实施', order: 2 },
      { id: 'p3', name: '收尾', order: 3 },
    ],
    tasks: [
      t('1', null, 'p1', '启动', '', '', 0, 0, '未开始'),
      t('2', '1', 'p1', '任务 1.1', '', '', 5, 0, '未开始'),
      t('3', null, 'p2', '实施', '', '', 0, 0, '未开始'),
      t('4', '3', 'p2', '任务 2.1', '', '', 5, 0, '未开始'),
    ],
    dependencies: [],
    riskRules: defaultRiskRules(),
    riskFindings: [],
  } satisfies Project
  return recompute(raw, { today: '2026-08-31' })
}
