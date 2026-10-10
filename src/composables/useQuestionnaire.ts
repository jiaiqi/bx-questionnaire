/**
 * 问卷配置加载
 *
 * 复刻老工程 `getQuestionnaireData()` 的语义：
 * - `type=use` 条件在「已结束」活动上会返回 FAILURE「活动已结束」，此时把活动状态置为已结束；
 * - 拿到 `item_data` 后映射为领域字段，并用后端 `user_data` 回填作答。
 */

import type { InitViewMode } from '@/api/daq/activity'
import type { DaqActivityRow } from '@/api/daq/types'
import type { AnswerMap, BackfillRow, QuestionField } from '@/domain/questionnaire'

import { ref } from 'vue'

import { activityCfgUpdate, initViewSelect } from '@/api/daq/activity'
import { applyBackfill, toQuestionFields } from '@/domain/questionnaire'
import { BxError } from '@/utils/request'

export interface LoadOptions {
  /** 取值模式：plain 不带 type 条件（默认），use 进行中活动，cfg 未开始活动 */
  mode?: InitViewMode
  /** 续答 / 详情：指定批次号 */
  fillBatchNo?: string
  /** 已结束活动是否自动置状态（老工程行为，默认开启） */
  autoUpdateState?: boolean
}

export function useQuestionnaire() {
  const loading = ref(false)
  const activity = ref<DaqActivityRow | null>(null)
  const fields = ref<QuestionField[]>([])
  const backfill = ref<AnswerMap>({})
  const errorMessage = ref('')

  async function load(activityNo: string, options: LoadOptions = {}): Promise<boolean> {
    loading.value = true
    errorMessage.value = ''

    try {
      const envelope = await initViewSelect({
        activityNo,
        mode: options.mode ?? 'plain',
        fillBatchNo: options.fillBatchNo,
      })

      const row = envelope.data?.[0]
      if (!row) {
        errorMessage.value = '问卷不存在或已下线'
        return false
      }

      activity.value = row
      fields.value = toQuestionFields(row.item_data)
      backfill.value = applyBackfill(fields.value, row.user_data as BackfillRow[] | undefined)
      return true
    }
    catch (error) {
      const message = error instanceof BxError ? error.message : '问卷加载失败'
      errorMessage.value = message

      // 「活动已结束」：复刻老工程自动置状态的语义
      if (options.autoUpdateState !== false && message.includes('活动已结束')) {
        try {
          await activityCfgUpdate(activityNo, '已结束')
        }
        catch {
          // 置状态失败不影响主流程提示
        }
      }
      return false
    }
    finally {
      loading.value = false
    }
  }

  return {
    loading,
    activity,
    fields,
    backfill,
    errorMessage,
    load,
  }
}
