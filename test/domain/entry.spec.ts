// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { shouldShowSuggestionEntry } from '@/domain/questionnaire/entry'

const BATCH = 'd9102bc941064d198405380e53431554'

describe('entry · 结果页「查看评估结果」入口', () => {
  it('评估类显示 —— 老工程提交后直接跳评估结果页，新工程必须给入口，否则报告无法到达', () => {
    expect(shouldShowSuggestionEntry('评估', BATCH)).toBe(true)
  })

  it('自测类隐藏 —— 老工程是内联显示分数，新结果页已经给了分数与逐题对错', () => {
    expect(shouldShowSuggestionEntry('自测', BATCH)).toBe(false)
  })

  it('反馈类隐藏 —— 老工程没有该按钮', () => {
    expect(shouldShowSuggestionEntry('反馈', BATCH)).toBe(false)
  })

  it('info_collect_type 缺失时放开 —— 两种误判代价不对称，宁可多一个入口', () => {
    expect(shouldShowSuggestionEntry(undefined, BATCH)).toBe(true)
    expect(shouldShowSuggestionEntry(null, BATCH)).toBe(true)
    expect(shouldShowSuggestionEntry('', BATCH)).toBe(true)
  })

  it('没有批次号一律隐藏 —— 面板缺该参数会直接拒绝加载', () => {
    expect(shouldShowSuggestionEntry('评估', '')).toBe(false)
    expect(shouldShowSuggestionEntry(undefined, '')).toBe(false)
  })

  it('取值大小写/空白不做宽容匹配 —— 平台枚举是固定中文，模糊匹配会误开入口', () => {
    expect(shouldShowSuggestionEntry(' 自测 ', BATCH)).toBe(true)
  })
})
