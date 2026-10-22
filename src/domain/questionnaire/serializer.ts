/**
 * 作答模型 → 平台请求体（纯函数）
 *
 * 契约（迁移期间不变）：
 * - 提交：选项类写 `option_data = [option_value…]` + `option_flag = [option_view_no…]`；
 *         文本/数字类写 `option_data = [字符串]`；
 * - 草稿：写 `option_data = [option_no…]`（老工程语义，选项主键）。
 */

import type { AnswerMap, DraftItem, QuestionField, SubmitItem } from './types'
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

/**
 * 组装单题草稿体
 *
 * 选项类写选项主键，文本/数字类写字符串；空值返回 null（不发起请求）。
 */
export function toDraftPayload(field: QuestionField, answers: AnswerMap): DraftItem | null {
  if (field.widget === 'section') {
    return null
  }

  const values = toArray(answers[field.key]).map(value => String(value)).filter(value => value !== '')
  if (values.length === 0) {
    return null
  }

  return {
    item_no: field.key,
    option_data: values,
  }
}
