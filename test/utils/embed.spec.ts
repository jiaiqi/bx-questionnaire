// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildSubmitPayload, detectHostChrome, isEmbedded, isHostChrome, notifyParent } from '@/utils/embed'

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

/**
 * 各端真实 UA 样本
 *
 * 取真机实测的形态而不是编造：判定逻辑的价值全在「这些词到底出没出现」，
 * 用假 UA 写测试等于自己给答案。
 */
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** 微信小程序 web-view（Android，微信 7.0 起 UA 带 miniProgram） */
const WX_MP_UA = 'Mozilla/5.0 (Linux; Android 13; 2211133C Build/TKQ1.221114.001; wv) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160065 MMWEBSDK/20231202 '
  + 'MicroMessenger/8.0.47.2560(0x28002F35) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64 '
  + 'miniProgram/wx1234567890abcdef'

/** 公众号 H5（微信内置浏览器，只有 MicroMessenger，没有 miniProgram） */
const WX_OA_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003128) NetType/WIFI Language/zh_CN'

/** 鸿蒙微信：官方建议看 ArkWeb + MicroMessenger，但公众号同款也带这两个词 */
const WX_HARMONY_UA = 'Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/114.0.0.0 Safari/537.36 ArkWeb/4.1.6.1 Mobile MicroMessenger/8.0.56'

/** 支付宝小程序 web-view（MiniProgram 大写） */
const ALIPAY_MP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Mobile/15E148 Ariver/1.0.0 AliApp(AP/10.5.0.6000) Nebula WK RVKType(0) '
  + 'AlipayDefined(nt:WIFI,ws:390|844|3.0) AlipayClient/10.5.0.6000 Language/zh-Hans Region/CN miniProgram'

/** 抖音小程序 web-view */
const TOUTIAO_MP_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/116.0.0.0 Mobile Safari/537.36 ToutiaoMicroApp/2.0'

/** uni-app / HTML5+ 打包的 App 里的 web-view */
const APP_UA = 'Mozilla/5.0 (Linux; Android 13; V2254A Build/TP1A.220624.014) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36 Html5Plus/1.0'

describe('embed · detectHostChrome', () => {
  it('普通浏览器独立打开 → 保留导航栏', () => {
    expect(detectHostChrome({ userAgent: CHROME_UA })).toBe(false)
    expect(detectHostChrome()).toBe(false)
  })

  it('iframe 内 → 隐藏 —— 门户 / 平台弹窗自己画了标题栏', () => {
    expect(detectHostChrome({ iframe: true, userAgent: CHROME_UA })).toBe(true)
  })

  it('微信小程序 web-view（UA 带 miniProgram）→ 隐藏', () => {
    expect(detectHostChrome({ userAgent: WX_MP_UA })).toBe(true)
  })

  it('支付宝小程序 web-view（MiniProgram 大写）→ 隐藏 —— 大小写不一致，不能区分对待', () => {
    expect(detectHostChrome({ userAgent: ALIPAY_MP_UA })).toBe(true)
  })

  it('抖音小程序 web-view → 隐藏', () => {
    expect(detectHostChrome({ userAgent: TOUTIAO_MP_UA })).toBe(true)
  })

  it('uni-app / HTML5+ 的 App web-view（UA 带 Html5Plus）→ 隐藏', () => {
    expect(detectHostChrome({ userAgent: APP_UA })).toBe(true)
  })

  it('存在 HTML5+ 运行时 → 隐藏 —— UA 被 App 改过时的第二条通道', () => {
    expect(detectHostChrome({ appRuntime: true, userAgent: CHROME_UA })).toBe(true)
  })

  it('公众号 H5（微信内置浏览器，UA 带 MicroMessenger）→ 隐藏 —— 微信自己的标题栏已经占位', () => {
    expect(detectHostChrome({ userAgent: WX_OA_UA })).toBe(true)
  })

  it('鸿蒙微信（ArkWeb + MicroMessenger）→ 隐藏 —— 微信内置浏览器同款标题栏，不需要单独看 ArkWeb', () => {
    expect(detectHostChrome({ userAgent: WX_HARMONY_UA })).toBe(true)
  })

  it('__wxjs_environment === miniprogram → 隐藏（UA 之外的补充信号）', () => {
    expect(detectHostChrome({ wxjsEnvironment: 'miniprogram', userAgent: CHROME_UA })).toBe(true)
    // 大小写不敏感：这个变量由客户端注入，值形态不完全固定
    expect(detectHostChrome({ wxjsEnvironment: 'MiniProgram', userAgent: CHROME_UA })).toBe(true)
  })

  it('__wxjs_environment 是其它值（如 wechat）→ 不影响判定', () => {
    expect(detectHostChrome({ wxjsEnvironment: 'wechat', userAgent: CHROME_UA })).toBe(false)
  })

  it('hideHeader=1 强制隐藏 —— 宿主 UA / 容器都识别不出来时的出口', () => {
    expect(detectHostChrome({ search: '?hideHeader=1', userAgent: CHROME_UA })).toBe(true)
    expect(detectHostChrome({ search: 'hideHeader=true', userAgent: CHROME_UA })).toBe(true)
  })

  it('hideHeader=0 强制保留 —— 覆盖 iframe 与 web-view 的自动判定，用于排查「导航栏怎么没了」', () => {
    expect(detectHostChrome({ search: '?hideHeader=0', iframe: true, userAgent: WX_MP_UA })).toBe(false)
    expect(detectHostChrome({ search: 'hideHeader=false', iframe: true })).toBe(false)
  })

  it('hideHeader 取值不认识时不改变自动判定 —— 不能因为拼写错误就静默藏掉导航栏', () => {
    expect(detectHostChrome({ search: '?hideHeader=yes', userAgent: CHROME_UA })).toBe(false)
    expect(detectHostChrome({ search: '?hideHeader=yes', iframe: true })).toBe(true)
    expect(detectHostChrome({ search: '?hideHeader=', userAgent: CHROME_UA })).toBe(false)
  })

  it('查询串里混杂其它参数也能取到 hideHeader', () => {
    expect(detectHostChrome({ search: '?t=abcd&hideHeader=1&srvApp=daq', userAgent: CHROME_UA })).toBe(true)
  })
})

