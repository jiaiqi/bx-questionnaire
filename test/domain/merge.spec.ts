/**
 * 维度汇总映射测试
 *
 * 锁定 parkDev 实测契约（见 scripts/probe-services.mjs 与方案文档 §11）：
 * - srvdaq_record_reply_merge_select 的题目维度用 item_seq 标识，**没有 item_no**；
 * - 作答值在 svalue，单选/多选存 option_value。
 *
 * 这两个契约此前各错一次（先传了不存在的 activity_no 条件列，后用 item_no 做键），
 * 且都是静默失效 —— 结果页照常渲染，只是维度汇总永远为空。
 */

import { describe, expect, it } from 'vitest'

import { toMergeAnswerMap } from '@/domain/questionnaire'

describe('toMergeAnswerMap', () => {
  it('按 item_seq 建立「序号 → 作答值」映射', () => {
    const map = toMergeAnswerMap([
      { item_seq: 1, svalue: '1' },
      { item_seq: 2, svalue: 'A,B' },
    ])
    expect(map).toEqual({ 1: '1', 2: 'A,B' })
  })

  it('跳过空序号与空作答值', () => {
    const map = toMergeAnswerMap([
      { item_seq: null, svalue: 'x' },
      { item_seq: undefined, svalue: 'y' },
      { item_seq: 3, svalue: null },
      { item_seq: 4, svalue: '' },
      { item_seq: 5, svalue: 'ok' },
    ])
    expect(map).toEqual({ 5: 'ok' })
  })

  it('空输入不抛错', () => {
    expect(toMergeAnswerMap(undefined)).toEqual({})
    expect(toMergeAnswerMap(null)).toEqual({})
    expect(toMergeAnswerMap([])).toEqual({})
  })

  it('数值作答值统一转成字符串（svalue 可能返回数字）', () => {
    const map = toMergeAnswerMap([{ item_seq: 6, svalue: '2026' }])
    expect(map['6']).toBe('2026')
    expect(typeof map['6']).toBe('string')
  })
})
