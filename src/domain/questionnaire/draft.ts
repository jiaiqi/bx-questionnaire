/**
 * 本地草稿的读写规则
 *
 * 抽成纯函数是为了可测：这段逻辑有两个「不写测试就一定会踩」的坑 ——
 * 批次归属判断、以及只保留仍然存在的题目键。组件里没法直接断言。
 */

import type { AnswerValue, QuestionField } from './types'

import { toArray } from './types'

/** 本地草稿结构：带批次号，恢复时据此判断是否属于当前这次作答 */
export interface LocalDraft {
  batchNo?: string
  answers?: Record<string, AnswerValue>
  /**
   * 保存时刻（ms）
   *
   * 服务端不再产生 `state='未完成'` 记录后，本机草稿成了「填到一半」的唯一线索，
   * 记录页用它展示「本机草稿 · 保存于 X」。老草稿没有这个字段，读取方要容忍缺失。
   */
  savedAt?: number
}

/**
 * 由当前答案构造待写入的草稿
 *
 * 空答案不写入，避免把已有草稿清空；同时记录批次号供恢复时比对。
 * 返回 null 表示没有可写内容，调用方应跳过写入。
 */
export function toLocalDraft(
  fields: QuestionField[],
  answers: Record<string, AnswerValue>,
  batchNo: string,
): LocalDraft | null {
  const snapshot: Record<string, AnswerValue> = {}
  for (const field of fields) {
    const value = answers[field.key]
    if (value !== undefined && value !== null && toArray(value).length > 0) {
      snapshot[field.key] = value
    }
  }

  if (Object.keys(snapshot).length === 0) {
    return null
  }

  return { batchNo: batchNo || '', answers: snapshot, savedAt: Date.now() }
}

/**
 * 从草稿中取出可用于本次作答的答案
 *
 * 两条过滤规则：
 * - 草稿带批次号、且当前批次不同时不恢复：否则点击历史记录里另一条未完成记录，
 *   会把本机的草稿答案套到那条记录上，提交后数据错乱；
 * - 只保留「题目仍然存在」的键：活动配置可能已改，残留旧键会让进度统计把
 *   不存在的题算进去。
 *
 * 注意**当前批次号为空时不拦截**（见下方判断）：刷新续答时 `fill_batch_no` 可能
 * 还没从 URL / 会话恢复，此时若按批次号拦截，用户刚填的答案会被静默丢掉 ——
 * 丢答案比「可能串批次」更糟，所以这里刻意选择恢复。
 * 代价是：批次号确实拿不到时，本机草稿可能来自另一个批次；影响仅限本机，
 * 且恢复出来的内容在提交前用户可见，故可接受。
 */
export function fromLocalDraft(
  draft: LocalDraft | null | undefined,
  fields: QuestionField[],
  currentBatchNo: string,
): Record<string, AnswerValue> {
  if (!draft || typeof draft !== 'object') {
    return {}
  }

  if (currentBatchNo && draft.batchNo && draft.batchNo !== currentBatchNo) {
    return {}
  }

  const source = draft.answers ?? {}
  const valid: Record<string, AnswerValue> = {}
  for (const field of fields) {
    if (Object.hasOwn(source, field.key)) {
      valid[field.key] = source[field.key] as AnswerValue
    }
  }
  return valid
}
