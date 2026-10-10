// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { applyBackfill, describeServerValue, resolveWidget, serverAnswersToAnswerMap, toFieldOptions, toMergeAnswerMap, toQuestionFields } from '@/domain/questionnaire/mapper'
import { activity5, activity8 } from '../fixtures/questionnaire'

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

/**
 * 以下用例来自变异测试：对 mapper.ts 注入小变异后有 21 处未被现有测试发现，
 * 全部集中在这些分支上。原代码本身正确，是测试没覆盖 —— 补上之后变异杀伤率
 * 从 30/51 提升到 51/51。
 */
describe('mapper · 变异测试补漏', () => {
  it('时间日期按 dateType 区分 date / time / datetime', () => {
    const attr = (dateType: string) => ({ item_no: 'a', item_type: '时间日期', item_type_attr: { dateType } })
    expect(resolveWidget(attr('time')).widget).toBe('time')
    expect(resolveWidget(attr('datetime')).widget).toBe('datetime')
    // 平台存在两种大小写写法，都要认
    expect(resolveWidget(attr('dateTime')).widget).toBe('datetime')
    expect(resolveWidget(attr('date')).widget).toBe('date')
    // 未配置时默认 date
    expect(resolveWidget({ item_no: 'a', item_type: '时间日期' }).widget).toBe('date')
  })

  it('图片、地址、引用题型的 widget 与 multi', () => {
    expect(resolveWidget({ item_no: 'a', item_type: '图片' })).toEqual({ widget: 'image', multi: true })
    expect(resolveWidget({ item_no: 'b', item_type: '地址' }).widget).toBe('address')
    expect(resolveWidget({ item_no: 'c', item_type: '引用' }).widget).toBe('ref')
  })

  it('选项的正确答案来自 option.answer === "是"', () => {
    const options = toFieldOptions({
      item_no: 'x',
      option_data: [
        { option_no: 'o1', option_value: '甲', answer: '是' },
        { option_no: 'o2', option_value: '乙', answer: '否' },
        { option_no: 'o3', option_value: '丙' },
      ],
    })
    expect(options.map(option => option.isAnswer)).toEqual([true, false, false])
  })

  it('applyBackfill 对 null / undefined / 非数组一律返回空映射', () => {
    const backfillFields = toQuestionFields(activity8.item_data)
    expect(applyBackfill(backfillFields, null)).toEqual({})
    expect(applyBackfill(backfillFields, undefined)).toEqual({})
    // 传进来的不是数组时不能抛错（历史上出现过服务端返回对象的情况）
    expect(applyBackfill(backfillFields, {} as never)).toEqual({})
  })

  it('describeServerValue：选项题还原文案、数字题去小数尾、空值返回空串', () => {
    const [optionField] = toQuestionFields([activity8.item_data![0]!])
    // 单选服务端返回的是选项序号 "1"，要还原成选项文案而不是显示 "1"
    expect(describeServerValue(optionField!, '1')).toBe('1')
    expect(describeServerValue(optionField!, '')).toBe('')
    expect(describeServerValue(optionField!, '   ')).toBe('')

    const [numberField] = toQuestionFields([activity8.item_data![1]!])
    expect(describeServerValue(numberField!, '2026.00000')).toBe('2026')

    // 匹配不上的原值要保留，便于排查而不是显示空白
    expect(describeServerValue(optionField!, '999')).toBe('999')
  })

  it('serverAnswersToAnswerMap：空白视为未作答，选项题映射回 option_no', () => {
    const fields2 = toQuestionFields([activity8.item_data![0]!])
    const itemNo = String(fields2[0]!.raw.item_no)

    expect(serverAnswersToAnswerMap(fields2, { [itemNo]: '   ' })).toEqual({})
    expect(serverAnswersToAnswerMap(fields2, { [itemNo]: '' })).toEqual({})
    expect(serverAnswersToAnswerMap(fields2, {})).toEqual({})

    const mapped = serverAnswersToAnswerMap(fields2, { [itemNo]: '1' })
    expect(mapped[fields2[0]!.key]).toEqual(['20260513185113000017'])
  })

  /**
   * 选项的 label 恰好等于服务端返回的序号时，两条实现路径会给出相同结果，
   * 无法区分「走选项匹配」与「原样返回」。这里用 label ≠ 服务端值的选项，
   * 让差异暴露出来。
   */
  it('describeServerValue：选项文案与服务端值不同时必须还原文案', () => {
    const [field] = toQuestionFields([{
      item_no: 'q',
      item_type: '单选',
      option_data: [{ option_no: 'o1', option_value: '甲', option_view_no: 'A' }],
    }])
    // 服务端返回序号 A，展示应是文案「甲」（label 取自 option_value）
    expect(describeServerValue(field!, 'A')).toBe('甲')
    expect(describeServerValue(field!, 'o1')).toBe('甲')
    // matchServerOptions 只认 viewNo / no / label，不认其它写法 —— 原值保留
    expect(describeServerValue(field!, 'v1')).toBe('v1')
    // 匹配不上时保留原值
    expect(describeServerValue(field!, 'Z')).toBe('Z')
  })

  it('describeServerValue 与 serverAnswersToAnswerMap：文本题原样返回', () => {
    const [field] = toQuestionFields([{ item_no: 't', item_type: '文本' }])
    expect(describeServerValue(field!, '一些建议')).toBe('一些建议')
    expect(serverAnswersToAnswerMap([field!], { t: '一些建议' })).toEqual({ t: '一些建议' })
  })

  it('serverAnswersToAnswerMap：svalue 为 null / undefined 时不产生键', () => {
    const [field] = toQuestionFields([{ item_no: 't', item_type: '文本' }])
    expect(serverAnswersToAnswerMap([field!], { t: null as never })).toEqual({})
    expect(serverAnswersToAnswerMap([field!], { t: undefined as never })).toEqual({})
  })

  it('serverAnswersToAnswerMap：item_no 与 index 都能作为键', () => {
    const [field] = toQuestionFields([{ item_no: 'q1', item_seq: 3, item_type: '文本' }])
    expect(serverAnswersToAnswerMap([field!], { q1: '按 item_no' })).toEqual({ q1: '按 item_no' })
    // 服务端只给 item_seq 时靠 index 兜底（item_seq 本身不参与查找，理由见下一条）
    expect(serverAnswersToAnswerMap([field!], { 1: '按 index' })).toEqual({ q1: '按 index' })
  })

  /**
   * item_seq 在真实数据里会重复（activity5 前三题都是 1），此时 field.index
   * 与 item_seq 不再一致。这里锁定的是**已知行为与限制**：
   * 用 index（1 起连续）兜底，保证一对一；而服务端按 item_seq 返回值时，
   * 重复的 item_seq 会让它自己也分不清题目 —— 属数据层缺陷，前端无法补偿。
   */
  it('serverAnswersToAnswerMap：item_seq 重复时靠 index 兜底，保持一对一', () => {
    const fields3 = toQuestionFields([
      { item_no: 'q1', item_seq: 1, item_type: '文本' },
      { item_no: 'q2', item_seq: 1, item_type: '文本' },
      { item_no: 'q3', item_seq: 1, item_type: '文本' },
    ])
    expect(fields3.map(f => f.index)).toEqual([1, 2, 3])
    expect(fields3.map(f => f.seq)).toEqual([1, 1, 1])
    // 只命中 index=1 的那道，不会因为 item_seq 相同就三题都套上同一个值
    expect(serverAnswersToAnswerMap(fields3, { 1: '值' })).toEqual({ q1: '值' })
  })

  it('applyBackfill：图片 / 引用 / 地址 / 分节符按原始值回填，多选返回数组', () => {
    const backfillFields = toQuestionFields([
      { item_no: 'img', item_seq: 1, item_type: '图片' },
      { item_no: 'ref', item_seq: 2, item_type: '引用' },
      { item_no: 'addr', item_seq: 3, item_type: '地址' },
      { item_no: 'sec', item_seq: 4, item_type: '分节符' },
    ])
    const answers = applyBackfill(backfillFields, [
      { item_no: 'img', option_data: ['a.png', 'b.png'] },
      { item_no: 'ref', option_data: ['r1'] },
      { item_no: 'addr', option_data: ['广东省/深圳市'] },
      { item_no: 'sec', option_data: ['说明文字'] },
    ])
    // 图片是 multi，返回数组
    expect(answers.img).toEqual(['a.png', 'b.png'])
    expect(answers.ref).toBe('r1')
    expect(answers.addr).toBe('广东省/深圳市')
    expect(answers.sec).toBe('说明文字')
  })

  it('toMergeAnswerMap：svalue 为 null / undefined / 空串时跳过', () => {
    expect(toMergeAnswerMap([{ item_seq: 1, svalue: null }])).toEqual({})
    expect(toMergeAnswerMap([{ item_seq: 1, svalue: undefined }])).toEqual({})
    expect(toMergeAnswerMap([{ item_seq: 1, svalue: '' }])).toEqual({})
    // 有值时才写入
    expect(toMergeAnswerMap([{ item_seq: 1, svalue: '甲' }])).toEqual({ 1: '甲' })
  })

  it('toMergeAnswerMap：item_no 与 item_seq 都写进映射，键为空则跳过', () => {
    // 两个键都写，调用方用哪个都能命中
    expect(toMergeAnswerMap([{ item_no: 'q1', item_seq: 1, svalue: '甲' }])).toEqual({ q1: '甲', 1: '甲' })
    // 键为 null / undefined / 空串时不产生对应键
    expect(toMergeAnswerMap([{ item_no: null, item_seq: 2, svalue: '乙' }])).toEqual({ 2: '乙' })
    expect(toMergeAnswerMap([{ item_no: '', item_seq: 3, svalue: '丙' }])).toEqual({ 3: '丙' })
    expect(toMergeAnswerMap([{ item_no: 'q9', item_seq: null, svalue: '丁' }])).toEqual({ q9: '丁' })
  })

  it('serverAnswersToAnswerMap：数字题去掉平台小数尾巴', () => {
    const [field] = toQuestionFields([{ item_no: 'n1', item_type: '数字' }])
    expect(serverAnswersToAnswerMap([field!], { n1: '2026.00000' })).toEqual({ n1: '2026' })
  })

  it('serverAnswersToAnswerMap：数字题带有效小数时只去尾随零，不截断有效位', () => {
    const [field] = toQuestionFields([{ item_no: 'n1', item_type: '数字' }])
    // 平台固定回传 5 位小数，小数题必须保留有效小数位：
    // 早期实现 replace(/\.0+$/) 只处理「小数全为 0」，会把 2026.50000 原样留下
    expect(serverAnswersToAnswerMap([field!], { n1: '2026.50000' })).toEqual({ n1: '2026.5' })
    expect(serverAnswersToAnswerMap([field!], { n1: '-1.20000' })).toEqual({ n1: '-1.2' })
    expect(serverAnswersToAnswerMap([field!], { n1: '0.00000' })).toEqual({ n1: '0' })
    // 已归一化或本就无小数点的值不受影响
    expect(serverAnswersToAnswerMap([field!], { n1: '2026.5' })).toEqual({ n1: '2026.5' })
    expect(serverAnswersToAnswerMap([field!], { n1: '2026' })).toEqual({ n1: '2026' })
  })

  it('applyBackfill：数字题回填同样去尾随零（详情模式走的是这条）', () => {
    const [field] = toQuestionFields([{ item_no: 'n1', item_type: '数字' }])
    const answers = applyBackfill([field!], [{ item_no: 'n1', option_data: ['2026.50000'] }])
    expect(answers).toEqual({ n1: '2026.5' })
  })

  it('toMergeAnswerMap：null / undefined 行安全跳过', () => {
    expect(toMergeAnswerMap(null)).toEqual({})
    expect(toMergeAnswerMap(undefined)).toEqual({})
    expect(toMergeAnswerMap([])).toEqual({})
  })
})
