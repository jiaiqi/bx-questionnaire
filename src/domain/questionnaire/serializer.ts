/**
 * 作答模型 → 平台请求体（纯函数）
 *
 * 契约（迁移期间不变）：
 * - 提交：选项类写 `option_data = [option_value…]` + `option_flag = [option_view_no…]`；
 *         文本/数字类写 `option_data = [字符串]`。
 *
 * 「草稿体」(`option_data = [option_no…]`) 随逐题草稿上报一起下线（2026-11-06）：
 * 草稿现在只写本机，直接复用作答模型，不再需要单独的序列化口径。
 */

import type { AnswerMap, QuestionField, SubmitItem } from './types'
import { toArray } from './types'

/** 需要按选项主键反查映射的控件 */
const OPTION_WIDGETS = new Set(['radio', 'checkbox'])

/**
 * 组装提交体
 *
 * 空值题目不会出现在提交体中（与老工程一致），分节符永不提交。
 */
export function toSubmitPayload(fields: QuestionField[], answers: AnswerMap): SubmitItem[] {
  const payload: SubmitItem[] = []

  for (const field of fields) {
    if (field.widget === 'section') {
      continue
    }

    const values = toArray(answers[field.key])
    const item: SubmitItem = { item_no: field.key, option_data: [] }

    if (OPTION_WIDGETS.has(field.widget)) {
      const selected = field.options.filter(option => values.includes(option.no))
      item.option_data = selected
        .map(option => option.value)
        .filter(value => value !== '')
      const flags = selected
        .map(option => option.viewNo)
        .filter(value => value !== '')
      if (flags.length > 0) {
        item.option_flag = flags
      }
    }
    else {
      item.option_data = values
        .map(value => String(value))
        .filter(value => value !== '')
    }

    if (item.option_data.length > 0) {
      payload.push(item)
    }
  }

  return payload
}
