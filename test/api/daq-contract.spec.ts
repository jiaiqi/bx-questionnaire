/**
 * daq 接口契约测试
 *
 * 这里每一条断言都对应一次**静默失效**的修复记录：参数写错时请求照样成功返回，
 * 页面照常渲染、lint 与类型检查照常通过，只有真实数据或截图才能发现问题。
 * 所以用单测把「请求参数长什么样」锁住，避免以后被无意改回去。
 *
 * 覆盖：
 * - init_view_select 只有 plain / use 两种模式，没有凭空推测的 biz_type=cfg；
 * - activity_cfg_update 的 condition 在请求项顶层，data 只传 status；
 * - record_reply_merge_select 只有 fill_batch_no（传 activity_no 会 CONDITION_COLUMS_NOT_EXISTS）；
 * - record_reply_select 的条件组装 / 默认排序分页；
 * - activity_sug_select 用 activity_no + 可选 fill_batch_no；
 * - record_share_add 的业务号是 biz_no 而非 activity_no；
 * - result_save 首次不带 fill_batch_no，续答才带。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { activityCfgUpdate, initViewSelect } from '@/api/daq/activity'
import {
  activitySugSelect,
  recordReplyMergeSelect,
  recordReplySelect,
  recordShareAdd,
  resultSave,
  resultSubmit,
} from '@/api/daq/record'

const mocks = vi.hoisted(() => ({
  bxSelect: vi.fn(),
  bxWrite: vi.fn(),
}))

vi.mock('@/utils/request', () => ({
  bxSelect: mocks.bxSelect,
  bxWrite: mocks.bxWrite,
}))

interface SelectArg {
  serviceName: string
  colNames?: string[]
  condition?: { colName: string }[]
  order?: unknown
  page?: unknown
}

interface WriteItem {
  serviceName: string
  condition?: unknown
  data: Record<string, unknown>[]
}

function lastSelectArg(): SelectArg {
  const calls = mocks.bxSelect.mock.calls
  return calls[calls.length - 1]?.[0] as SelectArg
}

function lastWriteArg(): [string, WriteItem[]] {
  const calls = mocks.bxWrite.mock.calls
  return calls[calls.length - 1] as [string, WriteItem[]]
}

function conditionCols(): string[] {
  return (lastSelectArg().condition ?? []).map(item => item.colName)
}

beforeEach(() => {
  mocks.bxSelect.mockReset()
  mocks.bxWrite.mockReset()
})

describe('initViewSelect', () => {
  it('默认 plain：只带 activity_no', () => {
    initViewSelect({ activityNo: 'A1' })
    expect(lastSelectArg().serviceName).toBe('srvdaq_init_view_select')
    expect(lastSelectArg().condition).toEqual([
      { colName: 'activity_no', ruleType: 'eq', value: 'A1' },
    ])
  })

  it('mode=use 时追加 type 条件', () => {
    initViewSelect({ activityNo: 'A1', mode: 'use' })
    expect(lastSelectArg().condition).toContainEqual({
      colName: 'type',
      ruleType: 'eq',
      value: 'use',
    })
  })

  it('不会出现 biz_type=cfg —— 那是凭空推测的写法，老工程没有该分支', () => {
    initViewSelect({ activityNo: 'A1' })
    expect(conditionCols()).not.toContain('biz_type')
  })

  it('题目按 item_seq 升序，否则题目顺序会乱', () => {
    initViewSelect({ activityNo: 'A1' })
    expect(lastSelectArg().order).toEqual([{ colName: 'item_seq', orderType: 'asc' }])
  })
})

describe('activityCfgUpdate', () => {
  it('condition 在请求项顶层，data 只传 status', () => {
    activityCfgUpdate('A1', '已结束')
    const [action, items] = lastWriteArg()
    expect(action).toBe('operate')
    expect(items[0]?.serviceName).toBe('srvdaq_activity_cfg_update')
    expect(items[0]?.condition).toEqual([
      { colName: 'activity_no', ruleType: 'eq', value: 'A1' },
    ])
    expect(items[0]?.data).toEqual([{ status: '已结束' }])
  })

  it('data 里不能出现 activity_no —— 主键由 condition 指定', () => {
    activityCfgUpdate('A1', '已结束')
    expect(lastWriteArg()[1][0]?.data[0]).not.toHaveProperty('activity_no')
  })
})

describe('recordReplyMergeSelect', () => {
  it('只用 fill_batch_no：该服务的服务列里没有 activity_no', () => {
    recordReplyMergeSelect({ fillBatchNo: 'B1' })
    expect(lastSelectArg().condition).toEqual([
      { colName: 'fill_batch_no', ruleType: 'eq', value: 'B1' },
    ])
    expect(conditionCols()).not.toContain('activity_no')
  })

  it('不带 order：实测传 order 会直接 FAILURE（与 record_reply_select 的静默空结果不同）', () => {
    recordReplyMergeSelect({ fillBatchNo: 'B1' })
    expect(lastSelectArg().order).toBeUndefined()
  })
})

describe('recordReplySelect', () => {
  it('按需组装条件，并给出分页', () => {
    recordReplySelect({ activityNo: 'A1', userNo: 'u1', state: '完成' })
    expect(conditionCols()).toEqual(['activity_no', 'user_no', 'state'])
    expect(lastSelectArg().page).toEqual({ pageNo: 1, rownumber: 20 })
  })

  it('默认不传 order：该服务传任何排序字段都会返回 0 条（实测静默失效）', () => {
    recordReplySelect({ activityNo: 'A1' })
    expect(lastSelectArg().order).toBeUndefined()
  })

  it('调用方显式要求时才带上 order', () => {
    recordReplySelect({ activityNo: 'A1', order: [{ colName: 'start_time', ruleType: 'desc' }] })
    expect(lastSelectArg().order).toEqual([{ colName: 'start_time', ruleType: 'desc' }])
  })

  it('传入的条件都可被裁剪，不传即不拼', () => {
    recordReplySelect({ fillBatchNo: 'B1', rownumber: 50, pageNo: 2 })
    expect(conditionCols()).toEqual(['fill_batch_no'])
    expect(lastSelectArg().page).toEqual({ pageNo: 2, rownumber: 50 })
  })

  /**
   * user_no 是「按用户维度查询」的条件，而平台对这类查询额外要求调用者的会话身份，
   * 无会话时会静默返回空结果。因此空值必须视为「不过滤」，否则会传 user_no eq ''
   * 把本该显示全部记录的场景变成一条都查不到。
   */
  it('userNo 为空字符串时不拼 user_no 条件', () => {
    recordReplySelect({ activityNo: 'A1', userNo: '' })
    expect(conditionCols()).toEqual(['activity_no'])
  })

  it('userNo 为 undefined 时不拼 user_no 条件', () => {
    recordReplySelect({ activityNo: 'A1', userNo: undefined })
    expect(conditionCols()).toEqual(['activity_no'])
  })
})

