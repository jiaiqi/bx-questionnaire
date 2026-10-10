/**
 * 草稿保存
 *
 * 按老工程方案：**逐题即时保存**到 `srvdaq_activity_result_save`，
 * **首次**保存响应回传的 `fill_batch_no` 锁定为本次作答的批次号，后续保存与提交都用它。
 *
 * 批次号语义**严格对齐老工程**（`if (data.fill_batch_no && !self.fill_batch_no)`）：
 * 只在首次保存时锁定，之后服务端再回传新批次号也不采用。实测服务端每次保存都会回传
 * 一个新批次号，若无条件采用，批次号会被逐次推进，同一次作答被割裂到多条草稿，
 * 提交只能挂到最后一条上，其余成为孤儿记录。
 *
 * 相比老实现加固两点：
 * - 串行队列：快速连续作答不会并发打同一接口；
 * - 失败可感知：`savedTip` 暴露保存状态，不再静默失败。
 */

import type { AnswerMap, DraftItem, QuestionField } from '@/domain/questionnaire'

import { ref } from 'vue'

import { resultSave } from '@/api/daq/record'
import { toDraftPayload, toDraftPayloads } from '@/domain/questionnaire'
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
  item: DraftItem
  onBatchNo?: (batchNo: string) => void
}

export function useDraft() {
  const saving = ref(false)
  const savedTip = ref('')
  const savedAt = ref(0)
  const failed = ref(false)

  const queue: PendingTask[] = []

  /**
   * 当前批次号
   *
   * 必须由队列执行时读取，**不能**在入队时把调用方传入的值快照进任务里：
   * 首次保存尚未返回时用户继续作答，后续任务入队时拿到的仍是空批次号，
   * 于是又被当作「首次保存」，平台会分配第二个批次号，
   * 导致同一次作答被割裂到多个批次（快速连答时必然触发）。
   */
  let currentBatchNo = ''

  /** 正在进行的 flush，用于让提交前能等待队列排空 */
  let inflight: Promise<void> | null = null

  async function flush(): Promise<void> {
    saving.value = true
    failed.value = false
    savedTip.value = '正在保存草稿…'

    try {
      while (queue.length > 0) {
        const task = queue.shift()!
        const envelope = await resultSave({
          activityNo: task.activityNo,
          fillBatchNo: currentBatchNo || undefined,
          itemData: [task.item],
        })
        const payload = extractResponsePayload<{ fill_batch_no?: string }>(envelope)
        // 批次号只在首次保存时锁定，后续服务端即使回传新批次也不覆盖 ——
        // 与老工程 indexyax.vue 的 `if (data.fill_batch_no && !self.fill_batch_no)` 一致。
        // 实测服务端每次保存都会回传一个新批次号：若无条件覆盖，同一次作答会被
        // 割裂到多条草稿记录（每次保存一条），提交只能挂到最后一条上，其余成为孤儿。
        if (payload?.fill_batch_no && !currentBatchNo) {
          currentBatchNo = payload.fill_batch_no
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

    // 续答场景调用方会带来既有批次号；一旦服务端回传，以服务端为准
    if (!currentBatchNo && params.fillBatchNo) {
      currentBatchNo = params.fillBatchNo
    }

    queue.push({
      activityNo: params.activityNo,
      item,
      onBatchNo: params.onBatchNo,
    })

    if (!inflight) {
      inflight = flush().finally(() => {
        inflight = null
      })
    }
    await inflight
  }

  /**
   * 等待草稿队列排空
   *
   * 提交前必须调用：否则「答完最后一题立刻提交」时草稿请求与提交请求并发，
   * 提交那一刻 session.fillBatchNo 还是空的，提交也被当成首次保存，
   * 平台再分配一个批次号 —— 草稿与提交分属两个批次，两个响应还会互相覆盖批次号。
   * 等待排空后草稿先落库并回传批次号，提交就能落在同一批次上。
   */
  async function waitIdle(): Promise<void> {
    // 等待期间可能有新任务入队并开启新一轮 flush，所以要循环重读
    let pending = inflight
    while (pending) {
      await pending
      pending = inflight
    }
  }

  /** 「暂存草稿」按钮：一次提交全部已作答项 */
  async function saveAll(params: Omit<DraftSaveParams, 'field'> & { fields: QuestionField[] }): Promise<void> {
    // 全卷组装复用 domain 的 toDraftPayloads：此前这里把「遍历 + 调 toDraftPayload +
    // 过滤空值」抄了一遍，与 serializer 里的实现逐字重复，且让 toDraftPayloads 成了死代码。
    const items = toDraftPayloads(params.fields, params.answers)
    if (items.length === 0) {
      return
    }

    // 与 save 保持同一套批次号来源，避免两条路径各写各的
    if (!currentBatchNo && params.fillBatchNo) {
      currentBatchNo = params.fillBatchNo
    }

    saving.value = true
    failed.value = false
    savedTip.value = '正在保存草稿…'
    try {
      const envelope = await resultSave({
        activityNo: params.activityNo,
        fillBatchNo: currentBatchNo || undefined,
        itemData: items,
      })
      const payload = extractResponsePayload<{ fill_batch_no?: string }>(envelope)
      // 同 flush：批次号首次锁定后不再被服务端回传值覆盖（对齐老工程语义）
      if (payload?.fill_batch_no && !currentBatchNo) {
        currentBatchNo = payload.fill_batch_no
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
    waitIdle,
  }
}
