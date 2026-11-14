// @vitest-environment node

/**
 * URL 票据读取与清理单测
 *
 * 需求：宿主在**任意页面** URL 上带 `bx_auth_ticket` 时免登录，直接使用该票据。
 * 这里锁住三件事：
 * 1. 三个读取来源（页面 query / H5 地址栏 / 小程序页面栈）都能拿到票据；
 * 2. 优先级固定为 query > 地址栏 > 页面栈，不会因为来源不同而漂移；
 * 3. 采纳后能从地址栏（`#` 之前）清掉票据 —— 否则退出登录后切页会被再次自动登录。
 */

import { afterEach, describe, expect, it } from 'vitest'

import {
  clearUrlTicketFromSearch,
  readUrlTicket,
  readUrlTicketFromCurrentPage,
  readUrlTicketFromLocation,
  resolveUrlTicket,
} from '@/utils/url-ticket'

/** 安装最小 window 桩（H5 地址栏 + history.replaceState） */
function stubWindow(href: string): { replaced: string[], restore: () => void } {
  const replaced: string[] = []
  const url = new URL(href)
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      location: {
        href,
        search: url.search,
        hash: url.hash,
      },
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

/** 安装页面栈桩（小程序 / App 的 getCurrentPages） */
function stubCurrentPages(pages: Array<{ options?: Record<string, unknown> }>): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'getCurrentPages')
  Object.defineProperty(globalThis, 'getCurrentPages', {
    configurable: true,
    writable: true,
    value: () => pages,
  })
  return () => {
    if (original) {
      Object.defineProperty(globalThis, 'getCurrentPages', original)
    }
    else {
      delete (globalThis as Record<string, unknown>).getCurrentPages
    }
  }
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window
  delete (globalThis as Record<string, unknown>).getCurrentPages
})

describe('readUrlTicket（页面 query）', () => {
  it('读取普通票据并去掉首尾空白', () => {
    expect(readUrlTicket({ bx_auth_ticket: '  abc123  ' })).toBe('abc123')
  })

  it('解码百分号编码的票据', () => {
    expect(readUrlTicket({ bx_auth_ticket: encodeURIComponent('a+b/c=') })).toBe('a+b/c=')
  })

  it('缺失、空值、非字符串时返回空串', () => {
    expect(readUrlTicket(undefined)).toBe('')
    expect(readUrlTicket(null)).toBe('')
    expect(readUrlTicket({})).toBe('')
    expect(readUrlTicket({ bx_auth_ticket: '' })).toBe('')
    expect(readUrlTicket({ bx_auth_ticket: '   ' })).toBe('')
  })

  it('含裸 % 的票据不会抛 URIError（安全解码回退原值）', () => {
    expect(() => readUrlTicket({ bx_auth_ticket: '100%' })).not.toThrow()
    expect(readUrlTicket({ bx_auth_ticket: '100%' })).toBe('100%')
  })
})

describe('readUrlTicketFromLocation（H5 地址栏）', () => {
  it('读取 # 之前的查询串（宿主注入的典型位置）', () => {
    const { restore } = stubWindow('https://host/quest/?bx_auth_ticket=from-search#/pages/questionnaire/cover/index')
    try {
      expect(readUrlTicketFromLocation()).toBe('from-search')
    }
    finally {
      restore()
    }
  })

  it('读取 hash 路由里的查询串', () => {
    const { restore } = stubWindow('https://host/quest/#/pages/questionnaire/cover/index?bx_auth_ticket=from-hash')
    try {
      expect(readUrlTicketFromLocation()).toBe('from-hash')
    }
    finally {
      restore()
    }
  })

  it('# 之前与 hash 里都有时，宿主级（# 之前）优先', () => {
    const { restore } = stubWindow('https://host/quest/?bx_auth_ticket=from-search#/pages/x?bx_auth_ticket=from-hash')
    try {
      expect(readUrlTicketFromLocation()).toBe('from-search')
    }
    finally {
      restore()
    }
  })

  it('没有票据时返回空串', () => {
    const { restore } = stubWindow('https://host/quest/?hideHeader=1#/pages/x')
    try {
      expect(readUrlTicketFromLocation()).toBe('')
    }
    finally {
      restore()
    }
  })

  it('非浏览器环境（没有 window）时返回空串而不是抛错', () => {
    expect(readUrlTicketFromLocation()).toBe('')
  })
})

