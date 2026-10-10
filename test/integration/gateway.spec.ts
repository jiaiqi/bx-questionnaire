// @vitest-environment node

/**
 * 真实网关集成测试
 *
 * 只在存在票据时执行（票据来自 .env.local 或环境变量），
 * 用于验证「请求层 + 接口层 + 领域映射」在真实数据上端到端可用。
 * 仅调用只读 select，不产生任何业务数据。
 *
 * 运行：确保 .env.local 内有 VITE_BX_TICKET，然后 pnpm test
 */

import { describe, expect, it, vi } from 'vitest'

import { initViewSelect } from '@/api/daq/activity'
import { toQuestionFields } from '@/domain/questionnaire'
import { bxSelect } from '@/utils/request'

const ticket = (import.meta.env.VITE_BX_TICKET as string | undefined) || process.env.BX_TICKET || ''
const gateway = (import.meta.env.VITE_BX_GATEWAY as string | undefined) || 'http://192.168.0.214/bxapi'

interface UniRequestOptions {
  url: string
  method: string
  data: string
  header: Record<string, string>
  success: (res: { statusCode: number, data: unknown }) => void
  fail: (err: { errMsg: string }) => void
}

// 用真实 fetch 实现 uni.request 的语义，让请求层在 Node 环境下直连网关
vi.stubGlobal('uni', {
  request: (options: UniRequestOptions) => {
    void fetch(options.url, {
      method: options.method,
      headers: options.header,
      body: options.data,
    })
      .then(async (response) => {
        options.success({ statusCode: response.status, data: await response.json() })
      })
      .catch((error: unknown) => {
        options.fail({ errMsg: error instanceof Error ? error.message : String(error) })
      })
  },
  getStorageSync: (key: string) => (key === 'bx_auth_ticket' ? ticket : ''),
  setStorageSync: () => {},
  removeStorageSync: () => {},
})

/** 真实环境存在的进行中活动（测试11123） */
const ACTIVITY_NO = '20260513185113000009'

describe.skipIf(!ticket)('真实网关集成 · 只读', () => {
  it('网关可达且票据有效（裸请求层）', async () => {
    const envelope = await bxSelect({
      serviceName: 'srvdaq_init_view_select',
      colNames: ['*'],
      condition: [{ colName: 'activity_no', ruleType: 'eq', value: ACTIVITY_NO }],
    })

    expect(envelope.state).toBe('SUCCESS')
    expect(envelope.data?.[0]?.activity_no).toBe(ACTIVITY_NO)
  }, 30000)

  it('真实题目可被 mapper 转成字段，选项主键完整', async () => {
    const envelope = await initViewSelect({ activityNo: ACTIVITY_NO })
    const row = envelope.data?.[0]

    expect(row?.activity_no).toBe(ACTIVITY_NO)

    const fields = toQuestionFields(row?.item_data ?? [])
    expect(fields.length).toBeGreaterThan(0)

    for (const field of fields) {
      expect(field.key).toBeTruthy()
      expect(field.widget).toBeTruthy()
      expect(typeof field.index).toBe('number')
    }

    // 选项题的每个选项都必须能拿到 option_no（提交与草稿都依赖它）。
    // 注意：真实数据里存在「单选但未配置任何选项」的题目，属数据侧问题，
    // 前端在 BxOptionList 里给出「该题暂无可选项」提示而不是静默留白。
    const optionFields = fields.filter(field => field.widget === 'radio' || field.widget === 'checkbox')
    const withOptions = optionFields.filter(field => field.options.length > 0)
    expect(withOptions.length).toBeGreaterThan(0)
    for (const field of withOptions) {
      expect(field.options.every(option => !!option.no)).toBe(true)
      expect(field.options.every(option => !!option.label)).toBe(true)
    }
  }, 30000)

  it('活动编号不存在时返回业务错误而不是静默成功', async () => {
    await expect(
      initViewSelect({ activityNo: '00000000000000000000' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('活动编号不存在') })
  }, 30000)

  it('网关地址与默认环境一致', () => {
    expect(gateway).toContain('192.168.0.214/bxapi')
  })
})
