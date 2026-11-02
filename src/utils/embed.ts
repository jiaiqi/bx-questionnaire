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
