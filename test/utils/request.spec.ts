// @vitest-environment node

/**
 * 请求层单测
 *
 * 通过 stub `uni.request` 验证 URL / header / 错误码策略，不依赖真实网关。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bxSelect, bxWrite, extractResponsePayload, setSessionExpiredHandler } from '@/utils/request'
import { ENV, resolveGateway, resolveTicket } from '@/utils/request/env'

interface RequestOptions {
  url: string
  method: string
  data: string
  header: Record<string, string>
  timeout: number
  success: (res: { statusCode: number, data: unknown }) => void
  fail: (err: { errMsg?: string }) => void
}

const requestMock = vi.fn<(options: RequestOptions) => void>()
const getStorageSync = vi.fn<(key: string) => unknown>(() => '')
const setStorageSync = vi.fn()
const removeStorageSync = vi.fn()

vi.stubGlobal('uni', {
  request: requestMock,
  getStorageSync,
  setStorageSync,
  removeStorageSync,
})

function respondWith(envelope: unknown, statusCode = 200): void {
  requestMock.mockImplementation((options) => {
    options.success({ statusCode, data: envelope })
  })
}

/**
 * 安装最小 window 桩（模拟「被 iframe 嵌入」）
 *
 * 刻意不用 `vi.stubGlobal` + `vi.unstubAllGlobals`：后者会把文件级安装的 `uni` 桩
 * 一并撤掉，导致后续所有用例报 `uni is not defined`。
 * 这里只接管 `window` 一个键，并原样还原。
 */
function stubEmbedWindow(): { posted: Array<{ message: unknown }>, restore: () => void } {
  const posted: Array<{ message: unknown }> = []
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      // self 与 top 是不同对象 → self !== top → 判定为嵌入
      self: {},
      top: {},
      parent: { postMessage: (message: unknown) => posted.push({ message }) },
    },
  })
  return {
    posted,
    restore: () => {
      if (original) {
        Object.defineProperty(globalThis, 'window', original)
      }
      else {
        delete (globalThis as Record<string, unknown>).window
      }
    },
  }
}

function lastCall(): RequestOptions {
  const call = requestMock.mock.calls.at(-1)
  if (!call) {
    throw new Error('uni.request 未被调用')
  }
  return call[0]
}

