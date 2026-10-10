// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { toQuestionFields } from '@/domain/questionnaire/mapper'
import { toDraftPayload, toDraftPayloads, toSubmitPayload } from '@/domain/questionnaire/serializer'
import { activity8, buildRealistic19, realistic19Answers } from '../fixtures/questionnaire'

describe('serializer · 提交体', () => {
  it('回归：19 题问卷（含 2 道文本题）全部进入提交体，文本值不丢', () => {
    const fields = toQuestionFields(buildRealistic19())
    const payload = toSubmitPayload(fields, realistic19Answers)

    expect(payload).toHaveLength(19)
    expect(payload).toContainEqual({
      item_no: '20261009105712000012',
      option_data: ['1717'],
    })
    expect(payload).toContainEqual({
      item_no: '20261009105732000013',
      option_data: ['1818'],
    })
  })

  it('选项类：option_data 写 option_value，option_flag 写 option_view_no', () => {
    const fields = toQuestionFields(activity8.item_data)
    const first = fields[0]!
    const payload = toSubmitPayload(fields, { [first.key]: first.options[0]!.no })

    expect(payload).toEqual([{
      item_no: first.key,
      option_data: ['1'],
      option_flag: ['A'],
    }])
  })

  it('多选：全部选中项按顺序进入 option_data 与 option_flag', () => {
    const fields = toQuestionFields([{
      item_no: 'multi',
      item_seq: 1,
      item_type: '多选',
      is_require: '否',
      option_data: [
        { option_no: 'o1', option_value: '甲', option_view_no: 'A' },
        { option_no: 'o2', option_value: '乙', option_view_no: 'B' },
        { option_no: 'o3', option_value: '丙', option_view_no: 'C' },
      ],
    }])

    const payload = toSubmitPayload(fields, { multi: ['o1', 'o3'] })
    expect(payload).toEqual([{ item_no: 'multi', option_data: ['甲', '丙'], option_flag: ['A', 'C'] }])
  })

  it('未作答题目不进入提交体，分节符永不提交', () => {
    const fields = toQuestionFields([
      { item_no: 'q1', item_seq: 1, item_type: '单选', option_data: [{ option_no: 'o1', option_value: '甲' }] },
      { item_no: 'sec', item_seq: 2, item_type: '分节符' },
      { item_no: 'q2', item_seq: 3, item_type: '文本' },
    ])

    const payload = toSubmitPayload(fields, { q1: 'o1' })
    expect(payload).toHaveLength(1)
    expect(payload[0]!.item_no).toBe('q1')
  })

  it('文本类空字符串不提交（避免产生空作答）', () => {
    const fields = toQuestionFields([{ item_no: 'q1', item_seq: 1, item_type: '文本' }])
    expect(toSubmitPayload(fields, { q1: '' })).toHaveLength(0)
  })
})

describe('serializer · 草稿体', () => {
  it('草稿写选项主键 option_no（与老工程一致）', () => {
    const fields = toQuestionFields(activity8.item_data)
    const first = fields[0]!
    const draft = toDraftPayload(first, { [first.key]: first.options[1]!.no })

    expect(draft).toEqual({ item_no: first.key, option_data: [first.options[1]!.no] })
  })

  it('草稿文本题写字符串', () => {
    const fields = toQuestionFields([{ item_no: 'q1', item_seq: 1, item_type: '文本' }])
    expect(toDraftPayload(fields[0]!, { q1: '意见' })).toEqual({ item_no: 'q1', option_data: ['意见'] })
  })

  it('空值不产生草稿项', () => {
    const fields = toQuestionFields([{ item_no: 'q1', item_seq: 1, item_type: '文本' }])
    expect(toDraftPayload(fields[0]!, {})).toBeNull()
    expect(toDraftPayloads(fields, {})).toHaveLength(0)
  })
})
