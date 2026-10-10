/**
 * 提交整卷
 *
 * 提交前由 `validator` 判定必填，由 `serializer` 组装请求体；
 * 提交成功后回传批次号，供结果页与续答使用。
 */

import type { AnswerMap, QuestionField } from '@/domain/questionnaire'

import { ref } from 'vue'

import { resultSubmit } from '@/api/daq/record'
import { toSubmitPayload, validateRequired } from '@/domain/questionnaire'
import { extractResponsePayload } from '@/utils/request'

export interface SubmitParams {
  activityNo: string
  fillBatchNo?: string
  fields: QuestionField[]
  answers: AnswerMap
}

export interface SubmitResult {
  ok: boolean
  batchNo: string
  /** 校验未通过时的第一处问题，用于定位滚动 */
  firstIssueKey: string
}

export function useSubmit() {
  const submitting = ref(false)

  async function submit(params: SubmitParams): Promise<SubmitResult> {
    // 函数级防重：不能只依赖按钮的 loading 态 —— 那是 UI 层的保证，
    // 任何绕过 UI 的调用（快捷入口、重复触发）都会造成重复提交。
    if (submitting.value) {
      return { ok: false, batchNo: params.fillBatchNo ?? '', firstIssueKey: '' }
    }

    const issues = validateRequired(params.fields, params.answers)
    if (issues.length > 0) {
      return { ok: false, batchNo: params.fillBatchNo ?? '', firstIssueKey: issues[0]!.key }
    }

    submitting.value = true
    try {
      const itemData = toSubmitPayload(params.fields, params.answers)
      const envelope = await resultSubmit({
        activityNo: params.activityNo,
        fillBatchNo: params.fillBatchNo,
        itemData,
      })
      const payload = extractResponsePayload<{ fill_batch_no?: string }>(envelope)
      return {
        ok: true,
        batchNo: payload?.fill_batch_no ?? params.fillBatchNo ?? '',
        firstIssueKey: '',
      }
    }
    finally {
      submitting.value = false
    }
  }

  return {
    submitting,
    submit,
  }
}