describe('activitySugSelect', () => {
  it('activity_no 必传，fill_batch_no 可选', () => {
    activitySugSelect({ activityNo: 'A1' })
    expect(conditionCols()).toEqual(['activity_no'])

    activitySugSelect({ activityNo: 'A1', fillBatchNo: 'B1' })
    expect(conditionCols()).toEqual(['activity_no', 'fill_batch_no'])
  })
})

describe('recordShareAdd', () => {
  it('业务号是 biz_no，不是 activity_no', () => {
    recordShareAdd({ bizNo: 'A1', shareType: '好友' })
    const [action, items] = lastWriteArg()
    expect(action).toBe('add')
    expect(items[0]?.data[0]).toMatchObject({
      biz_no: 'A1',
      biz_type: 'daq',
      share_type: '好友',
    })
    expect(items[0]?.data[0]).not.toHaveProperty('activity_no')
  })

  it('分享渠道不提供默认值：避免把好友分享静默记成朋友圈', () => {
    // @ts-expect-error shareType 为必填，此处刻意不传，验证不会臆造出「朋友圈」
    recordShareAdd({ bizNo: 'A1' })
    const data = lastWriteArg()[1][0]?.data[0]
    expect(data?.share_type).toBeUndefined()
  })
})

describe('resultSave', () => {
  it('首次保存不带 fill_batch_no（由响应回传批次号）', () => {
    resultSave({ activityNo: 'A1', itemData: [{ item_no: 'col1', option_data: ['opt1'] }] })
    const data = lastWriteArg()[1][0]?.data[0]
    expect(data).toMatchObject({ activity_no: 'A1' })
    expect(data).not.toHaveProperty('fill_batch_no')
  })

  it('续答时带上 fill_batch_no', () => {
    resultSave({ activityNo: 'A1', fillBatchNo: 'B1', itemData: [] })
    expect(lastWriteArg()[1][0]?.data[0]).toMatchObject({ fill_batch_no: 'B1' })
  })
})

describe('result_submit · 登记表单字段', () => {
  it('extra 里的非空字段进入 data[0]，空值不带进去', async () => {
    mocks.bxWrite.mockResolvedValue({})
    await resultSubmit({
      activityNo: 'A1',
      fillBatchNo: 'B1',
      itemData: [],
      extra: { company: '某单位', user_name: '张三', user_phone: '' },
    })

    const items = mocks.bxWrite.mock.calls[0]?.[1] as Array<{ data: Array<Record<string, unknown>> }>
    expect(items[0]!.data[0]).toMatchObject({
      activity_no: 'A1',
      fill_batch_no: 'B1',
      company: '某单位',
      user_name: '张三',
    })
    // 空值不能写进结果表
    expect(items[0]!.data[0]).not.toHaveProperty('user_phone')
  })

  it('不传 extra 时请求体保持原样', async () => {
    mocks.bxWrite.mockResolvedValue({})
    await resultSubmit({ activityNo: 'A1', itemData: [] })

    const items = mocks.bxWrite.mock.calls[0]?.[1] as Array<{ data: Array<Record<string, unknown>> }>
    expect(Object.keys(items[0]!.data[0]!).sort()).toEqual(['activity_no', 'item_data'])
  })
})
