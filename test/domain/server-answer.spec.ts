// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { describeServerValue, serverAnswersToAnswerMap, toQuestionFields } from '@/domain/questionnaire/mapper'
import { activity8 } from '../fixtures/questionnaire'

const fields = toQuestionFields(activity8.item_data)

// activity8 只有选项类与数字类题目，文本题单独构造，避免用例依赖 fixture 的具体题型
const textField = toQuestionFields([{ item_no: 'TEXT_1', item_seq: 1, item_type: '文本' }])[0]!
const numberField = toQuestionFields([{ item_no: 'NUM_1', item_seq: 2, item_type: '数字' }])[0]!

/** 第 1 题是单选，取它的第二个选项做样本 */
const radioField = fields[0]!
const radioOption = radioField.options[1]!

describe('describeServerValue · 服务端作答值还原为文案', () => {
  it('选项题返回的是序号，必须还原成选项文案 —— 否则用户看到「我的作答：1」', () => {
    // 前提：真实数据里序号与文案确实不同，这个断言保证用例不会因数据变化而失真
    expect(radioOption.viewNo).not.toBe(radioOption.label)
    expect(describeServerValue(radioField, radioOption.viewNo)).toBe(radioOption.label)
  })

  it('也接受 option_no，兼容服务端换用另一列返回', () => {
    expect(describeServerValue(radioField, radioOption.no)).toBe(radioOption.label)
  })

  it('多个选项用逗号/分号/顿号分隔时逐个还原', () => {
    const [a, b] = radioField.options
    const expected = `${a!.label}、${b!.label}`
    expect(describeServerValue(radioField, `${a!.viewNo},${b!.viewNo}`)).toBe(expected)
    expect(describeServerValue(radioField, `${a!.viewNo};${b!.viewNo}`)).toBe(expected)
    expect(describeServerValue(radioField, `${a!.viewNo}、${b!.viewNo}`)).toBe(expected)
  })

  it('匹配不上时保留原值，便于排查而不是显示成空白', () => {
    expect(describeServerValue(radioField, '不存在的序号')).toBe('不存在的序号')
  })

  it('文本题裁剪空白后原样返回', () => {
    expect(describeServerValue(textField, '  一段作答  ')).toBe('一段作答')
  })

  it('数字题去掉平台带的小数尾巴', () => {
    expect(describeServerValue(numberField, '2026.00000')).toBe('2026')
    expect(describeServerValue(numberField, '2026')).toBe('2026')
  })

  it('空值返回空串，调用方据此走回退逻辑', () => {
    expect(describeServerValue(radioField, '')).toBe('')
    expect(describeServerValue(radioField, '   ')).toBe('')
  })
})

describe('serverAnswersToAnswerMap · 服务端作答转 AnswerMap', () => {
  it('按 item_seq 命中（真实服务返回 item_seq 而非 item_no）', () => {
    const map = serverAnswersToAnswerMap(fields, { [String(radioField.index)]: radioOption.viewNo })
    expect(map[radioField.key]).toEqual([radioOption.no])
  })

  it('按 item_no 也能命中', () => {
    const map = serverAnswersToAnswerMap(fields, { [radioField.key]: radioOption.viewNo })
    expect(map[radioField.key]).toEqual([radioOption.no])
  })

  it('数字题去掉小数尾巴，文本题原样', () => {
    // 按 item_no 命中：单独构造的题 index 都从 1 开始，用 index 会互相覆盖
    const map = serverAnswersToAnswerMap([textField, numberField], {
      [numberField.key]: '2026.00000',
      [textField.key]: '作答内容',
    })
    expect(map[numberField.key]).toBe('2026')
    expect(map[textField.key]).toBe('作答内容')
  })

  it('空值与匹配不上的选项都不写入 —— 避免把「无作答」算成「答错」', () => {
    const map = serverAnswersToAnswerMap(fields, {
      [String(radioField.index)]: '',
      [String(fields[1]!.index)]: '   ',
    })
    expect(map[radioField.key]).toBeUndefined()
    expect(map[fields[1]!.key]).toBeUndefined()
    // 纯空白同样视为无作答
    const blank = serverAnswersToAnswerMap([textField], { [String(textField.index)]: '   ' })
    expect(blank[textField.key]).toBeUndefined()
  })

  it('匹配不上的选项序号不写入（宁可算未答，也不要算错）', () => {
    const map = serverAnswersToAnswerMap(fields, { [String(radioField.index)]: '999' })
    expect(map[radioField.key]).toBeUndefined()
  })
})
