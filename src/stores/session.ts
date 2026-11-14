/**
 * 会话 store
 *
 * 老工程 `persistData` blob 与顶层 key 双写，导致 `isLogin` 与 `bx_auth_ticket`
 * 长期不同步；这里改为**单一来源**：store 是唯一入口，写入即同步 storage。
 */

import type { BxLoginUserInfo } from '@/utils/request/types'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { SHARED_KEYS, storage, STORAGE_KEYS } from '@/utils/storage'
import { clearUrlTicketFromSearch, resolveUrlTicket } from '@/utils/url-ticket'

export const useSessionStore = defineStore('session', () => {
  /** 平台票据（与宿主共享 key） */
  const ticket = ref<string>(storage.getString(SHARED_KEYS.TICKET))
  /** 登录用户信息 */
  const userInfo = ref<BxLoginUserInfo | null>(
    storage.get<BxLoginUserInfo | null>(SHARED_KEYS.LOGIN_USER_INFO, null),
  )
  /** 当前作答批次号：由草稿保存响应产生，续答与结果查询都依赖它 */
  const fillBatchNo = ref<string>(storage.getString(STORAGE_KEYS.FILL_BATCH_NO))

  const isLogin = computed(() => ticket.value !== '')

  function setTicket(value: string): void {
    ticket.value = value
    storage.set(SHARED_KEYS.TICKET, value)
  }

  function setUserInfo(info: BxLoginUserInfo | null): void {
    userInfo.value = info
    storage.set(SHARED_KEYS.LOGIN_USER_INFO, info)
  }

  /**
   * 采纳 URL 传入的票据（免登录）
   *
   * 宿主在任意页面 URL 上带 `bx_auth_ticket` 时，直接把它当作当前会话票据：
   * 不调登录接口、不做校验（合法性由服务端判定，失效仍走 `0011` → 登录页）。
   *
   * 票据变化时必须清掉旧的 `login_user_info` —— 它属于上一个身份，
   * 留着会让「按 user_no 查询」用错账号（记录列表 / 我的测评）。
   *
   * @returns 是否采纳到票据（调用方据此判断本次 URL 是否带票）
   */
  function adoptUrlTicket(query?: Record<string, unknown> | null): boolean {
    const next = resolveUrlTicket(query)
    if (!next) {
      return false
    }
    if (next !== ticket.value) {
      if (userInfo.value) {
        setUserInfo(null)
      }
      setTicket(next)
    }
    // 采纳后清掉地址栏里的票据：避免退出登录后切页又被自动登录
    clearUrlTicketFromSearch()
    return true
  }

  function setFillBatchNo(value: string): void {
    fillBatchNo.value = value
    storage.set(STORAGE_KEYS.FILL_BATCH_NO, value)
  }

  /**
   * 只清批次号，不动登录态
   *
   * 对齐老工程 indexyax.vue 的 `beforeDestroy` 里 `setStorageSync('fill_batch_no', '')`：
   * 离开答题页即作废当前批次，下次进入是新作答，不会续写到已完成的那条记录上。
   * 注意不能用 `clear()` —— 它会把票据和用户信息一并清掉，等于登出。
   */
  function clearFillBatchNo(): void {
    fillBatchNo.value = ''
    storage.remove(STORAGE_KEYS.FILL_BATCH_NO)
  }

  function clear(): void {
    ticket.value = ''
    userInfo.value = null
    fillBatchNo.value = ''
    storage.remove(SHARED_KEYS.TICKET)
    storage.remove(SHARED_KEYS.LOGIN_USER_INFO)
    storage.remove(STORAGE_KEYS.FILL_BATCH_NO)
  }

  return {
    ticket,
    userInfo,
    fillBatchNo,
    isLogin,
    setTicket,
    setUserInfo,
    adoptUrlTicket,
    setFillBatchNo,
    clearFillBatchNo,
    clear,
  }
})