describe('readUrlTicketFromCurrentPage（小程序页面栈）', () => {
  it('读取页面栈最后一页的 options', () => {
    const restore = stubCurrentPages([
      { options: { bx_auth_ticket: 'first' } },
      { options: { bx_auth_ticket: 'last' } },
    ])
    try {
      expect(readUrlTicketFromCurrentPage()).toBe('last')
    }
    finally {
      restore()
    }
  })

  it('页面栈为空或没有 options 时返回空串', () => {
    const restore = stubCurrentPages([])
    try {
      expect(readUrlTicketFromCurrentPage()).toBe('')
    }
    finally {
      restore()
    }
  })

  it('getCurrentPages 不存在时返回空串', () => {
    expect(readUrlTicketFromCurrentPage()).toBe('')
  })

  it('getCurrentPages 抛错时返回空串（启动早期页面栈不可用）', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'getCurrentPages')
    Object.defineProperty(globalThis, 'getCurrentPages', {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error('页面栈未就绪')
      },
    })
    try {
      expect(readUrlTicketFromCurrentPage()).toBe('')
    }
    finally {
      if (original) {
        Object.defineProperty(globalThis, 'getCurrentPages', original)
      }
      else {
        delete (globalThis as Record<string, unknown>).getCurrentPages
      }
    }
  })
})

describe('resolveUrlTicket（来源优先级）', () => {
  it('页面 query 优先于地址栏与页面栈', () => {
    const { restore } = stubWindow('https://host/quest/?bx_auth_ticket=from-search#/pages/x')
    const restorePages = stubCurrentPages([{ options: { bx_auth_ticket: 'from-page' } }])
    try {
      expect(resolveUrlTicket({ bx_auth_ticket: 'from-query' })).toBe('from-query')
    }
    finally {
      restore()
      restorePages()
    }
  })

  it('没有 query 时用地址栏', () => {
    const { restore } = stubWindow('https://host/quest/?bx_auth_ticket=from-search#/pages/x')
    const restorePages = stubCurrentPages([{ options: { bx_auth_ticket: 'from-page' } }])
    try {
      expect(resolveUrlTicket()).toBe('from-search')
    }
    finally {
      restore()
      restorePages()
    }
  })

  it('query 与地址栏都没有时用页面栈', () => {
    const restorePages = stubCurrentPages([{ options: { bx_auth_ticket: 'from-page' } }])
    try {
      expect(resolveUrlTicket()).toBe('from-page')
    }
    finally {
      restorePages()
    }
  })

  it('三处都没有时返回空串', () => {
    expect(resolveUrlTicket()).toBe('')
  })
})

describe('clearUrlTicketFromSearch（采纳后清理地址栏）', () => {
  it('只删票据，保留其它查询参数与 hash 路由', () => {
    const { replaced, restore } = stubWindow(
      'https://host/quest/?bx_auth_ticket=secret&hideHeader=1#/pages/questionnaire/cover/index?activity_no=A1',
    )
    try {
      clearUrlTicketFromSearch()
      expect(replaced).toHaveLength(1)
      expect(replaced[0]).toBe(
        'https://host/quest/?hideHeader=1#/pages/questionnaire/cover/index?activity_no=A1',
      )
    }
    finally {
      restore()
    }
  })

  it('地址栏没有票据时不调用 replaceState', () => {
    const { replaced, restore } = stubWindow('https://host/quest/?hideHeader=1#/pages/x')
    try {
      clearUrlTicketFromSearch()
      expect(replaced).toEqual([])
    }
    finally {
      restore()
    }
  })

  it('非浏览器环境（没有 window）时不抛错', () => {
    expect(() => clearUrlTicketFromSearch()).not.toThrow()
  })

  it('history.replaceState 不可用时不抛错', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { location: { href: 'https://host/quest/?bx_auth_ticket=t' } },
    })
    try {
      expect(() => clearUrlTicketFromSearch()).not.toThrow()
    }
    finally {
      if (original) {
        Object.defineProperty(globalThis, 'window', original)
      }
      else {
        delete (globalThis as Record<string, unknown>).window
      }
    }
  })
})