describe('request · 基础约定', () => {
  beforeEach(() => {
    requestMock.mockReset()
    getStorageSync.mockReset()
    getStorageSync.mockReturnValue('')
  })

  it('select 的 URL、票据双 header 与请求体符合平台约定', async () => {
    getStorageSync.mockReturnValue('ticket-abc')
    respondWith({ state: 'SUCCESS', resultCode: '0000', data: [], page: { total: 0, pageNo: 1, rownumber: 20 } })

    await bxSelect({ serviceName: 'srvdaq_init_view_select', colNames: ['*'] })

    const options = lastCall()
    expect(options.url).toBe('http://192.168.0.214/bxapi/daq/select/srvdaq_init_view_select?srvdaq_init_view_select')
    expect(options.method).toBe('POST')
    expect(options.timeout).toBe(20000)
    expect(options.header.bx_auth_ticket).toBe('ticket-abc')
    expect(options.header['bx-auth-ticket']).toBe('ticket-abc')
    expect(JSON.parse(options.data)).toMatchObject({
      serviceName: 'srvdaq_init_view_select',
      colNames: ['*'],
    })
  })

  it('select 的 params.app 决定 URL 里的应用段（不是只当请求体字段）', async () => {
    respondWith({ state: 'SUCCESS', resultCode: '0000', data: [], page: { total: 0, pageNo: 1, rownumber: 20 } })

    await bxSelect({ serviceName: 'srvconfig_area_adj_select', app: 'config', colNames: ['*'], condition: [] })

    const options = lastCall()
    // 这条断言是防回归的核心：早先 bxSelect 只从第二个参数读 app，
    // 于是 params.app 被静默忽略、URL 用了默认的 daq，服务返回「无权限访问」，
    // 地址题永远显示「暂无地区数据」。而 params 整体又是请求体，
    // body 里 app:'config' 看着完全正确 —— 只有断言 URL 才抓得到。
    expect(options.url).toBe('http://192.168.0.214/bxapi/config/select/srvconfig_area_adj_select?srvconfig_area_adj_select')
    expect(options.url).not.toContain('/daq/')
  })

  it('select 不传 app 时回落到默认应用', async () => {
    respondWith({ state: 'SUCCESS', resultCode: '0000', data: [], page: { total: 0, pageNo: 1, rownumber: 20 } })

    await bxSelect({ serviceName: 'srvdaq_init_view_select', colNames: ['*'] })

    expect(lastCall().url).toContain('/daq/select/srvdaq_init_view_select')
  })

  it('第二个参数的 app 优先级高于 params.app', async () => {
    respondWith({ state: 'SUCCESS', resultCode: '0000', data: [], page: { total: 0, pageNo: 1, rownumber: 20 } })

    await bxSelect(
      { serviceName: 'srvconfig_area_adj_select', app: 'config', colNames: ['*'] },
      { app: 'other' },
    )

    expect(lastCall().url).toContain('/other/select/srvconfig_area_adj_select')
  })

  it('写操作 URL 不带 select 后缀，请求体为数组', async () => {
    respondWith({ state: 'SUCCESS', resultCode: '0000', data: null, response: [{ state: 'SUCCESS', response: {} }] })

    await bxWrite('operate', [{ serviceName: 'srvdaq_activity_result_save', data: [{ activity_no: 'A1' }] }])

    const options = lastCall()
    expect(options.url).toBe('http://192.168.0.214/bxapi/daq/operate/srvdaq_activity_result_save')
    expect(Array.isArray(JSON.parse(options.data))).toBe(true)
  })
})

