// @vitest-environment node

import type { DaqItemRow } from '@/api/daq/types'

import type { FieldOption, QuestionField } from '@/domain/questionnaire'
import { describe, expect, it } from 'vitest'
import { toQuestionFields } from '@/domain/questionnaire/mapper'
import { toSubmitPayload } from '@/domain/questionnaire/serializer'
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

describe('serializer · 边界值', () => {
  function makeField(partial: Partial<QuestionField> & Pick<QuestionField, 'key' | 'widget'>): QuestionField {
    return {
      seq: 1,
      index: 1,
      label: '题目',
      required: false,
      multi: false,
      points: 0,
      options: [],
      raw: {} as DaqItemRow,
      ...partial,
    }
  }

  function opt(no: string, value: string, viewNo = ''): FieldOption {
    return { no, value, viewNo, label: value, serialChar: 'A', isAnswer: false }
  }

  it('数字题答 0 必须进入提交体 —— 0 是有效作答，不能当成空值', () => {
    const payload = toSubmitPayload([makeField({ key: 'k1', widget: 'number' })], { k1: '0' })
    expect(payload).toEqual([{ item_no: 'k1', option_data: ['0'] }])
  })

  it('多选取消全选（空数组）视为未作答，不进入提交体', () => {
    const field = makeField({ key: 'k2', widget: 'checkbox', options: [opt('n1', 'v1')] })
    expect(toSubmitPayload([field], { k2: [] })).toEqual([])
  })

  it('选项缺少 viewNo 时不产生空的 option_flag', () => {
    const field = makeField({
      key: 'k3',
      widget: 'radio',
      options: [{ ...opt('n1', 'v1'), viewNo: '' }],
    })
    const payload = toSubmitPayload([field], { k3: 'n1' })
    expect(payload).toEqual([{ item_no: 'k3', option_data: ['v1'] }])
    expect(payload[0]).not.toHaveProperty('option_flag')
  })

  it('选项类判空按选项主键 option_no，不存在的选项不会混进提交体', () => {
    const field = makeField({ key: 'k5', widget: 'radio', options: [opt('n1', 'v1')] })
    expect(toSubmitPayload([field], { k5: 'n-not-exist' })).toEqual([])
  })
})
