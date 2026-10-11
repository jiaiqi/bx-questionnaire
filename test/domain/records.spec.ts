// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { filterMyRecords, isMyRecord } from '@/domain/questionnaire/records'

const MINE = 'd9102bc941064d198405380e53431554'
const OTHERS = '4d5b54fb88144b53bd136776f6a383d3'

describe('records · isMyRecord', () => {
  it('本机产生过的批次号 → 是自己的（匿名提交拿不到稳定 user_no，只能靠这条）', () => {
    expect(isMyRecord({ fill_batch_no: MINE, user_no: 'a1b2' }, { userNo: '', myBatches: [MINE] })).toBe(true)
  })

  it('已登录且 user_no 相同 → 是自己的', () => {
    expect(isMyRecord({ fill_batch_no: OTHERS, user_no: 'jq' }, { userNo: 'jq', myBatches: [] })).toBe(true)
  })

  it('批次号与 user_no 都对不上 → 不是自己的（这就是要挡住的他人记录）', () => {
    expect(isMyRecord({ fill_batch_no: OTHERS, user_no: 'someone' }, { userNo: 'jq', myBatches: [MINE] })).toBe(false)
  })

  it('未登录且本机没记过 → 不是自己的 —— 不能因为「查不到身份」就把别人的记录当自己的放出来', () => {
    expect(isMyRecord({ fill_batch_no: OTHERS, user_no: 'someone' }, { userNo: '', myBatches: [] })).toBe(false)
  })

  it('已登录但记录没有 user_no → 不认领 —— 缺字段不等于匹配', () => {
    expect(isMyRecord({ fill_batch_no: OTHERS }, { userNo: 'jq', myBatches: [] })).toBe(false)
    expect(isMyRecord({ fill_batch_no: OTHERS, user_no: '' }, { userNo: 'jq', myBatches: [] })).toBe(false)
  })

  it('本机批次号优先于 user_no 不匹配 —— 同一浏览器换了登录账号，历史作答仍是自己的', () => {
    expect(isMyRecord({ fill_batch_no: MINE, user_no: 'old-account' }, { userNo: 'new-account', myBatches: [MINE] })).toBe(true)
  })

  it('记录没有批次号但有匹配的 user_no → 仍认领', () => {
    expect(isMyRecord({ user_no: 'jq' }, { userNo: 'jq', myBatches: [] })).toBe(true)
  })

  it('两边都是空 → 不认领', () => {
    expect(isMyRecord({}, { userNo: '', myBatches: [] })).toBe(false)
    expect(isMyRecord({ fill_batch_no: '', user_no: null }, { userNo: '', myBatches: [] })).toBe(false)
  })
})

describe('records · filterMyRecords', () => {
  it('分离出自己的记录与隐藏条数 —— 隐藏数要如实告知，否则用户以为记录丢了', () => {
    const rows = [
      { fill_batch_no: MINE, user_no: 'anon-1' },
      { fill_batch_no: OTHERS, user_no: 'anon-2' },
      { fill_batch_no: 'third', user_no: 'anon-3' },
    ]
    const result = filterMyRecords(rows, { userNo: '', myBatches: [MINE] })
    expect(result.mine).toHaveLength(1)
    expect(result.mine[0].fill_batch_no).toBe(MINE)
    expect(result.hidden).toBe(2)
  })

  it('全部是自己的 → 隐藏 0', () => {
    const rows = [{ fill_batch_no: MINE }, { fill_batch_no: 'x' }]
    const result = filterMyRecords(rows, { userNo: '', myBatches: [MINE, 'x'] })
    expect(result.mine).toHaveLength(2)
    expect(result.hidden).toBe(0)
  })

  it('一条都不是自己的 → mine 为空、hidden 等于总数（页面据此显示空态而不是别人的记录）', () => {
    const rows = [{ fill_batch_no: OTHERS }, { fill_batch_no: 'third' }]
    const result = filterMyRecords(rows, { userNo: 'jq', myBatches: [] })
    expect(result.mine).toEqual([])
    expect(result.hidden).toBe(2)
  })

  it('空列表不炸', () => {
    expect(filterMyRecords([], { userNo: 'jq', myBatches: [] })).toEqual({ mine: [], hidden: 0 })
  })

  it('保留原始对象引用 —— 调用方还要用 row.title 等字段渲染', () => {
    const row = { fill_batch_no: MINE, title: '测试问卷' }
    const result = filterMyRecords([row], { userNo: '', myBatches: [MINE] })
    expect(result.mine[0]).toBe(row)
  })
})
