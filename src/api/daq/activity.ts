/**
 * 问卷活动与配置接口
 *
 * 服务清单（接口契约迁移期间不变）：
 * - `srvdaq_init_view_select`     拉问卷配置（题目 + 选项 + 活动元信息）
 * - `srvdaq_activity_cfg_update`  活动结束置状态
 */

import type { DaqActivityRow } from './types'
import type { BxCondition } from '@/utils/request/types'

import { bxSelect, bxWrite } from '@/utils/request'

/**
 * init_view_select 的取值模式
 *
 * 只有两种，与老工程一一对应：
 * - 主答题页 / 信息页 / 调研页：不带 type 条件（plain）
 * - 结果页取 questionInfo：type = use
 *
 * 曾有一档 `cfg`（拼 biz_type=cfg），是凭空推测的写法 —— 老工程里不存在该分支。
 * 实测这个条件不会报错（biz_type 列存在），但"不报错"不等于"语义正确"，
 * 没有证据表明它能限定"未开始的活动"，故已删除。
 */
export type InitViewMode
  /** 不带 type 条件：实测对「已结束」活动也能取到数据 */
  = | 'plain'
  /** type = use：进行中的活动 */
    | 'use'

export interface InitViewQuery {
  activityNo: string
  mode?: InitViewMode
  /**
   * 续答 / 详情场景：按批次号精确取回该次作答上下文
   *
   * 这是本工程相对老工程的扩展（老工程没给该服务传过 fill_batch_no），
   * 实测该条件不会报错。
   */
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

  if (query.fillBatchNo) {
    condition.push({ colName: 'fill_batch_no', ruleType: 'eq', value: query.fillBatchNo })
  }

  return bxSelect<DaqActivityRow>({
    serviceName: 'srvdaq_init_view_select',
    colNames: ['*'],
    order: [{ colName: 'item_seq', orderType: 'asc' }],
    condition,
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
