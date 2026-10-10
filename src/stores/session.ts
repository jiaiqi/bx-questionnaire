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
    setFillBatchNo,
    clearFillBatchNo,
    clear,
  }
})
