/**
 * 客观题判分（纯函数）
 *
 * 依据平台选项行 `answer === '是'` 标记正确答案；文本类题目不计分。
 */

import type { AnswerMap, QuestionField } from './types'
import { toArray } from './types'

export interface ScoreDetail {
  key: string
  index: number
  /** 是否答对；无正确答案的题目为 null */
  correct: boolean | null
  /** 用户选中的选项主键 */
  selected: string[]
  /** 正确答案的选项主键 */
  expected: string[]
}

export interface ScoreResult {
  /** 已得总分（仅客观题） */
  score: number
  /** 客观题满分 */
  total: number
  /** 答对题数 */
  correctCount: number
  /** 答错题数 */
  wrongCount: number
  /** 未作答的客观题数 */
  unansweredCount: number
  detail: ScoreDetail[]
}

/** 判定单题对错：选中集合与正确答案集合完全一致 */
function judge(field: QuestionField, answers: AnswerMap): ScoreDetail {
  const expected = field.options.filter(option => option.isAnswer).map(option => option.no)
  const selected = toArray(answers[field.key])

  if (expected.length === 0) {
    return { key: field.key, index: field.index, correct: null, selected, expected }
  }

  const correct = selected.length === expected.length
    && selected.every(no => expected.includes(no))

  return { key: field.key, index: field.index, correct, selected, expected }
}

/** 全卷判分 */
export function calcScore(fields: QuestionField[], answers: AnswerMap): ScoreResult {
  const detail: ScoreDetail[] = []
  let score = 0
  let total = 0
  let correctCount = 0
  let wrongCount = 0
  let unansweredCount = 0

  for (const field of fields) {
    if (field.widget === 'section') {
      continue
    }
    const expectedCount = field.options.filter(option => option.isAnswer).length
    if (expectedCount === 0) {
      continue
    }

    const item = judge(field, answers)
    detail.push(item)
    total += field.points

    if (item.selected.length === 0) {
      unansweredCount += 1
    }
    else if (item.correct) {
      correctCount += 1
      score += field.points
    }
    else {
      wrongCount += 1
    }
  }

  return {
    score,
    total,
    correctCount,
    wrongCount,
    unansweredCount,
    detail,
  }
}

/** 取某题的正确答案文案（结果页展示用） */
export function describeAnswer(field: QuestionField): string {
  return field.options
    .filter(option => option.isAnswer)
    .map(option => option.label)
    .join('、')
}

/** 取某题的作答文案 */
export function describeSelected(field: QuestionField, answers: AnswerMap): string {
  const selected = toArray(answers[field.key])
  if (selected.length === 0) {
    return ''
  }
  if (field.widget === 'radio' || field.widget === 'checkbox') {
    const labels = field.options
      .filter(option => selected.includes(option.no))
      .map(option => option.label)
    // 服务端值匹配不上任何选项时保留原值：显示成空白会被下游当成「未作答」，
    // 而用户其实作答了 —— 宁可露出原值便于排查，也不要谎报。
    return labels.length > 0 ? labels.join('、') : selected.join('、')
  }
  return selected.join('、')
}
