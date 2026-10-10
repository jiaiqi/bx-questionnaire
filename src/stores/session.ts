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
    clear,
  }
})
