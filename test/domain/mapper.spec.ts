// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { activity5, activity8 } from '../fixtures/questionnaire'
import { applyBackfill, resolveWidget, toFieldOptions, toQuestionFields } from '@/domain/questionnaire/mapper'

describe('mapper · 题型映射', () => {
  it('单选 → radio，数字 → number，文本 → text', () => {
    expect(resolveWidget({ item_no: 'a', item_type: '单选' })).toEqual({ widget: 'radio', multi: false })
    expect(resolveWidget({ item_no: 'b', item_type: '数字' })).toEqual({ widget: 'number', multi: false })
    expect(resolveWidget({ item_no: 'c', item_type: '文本' })).toEqual({ widget: 'text', multi: false })
    expect(resolveWidget({ item_no: 'd', item_type: '文本', item_type_attr: { view_model: 'textarea' } }))
      .toEqual({ widget: 'textarea', multi: false })
  })

  it('选项题型按 radioType 决定单选/多选', () => {
    expect(resolveWidget({ item_no: 'a', item_type: '选项', item_type_attr: { radioType: 'multi' } }).widget).toBe('checkbox')
    expect(resolveWidget({ item_no: 'b', item_type: '选项', item_type_attr: { radioType: 'single' } }).widget).toBe('radio')
  })

  it('分节符不参与作答，且永不必填', () => {
    const [field] = toQuestionFields([{ item_no: 'sec', item_seq: 1, item_type: '分节符', is_require: '是' }])
    expect(field!.widget).toBe('section')
    expect(field!.required).toBe(false)
    expect(field!.index).toBe(0)
  })
})

describe('mapper · 真实数据适配', () => {
  it('8 题真实活动：题号连续、必填识别正确', () => {
    const fields = toQuestionFields(activity8.item_data)
    expect(fields).toHaveLength(8)
    expect(fields.map(field => field.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(fields.every(field => field.required)).toBe(true)
    expect(fields[0]!.widget).toBe('radio')
    expect(fields[1]!.widget).toBe('number')
  })

  it('5 题真实活动：文本题未带 view_model 时识别为 text，且 item_seq 重复时保持平台顺序', () => {
    const fields = toQuestionFields(activity5.item_data)
    expect(fields).toHaveLength(5)
    expect(fields[0]!.widget).toBe('text')
    // 真实数据中前 3 题 item_seq 都是 1，排序需稳定
    expect(fields.slice(0, 3).map(field => field.seq)).toEqual([1, 1, 1])
    expect(fields[0]!.label).toBe('使用舒适度')
  })

  it('选项解析：草稿用 option_no、提交用 option_value 与 option_view_no', () => {
    const [field] = toQuestionFields([activity8.item_data![0]!])
    const first = field!.options[0]!
    expect(first.no).toBe('20260513185113000017')
    expect(first.value).toBe('1')
    expect(first.viewNo).toBe('A')
    expect(first.label).toBe('1')
    expect(first.serialChar).toBe('A')
  })

  it('选项缺失 option_view_no 时回退到 option_seq / 下标', () => {
    const options = toFieldOptions({
      item_no: 'x',
      option_data: [
        { option_no: 'o1', option_value: '甲', option_view_no: 'A' },
        { option_no: 'o2', option_value: '乙', option_seq: 7 },
        { option_no: 'o3', option_value: '丙' },
      ],
    })
    expect(options.map(option => option.serialChar)).toEqual(['A', '7', '3'])
  })
})

describe('mapper · 回填', () => {
  const fields = toQuestionFields(activity8.item_data)

  it('按 option_value 匹配（提交语义）', () => {
    const answers = applyBackfill(fields, [
      { item_no: '20260513185113000014', option_data: ['1'] },
    ])
    expect(answers['20260513185113000014']).toBe('20260513185113000017')
  })

  it('按 option_no 匹配（草稿语义）也能回填', () => {
    const answers = applyBackfill(fields, [
      { item_no: '20260513185113000014', option_data: ['20260513185113000017'] },
    ])
    expect(answers['20260513185113000014']).toBe('20260513185113000017')
  })

  it('数字回填去掉平台小数尾巴', () => {
    const answers = applyBackfill(fields, [
      { item_no: '20260513185113000015', option_data: ['2026.0'] },
    ])
    expect(answers['20260513185113000015']).toBe('2026')
  })

  it('未作答的题目不产生键', () => {
    const answers = applyBackfill(fields, [])
    expect(Object.keys(answers)).toHaveLength(0)
  })
})
