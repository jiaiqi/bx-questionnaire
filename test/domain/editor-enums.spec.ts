import { describe, expect, it } from 'vitest'

import { ACT_OPTION_OPTIONS, normalizeActOption } from '@/domain/editor/enums'

/**
 * `act_option` 的枚举与脏值归一
 *
 * 平台枚举只有「评分 / 不评分」；老编辑器误写成 `['评分', '提交确认']`，
 * 结果既配不出「不评分」问卷，又会往库里写平台不认的「提交确认」。
 */
describe('editor-enums · act_option', () => {
  it('枚举与平台一致：评分 / 不评分', () => {
    expect([...ACT_OPTION_OPTIONS]).toEqual(['评分', '不评分'])
  })

  it('合法值原样返回', () => {
    expect(normalizeActOption('评分')).toBe('评分')
    expect(normalizeActOption('不评分')).toBe('不评分')
  })

  it('历史脏值「提交确认」归一为不评分', () => {
    expect(normalizeActOption('提交确认')).toBe('不评分')
  })

  it('逗号组合按包含匹配收敛，且「不评分」优先于「评分」', () => {
    // 真实脏值：某活动 act_option = '评分,提交确认'，总分 90、及格线 100，确实是计分问卷
    expect(normalizeActOption('评分,提交确认')).toBe('评分')
    // 顺序陷阱：'不评分'.includes('评分') 为真，判定必须先看不评分
    expect(normalizeActOption('不评分,评分')).toBe('不评分')
  })

  it('空值与空白兜底为不评分', () => {
    expect(normalizeActOption('')).toBe('不评分')
    expect(normalizeActOption('   ')).toBe('不评分')
  })
})
