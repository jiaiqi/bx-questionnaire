/**
 * iframe 嵌入通信（平台 iframe-embed 契约）
 *
 * 权威实现：`l-pc-front/src/components/common/update.vue` 的
 * `isEmbeddedDialog` / `notifyParentDialog` / `buildSubmitPayload`。
 *
 * 消息类型与载荷：
 *
 * | type | 触发时机 | data |
 * | --- | --- | --- |
 * | `FORM_READY` | 表单加载完成 | `{serviceName}` |
 * | `ADD_SUCCESS` | 新增提交成功 | `{action, serviceName, id, effectData, response}` |
 * | `UPDATE_SUCCESS` | 更新提交成功 | 同上 |
 * | `DELETE_SUCCESS` | 删除成功 | 同上 |
 * | `CLOSE_DIALOG` | 业务要求关闭弹窗 | 可选 |
 * | `REFRESH_LIST` | 业务要求父页面刷新列表 | 可选 |
 * | `RESIZE` | 内容高度变化 | `{height}` |
 * | `TICKET_EXPIRED` | 收到 `0011` 会话过期 | — |
 * | `h5_loaded` | 首屏就绪（兼容 l-mp-weixin-reface 的 webview 壳，非平台契约） | `{serviceName}` |
 *
 * 只在 H5 生效：小程序 / App 没有 `window.parent`，条件编译整段剥离
 * （`scripts/check-conditional.mjs` 会校验指纹在 H5 产物中存在、在小程序产物中被剥离）。
 *
 * 本文件另外负责「宿主外壳」判定（`isHostChrome`）：嵌入方自带标题栏时，
 * 页面自绘的导航栏要让位，否则就是双标题栏。
 */

/** 嵌入通信消息类型 */
export type EmbedMessageType
  = | 'FORM_READY'
    | 'ADD_SUCCESS'
    | 'UPDATE_SUCCESS'
    | 'DELETE_SUCCESS'
    | 'CLOSE_DIALOG'
    | 'REFRESH_LIST'
    | 'RESIZE'
    | 'TICKET_EXPIRED'
    /**
     * 历史自定义协议：l-mp-weixin-reface 的 `views/public/webview/webview` 壳页
     * 只认这条消息来撤掉加载遮罩。发 `FORM_READY` 时同步补发一条，两套宿主都兼容。
     */
    | 'h5_loaded'

/** 写操作成功载荷（对齐平台 `buildSubmitPayload`） */
export interface EmbedSubmitPayload {
  action: 'add' | 'update' | 'delete'
  serviceName: string
  /** 主键：`response.ids[0]` > `response.effect_data[0].id` > 调用方兜底值 */
  id: string | number | null
  /** `response.effect_data[0]` */
  effectData: Record<string, unknown> | null
  /** `response.response[0].response` 原样透传 */
  response: Record<string, unknown> | null
}

/**
 * 是否处于 iframe 嵌入环境
 *
 * 能访问 `window.top` 且 `self === top` → 独立窗口；否则视为嵌入。
 *
 * **跨域访问 `window.top` 会抛 SecurityError，此时同样按嵌入处理** ——
 * 跨域 iframe 恰恰是嵌入的典型场景，报错当成「不是嵌入」正好判断反了。
 *
 * 显式判 `typeof window`：单测跑在 node 环境（`vitest.config.ts` 不加载 uni 插件，
 * 条件编译注释不会被剥离），没有这层判断会走到 `window.self` 抛 ReferenceError。
 */
export function isEmbedded(): boolean {
  // #ifdef H5
  if (typeof window !== 'undefined') {
    try {
      return window.self !== window.top
    }
    catch {
      return true
    }
  }
  // #endif
  return false
}

/**
 * 宿主外壳（host chrome）判定
 *
 * 嵌入方已经画了自己的标题栏：老门户 / 平台弹窗的 iframe、小程序与 App 的
 * web-view 壳、微信内置浏览器（公众号 H5）。此时再画一条 48px 的顶部导航栏就是
 * 「双标题栏」—— 首屏高度白吃一截，还多出一个返回箭头。所以这种环境下页面自绘的
 * 导航栏要让位。
 *
 * 与 `isEmbedded()` 刻意分开：那个函数回答的是「能不能给父页面发消息」，只认
 * iframe；小程序 / App 的 web-view 里 `self === top`（没有父页面可发消息），
 * 但宿主的原生导航栏就压在上面，同样需要让位。合并成一个判断会漏掉 web-view。
 *
 * 判定顺序：显式开关 > iframe > web-view 特征。显式开关用平台 iframe-embed
 * 契约里的 `hideHeader`（`1` 隐藏 / `0` 保留），宿主识别不出来时可以自己指定。
 */

