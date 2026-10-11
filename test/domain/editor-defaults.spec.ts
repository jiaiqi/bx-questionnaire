// @vitest-environment node

/**
 * 编辑器时间工具与空实体工厂的默认值
 *
 * 这组断言在防三件事：
 * 1. 时间被当成 UTC 处理 —— `toISOString()` 在东八区会把「刚启用」的问卷显示成 8 小时前，
 *    所以这里把本地时间串写死成期望值；
 * 2. 默认时间窗的天数算错 —— 30 天必须跨得了月、也跨得了年，所以除了写死日期，
 *    还额外断言 end 与 start 的毫秒差正好是 30 天；
 * 3. 空实体的初值漂移 —— `status` / `permType` / 得分策略这些默认值刻意与平台 `init_expr`
 *    不同，被谁改回去都会让新建问卷的起点变差。
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ACTIVITY_DAYS,
  DEFAULT_SCORE_STRATEGY,
  defaultActivityWindow,
  emptyActivity,
  emptyItem,
  emptyOption,
  formatDateTime,
} from '@/domain/editor'

/** 平台时间串 → `Date`：把空格换成 `T`，避免各端对非标格式的解析差异 */
function parsePlatformTime(value: string): Date {
  return new Date(value.replace(' ', 'T'))
}

describe('editor-defaults · formatDateTime 用本地时间', () => {
  it('拼出 YYYY-MM-DD HH:mm:ss，且取的是本地时分秒', () => {
    // 东八区若误用 toISOString()，这里会得到 '2026-10-11 00:05:03'（差 8 小时）
    expect(formatDateTime(new Date(2026, 9, 11, 8, 5, 3))).toBe('2026-10-11 08:05:03')
  })

  it('月 / 日 / 时 / 分 / 秒都补零到两位', () => {
    expect(formatDateTime(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02 03:04:05')
  })

  it('本地零点之后的时间不会塌回前一天', () => {
    // 用 UTC 字段拼串时，本地 00:30 会被写成前一天的 16:30
    expect(formatDateTime(new Date(2026, 0, 1, 0, 30, 0))).toBe('2026-01-01 00:30:00')
  })

  it('23:59:59 这种临界时刻不会被进位成次日', () => {
    expect(formatDateTime(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31 23:59:59')
  })
})

describe('editor-defaults · defaultActivityWindow', () => {
  it('跨月：1 月 20 日 + 30 天落在 2 月 19 日', () => {
    const window = defaultActivityWindow(new Date(2026, 0, 20, 10, 0, 0))
    expect(window.startTime).toBe('2026-01-20 10:00:00')
    expect(window.endTime).toBe('2026-02-19 10:00:00')
  })

  it('跨年：12 月 20 日 + 30 天落在次年 1 月 19 日', () => {
    const window = defaultActivityWindow(new Date(2026, 11, 20, 10, 0, 0))
    expect(window.startTime).toBe('2026-12-20 10:00:00')
    expect(window.endTime).toBe('2027-01-19 10:00:00')
  })

  it('end 与 start 的毫秒差正好是 30 天', () => {
    // 写死 2592000000 = 30 * 24 * 3600 * 1000；跨月跨年算错时这条会先红
    const window = defaultActivityWindow(new Date(2026, 11, 20, 10, 0, 0))
    const diff = parsePlatformTime(window.endTime).getTime() - parsePlatformTime(window.startTime).getTime()
    expect(diff).toBe(2592000000)
  })

  it('两个时间都是平台列能直接写入的格式', () => {
    const window = defaultActivityWindow(new Date(2026, 5, 15, 9, 8, 7))
    expect(window.startTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(window.endTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(window.startTime).toBe('2026-06-15 09:08:07')
    expect(window.endTime).toBe('2026-07-15 09:08:07')
  })

  it('默认有效期是 30 天', () => {
    expect(DEFAULT_ACTIVITY_DAYS).toBe(30)
  })
})

describe('editor-defaults · 空实体工厂', () => {
  it('emptyActivity 用「进行中」「匿名访问」这些更少踩坑的起点', () => {
    const activity = emptyActivity()
    expect(activity.activityNo).toBe('')
    expect(activity.title).toBe('')
    expect(activity.classify).toBe('')
    expect(activity.keyword).toBe('')
    expect(activity.activityImage).toBe('')
    expect(activity.startTime).toBe('')
    expect(activity.endTime).toBe('')
    expect(activity.remark).toBe('')
    expect(activity.status).toBe('进行中')
    expect(activity.permType).toBe('匿名访问')
    expect(activity.answerTimes).toBe('1次')
    expect(activity.itemDispWay).toBe('全部')
    expect(activity.modifyAfterSubmit).toBe('否')
    expect(activity.modifyPeriond).toBe('一次')
    expect(activity.actOption).toBe('提交确认')
    expect(activity.passingMark).toBe('')
    expect(activity.raw).toBeNull()
  })

  it('得分策略默认取平台回填的「完全正确」', () => {
    expect(DEFAULT_SCORE_STRATEGY).toBe('完全正确')
  })

  it('emptyOption 的初值：不是答案、0 分、没有平台主键', () => {
    const option = emptyOption()
    expect(option.optionNo).toBe('')
    expect(option.value).toBe('')
    expect(option.isAnswer).toBe(false)
    expect(option.points).toBe(0)
    expect(option.raw).toBeNull()
    expect(option.clientKey).toMatch(/^option-\d+$/)
  })

  it('两次 emptyOption 拿到不同的 clientKey —— 用下标当 key 会在重排时错位', () => {
    expect(emptyOption().clientKey).not.toBe(emptyOption().clientKey)
  })

  it('emptyItem 复制传入的 attr，不与该对象共享引用', () => {
    const attr = { radioType: 'single' }
    const item = emptyItem('单选', attr)
    expect(item.type).toBe('单选')
    expect(item.attr).toEqual({ radioType: 'single' })

    attr.radioType = 'multi'
    expect(item.attr).toEqual({ radioType: 'single' })
  })

  it('emptyItem 的其余初值：无选项、非必填、0 分、带客户端标识', () => {
    const item = emptyItem('文本', { view_model: 'text' })
    expect(item.itemNo).toBe('')
    expect(item.title).toBe('')
    expect(item.required).toBe(false)
    expect(item.points).toBe(0)
    expect(item.answer).toBe('')
    expect(item.answerAnalysis).toBe('')
    expect(item.scoreStrategy).toBe('完全正确')
    expect(item.options).toEqual([])
    expect(item.raw).toBeNull()
    expect(item.clientKey).toMatch(/^item-\d+$/)
  })
})
