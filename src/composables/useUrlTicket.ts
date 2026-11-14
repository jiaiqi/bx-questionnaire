/**
 * 页面级 URL 票据采纳（免登录）
 *
 * 宿主在任意页面 URL 上带 `bx_auth_ticket` 时，页面应**先采纳票据、再加载数据**，
 * 否则首个请求会以匿名身份发出（登录访问的问卷直接 0011）。
 *
 * 用法：在页面 `setup` 顶部（或页面逻辑 composable 的开头）调用一次
 * `useUrlTicket()`。它注册的 `onLoad` 会先于页面自己的 `onLoad` 执行 ——
 * uni-app 按注册顺序调用，所以**必须放在其它 `onLoad` 注册之前**。
 */

import { onLoad } from '@dcloudio/uni-app'

import { useSessionStore } from '@/stores/session'

/** 页面级注册：所有页面都应在 setup 顶部调用一次 */
export function useUrlTicket(): void {
  onLoad((query) => {
    useSessionStore().adoptUrlTicket(query)
  })
}
