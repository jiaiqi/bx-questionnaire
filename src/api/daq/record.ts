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

import type { DaqActivitySugRow, DaqRecordMergeRow, DaqRecordReplyRow } from './types'
import type { BxCondition, BxOrder } from '@/utils/request/types'

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

/**
 * 评估维度汇总
 *
 * 实测：该服务的服务列里**没有 activity_no**，传该条件会直接返回
 * `CONDITION_COLUMS_NOT_EXISTS`（[activity_no]条件列信息不存在、不合法），
 * 导致维度汇总永远拿不到数据。老工程也只用 fill_batch_no 查询，这里与之一致。
 */
export function recordReplyMergeSelect(params: { fillBatchNo: string }) {
  return bxSelect<DaqRecordMergeRow>({
    serviceName: 'srvdaq_record_reply_merge_select',
    colNames: ['*'],
    condition: [{ colName: 'fill_batch_no', ruleType: 'eq', value: params.fillBatchNo }],
  })
}

/**
 * 评估建议文案
 *
 * 老工程按 `activity_no` + `fill_batch_no` 两个条件查询，
 * 批次号可精确定位到某一次作答对应的建议区间。
 */
export function activitySugSelect(params: { activityNo: string, fillBatchNo?: string }) {
  const condition: BxCondition[] = [
    { colName: 'activity_no', ruleType: 'eq', value: params.activityNo },
  ]
  if (params.fillBatchNo) {
    condition.push({ colName: 'fill_batch_no', ruleType: 'eq', value: params.fillBatchNo })
  }

  return bxSelect<DaqActivitySugRow>({
    serviceName: 'srvdaq_activity_sug_select',
    colNames: ['*'],
    condition,
  })
}

/**
 * 分享记录参数
 *
 * 字段名取自老工程 `saveShareRecord`：业务号是 **biz_no**（不是 activity_no），
 * 另有 biz_type / share_url / from_user / share_type。
 * 老工程那个方法自己没被调用过，但 record_share_select 有 819 行数据，
 * 说明该表确实在用，因此保留此封装并把字段名对齐。
 */
export interface ShareRecordParams {
  /** 业务号，问卷场景即活动号 */
  bizNo: string
  /** 业务应用，问卷为 daq */
  bizType?: string
  /** 分享出去的链接 */
  shareUrl?: string
  /** 分享人 user_no */
  fromUser?: string
  /** 分享渠道，老工程默认「朋友圈」 */
  shareType?: string
}

/** 分享记录埋点 */
export function recordShareAdd(params: ShareRecordParams) {
  return bxWrite('add', [
    {
      serviceName: 'srvdaq_record_share_add',
      data: [{
        biz_no: params.bizNo,
        biz_type: params.bizType ?? 'daq',
        share_url: params.shareUrl ?? '',
        from_user: params.fromUser ?? '',
        share_type: params.shareType ?? '朋友圈',
      }],
    },
  ])
}