describe('request · 错误策略', () => {
  beforeEach(() => {
    requestMock.mockReset()
    getStorageSync.mockReset()
    getStorageSync.mockReturnValue('ticket-abc')
    removeStorageSync.mockReset()
  })

  it('0011 会话过期：抛错、清票据并回调，不重试', async () => {
    const handler = vi.fn()
    setSessionExpiredHandler(handler)
    respondWith({ state: 'FAILURE', resultCode: '0011', resultMessage: '需要登录访问', data: null })

    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      code: '0011',
      message: '需要登录访问',
    })

    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(removeStorageSync).toHaveBeenCalledWith('bx_auth_ticket')
    expect(handler).toHaveBeenCalledTimes(1)
    setSessionExpiredHandler(null)
  })

  /**
   * 嵌入场景：子页掉线必须让父页面知道，否则父页面以为一切正常，
   * 用户看到的是「填完了但提交没反应」（契约 9.3）。
   *
   * 必须带 window 桩才有效 —— 不带桩时 `notifyParent` 在 node 环境本来就会早返回，
   * 无论有没有接线都通过，等于没测。
   */
  it('0011 会话过期：通知父页面 TICKET_EXPIRED', async () => {
    const { posted, restore } = stubEmbedWindow()
    try {
      respondWith({ state: 'FAILURE', resultCode: '0011', resultMessage: '需要登录访问', data: null })

      await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
        code: '0011',
      })

      expect(posted).toHaveLength(1)
      expect(posted[0].message).toMatchObject({ type: 'TICKET_EXPIRED' })
    }
    finally {
      restore()
    }
  })

  it('非 0011 的业务失败不通知父页面 —— 字段不存在与掉线是两回事，混报会让父页面无端跳登录', async () => {
    const { posted, restore } = stubEmbedWindow()
    try {
      respondWith({
        state: 'FAILURE',
        resultCode: 'SEARCH_COLUMS_NOT_EXISTS',
        resultMessage: '字段不存在',
        data: null,
      })

      await expect(bxSelect({ serviceName: 'srvdaq_record_reply_select' })).rejects.toMatchObject({
        code: 'SEARCH_COLUMS_NOT_EXISTS',
      })

      expect(posted).toEqual([])
    }
    finally {
      restore()
    }
  })

  /**
   * 必须同时断言 message：变异测试把 `status === 429` 改成 `430` 后，
   * 请求会落到下面的 `status >= 400 && !envelope` 分支，code 仍是 '429'
   * （`String(status)`），只断言 code 的测试全绿 —— 但提示语会从
   * 「请求过于频繁」变成「服务异常（HTTP 429）」，把限流误报成服务故障。
   */
  it('429 限流不重试，错误码为 429 且提示限流而非服务异常', async () => {
    respondWith(null, 429)
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      code: '429',
      message: '请求过于频繁，请稍后再试',
    })
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('429 带业务信封时同样按限流处理（不被信封的 resultMessage 覆盖）', async () => {
    respondWith({ state: 'FAILURE', resultCode: '429', resultMessage: '网关限流', data: null }, 429)
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      code: '429',
      message: '请求过于频繁，请稍后再试',
    })
  })

  /**
   * `status >= 400` 在 `failed` 计算里的那一份（第三个条件）。
   * 前两个条件（state === 'FAILURE'、FAILURE_CODES.has(code)）都为假时，
   * 只有 HTTP 状态能把这次调用判成失败 —— 必须单独覆盖，否则
   * 改成 `>= 401` 也不会有测试变红（用 500 测不出，500 同时满足两者）。
   */
  it('响应 400 但业务信封自称成功时仍判失败（状态码兜底不可少）', async () => {
    respondWith({ state: 'SUCCESS', resultCode: '0000', resultMessage: '', data: null }, 400)
    // code 取自信封的 resultCode（'0000'），不是 HTTP 状态 —— 关键是它**抛错了**
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      code: '0000',
      message: '请求失败',
    })
  })

  it('响应 200 且业务信封自称成功时正常返回，不被状态码判断误伤', async () => {
    respondWith({ state: 'SUCCESS', resultCode: '0000', resultMessage: '', data: { ok: true } }, 200)
    const res = await bxSelect<{ ok: boolean }>({ serviceName: 'srvdaq_init_view_select' })
    expect(res.data).toEqual({ ok: true })
  })

  it('响应 400 且无信封时按服务异常处理（边界值）', async () => {
    respondWith(null, 400)
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      code: '400',
      message: '服务异常（HTTP 400）',
    })
  })

  it('响应 400 但带业务信封时仍以信封为准（边界值）', async () => {
    respondWith({ state: 'FAILURE', resultCode: '0111', resultMessage: '参数错误', data: null }, 400)
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      message: '参数错误',
    })
  })

  /**
   * `res.statusCode ?? 0` 的兜底：statusCode 缺失时不能变成 truthy 值，
   * 否则会误判成「HTTP 4xx」把正常的无信封响应说成服务异常。
   */
  it('statusCode 缺失时按 0 处理，报「服务无响应」而不是服务异常', async () => {
    requestMock.mockImplementation((options) => {
      options.success({ statusCode: undefined as unknown as number, data: null })
    })
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
      message: '服务无响应',
    })
  })

  it('网络失败转成 NETWORK 错误', async () => {
    requestMock.mockImplementation((options) => {
      options.fail({ errMsg: 'request:fail timeout' })
    })
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      code: 'NETWORK',
      message: 'request:fail timeout',
    })
  })

  it('业务失败透出 resultMessage', async () => {
    respondWith({ state: 'FAILURE', resultCode: 'FAILURE', resultMessage: '活动编号不存在', data: null })
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      message: '活动编号不存在',
    })
  })

  /**
   * 三条共同锁定「HTTP 状态」与「有无信封」的组合判断（toBxError 的开头几行）。
   * 变异测试发现这处分界此前没被覆盖：把 `status >= 400 && !envelope` 改成 `||`
   * 后测试全绿 —— 而那会让「HTTP 4xx 但带业务信封」被误报成服务异常，
   * 丢掉服务端真正给出的 resultMessage。
   */
  it('响应 4xx 但带业务信封时，仍以信封的 resultMessage 为准', async () => {
    respondWith({ state: 'FAILURE', resultCode: '0011', resultMessage: '需要登录访问', data: null }, 500)
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      message: '需要登录访问',
    })
  })

  it('响应 4xx 且无信封时报「服务异常」并带上状态码', async () => {
    respondWith(null, 500)
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      code: '500',
      message: '服务异常（HTTP 500）',
    })
  })

  it('响应 2xx 但无信封时报「服务无响应」', async () => {
    respondWith(null, 200)
    await expect(bxSelect({ serviceName: 'srvdaq_init_view_select' })).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
      message: '服务无响应',
    })
  })
})

