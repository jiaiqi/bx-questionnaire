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

  it('有题号时提示带上题号', () => {
    const issues = validateRequired(fields, { q1: 'o1' })
    expect(issues[0]!.message).toBe('第 2 题为必填项')
  })

  /**
   * index 由 mapper 赋值（分节符为 0，其余从 1 递增），真实数据里分节符恒视为
   * 已作答，所以走不到无题号的分支。但 validateRequired 是公开纯函数，
   * 调用方可以直接构造 field —— 这里覆盖该分支，避免它成为无人看管的死代码。
   */
  it('无题号时退化为通用提示', () => {
    const noIndex = toQuestionFields([
      { item_no: 'x1', item_seq: 1, item_title: '无题号必填', item_type: '文本', is_require: '是' },
    ])
    noIndex[0]!.index = 0
    const issues = validateRequired(noIndex, {})
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toBe('存在必填项未作答')
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

  /**
   * 题号为 1 的边界：`field.index > 0` 改成 `> 1` 时，只有 index === 1 的题目
   * 会从「第 1 题为必填项」退化成通用提示 —— 上面那条用例测的是 index === 2，
   * 两条分支都命中同一侧，所以变异存活。
   */
  it('题号为 1 时同样带上题号，不因边界判断退化', () => {
    const onlyFirst = toQuestionFields([
      { item_no: 'q1', item_seq: 1, item_title: '第一题', item_type: '文本', is_require: '是' },
    ])
    const issues = validateRequired(onlyFirst, {})
    expect(issues[0]!.index).toBe(1)
    expect(issues[0]!.message).toBe('第 1 题为必填项')
  })

  /**
   * total 为 0 的边界：`total === 0` 改成 `=== 1` 后，空问卷会算出
   * `Math.round((0 / 0) * 100)` = NaN —— 进度条拿到 NaN 会渲染成空白或
   * 「NaN%」。必须显式覆盖空字段集。
   */
  it('没有任何题目时进度为 0 而不是 NaN', () => {
    const result = countAnswered([], {})
    expect(result).toEqual({ answered: 0, total: 0, percent: 0 })
    expect(Number.isNaN(result.percent)).toBe(false)
  })

  it('全部为分节符时进度同样为 0 而不是 NaN（分节符不计入 total）', () => {
    const sections = toQuestionFields([
      { item_no: 's1', item_seq: 1, item_title: '第一部分', item_type: '分节符' },
      { item_no: 's2', item_seq: 2, item_title: '第二部分', item_type: '分节符' },
    ])
    const result = countAnswered(sections, {})
    expect(result).toEqual({ answered: 0, total: 0, percent: 0 })
    expect(Number.isNaN(result.percent)).toBe(false)
  })
})
