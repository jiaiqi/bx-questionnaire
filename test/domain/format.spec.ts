import { describe, expect, it } from 'vitest'

import { formatDateTime, formatQuestionTitle } from '@/domain/questionnaire'

describe('formatQuestionTitle', () => {
  it('标题已带序号时原样返回，不再重复拼接', () => {
    expect(formatQuestionTitle(1, '1. 单选题：你更喜欢哪种沟通方式？'))
      .toBe('1. 单选题：你更喜欢哪种沟通方式？')
  })

  it('标题没有序号时才补上序号', () => {
    expect(formatQuestionTitle(2, '多选题：你使用过以下哪些功能？'))
      .toBe('2. 多选题：你使用过以下哪些功能？')
  })

  it('识别顿号、右括号等常见序号写法', () => {
    expect(formatQuestionTitle(3, '3、填空题')).toBe('3、填空题')
    expect(formatQuestionTitle(4, '4) 数字题')).toBe('4) 数字题')
    expect(formatQuestionTitle(5, '5）地址题')).toBe('5）地址题')
  })

  it('标题为空时退化为光秃秃的序号', () => {
    expect(formatQuestionTitle(6, '')).toBe('6.')
    expect(formatQuestionTitle(7, null)).toBe('7.')
    expect(formatQuestionTitle(8, undefined)).toBe('8.')
  })

  it('先裁剪首尾空白再判断，避免「 1. 题干」被误判为无序号', () => {
    expect(formatQuestionTitle(1, '  1. 题干  ')).toBe('1. 题干')
    expect(formatQuestionTitle(1, '   题干  ')).toBe('1. 题干')
  })

  it('index 为 0 时不拼序号 —— 分节符不占题号，否则会渲染成「0. 分节标题」', () => {
    expect(formatQuestionTitle(0, '第一部分')).toBe('第一部分')
    expect(formatQuestionTitle(0, '1. 已带序号的分节')).toBe('1. 已带序号的分节')
    // 字符串 '0' 与数字 0 都要挡住
    expect(formatQuestionTitle('0', '第二部分')).toBe('第二部分')
  })

  it('index 为 0 且标题为空时返回空串，而不是「0.」', () => {
    expect(formatQuestionTitle(0, '')).toBe('')
    expect(formatQuestionTitle(0, null)).toBe('')
  })
})

describe('formatDateTime', () => {
  it('裁剪到分钟精度', () => {
    expect(formatDateTime('2026-10-10 10:03:10')).toBe('2026-10-10 10:03')
  })

  it('短于 16 位时原样返回', () => {
    expect(formatDateTime('2026-10-10')).toBe('2026-10-10')
  })

  it('空值返回空串，调用方可用它决定是否渲染', () => {
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
  })

  it('只做字符串裁剪，不走 new Date —— 否则 iOS/微信小程序会得到 Invalid Date', () => {
    const out = formatDateTime('2026-10-10 10:03:10')
    expect(out).not.toContain('Invalid')
    expect(out).not.toContain('NaN')
  })
})
