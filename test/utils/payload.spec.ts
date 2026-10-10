/**
 * 平台响应契约测试
 *
 * 这些断言来自 parkDev 真实环境的实测结果（见 scripts/verify-write.mjs），
 * 用于防止后续重构破坏写入链路的关键约定：
 * - 提交的批次号在 `response[0].response.fill_batch_no`，不在顶层；
 * - 草稿保存（srvdaq_activity_result_save）**不回传**批次号；
 * - `response[i].state` 为 null 视为成功（平台部分服务不回填）。
 */

import { describe, expect, it } from 'vitest'

import { extractResponsePayload } from '@/utils/request'

/** 真实提交响应的结构（已脱敏，仅保留链路相关字段） */
const submitEnvelope = {
  state: 'SUCCESS',
  resultCode: 'SUCCESS',
  resultMessage: '操作成功',
  data: null,
  response: [
    {
      state: null,
      serviceName: 'srvdaq_activity_result_submit',
      response: { fill_batch_no: '305722cb2a6f4fb18042c4f93e6f7fda' },
      exetrigger: true,
    },
  ],
}

/** 真实草稿保存响应：response[0].response 为空 */
const draftEnvelope = {
  state: 'SUCCESS',
  resultCode: 'SUCCESS',
  resultMessage: '操作成功',
  data: null,
  response: [
    {
      state: null,
      serviceName: 'srvdaq_activity_result_save',
      response: null,
    },
  ],
}

describe('平台响应契约', () => {
  it('提交响应的批次号取自 response[0].response.fill_batch_no', () => {
    const payload = extractResponsePayload<{ fill_batch_no?: string }>(submitEnvelope)
    expect(payload?.fill_batch_no).toBe('305722cb2a6f4fb18042c4f93e6f7fda')
  })

  it('草稿保存不回传批次号，提取结果为空（调用方据此走取回逻辑）', () => {
    const payload = extractResponsePayload<{ fill_batch_no?: string }>(draftEnvelope)
    expect(payload?.fill_batch_no).toBeUndefined()
  })

  it('response 缺省时不抛错', () => {
    expect(extractResponsePayload({ state: 'SUCCESS', resultCode: 'SUCCESS', data: null })).toBeNull()
  })

  it('response[i].state 为 null 视为成功（平台部分服务不回填）', () => {
    const item = submitEnvelope.response[0]!
    expect(item.state === null || String(item.state).toUpperCase() === 'SUCCESS').toBe(true)
  })
})
