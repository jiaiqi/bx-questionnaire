// @vitest-environment node

/**
 * useUrlTicket 接线单测
 *
 * 页面接入靠「在 setup 顶部调用 useUrlTicket()」这一行，它必须真的注册 onLoad
 * 并在回调里采纳票据 —— 否则页面看起来接入了，实际首个请求仍是匿名。
 */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUrlTicket } from '@/composables/useUrlTicket'
import { useSessionStore } from '@/stores/session'

const mocks = vi.hoisted(() => ({
  registered: {} as { onLoad?: (query?: Record<string, unknown>) => void },
}))

vi.mock('@dcloudio/uni-app', () => ({
  onLoad: (fn: (query?: Record<string, unknown>) => void) => {
    mocks.registered.onLoad = fn
  },
}))

const setStorageSync = vi.fn()

vi.stubGlobal('uni', {
  getStorageSync: () => '',
  setStorageSync,
  removeStorageSync: vi.fn(),
})

beforeEach(() => {
  setActivePinia(createPinia())
  setStorageSync.mockReset()
  delete mocks.registered.onLoad
})

describe('useUrlTicket', () => {
  it('注册 onLoad，并在回调里采纳 URL 票据', () => {
    useUrlTicket()
    expect(typeof mocks.registered.onLoad).toBe('function')

    mocks.registered.onLoad?.({ bx_auth_ticket: 'ticket-from-url' })

    const session = useSessionStore()
    expect(session.ticket).toBe('ticket-from-url')
    expect(setStorageSync).toHaveBeenCalledWith('bx_auth_ticket', 'ticket-from-url')
  })

  it('没有票据时是空操作', () => {
    useUrlTicket()
    mocks.registered.onLoad?.({ activity_no: 'A1' })

    expect(useSessionStore().ticket).toBe('')
    expect(setStorageSync).not.toHaveBeenCalled()
  })
})
