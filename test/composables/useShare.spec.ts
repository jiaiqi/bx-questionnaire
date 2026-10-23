import { describe, expect, it } from 'vitest'

import { buildShareUrl, isWechatUA } from '@/composables/useShare'

describe('分享链接拼装', () => {
  it('用当前 origin + pathname 重拼 hash 路由', () => {
    expect(buildShareUrl('/pages/questionnaire/cover/index?activity_no=A1', {
      origin: 'https://quest.100xsys.cn',
      pathname: '/',
    })).toBe('https://quest.100xsys.cn/#/pages/questionnaire/cover/index?activity_no=A1')
  })

  it('部署在子路径下时保留 pathname', () => {
    expect(buildShareUrl('/pages/login/index', {
      origin: 'https://example.com',
      pathname: '/quest/',
    })).toBe('https://example.com/quest/#/pages/login/index')
  })

  it('路由缺少前导斜杠时自动补齐', () => {
    expect(buildShareUrl('pages/questionnaire/index/index?activity_no=A1', {
      origin: 'https://example.com',
      pathname: '/',
    })).toBe('https://example.com/#/pages/questionnaire/index/index?activity_no=A1')
  })

  it('pathname 为空时退化为根路径', () => {
    expect(buildShareUrl('/pages/x', { origin: 'https://example.com', pathname: '' }))
      .toBe('https://example.com/#/pages/x')
  })

  /**
   * 票据泄露是最严重的回归：分享链接只由「路由」拼出来，地址栏里手工追加的
   * 查询参数（例如联调时粘贴的 ticket）不可能进入产物。
   */
  it('分享链接只含业务参数，不含票据', () => {
    const url = buildShareUrl('/pages/questionnaire/cover/index?activity_no=A1&status=进行中', {
      origin: 'https://example.com',
      pathname: '/',
    })
    expect(url).toContain('activity_no=A1')
    expect(url).toContain('status=进行中')
    expect(url.toLowerCase()).not.toContain('ticket')
  })
})

describe('微信内置浏览器识别', () => {
  it('识别 iPhone 微信 UA', () => {
    expect(isWechatUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
      + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.47',
    )).toBe(true)
  })

  it('识别 Android 微信 UA（大小写不敏感）', () => {
    expect(isWechatUA('Mozilla/5.0 (Linux; Android 14) micromessenger/8.0.47')).toBe(true)
  })

  it('普通浏览器不算微信', () => {
    expect(isWechatUA(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    )).toBe(false)
    expect(isWechatUA('')).toBe(false)
    expect(isWechatUA(undefined as unknown as string)).toBe(false)
  })
})