describe('request · operate 逐项校验', () => {
  beforeEach(() => {
    requestMock.mockReset()
    getStorageSync.mockReset()
    getStorageSync.mockReturnValue('')
  })

  it('顶层 SUCCESS 但子项 FAILURE 时抛错', async () => {
    respondWith({
      state: 'SUCCESS',
      resultCode: '0000',
      data: null,
      response: [{ state: 'FAILURE', resultCode: 'FAILURE', resultMessage: '保存失败' }],
    })

    await expect(bxWrite('operate', [{ serviceName: 'srvdaq_activity_result_save', data: [] }]))
      .rejects
      .toMatchObject({ message: '保存失败' })
  })

  it('子项 state 为 null 视为成功（平台部分服务不回填）', async () => {
    respondWith({
      state: 'SUCCESS',
      resultCode: '0000',
      data: null,
      response: [{ state: null, response: { fill_batch_no: 'FB1' } }],
    })

    const envelope = await bxWrite('operate', [{ serviceName: 'srvdaq_activity_result_save', data: [] }])
    expect(envelope.response?.[0]?.response?.fill_batch_no).toBe('FB1')
  })
})

describe('resolveTicket（票据优先级）', () => {
  it('本地存储有票据时优先用它', () => {
    getStorageSync.mockReturnValue('from-storage')
    expect(resolveTicket()).toBe('from-storage')
  })

  it('本地存储为空时回退到构建期 VITE_BX_TICKET（ENV.devTicket）', () => {
    getStorageSync.mockReturnValue('')
    expect(resolveTicket()).toBe(ENV.devTicket)
  })

  it('请求头走 resolveTicket，不再内联同一段逻辑', () => {
    getStorageSync.mockReturnValue('header-ticket')
    bxSelect({ serviceName: 'srvdaq_activity_cfg_select' })

    const header = requestMock.mock.calls.at(-1)?.[0].header
    expect(header?.bx_auth_ticket).toBe('header-ticket')
    expect(header?.['bx-auth-ticket']).toBe('header-ticket')
  })
})

/**
 * extractResponsePayload 是写路径回填批次号的关键：提交后服务端把
 * `fill_batch_no` 放在 `response[0].response` 里。`?.[0]` 改成 `?.[1]`
 * 后取值恒为 undefined，提交拿不到批次号 —— 但只有单元素响应的用例能发现。
 */
