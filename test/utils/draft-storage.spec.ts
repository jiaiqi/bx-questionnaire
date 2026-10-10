// @vitest-environment node

/**
 * 本地草稿与批次号的存储约定
 *
 * 这两处都是「看不见但会串数据」的地方：
 * - 草稿 key 若不按活动隔离，多份问卷会互相读到对方的答案；
 * - `clearFillBatchNo` 若误用 `clear()`，会把票据一起清掉，等于把用户登出。
 */

import { createPinia, setActivePinia } from 'pinia'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessionStore } from '@/stores/session'
import { draftAnswersKey, storage, STORAGE_KEYS } from '@/utils/storage'

/** 内存版 uni 存储，行为与真机一致：未设置的 key 返回空字符串 */
function installUniStub() {
  const box = new Map<string, unknown>()
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => box.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => {
      box.set(key, value)
    },
    removeStorageSync: (key: string) => {
      box.delete(key)
    },
  })
  return box
}

let box: Map<string, unknown>

beforeEach(() => {
  box = installUniStub()
  setActivePinia(createPinia())
})

describe('draftAnswersKey', () => {
  it('按活动隔离，不同问卷不会互相读到草稿', () => {
    expect(draftAnswersKey('A1')).not.toBe(draftAnswersKey('A2'))
    expect(draftAnswersKey('A1')).toBe(`${STORAGE_KEYS.DRAFT_ANSWERS}:A1`)
  })

  it('草稿按各自活动读写，互不覆盖', () => {
    storage.set(draftAnswersKey('A1'), { k1: 'v1' })
    storage.set(draftAnswersKey('A2'), { k2: 'v2' })

    expect(storage.get(draftAnswersKey('A1'), {})).toEqual({ k1: 'v1' })
    expect(storage.get(draftAnswersKey('A2'), {})).toEqual({ k2: 'v2' })

    storage.remove(draftAnswersKey('A1'))
    expect(storage.get(draftAnswersKey('A1'), {})).toEqual({})
    // 清 A1 不能影响 A2
    expect(storage.get(draftAnswersKey('A2'), {})).toEqual({ k2: 'v2' })
  })
})

describe('session.clearFillBatchNo', () => {
  it('只清批次号，不动票据与用户信息', () => {
    const session = useSessionStore()
    session.setTicket('T-1')
    session.setUserInfo({ user_no: 'jq', user_name: '贾琦' })
    session.setFillBatchNo('B-1')

    session.clearFillBatchNo()

    expect(session.fillBatchNo).toBe('')
    expect(storage.getString(STORAGE_KEYS.FILL_BATCH_NO)).toBe('')
    // 关键：登录态必须原样保留，否则等于把用户登出
    expect(session.ticket).toBe('T-1')
    expect(session.userInfo).toEqual({ user_no: 'jq', user_name: '贾琦' })
    expect(box.has('bx_auth_ticket')).toBe(true)
    expect(box.has('login_user_info')).toBe(true)
  })

  it('clear() 才会连登录态一起清', () => {
    const session = useSessionStore()
    session.setTicket('T-1')
    session.setUserInfo({ user_no: 'jq' })
    session.setFillBatchNo('B-1')

    session.clear()

    expect(session.ticket).toBe('')
    expect(session.userInfo).toBeNull()
    expect(session.fillBatchNo).toBe('')
  })
})
