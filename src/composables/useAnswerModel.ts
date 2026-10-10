/**
 * 作答模型
 *
 * 单一数据源：页面用 `v-model="answers[field.key]"` 直接双向绑定，
 * 取代老工程「$refs 收集 + 事件副作用」的取值方式。
 */

import type { AnswerMap, AnswerValue, QuestionField } from '@/domain/questionnaire'

import { computed, reactive } from 'vue'

import { countAnswered } from '@/domain/questionnaire'

export function useAnswerModel(fields: () => QuestionField[]) {
  const answers = reactive<AnswerMap>({})

  /** 作答进度（分节符不计入） */
  const progress = computed(() => countAnswered(fields(), answers))

  function setAnswer(key: string, value: AnswerValue): void {
    const field = fields().find(item => item.key === key)
    if (!field) {
      return
    }
    if (field.multi) {
      answers[key] = Array.isArray(value) ? [...value] : [value]
    }
    else {
      answers[key] = Array.isArray(value) ? (value[0] ?? '') : value
    }
  }

  function clearField(key: string): void {
    delete answers[key]
  }

  /** 用后端回填数据整体替换作答模型 */
  function replace(next: AnswerMap): void {
    for (const key of Object.keys(answers)) {
      delete answers[key]
    }
    Object.assign(answers, next)
  }

  return {
    answers,
    progress,
    setAnswer,
    clearField,
    replace,
  }
}
