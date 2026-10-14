// @vitest-environment node

/**
 * 登录页提示语映射
 *
 * 回归防护：进入登录页的原因曾经用**中文文案**拼进 URL，而 URL 编码在各端会
 * 叠加不同层数，实测页面上直接显示成了 `%E7%99%BB%E5%BD%95...`。
 * 改成枚举码 + 映射表后，URL 里只出现 ASCII。
 * 这条红了 = 又会退回「提示语变成百分号编码原文」的状态。
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_LOGIN_NOTICE, isKnownLoginReason, loginNotice } from '@/domain/auth/notice'

describe('登录提示语', () => {
  it('会话过期给出可读的中文提示', () => {
    expect(loginNotice('expired')).toBe('登录已过期，请重新登录')
  })

  it('主动进入用默认提示', () => {
    expect(loginNotice('required')).toBe(DEFAULT_LOGIN_NOTICE)
  })

  it('认不出的原因回落到默认提示，而不是留空', () => {
    expect(loginNotice('')).toBe(DEFAULT_LOGIN_NOTICE)
    expect(loginNotice('whatever')).toBe(DEFAULT_LOGIN_NOTICE)
  })

  /**
   * 页面靠这个判定决定「要不要改用外部传进来的 notice 文案」。
   * 必须只认登记过的键：原型链上的 `toString` / `constructor` 不算，
   * 否则 `?reason=toString` 会让页面走进「已识别」分支。
   */
  it('只认登记过的原因（原型链上的键不算）', () => {
    expect(isKnownLoginReason('expired')).toBe(true)
    expect(isKnownLoginReason('required')).toBe(true)
    expect(isKnownLoginReason('expired ')).toBe(false)
    expect(isKnownLoginReason('toString')).toBe(false)
    expect(isKnownLoginReason('constructor')).toBe(false)
  })
})
