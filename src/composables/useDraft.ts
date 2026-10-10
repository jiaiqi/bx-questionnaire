/**
 * 草稿保存
 *
 * 按老工程方案：**逐题即时保存**到 `srvdaq_activity_result_save`，
 * 响应回传的 `fill_batch_no` 作为后续保存与提交的批次号。
 *
 * 相比老实现加固两点：
 * - 串行队列：快速连续作答不会并发打同一接口；
 * - 失败可感知：`savedTip` 暴露保存状态，不再静默失败。
 */

import type { AnswerMap, DraftItem, QuestionField } from '@/domain/questionnaire'

import { ref } from 'vue'

import { resultSave } from '@/api/daq/record'
import { toDraftPayload } from '@/domain/questionnaire'
import { extractResponsePayload } from '@/utils/request'

export interface DraftSaveParams {
  activityNo: string
  fillBatchNo?: string
  field: QuestionField
  answers: AnswerMap
  /** 首次保存拿到批次号后的回调 */
  onBatchNo?: (batchNo: string) => void
}

interface PendingTask {
  activityNo: string
  fillBatchNo?: string
  item: DraftItem
  onBatchNo?: (batchNo: string) => void
}

export function useDraft() {
  const saving = ref(false)
  const savedTip = ref('')
  const savedAt = ref(0)
  const failed = ref(false)

  const queue: PendingTask[] = []

  async function flush(): Promise<void> {
    saving.value = true
    failed.value = false
    savedTip.value = '正在保存草稿…'

    try {
      while (queue.length > 0) {
        const task = queue.shift()!
        const envelope = await resultSave({
          activityNo: task.activityNo,
          fillBatchNo: task.fillBatchNo,
          itemData: [task.item],
        })
        const payload = extractResponsePayload<{ fill_batch_no?: string }>(envelope)
        if (payload?.fill_batch_no) {
          task.onBatchNo?.(payload.fill_batch_no)
        }
      }
      savedTip.value = '草稿已自动保存'
      savedAt.value = Date.now()
    }
    catch {
      failed.value = true
      savedTip.value = '草稿保存失败，提交时仍会一并上传'
    }
    finally {
      saving.value = false
    }
  }

  /** 作答后调用：空值不产生请求 */
  async function save(params: DraftSaveParams): Promise<void> {
    const item = toDraftPayload(params.field, params.answers)
    if (!item) {
      return
    }

    queue.push({
      activityNo: params.activityNo,
      fillBatchNo: params.fillBatchNo,
      item,
      onBatchNo: params.onBatchNo,
    })

    // 已有 flush 在跑时，本次入队后直接返回
    if (saving.value) {
      return
    }
    await flush()
  }

  /** 「暂存草稿」按钮：一次提交全部已作答项 */
  async function saveAll(params: Omit<DraftSaveParams, 'field'> & { fields: QuestionField[] }): Promise<void> {
    const items: DraftItem[] = []
    for (const field of params.fields) {
      const item = toDraftPayload(field, params.answers)
      if (item) {
        items.push(item)
      }
    }
    if (items.length === 0) {
      return
    }

    saving.value = true
    failed.value = false
    savedTip.value = '正在保存草稿…'
    try {
      const envelope = await resultSave({
        activityNo: params.activityNo,
        fillBatchNo: params.fillBatchNo,
        itemData: items,
      })
      const payload = extractResponsePayload<{ fill_batch_no?: string }>(envelope)
      if (payload?.fill_batch_no) {
        params.onBatchNo?.(payload.fill_batch_no)
      }
      savedTip.value = '草稿已自动保存'
      savedAt.value = Date.now()
    }
    catch {
      failed.value = true
      savedTip.value = '草稿保存失败'
    }
    finally {
      saving.value = false
    }
  }

  return {
    saving,
    savedTip,
    savedAt,
    failed,
    save,
    saveAll,
  }
}
