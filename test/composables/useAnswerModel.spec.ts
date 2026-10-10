// @vitest-environment node

/**
 * 作答模型的写入语义
 *
 * 用例来自变异测试：`setAnswer` 里「先按 key 找到题目，找不到就返回」这两行
 * 此前没有测试守着，把 `item.key === key` 改成 `!==`、或删掉 `if (!field)`
 * 的取反，测试都还是绿的。
 *
 * 这两处看似只是防御，实际决定了「写一个不存在的 key」会不会污染作答表 ——
 * 污染后 countAnswered 会把幽灵题目算进进度，结果页也可能渲染出多余条目。
 */

import { describe, expect, it } from 'vitest'

import { useAnswerModel } from '@/composables/useAnswerModel'
import { toQuestionFields } from '@/domain/questionnaire/mapper'

function fields() {
  return toQuestionFields([
    { item_no: 'q1', item_seq: 1, item_type: '文本' },
    { item_no: 'q2', item_seq: 2, item_type: '选项', item_type_attr: { radioType: 'multi' } },
  ])
}

describe('useAnswerModel · setAnswer', () => {
  it('写入已存在的题目并更新进度', () => {
    const model = useAnswerModel(fields)
    model.setAnswer('q1', '一些建议')

    expect(model.answers.q1).toBe('一些建议')
    expect(model.progress.value.answered).toBe(1)
  })

  it('key 不存在时不写入，避免污染作答表', () => {
    const model = useAnswerModel(fields)
    model.setAnswer('不存在的题', 'x')

    expect(Object.keys(model.answers)).toHaveLength(0)
    expect(model.progress.value.answered).toBe(0)
  })

  it('多选题目始终存成数组，单值也会被包成数组', () => {
    const model = useAnswerModel(fields)
    model.setAnswer('q2', 'o1')
    expect(model.answers.q2).toEqual(['o1'])

    model.setAnswer('q2', ['o1', 'o2'])
    expect(model.answers.q2).toEqual(['o1', 'o2'])
  })

  it('非多选题目存单值，传数组时取第一项', () => {
    const model = useAnswerModel(fields)
    model.setAnswer('q1', ['甲', '乙'])
    expect(model.answers.q1).toBe('甲')
  })
})
