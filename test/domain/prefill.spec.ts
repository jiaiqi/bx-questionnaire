import { describe, expect, it } from 'vitest'

import { matchEntryPrefill } from '@/domain/questionnaire/prefill'

/**
 * 登记信息预填的匹配逻辑
 *
 * 这段逻辑原先埋在 `QuestionnaireRunner` 里，而测试活动的题目标题不含
 * 「单位 / 姓名 / 电话 / 手机」，无法在真实数据上触发，因此只能靠单测保证。
 */
describe('matchEntryPrefill', () => {
  const entry = {
    company: '某某单位',
    user_name: '张三',
    user_phone: '13800138000',
  }

  it('标题含「单位」时用 company 预填', () => {
    expect(matchEntryPrefill('所属单位', entry)).toBe('某某单位')
    expect(matchEntryPrefill('单位名称', entry)).toBe('某某单位')
  })

  it('标题含「姓名」时用 user_name 预填', () => {
    expect(matchEntryPrefill('姓名', entry)).toBe('张三')
    expect(matchEntryPrefill('您的姓名是？', entry)).toBe('张三')
  })

  it('标题含「电话」或「手机」时都用 user_phone 预填', () => {
    expect(matchEntryPrefill('联系电话', entry)).toBe('13800138000')
    expect(matchEntryPrefill('手机号码', entry)).toBe('13800138000')
  })

  it('标题不含任何关键词时返回 undefined', () => {
    expect(matchEntryPrefill('请留下你的建议', entry)).toBeUndefined()
    expect(matchEntryPrefill('今年是哪一年？', entry)).toBeUndefined()
    expect(matchEntryPrefill('你更喜欢哪种沟通方式？', entry)).toBeUndefined()
  })

  it('空标题返回 undefined', () => {
    expect(matchEntryPrefill('', entry)).toBeUndefined()
  })

  it('对应登记项为空时不预填，也不会退化成别的字段', () => {
    expect(matchEntryPrefill('所属单位', { user_name: '张三' })).toBeUndefined()
    expect(matchEntryPrefill('联系电话', { company: '某某单位' })).toBeUndefined()
    expect(matchEntryPrefill('姓名', {})).toBeUndefined()
  })

  it('命中多个关键词时取规则顺序里靠前的那个', () => {
    // 「单位」在规则中先于「姓名」，因此「单位姓名」取 company
    expect(matchEntryPrefill('单位姓名', entry)).toBe('某某单位')
    // 「电话」先于「手机」，两者本就指向同一字段，此处确认不会串到别的字段
    expect(matchEntryPrefill('电话手机', entry)).toBe('13800138000')
  })

  /**
   * 这条区分了「跳过空值」与「命中即停」两种实现：
   * 标题同时含「单位」和「姓名」，但登记信息里只有 user_name ——
   * 若不做空值跳过，会在「单位」上停下并返回 undefined，把本可预填的姓名也丢掉。
   */
  it('靠前的规则对应值为空时，继续匹配靠后的规则', () => {
    expect(matchEntryPrefill('单位姓名', { user_name: '张三' })).toBe('张三')
    expect(matchEntryPrefill('单位电话', { user_phone: '13800138000' })).toBe('13800138000')
    expect(matchEntryPrefill('姓名电话', { user_phone: '13800138000' })).toBe('13800138000')
  })

  it('关键词需要连续出现，不做单字匹配', () => {
    expect(matchEntryPrefill('单据位置', entry)).toBeUndefined()
    expect(matchEntryPrefill('姓氏名称', entry)).toBeUndefined()
  })
})
