import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  formatPosterDate,
  parseBatchDateTime,
  POSTER_CTA_TEXT,
  POSTER_FOOT_TEXT,
  POSTER_INVITE_TEXT,
  POSTER_PALETTE,
  posterFileName,
  posterTimeLabel,
  wrapPosterText,
} from '@/components/share/poster'

/** 固定字宽桩：每个字符 10px，断言不依赖真实字体 */
const measure = (text: string): number => Array.from(text).length * 10

describe('批次号时间解析', () => {
  it('20 位时间戳式批次号取前 14 位', () => {
    expect(parseBatchDateTime('20261011121039186100')).toBe('2026-10-11 12:10')
  })

  it('14 位时间戳式批次号', () => {
    expect(parseBatchDateTime('20261011121039')).toBe('2026-10-11 12:10')
  })

  it('短批次号只带日期', () => {
    expect(parseBatchDateTime('B20261022-32')).toBe('2026-10-22')
    expect(parseBatchDateTime('20261022-32')).toBe('2026-10-22')
  })

  it('uuid 式批次号不猜时间', () => {
    expect(parseBatchDateTime('4d5b54fb88144b53bd136776f6a383d3')).toBe('')
    expect(parseBatchDateTime('')).toBe('')
    expect(parseBatchDateTime(undefined as unknown as string)).toBe('')
  })

  it('格式对但日期不存在时不算解析成功', () => {
    expect(parseBatchDateTime('20261340000000')).toBe('')
    expect(parseBatchDateTime('20260231120000')).toBe('')
    expect(parseBatchDateTime('20261231250000')).toBe('')
  })

  it('非时间戳前缀的数字串不被误读', () => {
    // 前 8 位是 1234-56-78，月份 / 日期都不成立 —— 必须落在「不猜」分支
    expect(parseBatchDateTime('12345678')).toBe('')
  })
})

describe('海报时间行', () => {
  it('能解析出完成时间时写「完成于」', () => {
    expect(posterTimeLabel('20261011121039186100', new Date(2026, 9, 23))).toBe('完成于 2026-10-11 12:10')
  })

  it('解析不出时写「生成于」，不谎报完成时间', () => {
    expect(posterTimeLabel('4d5b54fb88144b53bd136776f6a383d3', new Date(2026, 9, 23)))
      .toBe('生成于 2026-10-23')
  })

  it('日期格式化按本地时区补零', () => {
    expect(formatPosterDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('海报文本换行', () => {
  it('中文按宽度逐字断行', () => {
    expect(wrapPosterText('员工满意度调查', 50, measure, 3)).toEqual(['员工满意度', '调查'])
  })

  it('行首不放空格、英文按词不拆', () => {
    expect(wrapPosterText('hello world', 60, measure, 3)).toEqual(['hello', 'world'])
    expect(wrapPosterText('hello world', 50, measure, 3)).toEqual(['hello', 'world'])
  })

  it('超出行数时最后一行以省略号收尾且不超宽', () => {
    const lines = wrapPosterText('员工满意度调查问卷', 50, measure, 1)
    expect(lines).toHaveLength(1)
    expect(lines[0].endsWith('…')).toBe(true)
    expect(measure(lines[0])).toBeLessThanOrEqual(50)
  })

  it('超长英文单词硬切，不整段溢出', () => {
    const lines = wrapPosterText('abcdefghij', 30, measure, 5)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(measure(line)).toBeLessThanOrEqual(30)
    }
  })

  it('空文本与非法宽度返回空数组', () => {
    expect(wrapPosterText('', 50, measure, 3)).toEqual([])
    expect(wrapPosterText('   ', 50, measure, 3)).toEqual([])
    expect(wrapPosterText('员工', 0, measure, 3)).toEqual([])
    expect(wrapPosterText('员工', 50, measure, 0)).toEqual([])
  })
})

describe('海报文案与调色板', () => {
  it('cTA / 邀请 / 页脚文案非空', () => {
    expect(POSTER_CTA_TEXT.length).toBeGreaterThan(0)
    expect(POSTER_INVITE_TEXT.length).toBeGreaterThan(0)
    expect(POSTER_FOOT_TEXT.length).toBeGreaterThan(0)
  })

  /**
   * canvas 里读不到 CSS 变量，调色板只能落成常量。
   * 这条守卫保证「改了 tokens.scss 却忘了改海报」会变红。
   */
  it('调色板与 tokens.scss 同值', () => {
    const tokens = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'tokens.scss'), 'utf8')
    const readToken = (name: string): string => {
      const match = tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
      return match ? match[1].toLowerCase() : ''
    }

    const pairs: Array<[string, string]> = [
      ['surface', readToken('--bx-surface')],
      ['ink', readToken('--bx-text')],
      ['ink2', readToken('--bx-text-2')],
      ['ink3', readToken('--bx-text-3')],
      ['line', readToken('--bx-line')],
      ['primary', readToken('--bx-blue')],
      ['primarySoft', readToken('--bx-blue-soft')],
      ['success', readToken('--bx-success')],
      ['successSoft', readToken('--bx-success-soft')],
      ['danger', readToken('--bx-danger')],
      ['dangerSoft', readToken('--bx-danger-soft')],
    ]

    for (const [paletteKey, tokenValue] of pairs) {
      expect(tokenValue, `tokens.scss 缺少对应的 ${paletteKey} 令牌`).not.toBe('')
      expect(POSTER_PALETTE[paletteKey as keyof typeof POSTER_PALETTE]).toBe(tokenValue)
    }
  })
})

describe('海报下载文件名', () => {
  it('去掉路径分隔符与非法字符', () => {
    expect(posterFileName('A/B:C*?"<>|')).toBe('问卷海报-A-B-C.png')
  })

  it('空标题有兜底名', () => {
    expect(posterFileName('   ')).toBe('问卷海报-作答结果.png')
  })

  it('过长的标题被截断', () => {
    const name = posterFileName('这是一个非常非常非常非常长的问卷标题用于测试截断')
    expect(name.startsWith('问卷海报-')).toBe(true)
    expect(name.length).toBeLessThan(40)
  })
})
