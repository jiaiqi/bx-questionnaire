// @vitest-environment node

/**
 * 会话 store · URL 票据采纳单测
 *
 * 需求：宿主在任意页面 URL 上带 `bx_auth_ticket` 时免登录，直接使用该票据。
 * 这里锁住采纳语义：
 * 1. 票据写入 store 与本地存储（请求层只认存储里的票据）；
 * 2. 票据变化时清掉旧的 `login_user_info` —— 否则「按 user_no 查询」会用错身份；
 * 3. 同一张票据重复采纳是幂等的，不会把用户信息清掉；
 * 4. 没有票据时是空操作，不影响已有登录态。
 */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessionStore } from '@/stores/session'

const getStorageSync = vi.fn<(key: string) => unknown>(() => '')
const setStorageSync = vi.fn()
const removeStorageSync = vi.fn()

vi.stubGlobal('uni', {
  getStorageSync,
  setStorageSync,
  removeStorageSync,
})

/** 安装最小 window 桩（H5 地址栏 + history.replaceState） */
function stubWindow(href: string): { replaced: string[], restore: () => void } {
  const replaced: string[] = []
  const url = new URL(href)
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      location: { href, search: url.search, hash: url.hash },
      history: {
        state: null,
        replaceState: (_state: unknown, _title: string, next: string) => {
          replaced.push(next)
        },
      },
    },
  })
  return {
    replaced,
    restore: () => {
      if (original) {
        Object.defineProperty(globalThis, 'window', original)
      }
      else {
        delete (globalThis as Record<string, unknown>).window
      }
    },
  }
}

beforeEach(() => {
  getStorageSync.mockReset()
  getStorageSync.mockReturnValue('')
  setStorageSync.mockReset()
  removeStorageSync.mockReset()
  setActivePinia(createPinia())
})

describe('adoptUrlTicket（URL 票据免登录）', () => {
  it('页面 query 带票据时写入 store 与本地存储', () => {
    const session = useSessionStore()

    expect(session.adoptUrlTicket({ bx_auth_ticket: 'ticket-from-url' })).toBe(true)
    expect(session.ticket).toBe('ticket-from-url')
    expect(session.isLogin).toBe(true)
    expect(setStorageSync).toHaveBeenCalledWith('bx_auth_ticket', 'ticket-from-url')
  })

  it('没有票据时是空操作，不影响已有登录态', () => {
    const session = useSessionStore()
    session.setTicket('existing-ticket')

    expect(session.adoptUrlTicket({})).toBe(false)
    expect(session.adoptUrlTicket(undefined)).toBe(false)
    expect(session.ticket).toBe('existing-ticket')
  })

  it('票据变化时清掉旧的 login_user_info（避免按旧身份查询）', () => {
    const session = useSessionStore()
    session.setTicket('old-ticket')
    session.setUserInfo({ user_no: 'old-user' })

    expect(session.adoptUrlTicket({ bx_auth_ticket: 'new-ticket' })).toBe(true)
    expect(session.ticket).toBe('new-ticket')
    expect(session.userInfo).toBeNull()
    expect(setStorageSync).toHaveBeenCalledWith('login_user_info', null)
  })

  it('同一张票据重复采纳是幂等的，保留用户信息', () => {
    const session = useSessionStore()
    session.setTicket('same-ticket')
    session.setUserInfo({ user_no: 'jq' })

    expect(session.adoptUrlTicket({ bx_auth_ticket: 'same-ticket' })).toBe(true)
    expect(session.ticket).toBe('same-ticket')
    expect(session.userInfo).toEqual({ user_no: 'jq' })
  })

  it('页面 query 没有票据时回退到 H5 地址栏', () => {
    const { restore } = stubWindow('https://host/quest/?bx_auth_ticket=from-search#/pages/x')
    try {
      const session = useSessionStore()
      expect(session.adoptUrlTicket({})).toBe(true)
      expect(session.ticket).toBe('from-search')
    }
    finally {
      restore()
    }
  })

  it('采纳后从地址栏清掉票据（退出登录后切页不会被再次自动登录）', () => {
    const { replaced, restore } = stubWindow('https://host/quest/?bx_auth_ticket=secret&hideHeader=1#/pages/x')
    try {
      const session = useSessionStore()
      session.adoptUrlTicket({})
      expect(replaced).toHaveLength(1)
      expect(replaced[0]).toBe('https://host/quest/?hideHeader=1#/pages/x')
    }
    finally {
      restore()
    }
  })

  it('空白票据不采纳', () => {
    const session = useSessionStore()
    expect(session.adoptUrlTicket({ bx_auth_ticket: '   ' })).toBe(false)
    expect(session.ticket).toBe('')
  })
})