/** 宿主外壳判定所需的环境观察值（集中传参，便于单测穷举各端 UA 与显式开关） */
export interface HostChromeEnv {
  /** 处于 iframe 内（`isEmbedded()` 的结论；跨域读 `top` 抛 SecurityError 也算） */
  iframe?: boolean
  /** `navigator.userAgent`；非浏览器环境留空 */
  userAgent?: string
  /** 微信注入的 `window.__wxjs_environment`；小程序 web-view 里是 `miniprogram` */
  wxjsEnvironment?: string
  /** HTML5+ 运行时存在（uni-app / 5+ 打包的 App 会把 `plus` 注入到它的 web-view） */
  appRuntime?: boolean
  /** 地址栏查询串：`location.search` 与 hash 路由里的查询串拼接 */
  search?: string
}

/**
 * 宿主 web-view / 内置浏览器的 UA 标记
 *
 * - 微信从 7.0.0 起在 web-view 的 UA 里带 `miniProgram`（微信开放文档 · web-view
 *   组件页），支付宝、QQ 小程序同族做法但大小写不一，统一忽略大小写匹配；
 * - 微信内置浏览器（公众号 H5、微信 PC 端）带 `MicroMessenger`，它同样有自己的
 *   标题栏与返回键，所以一并隐藏。鸿蒙微信也带这个词，不需要再单独看 `ArkWeb`。
 */
const WEBVIEW_UA_MARKERS: RegExp[] = [
  // 微信内置浏览器（公众号 H5 / 微信 PC 端）与小程序 web-view 都带
  /micromessenger/i,
  // 微信 / 支付宝 / QQ 小程序 web-view
  /miniprogram/i,
  // uni-app / HTML5+ 打包的 App 里的 web-view（宿主自家 App 壳多为此形态）
  /html5plus/i,
  // 抖音小程序 web-view
  /toutiaomicroapp/i,
]

/**
 * 读取显式开关 `hideHeader`
 *
 * 平台 iframe-embed 契约里，嵌入页的地址形如
 * `/vpages/index.html?t=...&hideHeader=1#/update/...`（见 `docs/验收清单.md`）。
 * 返回三态：`null` 表示没提要求，交给自动判定；`true` / `false` 是明确指令。
 *
 * `0` 不是摆设：线上出现「导航栏怎么没了」时，宿主或联调人员不用改 UA 就能复现。
 */
function readHideHeader(search: string): boolean | null {
  const raw = String(search ?? '').replace(/^[?&]+/, '')
  if (!raw) {
    return null
  }
  const value = new URLSearchParams(raw).get('hideHeader')
  if (value === null) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true') {
    return true
  }
  if (normalized === '0' || normalized === 'false') {
    return false
  }
  return null
}

/**
 * 是否处在「宿主自带标题栏」的环境
 *
 * 纯函数：不碰任何平台 API，运行时观察值由调用方传入 —— 各端 UA 的差异靠单测
 * 穷举，比在真机上一台台试可靠，也不会因为某个宿主 UA 变了就静默失效。
 */
export function detectHostChrome(env: HostChromeEnv = {}): boolean {
  // 显式开关优先：宿主最清楚自己有没有标题栏
  const forced = readHideHeader(env.search ?? '')
  if (forced !== null) {
    return forced
  }

  // iframe：父页面（门户 / 平台弹窗）自己画了标题栏
  if (env.iframe) {
    return true
  }

  // 小程序 / App 的 web-view：canonical 特征是 UA，而不是 window.parent
  const userAgent = String(env.userAgent ?? '')
  if (WEBVIEW_UA_MARKERS.some(marker => marker.test(userAgent))) {
    return true
  }
  // 微信注入的环境变量是 UA 之外的补充信号
  if (String(env.wxjsEnvironment ?? '').trim().toLowerCase() === 'miniprogram') {
    return true
  }
  // HTML5+ 运行时：uni-app / 5+ 打的 App 的 web-view 里能拿到 window.plus
  if (env.appRuntime) {
    return true
  }

  return false
}

