// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { toQuestionFields } from '@/domain/questionnaire/mapper'
import { calcScore, describeAnswer, describeSelected } from '@/domain/questionnaire/scoring'

const fields = toQuestionFields([
  {
    item_no: 'q1',
    item_seq: 1,
    item_title: '单选题',
    item_type: '单选',
    is_require: '是',
    points: 10,
    option_data: [
      { option_no: 'o1', option_value: '甲', answer: '是' },
      { option_no: 'o2', option_value: '乙', answer: '否' },
    ],
  },
  {
    item_no: 'q2',
    item_seq: 2,
    item_title: '多选题',
    item_type: '多选',
    is_require: '是',
    points: 20,
    option_data: [
      { option_no: 'o1', option_value: 'A', answer: '是' },
      { option_no: 'o2', option_value: 'B', answer: '是' },
      { option_no: 'o3', option_value: 'C', answer: '否' },
    ],
  },
  { item_no: 'q3', item_seq: 3, item_title: '文本题', item_type: '文本', is_require: '否', points: 5 },
])

describe('scoring', () => {
  it('全对时得满分', () => {
    const result = calcScore(fields, { q1: 'o1', q2: ['o1', 'o2'], q3: '随便' })
    expect(result).toMatchObject({ score: 30, total: 30, correctCount: 2, wrongCount: 0, unansweredCount: 0 })
  })

  it('多选漏选判为答错，未作答单独统计', () => {
    const result = calcScore(fields, { q1: 'o2', q2: ['o1'] })
    expect(result).toMatchObject({ score: 0, total: 30, correctCount: 0, wrongCount: 2, unansweredCount: 0 })
  })

  it('未作答的客观题计入 unansweredCount 且不计分', () => {
    const result = calcScore(fields, { q1: 'o1' })
    expect(result).toMatchObject({ score: 10, total: 30, correctCount: 1, wrongCount: 0, unansweredCount: 1 })
  })

  it('无正确答案的题目不计分也不进入明细', () => {
    const result = calcScore(fields, {})
    expect(result.detail.map(item => item.key)).toEqual(['q1', 'q2'])
    expect(result.total).toBe(30)
  })

  it('describeAnswer / describeSelected 输出可读文案', () => {
    expect(describeAnswer(fields[1]!)).toBe('A、B')
    expect(describeSelected(fields[1]!, { q2: ['o1', 'o3'] })).toBe('A、C')
    expect(describeSelected(fields[2]!, { q3: '自定义意见' })).toBe('自定义意见')
  })
})
