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

import { beforeAll, describe, expect, it, vi } from 'vitest'

import { initViewSelect } from '@/api/daq/activity'
import { recordReplyMergeSelect, recordReplySelect } from '@/api/daq/record'
import { toMergeAnswerMap, toQuestionFields } from '@/domain/questionnaire'
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

/** 有作答记录的活动（bxq 自动化测试问卷），用于验证记录类服务 */
const RECORD_ACTIVITY_NO = '20261010100256000001'

describe.skipIf(!ticket)('真实网关集成 · 只读', () => {
  /**
   * 票据有效性预检
   *
   * `skipIf` 只看票据**是否存在**，过期票据同样会让用例执行 —— 此时 7 条用例
   * 各自报 `0011 需要登录访问`，读的人得自己推断「是票据过期还是代码坏了」。
   * 这里主动探一次**需要登录态**的服务（`record_reply_merge_select`），
   * 把票据问题在入口处一次说清，并给出换票命令。
   *
   * 用不存在的批次号探测是刻意的：票据有效时它只返回空结果，
   * 不会因为「查不到数据」被误判成票据失效。
   */
  beforeAll(async () => {
    try {
      await recordReplyMergeSelect({ fillBatchNo: '00000000000000000000000000000000' })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('需要登录访问') || message.includes('0011')) {
        throw new Error(
          `联调票据已过期或无效：${message}\n`
          + '请先换票（票据约 1.5 小时滑动过期）：\n'
          + '  BX_USER=<账号> BX_PWD=<密码> node scripts/bx-login.mjs --write\n'
          + '换票后重跑：pnpm test:integration',
        )
      }
      // 其它错误（例如服务端对空批次号的业务校验）与票据无关，不阻断后续用例
    }
  })

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

  it('维度汇总可按批次号取到作答值（结果页「我的作答」的数据源）', async () => {
    // 两步都走真实接口：先取真实记录的批次号，再查它的维度汇总。
    // 这条链路是结果页「我的作答」的唯一服务端数据源，曾经静默为空。
    //
    // 注意：环境里存在「已提交但未作答」的记录（svalue 全为 null），
    // 所以不能只取第一条 —— 要找到确实有作答值的批次，否则断言的是数据而不是契约。
    const reply = await recordReplySelect({ activityNo: RECORD_ACTIVITY_NO, rownumber: 50 })
    const batches = (reply.data ?? [])
      .map(row => String(row.fill_batch_no ?? ''))
      .filter(Boolean)
    expect(batches.length).toBeGreaterThan(0)

    let hit: { batchNo: string, map: Record<string, string> } | null = null
    for (const batchNo of batches) {
      const merge = await recordReplyMergeSelect({ fillBatchNo: batchNo })
      expect(Array.isArray(merge.data)).toBe(true)
      const map = toMergeAnswerMap(merge.data)
      if (Object.keys(map).length > 0) {
        hit = { batchNo, map }
        break
      }
    }

    expect(hit, '至少应有一个批次能在维度汇总里取到作答值').not.toBeNull()

    // 该服务没有 item_no，只能靠 item_seq 定位题目（与题目行的 item_seq 对应）
    const merge = await recordReplyMergeSelect({ fillBatchNo: hit!.batchNo })
    const rows = merge.data ?? []
    expect(rows.some(row => row.item_seq !== null && row.item_seq !== undefined)).toBe(true)
  }, 60000)

  it('活动编号不存在时返回业务错误而不是静默成功', async () => {
    await expect(
      initViewSelect({ activityNo: '00000000000000000000' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('活动编号不存在') })
  }, 30000)

  it('网关地址与默认环境一致', () => {
    expect(gateway).toContain('192.168.0.214/bxapi')
  })

  /**
   * 服务端**不按调用者身份过滤数据**
   *
   * 这决定了两件事，所以必须固化下来：
   *  - `history` 页按 activity_no 查询，**匿名也能看到该活动的全部记录**；
   *  - 前端不能指望服务端做数据隔离，展示层要自己控制。
   *
   * 实测（同一活动，带票据与不带票据对比）：行数与涉及的 user_no 完全一致。
   */
  it('按 activity_no 查询不按调用者身份过滤（匿名与带票据结果一致）', async () => {
    const body = {
      serviceName: 'srvdaq_record_reply_select',
      colNames: ['user_no', 'activity_no', 'state'],
      condition: [{ colName: 'activity_no', ruleType: 'eq', value: RECORD_ACTIVITY_NO }],
      page: { pageNo: 1, rownumber: 100 },
    }
    const url = `${gateway}/daq/select/srvdaq_record_reply_select?srvdaq_record_reply_select`

    const withTicket = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'bx_auth_ticket': ticket,
        'bx-auth-ticket': ticket,
      },
      body: JSON.stringify(body),
    }).then(r => r.json() as Promise<{ data?: unknown[] }>)

    const anonymous = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json() as Promise<{ data?: unknown[] }>)

    const a = withTicket.data ?? []
    const b = anonymous.data ?? []
    expect(a.length).toBeGreaterThan(0)
    expect(b.length, '匿名查询应返回与带票据相同的行数').toBe(a.length)
  }, 30000)

  /**
   * `user_no` 条件在**无票据时被静默忽略**（返回 0 行，不报错）
   *
   * 这条曾经被误读成「该服务不支持按用户过滤」，实际上过滤完全生效，
   * 只是必须带票据。因为它**不报错**，前端无法区分「没有记录」与「没带票据」，
   * 所以开发环境票据缺失时 couple 页会一直显示空列表而没有任何线索。
   */
  it('按 user_no 查询必须带票据，否则静默返回 0 行', async () => {
    const body = {
      serviceName: 'srvdaq_record_reply_select',
      colNames: ['user_no', 'activity_no', 'state'],
      condition: [{ colName: 'user_no', ruleType: 'eq', value: 'jq' }],
      page: { pageNo: 1, rownumber: 100 },
    }
    const url = `${gateway}/daq/select/srvdaq_record_reply_select?srvdaq_record_reply_select`

    const withTicket = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'bx_auth_ticket': ticket,
        'bx-auth-ticket': ticket,
      },
      body: JSON.stringify(body),
    }).then(r => r.json() as Promise<{ state?: string, data?: unknown[] }>)

    expect(withTicket.state).toBe('SUCCESS')
    expect((withTicket.data ?? []).length, '带票据时应能查到 jq 的记录').toBeGreaterThan(0)

    const anonymous = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json() as Promise<{ state?: string, data?: unknown[] }>)

    // 关键：不报错，只是空
    expect(anonymous.state).toBe('SUCCESS')
    expect((anonymous.data ?? []).length, '无票据时 user_no 条件被静默忽略').toBe(0)
  }, 30000)
})