/**
 * 读取当前地址的查询串
 *
 * 两处都要看：宿主要在 `#` 之前追加参数（`/quest/?hideHeader=1#/pages/...`），
 * 页面自己拼地址时则把参数写在 hash 路由里。拼起来交给 URLSearchParams，
 * 前者在前 —— 宿主级开关优先于页面级。
 */
function readHostQuery(): string {
  // #ifdef H5
  if (typeof window !== 'undefined' && window.location) {
    const search = String(window.location.search ?? '').replace(/^\?/, '')
    const hash = String(window.location.hash ?? '')
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
    return [search, hashQuery].filter(Boolean).join('&')
  }
  // #endif
  return ''
}

/**
 * 当前是否处在「宿主自带标题栏」的环境（**仅 H5 生效**）
 *
 * 小程序（mp-weixin）与 App（app-plus）原生包没有 web-view 宿主这一层，恒为
 * `false`：那两种形态的标题栏本来就是我们自绘的（`navigationStyle: 'custom'`），
 * 藏掉等于没有标题栏。
 */
export function isHostChrome(): boolean {
  // #ifdef H5
  if (typeof window !== 'undefined') {
    const host = window as Window & {
      __wxjs_environment?: string
      plus?: unknown
    }
    return detectHostChrome({
      iframe: isEmbedded(),
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      wxjsEnvironment: host.__wxjs_environment,
      appRuntime: typeof host.plus !== 'undefined',
      search: readHostQuery(),
    })
  }
  // #endif
  return false
}

/**
 * 向父页面发消息
 *
 * `postMessage` **静默失败是固有特性**：发送端拿不到任何反馈，父页面没监听、
 * targetOrigin 不匹配、父页面已销毁 —— 全部表现为「什么都没发生」。
 * 所以这里至少留下一条 console 日志，便于按契约文档的排查步骤定位。
 *
 * 载荷类型用 `object` 而非 `Record<string, unknown>`：契约里的载荷都是扁平对象，
 * 但 `EmbedSubmitPayload` 这类具名 interface 没有索引签名，用 Record 会逼调用方
 * 到处做类型断言 —— 那是为了类型而类型，postMessage 本身不做任何校验。
 */
export function notifyParent(type: EmbedMessageType, data: object = {}): void {
  // #ifdef H5
  if (typeof window === 'undefined' || !isEmbedded() || !window.parent || window.parent === window) {
    return
  }
  try {
    // targetOrigin 用 '*'：嵌入方域名可能多变（契约文档第 2 节）。
    // 安全敏感场景应改为父域白名单，届时在此处集中修改。
    window.parent.postMessage({ type, data }, '*')
  }
  catch (error) {
    console.warn('[embed] 向父页面发送消息失败', type, error)
  }
  // #endif
}

/**
 * 组装写操作成功载荷
 *
 * 取值优先级与平台一致：`response.ids[0]` > `response.effect_data[0].id`。
 * 问卷提交走 `srvdaq_activity_result_submit`，平台把回填字段放在
 * `response.response[0].response`（实测是 `fill_batch_no`），既没有 `ids`
 * 也没有 `effect_data`，所以需要调用方给一个兜底 id。
 */
export function buildSubmitPayload(
  action: EmbedSubmitPayload['action'],
  serviceName: string,
  response: Record<string, unknown> | null,
  fallbackId?: string | number | null,
): EmbedSubmitPayload {
  const ids = Array.isArray(response?.ids) ? (response.ids as unknown[]) : []
  const effectList = Array.isArray(response?.effect_data)
    ? (response.effect_data as unknown[])
    : []
  const firstEffect = effectList[0]
  const effectData
    = firstEffect && typeof firstEffect === 'object'
      ? (firstEffect as Record<string, unknown>)
      : null

  const id = ids[0] ?? effectData?.id ?? fallbackId ?? null

  return { action, serviceName, id: (id as string | number | null) ?? null, effectData, response }
}
