// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildSubmitPayload, isEmbedded, notifyParent } from '@/utils/embed'

/**
 * 最小 window 桩
 *
 * 只覆盖 `isEmbedded` / `notifyParent` 用到的几个成员，不引 jsdom。
 *
 * **`parent` 必须始终带一个收集用的 `postMessage`**：早先只在「非嵌入」场景把
 * `parent` 留成空对象，结果去掉 `isEmbedded` 守卫后调用会抛 TypeError 被
 * notifyParent 的 try/catch 吞掉，`posted` 两种情况都是空 ——
 * 断言区分不出「被守卫拦住」和「静默炸了」，变异测试直接抓出了这个假绿。
 *
 * `top` 传 getter 才能模拟跨域抛 SecurityError。
 */
function stubWindow(options: { sameAsTop: boolean, throwing?: boolean }): {
  posted: Array<{ message: unknown, targetOrigin: string }>
} {
  const posted: Array<{ message: unknown, targetOrigin: string }> = []
  const collect = (message: unknown, targetOrigin: string): void => {
    posted.push({ message, targetOrigin })
  }
  const self = { postMessage: collect }
  const parent = options.sameAsTop ? self : { postMessage: collect }
  const win: Record<string, unknown> = {
    self,
    parent,
    postMessage: collect,
  }
  if (options.throwing) {
    Object.defineProperty(win, 'top', {
      get() {
        throw new Error('SecurityError')
      },
    })
  }
  else {
    win.top = options.sameAsTop ? self : parent
  }
  vi.stubGlobal('window', win)
  return { posted }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('embed · isEmbedded', () => {
  it('node 环境没有 window → 不是嵌入 —— 缺这层判断会走到 window.self 抛 ReferenceError', () => {
    expect(typeof window).toBe('undefined')
    expect(isEmbedded()).toBe(false)
  })

  it('self === top → 独立窗口，不是嵌入', () => {
    stubWindow({ sameAsTop: true })
    expect(isEmbedded()).toBe(false)
  })

  it('self !== top → 嵌入', () => {
    stubWindow({ sameAsTop: false })
    expect(isEmbedded()).toBe(true)
  })

  it('访问 window.top 抛 SecurityError → **算嵌入** —— 跨域 iframe 恰恰是典型嵌入场景，判断反了就全错', () => {
    stubWindow({ sameAsTop: false, throwing: true })
    expect(isEmbedded()).toBe(true)
  })
})

describe('embed · notifyParent', () => {
  it('非嵌入环境不发消息 —— 独立打开页面时不该往 window.parent 乱发', () => {
    const { posted } = stubWindow({ sameAsTop: true })
    notifyParent('FORM_READY', { serviceName: 'srvdaq_init_view_select' })
    expect(posted).toEqual([])
  })

  it('嵌入环境按契约发送 {type, data}，targetOrigin 为 *', () => {
    const { posted } = stubWindow({ sameAsTop: false })

    notifyParent('RESIZE', { height: 1234 })

    expect(posted).toEqual([{ message: { type: 'RESIZE', data: { height: 1234 } }, targetOrigin: '*' }])
  })

  it('h5_loaded 与平台消息同信封发送 —— l-mp-weixin-reface 的 webview 壳按 type 撤加载遮罩', () => {
    const { posted } = stubWindow({ sameAsTop: false })

    notifyParent('h5_loaded', { serviceName: 'srvdaq_init_view_select' })

    expect(posted).toEqual([{
      message: { type: 'h5_loaded', data: { serviceName: 'srvdaq_init_view_select' } },
      targetOrigin: '*',
    }])
  })

  it('data 省略时补空对象 —— 父页面解构 data 不会拿到 undefined', () => {
    const { posted } = stubWindow({ sameAsTop: false })

    notifyParent('TICKET_EXPIRED')

    expect(posted[0].message).toEqual({ type: 'TICKET_EXPIRED', data: {} })
  })

  it('父页面 postMessage 抛异常时不冒泡 —— 通信失败不能影响问卷主流程', () => {
    stubWindow({ sameAsTop: false })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const win = window as unknown as { parent: { postMessage: () => void } }
    win.parent.postMessage = () => {
      throw new Error('父页面已销毁')
    }

    expect(() => notifyParent('ADD_SUCCESS', { id: 1 })).not.toThrow()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('node 环境调用不抛异常 —— 小程序产物里整段被剥离，单测跑的是未剥离的源码', () => {
    expect(() => notifyParent('FORM_READY', { serviceName: 'x' })).not.toThrow()
  })
})

describe('embed · buildSubmitPayload', () => {
  it('id 优先取 response.ids[0]', () => {
    const payload = buildSubmitPayload('update', 'srvoa_project_update', {
      ids: [123],
      effect_data: [{ id: 456 }],
    }, 'fallback')
    expect(payload.id).toBe(123)
    expect(payload.action).toBe('update')
    expect(payload.serviceName).toBe('srvoa_project_update')
  })

  it('没有 ids 时退回 effect_data[0].id', () => {
    const payload = buildSubmitPayload('add', 'srvoa_project_add', {
      effect_data: [{ id: 456, project_no: 'PRJ-1' }],
    })
    expect(payload.id).toBe(456)
    expect(payload.effectData).toEqual({ id: 456, project_no: 'PRJ-1' })
  })

  it('问卷提交：平台把回填字段放在 response 里，既无 ids 也无 effect_data → 用兜底 id（批次号）', () => {
    const payload = buildSubmitPayload('add', 'srvdaq_activity_result_submit', {
      fill_batch_no: 'd9102bc941064d198405380e53431554',
    }, 'd9102bc941064d198405380e53431554')

    expect(payload.id).toBe('d9102bc941064d198405380e53431554')
    expect(payload.effectData).toBeNull()
    // response 原样透传，父页面要能拿到 fill_batch_no
    expect(payload.response).toEqual({ fill_batch_no: 'd9102bc941064d198405380e53431554' })
  })

  it('response 为 null 时不炸 —— 服务端不回填负载是常见情况', () => {
    const payload = buildSubmitPayload('add', 'srvdaq_activity_result_submit', null, 'batch-1')
    expect(payload).toEqual({
      action: 'add',
      serviceName: 'srvdaq_activity_result_submit',
      id: 'batch-1',
      effectData: null,
      response: null,
    })
  })

  it('effect_data 是空数组时不把 undefined 当数据 —— 会变成 id: undefined 传给父页面', () => {
    const payload = buildSubmitPayload('add', 'srv_x_add', { effect_data: [] }, 'batch-2')
    expect(payload.effectData).toBeNull()
    expect(payload.id).toBe('batch-2')
  })

  it('effect_data[0] 不是对象时按无数据处理', () => {
    const payload = buildSubmitPayload('add', 'srv_x_add', { effect_data: ['oops'] }, 'batch-3')
    expect(payload.effectData).toBeNull()
    expect(payload.id).toBe('batch-3')
  })

  it('什么都是空时 id 为 null，而不是 undefined', () => {
    const payload = buildSubmitPayload('add', 'srv_x_add', null)
    expect(payload.id).toBeNull()
  })
})