/**
 * 浏览器桩（供 `isHostChrome` 用）
 *
 * 与 `stubWindow` 分开：那个只覆盖 postMessage 需要的最少成员；这个还要
 * `location`、`navigator`、微信注入的环境变量与 HTML5+ 的 `plus`。
 */
function stubBrowser(options: {
  sameAsTop?: boolean
  userAgent?: string
  search?: string
  hash?: string
  wxjsEnvironment?: string
  plus?: unknown
} = {}): void {
  const sameAsTop = options.sameAsTop ?? true
  const collect = (): void => {}
  const self: Record<string, unknown> = {
    postMessage: collect,
    location: { search: options.search ?? '', hash: options.hash ?? '' },
  }
  const parent = sameAsTop ? self : { postMessage: collect }
  const win: Record<string, unknown> = {
    self,
    parent,
    top: sameAsTop ? self : parent,
    postMessage: collect,
    location: self.location,
  }
  if (options.wxjsEnvironment !== undefined) {
    win.__wxjs_environment = options.wxjsEnvironment
  }
  if (options.plus !== undefined) {
    win.plus = options.plus
  }
  vi.stubGlobal('window', win)
  vi.stubGlobal('navigator', { userAgent: options.userAgent ?? '' })
}

describe('embed · isHostChrome', () => {
  it('node 环境没有 window → 保留导航栏（小程序产物恒走这条）', () => {
    expect(typeof window).toBe('undefined')
    expect(isHostChrome()).toBe(false)
  })

  it('独立打开的普通浏览器 → 保留', () => {
    stubBrowser({ userAgent: CHROME_UA })
    expect(isHostChrome()).toBe(false)
  })

  it('iframe 内 → 隐藏', () => {
    stubBrowser({ sameAsTop: false, userAgent: CHROME_UA })
    expect(isHostChrome()).toBe(true)
  })

  it('小程序 web-view（UA 判定）→ 隐藏', () => {
    stubBrowser({ userAgent: WX_MP_UA })
    expect(isHostChrome()).toBe(true)
  })

  it('公众号 H5（微信内置浏览器）→ 隐藏', () => {
    stubBrowser({ userAgent: WX_OA_UA })
    expect(isHostChrome()).toBe(true)
  })

  it('存在 HTML5+ 的 window.plus → 隐藏', () => {
    stubBrowser({ userAgent: CHROME_UA, plus: { navigator: {} } })
    expect(isHostChrome()).toBe(true)
  })

  it('嵌入地址像 README 那样把参数写在 # 之前，也能读到 hideHeader', () => {
    stubBrowser({ userAgent: CHROME_UA, search: '?hideHeader=1', hash: '#/pages/questionnaire/index/index' })
    expect(isHostChrome()).toBe(true)
  })

  it('页面自己拼的 hash 路由参数也认 —— 参数写在 ? 之后同样是一个入口', () => {
    stubBrowser({ userAgent: CHROME_UA, hash: '#/pages/questionnaire/index/index?activity_no=x&hideHeader=1' })
    expect(isHostChrome()).toBe(true)
  })

  it('宿主级开关优先于 hash 里的页面级写法 —— 前者是宿主的明确指令', () => {
    stubBrowser({
      userAgent: CHROME_UA,
      search: '?hideHeader=0',
      hash: '#/pages/questionnaire/index/index?hideHeader=1',
    })
    expect(isHostChrome()).toBe(false)
  })

  it('iframe 里显式 hideHeader=0 → 保留（排障出口真的能用）', () => {
    stubBrowser({ sameAsTop: false, userAgent: CHROME_UA, search: '?hideHeader=0' })
    expect(isHostChrome()).toBe(false)
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
