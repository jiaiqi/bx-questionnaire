/**
 * 作答校验（纯函数）
 *
 * 老工程把校验塞在 `a-form-item.getValid()` 里并靠 `$refs` 触发，
 * 这里改为纯函数：给定字段与作答模型，返回全部问题。
 */

import type { AnswerMap, QuestionField } from './types'
import { toArray } from './types'

export interface ValidationIssue {
  key: string
  /** 题号，分节符为 0 */
  index: number
  label: string
  message: string
}

/** 单题是否已作答 */
export function isFieldAnswered(field: QuestionField, answers: AnswerMap): boolean {
  if (field.widget === 'section') {
    return true
  }
  return toArray(answers[field.key]).length > 0
}

/** 校验全部必填项 */
export function validateRequired(fields: QuestionField[], answers: AnswerMap): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const field of fields) {
    if (!field.required || isFieldAnswered(field, answers)) {
      continue
    }
    issues.push({
      key: field.key,
      index: field.index,
      label: field.label,
      // index 由 mapper 赋值：分节符为 0，其余从 1 递增。分节符在 isFieldAnswered
      // 里恒视为已作答，因此真实数据走不到 else 分支；这里保留兜底是因为
      // validateRequired 是公开的纯函数，调用方可以直接构造 field。
      message: field.index > 0 ? `第 ${field.index} 题为必填项` : '存在必填项未作答',
    })
  }

  return issues
}

/** 取第一个问题（用于定位滚动与错误提示） */
export function findFirstIssue(fields: QuestionField[], answers: AnswerMap): ValidationIssue | null {
  return validateRequired(fields, answers)[0] ?? null
}

/** 作答进度统计（分节符不计入） */
export function countAnswered(
  fields: QuestionField[],
  answers: AnswerMap,
): { answered: number, total: number, percent: number } {
  const answerable = fields.filter(field => field.widget !== 'section')
  const answered = answerable.filter(field => isFieldAnswered(field, answers)).length
  const total = answerable.length

  return {
    answered,
    total,
    percent: total === 0 ? 0 : Math.round((answered / total) * 100),
  }
}
