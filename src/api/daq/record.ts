/**
 * 问卷作答记录接口
 *
 * 服务清单（接口契约迁移期间不变）：
 * - `srvdaq_activity_result_submit`      提交整卷
 *
 * 注意：`srvdaq_activity_result_save`（逐题草稿上报）自 2026-11-06 起**不再调用**。
 * 作答过程中的草稿改为只写本机（`domain/questionnaire/draft.ts` + `utils/storage.ts`），
 * 一次作答只在提交时产生一次写请求；提交不带 `fill_batch_no` 时服务端新建记录并回传批次号。
 * - `srvdaq_record_reply_select`         答题记录 / 得分
 * - `srvdaq_record_reply_merge_select`   评估维度汇总
 * - `srvdaq_activity_sug_select`         评估建议文案
 * - `srvdaq_record_share_add`            微信分享记录
 */

import type { DaqActivitySugRow, DaqRecordMergeRow, DaqRecordReplyRow } from './types'
import type { BxCondition, BxOrder } from '@/utils/request/types'

import { bxSelect, bxWrite } from '@/utils/request'

/** 提交单项 */
export interface SubmitItem {
  item_no: string
  option_data: string[]
  /** 选项展示序号，仅选项类题目带 */
  option_flag?: string[]
}

export interface ResultSubmitParams {
  activityNo: string
  fillBatchNo?: string
  itemData: SubmitItem[]
  /**
   * 登记表单字段（company / user_name / user_phone）
   *
   * 老工程把 submitInfo 展开进提交请求的 data[0]（indexyax.vue 的 `...self.submitInfo`），
   * 用于填充结果表的 company / user_name / user_phone 三列。
   * 实测这三列确实存在于结果表（user_phone 还配了前端部分脱敏），故必须一并提交。
   */
  extra?: Record<string, string>
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
  // 登记表单字段：只带非空值，避免把空字符串写进结果表
  for (const [key, value] of Object.entries(params.extra ?? {})) {
    if (value) {
      data[key] = value
    }
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
    // 实测：该服务**不接受 order** —— 传任何排序字段（start_time / end_time / id / create_time，
    // asc 或 desc）都会返回 0 条且不报错，属静默失效。老工程 history.vue 也未传 order。
    // 因此默认不传，仅在调用方显式要求时才带上。
    ...(query.order?.length ? { order: query.order } : {}),
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
 *
 * **注意：本工程同样没有接线。** 老工程那个方法自己就没被调用过，本工程沿用
 * 同样的行为 —— 分享（`onShareAppMessage` / `onShareTimeline`）只做了分享本身，
 * 没有写埋点，因此该封装目前没有生产调用点。
 *
 * 之所以保留：`record_share_select` 有 819 行数据，说明这张表和该服务确实在用
 * （数据来自其它入口），字段名也已对齐老工程，后续要接埋点可直接用。
 * 若确认不需要，删除时应连同测试一起删。
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
  /**
   * 分享渠道。**必填，且刻意不给默认值**：分享给好友与分享到朋友圈是两个渠道，
   * 若默认成「朋友圈」，忘记传参的调用会把好友分享也记成朋友圈，数据静默失真。
   */
  shareType: string
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
        share_type: params.shareType,
      }],
    },
  ])
}
