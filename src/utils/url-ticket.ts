/**
 * URL 票据（免登录）
 *
 * 宿主（门户 / 小程序壳 / 第三方系统）可以在**任意页面**的 URL 上带
 * `bx_auth_ticket` 参数，应用直接采纳这张票据，不再走账号密码登录。
 *
 * 读取顺序（先到先得）：
 * 1. 页面 query —— `onLoad(query)` 拿到的参数，各端都有；
 * 2. H5 地址栏 —— 宿主常把参数加在 `#` 之前（`?bx_auth_ticket=…#/pages/…`），
 *    这部分**不在** uni-app 的路由 query 里，必须单独读 `location.search`；
 * 3. 小程序 / App 当前页面栈 —— 兜底，覆盖没有 `onLoad` 参数的场景。
 *
 * 票据是**外部可控输入**：只做安全解码与去空白，不做格式校验 ——
 * 平台票据的合法性只能由服务端判定，前端猜格式只会误伤。
 */

import { readQuery } from '@/utils/query'

/** URL 上的票据参数名（与平台 header 同名，宿主不需要额外约定） */
export const URL_TICKET_KEY = 'bx_auth_ticket'

/** 从页面 query 读取票据（安全解码、去空白） */
export function readUrlTicket(query?: Record<string, unknown> | null): string {
  return readQuery(query ?? undefined, URL_TICKET_KEY).trim()
}

/**
 * H5：从地址栏读取票据
 *
 * 两处都要看：宿主把参数加在 `#` 之前（`location.search`），
 * 页面自己拼地址时则写在 hash 路由里（`#/pages/…?bx_auth_ticket=…`）。
 * 前者在前 —— 宿主级参数优先于页面级。
 */
export function readUrlTicketFromLocation(): string {
  // #ifdef H5
  if (typeof window !== 'undefined' && window.location) {
    const search = String(window.location.search ?? '').replace(/^\?/, '')
    const hash = String(window.location.hash ?? '')
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
    for (const raw of [search, hashQuery]) {
      if (!raw) {
        continue
      }
      const value = new URLSearchParams(raw).get(URL_TICKET_KEY)
      if (value && value.trim()) {
        return value.trim()
      }
    }
  }
  // #endif
  return ''
}

/** 小程序 / App：从当前页面栈最后一页的 `options` 读取 */
export function readUrlTicketFromCurrentPage(): string {
  try {
    if (typeof getCurrentPages !== 'function') {
      return ''
    }
    const pages = getCurrentPages()
    const page = pages[pages.length - 1] as { options?: Record<string, unknown> } | undefined
    return readUrlTicket(page?.options)
  }
  catch {
    // 页面栈不可用（启动早期 / 非页面环境）时按「没有票据」处理
    return ''
  }
}

/** 汇总读取：页面 query > 地址栏 > 当前页面栈 */
export function resolveUrlTicket(query?: Record<string, unknown> | null): string {
  return readUrlTicket(query) || readUrlTicketFromLocation() || readUrlTicketFromCurrentPage()
}

/**
 * H5：采纳后把票据从地址栏（`#` 之前）移除
 *
 * 两个原因：
 * 1. 票据是凭据，留在地址栏会被复制、进历史记录、随 Referer 外泄；
 * 2. 不清理的话，退出登录后切到任何页面都会从地址栏**再次采纳**，等于退不出去。
 *
 * 只动 `location.search`，不碰 hash 路由里的查询串 —— 那是 vue-router 的状态，
 * 直接改会让路由与地址栏不同步。hash 里的票据在切页时自然消失。
 */
export function clearUrlTicketFromSearch(): void {
  // #ifdef H5
  if (typeof window === 'undefined' || !window.location || !window.history?.replaceState) {
    return
  }
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(URL_TICKET_KEY)) {
      return
    }
    url.searchParams.delete(URL_TICKET_KEY)
    window.history.replaceState(window.history.state, '', url.toString())
  }
  catch {
    // 地址栏不可写（隐私模式 / 非浏览器）时忽略：票据已落本地存储，不影响后续请求
  }
  // #endif
}
