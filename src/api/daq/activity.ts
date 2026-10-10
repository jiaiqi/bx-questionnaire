/**
 * 问卷活动与配置接口
 *
 * 服务清单（接口契约迁移期间不变）：
 * - `srvdaq_init_view_select`     拉问卷配置（题目 + 选项）
 * - `srvdaq_activity_cfg_select`  拉活动配置（不含题目）
 * - `srvdaq_activity_cfg_update`  活动结束置状态
 */

import type { DaqActivityRow } from './types'
import type { BxCondition } from '@/utils/request/types'

import { bxSelect, bxWrite } from '@/utils/request'

/** init_view_select 的取值模式（复刻老工程三分支） */
export type InitViewMode
  /** 不带 type 条件：实测对「已结束」活动也能取到数据 */
  = | 'plain'
  /** type = use：进行中的活动 */
    | 'use'
  /** biz_type = cfg：未开始的活动 */
    | 'cfg'

export interface InitViewQuery {
  activityNo: string
  mode?: InitViewMode
  /** 续答 / 详情场景：按批次号精确取回该次作答上下文 */
  fillBatchNo?: string
}

/**
 * 拉取问卷配置（题目 + 选项 + 活动信息）
 *
 * 注意：老工程在「已结束」活动上带 `type=use` 会得到 FAILURE「活动已结束」，
 * 并据此触发 `activity_cfg_update` 置状态，该语义在 `useQuestionnaire` 中保留。
 */
export function initViewSelect(query: InitViewQuery) {
  const condition: BxCondition[] = [
    { colName: 'activity_no', ruleType: 'eq', value: query.activityNo },
  ]

  if (query.mode === 'use') {
    condition.push({ colName: 'type', ruleType: 'eq', value: 'use' })
  }
  else if (query.mode === 'cfg') {
    condition.push({ colName: 'biz_type', ruleType: 'eq', value: 'cfg' })
  }

  if (query.fillBatchNo) {
    condition.push({ colName: 'fill_batch_no', ruleType: 'eq', value: query.fillBatchNo })
  }

  return bxSelect<DaqActivityRow>({
    serviceName: 'srvdaq_init_view_select',
    colNames: ['*'],
    order: [{ colName: 'item_seq', ruleType: 'asc' }],
    condition,
  })
}

/**
 * 拉活动配置（不含题目）
 *
 * 注意：parkDev 环境下该服务对当前票据返回 0011「无权限访问」，
 * 因此活动元信息应优先取自 `init_view_select` 的返回行（该行含完整活动字段）。
 * 本函数保留，用于兼容其他环境的权限配置。
 */
export function activityCfgSelect(activityNo: string) {
  return bxSelect<DaqActivityRow>({
    serviceName: 'srvdaq_activity_cfg_select',
    colNames: ['*'],
    condition: [{ colName: 'activity_no', ruleType: 'eq', value: activityNo }],
  })
}

/**
 * 更新活动状态（用于把「已结束」的活动置为结束态）
 *
 * 契约取自老工程 updateState：
 * - `condition` 放在 **operate 请求项的顶层**（不是 data 里）；
 * - `data` 里**只传 status**，不要带 activity_no —— 主键由 condition 指定，
 *   老工程也只传 status。
 */
export function activityCfgUpdate(activityNo: string, status: string) {
  return bxWrite('operate', [
    {
      serviceName: 'srvdaq_activity_cfg_update',
      condition: [{ colName: 'activity_no', ruleType: 'eq', value: activityNo }],
      data: [{ status }],
    },
  ])
}
