// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { toQuestionFields } from '@/domain/questionnaire/mapper'
import { countAnswered, findFirstIssue, isFieldAnswered, validateRequired } from '@/domain/questionnaire/validator'

const fields = toQuestionFields([
  { item_no: 'q1', item_seq: 1, item_title: '第一题', item_type: '单选', is_require: '是', option_data: [{ option_no: 'o1', option_value: '甲' }] },
  { item_no: 'sec', item_seq: 2, item_title: '第二部分', item_type: '分节符' },
  { item_no: 'q2', item_seq: 3, item_title: '第二题', item_type: '文本', is_require: '是' },
  { item_no: 'q3', item_seq: 4, item_title: '第三题', item_type: '数字', is_require: '否' },
])

describe('validator', () => {
  it('必填未作答会产出问题项，并带题号与题干', () => {
    const issues = validateRequired(fields, { q1: 'o1' })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ key: 'q2', index: 2, label: '第二题' })
  })

  it('分节符永不必填', () => {
    const issues = validateRequired(fields, {})
    expect(issues.map(issue => issue.key)).toEqual(['q1', 'q2'])
  })

  it('findFirstIssue 返回第一道未答必填题', () => {
    expect(findFirstIssue(fields, {})?.key).toBe('q1')
    expect(findFirstIssue(fields, { q1: 'o1' })?.key).toBe('q2')
    expect(findFirstIssue(fields, { q1: 'o1', q2: '意见' })).toBeNull()
  })

  it('isFieldAnswered 区分空字符串与有值', () => {
    expect(isFieldAnswered(fields[2]!, { q2: '' })).toBe(false)
    expect(isFieldAnswered(fields[2]!, { q2: '意见' })).toBe(true)
    expect(isFieldAnswered(fields[0]!, { q1: [] })).toBe(false)
  })

  it('进度统计不计入分节符', () => {
    expect(countAnswered(fields, {})).toEqual({ answered: 0, total: 3, percent: 0 })
    expect(countAnswered(fields, { q1: 'o1', q2: '意见' })).toEqual({ answered: 2, total: 3, percent: 67 })
    expect(countAnswered(fields, { q1: 'o1', q2: '意见', q3: '42' })).toEqual({ answered: 3, total: 3, percent: 100 })
  })
})
