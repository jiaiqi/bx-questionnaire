import { describe, expect, it } from 'vitest'

import { formatQuestionTitle } from '@/domain/questionnaire'

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
})