describe('extractResponsePayload（批量响应取值）', () => {
  it('取 response[0].response 这一层，返回服务端回填的数据', () => {
    const envelope = {
      state: 'SUCCESS',
      response: [{ serviceName: 'srvdaq_activity_result_submit', response: { fill_batch_no: 'abc123' } }],
    }
    expect(extractResponsePayload<{ fill_batch_no: string }>(envelope as never))
      .toEqual({ fill_batch_no: 'abc123' })
  })

  it('单元素数组必须取第 0 项 —— 取第 1 项会恒为 undefined', () => {
    const envelope = { state: 'SUCCESS', response: [{ response: { fill_batch_no: 'only-one' } }] }
    expect(extractResponsePayload(envelope as never)).toEqual({ fill_batch_no: 'only-one' })
  })

  it('response 为空数组时返回 null', () => {
    expect(extractResponsePayload({ state: 'SUCCESS', response: [] } as never)).toBeNull()
  })

  it('response 缺失时返回 null', () => {
    expect(extractResponsePayload({ state: 'SUCCESS' } as never)).toBeNull()
    expect(extractResponsePayload({ state: 'SUCCESS', response: null } as never)).toBeNull()
  })

  it('子项没有 response 字段时返回 null，不抛异常', () => {
    expect(extractResponsePayload({ state: 'SUCCESS', response: [{}] } as never)).toBeNull()
  })

  it('子项 response 为 null 时返回 null', () => {
    expect(extractResponsePayload({ state: 'SUCCESS', response: [{ response: null }] } as never)).toBeNull()
  })

  it('多元素时只取第一个（平台 operate 逐项校验另行处理）', () => {
    const envelope = {
      state: 'SUCCESS',
      response: [{ response: { first: true } }, { response: { second: true } }],
    }
    expect(extractResponsePayload(envelope as never)).toEqual({ first: true })
  })
})

/**
 * resolveGateway 的去斜杠与宿主注入优先级。
 *
 * `.env.test` 里的网关不带末尾斜杠，所以 `gateway.endsWith('/')` 恒为 false，
 * else 分支从未被走到 —— `slice(0, -1)` 改成 `slice(1, -1)` 时测试全绿，
 * 而那会把 `http://x.com/` 砍成 `ttp://x.com`，网关地址丢掉首字符。
 * 必须显式构造「带末尾斜杠」的输入。
 */
describe('resolveGateway（去斜杠与宿主注入）', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as Record<string, unknown>).window
  })

  it('网关带末尾斜杠时去掉它，且不误伤首字符', () => {
    vi.stubEnv('VITE_BX_GATEWAY', 'http://example.com/bxapi/')
    expect(resolveGateway()).toBe('http://example.com/bxapi')
  })

  it('多个末尾斜杠只去掉一个（保留其余部分不做递归清理）', () => {
    vi.stubEnv('VITE_BX_GATEWAY', 'http://example.com/bxapi//')
    expect(resolveGateway()).toBe('http://example.com/bxapi/')
  })

  it('网关不带末尾斜杠时原样返回', () => {
    vi.stubEnv('VITE_BX_GATEWAY', 'http://example.com/bxapi')
    expect(resolveGateway()).toBe('http://example.com/bxapi')
  })

  it('首尾空白被裁掉', () => {
    vi.stubEnv('VITE_BX_GATEWAY', '  http://example.com/bxapi  ')
    expect(resolveGateway()).toBe('http://example.com/bxapi')
  })

  it('空网关抛错，不退化成默认值（避免生产静默连内网）', () => {
    vi.stubEnv('VITE_BX_GATEWAY', '')
    expect(() => resolveGateway()).toThrow('未配置网关地址')
  })

  it('宿主注入的网关优先于构建期环境变量（老门户 iframe 场景）', () => {
    vi.stubEnv('VITE_BX_GATEWAY', 'http://from-env.com/bxapi')
    ;(globalThis as Record<string, unknown>).window = {
      top: { pathConfig: { gateway: 'http://from-host.com/bxapi/' } },
    }
    expect(resolveGateway()).toBe('http://from-host.com/bxapi')
  })

  it('宿主注入为空时回退到构建期环境变量', () => {
    vi.stubEnv('VITE_BX_GATEWAY', 'http://from-env.com/bxapi')
    ;(globalThis as Record<string, unknown>).window = { top: { pathConfig: { gateway: '' } } }
    expect(resolveGateway()).toBe('http://from-env.com/bxapi')
  })

  it('读取宿主配置抛异常时（跨域 iframe）回退到构建期环境变量', () => {
    vi.stubEnv('VITE_BX_GATEWAY', 'http://from-env.com/bxapi')
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      get() {
        throw new Error('跨域')
      },
    })
    expect(resolveGateway()).toBe('http://from-env.com/bxapi')
  })
})
