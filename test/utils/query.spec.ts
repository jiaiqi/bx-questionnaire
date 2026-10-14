/**
 * 页面参数解析测试
 *
 * 背景：各页面此前各自写 `String(query?.xxx ?? '')`，需要解码的再自己调
 * `decodeURIComponent` —— 口径不一致，而且裸调遇到含裸 `%` 的值会抛 `URIError`
 * 把页面打白屏（活动标题写成「完成率 100%」就会触发）。
 *
 * 这里锁住安全解码的行为：解码失败宁可回退原值，也不崩页面。
 */

import { describe, expect, it } from 'vitest'

import { readQuery, readQueryDeeply, safeDecode } from '@/utils/query'

describe('safeDecode（安全解码）', () => {
  it('解码已编码的中文', () => {
    expect(safeDecode('%E4%B8%AD%E6%96%87')).toBe('中文')
  })

  it('对未编码的值是幂等的', () => {
    expect(safeDecode('20261010100256000001')).toBe('20261010100256000001')
    expect(safeDecode('305722cb2a6f4fb18042c4f93e6f7fda')).toBe('305722cb2a6f4fb18042c4f93e6f7fda')
    expect(safeDecode('')).toBe('')
  })

  it('含裸 % 时返回原值而不是抛 URIError', () => {
    // 回归：活动标题「完成率 100%」曾会让页面白屏
    expect(() => safeDecode('完成率 100%')).not.toThrow()
    expect(safeDecode('完成率 100%')).toBe('完成率 100%')
    expect(safeDecode('%')).toBe('%')
    expect(safeDecode('abc%zz')).toBe('abc%zz')
  })
})

describe('readQuery（读取页面参数）', () => {
  it('读取普通参数', () => {
    const query = { activity_no: '20261010100256000001' }
    expect(readQuery(query, 'activity_no')).toBe('20261010100256000001')
  })

  it('解码中文标题', () => {
    const query = { title: encodeURIComponent('满意度调查 100%') }
    expect(readQuery(query, 'title')).toBe('满意度调查 100%')
  })

  it('缺失或空值时返回默认值', () => {
    expect(readQuery(undefined, 'activity_no')).toBe('')
    expect(readQuery({}, 'activity_no')).toBe('')
    expect(readQuery({ title: '' }, 'title', '作答记录')).toBe('作答记录')
    expect(readQuery({ title: null }, 'title', '作答记录')).toBe('作答记录')
  })

  it('未编码的 ID 解码后不变', () => {
    const query = {
      activity_no: '20261010100256000001',
      fill_batch_no: '305722cb2a6f4fb18042c4f93e6f7fda',
    }
    expect(readQuery(query, 'activity_no')).toBe('20261010100256000001')
    expect(readQuery(query, 'fill_batch_no')).toBe('305722cb2a6f4fb18042c4f93e6f7fda')
  })

  it('formType 支持默认值', () => {
    expect(readQuery({}, 'formType', 'form')).toBe('form')
    expect(readQuery({ formType: 'detail' }, 'formType', 'form')).toBe('detail')
  })
})

/**
 * 解码到稳定
 *
 * 回归防护：会话过期跳登录页时，提示语曾以 `%E7%99%BB%E5%BD%95...` 的形式
 * 显示在页面上 —— uni-app 在 H5 端会把 `reLaunch` 的 URL 再编码一次，
 * 于是自己 encode 过的参数变成双重编码，单次解码只解掉外层。
 * 这条红了 = 登录页会重新露出编码原文（或回跳地址被解错）。
 */
describe('readQueryDeeply（解码到稳定）', () => {
  it('双重编码的值能解到原文', () => {
    const once = encodeURIComponent('登录已过期，请重新登录')
    const twice = encodeURIComponent(once)

    expect(readQueryDeeply({ notice: twice }, 'notice')).toBe('登录已过期，请重新登录')
  })

  it('只编码一次的值同样能解（小程序端不会二次编码）', () => {
    expect(readQueryDeeply({ notice: encodeURIComponent('登录已过期') }, 'notice')).toBe('登录已过期')
  })

  it('未编码的值是幂等的', () => {
    expect(readQueryDeeply({ activity_no: '20261010100256000001' }, 'activity_no'))
      .toBe('20261010100256000001')
  })

  it('含裸 % 的值不会被解坏，也不会抛错', () => {
    expect(readQueryDeeply({ title: '完成率 100%' }, 'title')).toBe('完成率 100%')
  })

  it('缺失或空值时返回默认值', () => {
    expect(readQueryDeeply(undefined, 'notice', '请登录')).toBe('请登录')
    expect(readQueryDeeply({ notice: '' }, 'notice', '请登录')).toBe('请登录')
  })
})
