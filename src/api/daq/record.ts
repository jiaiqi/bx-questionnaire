/**
 * 问卷作答记录接口
 *
 * 服务清单（接口契约迁移期间不变）：
 * - `srvdaq_activity_result_save`        草稿保存（逐题即时）
 * - `srvdaq_activity_result_submit`      提交整卷
 * - `srvdaq_record_reply_select`         答题记录 / 得分
 * - `srvdaq_record_reply_merge_select`   评估维度汇总
 * - `srvdaq_activity_sug_select`         评估建议文案
 * - `srvdaq_record_share_add`            微信分享记录
 */

import type { BxCondition, BxOrder } from '@/utils/request/types'
import type { DaqActivitySugRow, DaqRecordMergeRow, DaqRecordReplyRow } from './types'

import { bxSelect, bxWrite } from '@/utils/request'

/**
 * 草稿单项
 *
 * 注意：老工程草稿保存写入的是**选项主键 `option_no`**（提交才写 `option_value`），
 * 这里保持同一语义；回填匹配两种值都接受（见 `domain/questionnaire/mapper.ts`）。
 */
export interface DraftItem {
  item_no: string
  option_data: string[]
}

/** 提交单项 */
export interface SubmitItem {
  item_no: string
  option_data: string[]
  /** 选项展示序号，仅选项类题目带 */
  option_flag?: string[]
}

export interface ResultSaveParams {
  activityNo: string
  /** 首次保存时为空，响应会回传 fill_batch_no */
  fillBatchNo?: string
  itemData: DraftItem[]
}

/** 草稿保存：逐题即时上报 */
export function resultSave(params: ResultSaveParams) {
  const data: Record<string, unknown> = {
    activity_no: params.activityNo,
    item_data: params.itemData,
  }
  if (params.fillBatchNo) {
    data.fill_batch_no = params.fillBatchNo
  }

  return bxWrite('operate', [
    { serviceName: 'srvdaq_activity_result_save', data: [data] },
  ])
}

export interface ResultSubmitParams {
  activityNo: string
  fillBatchNo?: string
  itemData: SubmitItem[]
}

/** 提交整卷 */
export function resultSubmit(params: ResultSubmitParams) {
  const data: Record<string, unknown> = {
    activity_no: params.activityNo,
    item_data: params.itemData,
  }
  if (params.fillBatchNo) {
    data.fill_batch_no = params.fillBatchNo
  }

  return bxWrite('operate', [
    { serviceName: 'srvdaq_activity_result_submit', data: [data] },
  ])
}

export interface RecordReplyQuery {
  activityNo?: string
  fillBatchNo?: string
  userNo?: string
  /** 作答状态：完成 / 未完成 */
  state?: string
  /** 额外条件（如按 user_no 过滤） */
  extra?: BxCondition[]
  order?: BxOrder[]
  pageNo?: number
  rownumber?: number
}

/** 查询答题记录 */
export function recordReplySelect(query: RecordReplyQuery = {}) {
  const condition: BxCondition[] = []

  if (query.activityNo) {
    condition.push({ colName: 'activity_no', ruleType: 'eq', value: query.activityNo })
  }
  if (query.fillBatchNo) {
    condition.push({ colName: 'fill_batch_no', ruleType: 'eq', value: query.fillBatchNo })
  }
  if (query.userNo) {
    condition.push({ colName: 'user_no', ruleType: 'eq', value: query.userNo })
  }
  if (query.state) {
    condition.push({ colName: 'state', ruleType: 'eq', value: query.state })
  }
  if (query.extra?.length) {
    condition.push(...query.extra)
  }

  return bxSelect<DaqRecordReplyRow>({
    serviceName: 'srvdaq_record_reply_select',
    colNames: ['*'],
    condition,
    order: query.order ?? [{ colName: 'start_time', ruleType: 'desc' }],
    page: {
      pageNo: query.pageNo ?? 1,
      rownumber: query.rownumber ?? 20,
    },
  })
}

/** 评估维度汇总 */
export function recordReplyMergeSelect(params: { activityNo: string; fillBatchNo?: string }) {
  const condition: BxCondition[] = [
    { colName: 'activity_no', ruleType: 'eq', value: params.activityNo },
  ]
  if (params.fillBatchNo) {
    condition.push({ colName: 'fill_batch_no', ruleType: 'eq', value: params.fillBatchNo })
  }

  return bxSelect<DaqRecordMergeRow>({
    serviceName: 'srvdaq_record_reply_merge_select',
    colNames: ['*'],
    condition,
  })
}

/** 评估建议文案 */
export function activitySugSelect(params: { activityNo: string }) {
  return bxSelect<DaqActivitySugRow>({
    serviceName: 'srvdaq_activity_sug_select',
    colNames: ['*'],
    condition: [{ colName: 'activity_no', ruleType: 'eq', value: params.activityNo }],
  })
}

export interface ShareRecordParams {
  activityNo: string
  shareType?: string
  [key: string]: unknown
}

/** 分享记录埋点 */
export function recordShareAdd(params: ShareRecordParams) {
  const { activityNo, ...rest } = params
  return bxWrite('add', [
    {
      serviceName: 'srvdaq_record_share_add',
      data: [{ activity_no: activityNo, ...rest }],
    },
  ])
}
