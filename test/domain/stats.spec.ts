import type { AnswerMap, QuestionField } from '@/domain/questionnaire/types'
import type { ReplySummary, StatsDetail } from '@/domain/stats/types'

import { describe, expect, it } from 'vitest'

import {
  buildOverview,
  buildOverviewFromAggregates,
  buildQuestionAggregateCsv,
  buildQuestionStats,
  buildQuestionStatsFromAggregates,
  buildRepliesCsv,
  buildScoreBuckets,
  buildScoreBucketsFromAggregates,
  buildTrend,
  buildTrendFromAggregates,
  filterReplies,
  normalizeReply,
  parseDateTime,
  widgetLabel,
} from '@/domain/stats'

function field(partial: Partial<QuestionField> & Pick<QuestionField, 'key' | 'label'>): QuestionField {
  return {
    seq: 1,
    index: 1,
    widget: 'text',
    required: false,
    multi: false,
    points: 0,
    options: [],
    ...partial,
    raw: partial.raw ?? ({} as QuestionField['raw']),
  }
}

function reply(partial: Partial<ReplySummary> = {}): ReplySummary {
  return {
    batchNo: 'B1',
    state: '完成',
    score: 10,
    startTime: '2026-10-20 10:00:00',
    endTime: '2026-10-20 10:01:00',
    createTime: '2026-10-20 10:00:00',
    userName: '张三',
    userType: '微信',
    durationSec: 60,
    ...partial,
  }
}

function detail(batchNo: string, answers: AnswerMap): StatsDetail {
  return { batchNo, answers }
}

describe('parseDateTime / normalizeReply', () => {
  it('解析平台时间格式', () => {
    expect(parseDateTime('2026-10-20 10:00:00')).toBeTypeOf('number')
    expect(parseDateTime('2026-10-20T10:00:00')).toBeTypeOf('number')
    expect(parseDateTime('bad')).toBeNull()
    expect(parseDateTime(null)).toBeNull()
  })

  it('归一化记录：分数、用时、昵称回退', () => {
    const row = normalizeReply({
      fill_batch_no: 'B2',
      state: '完成',
      score: '15.5',
      start_time: '2026-10-20 10:00:00',
      end_time: '2026-10-20 10:02:30',
      create_time: '2026-10-20 10:00:00',
      nickname: '',
      user_name: '李四',
      user_type: '账号',
    })
    expect(row.score).toBe(15.5)
    expect(row.durationSec).toBe(150)
    expect(row.userName).toBe('李四')
    expect(row.userType).toBe('账号')
  })

  it('起止时间倒挂/缺失时用时为 null', () => {
    expect(normalizeReply({ start_time: '2026-10-20 10:02:00', end_time: '2026-10-20 10:00:00' }).durationSec).toBeNull()
    expect(normalizeReply({ end_time: '' }).durationSec).toBeNull()
  })
})

describe('filterReplies', () => {
  const now = new Date(2026, 9, 20, 12, 0, 0).getTime()

  it('全部不过滤', () => {
    const replies = [reply(), reply({ createTime: '2026-01-01 00:00:00' })]
    expect(filterReplies(replies, 'all', now)).toHaveLength(2)
  })

  it('近 7 天/30 天按创建时间过滤', () => {
    const replies = [
      reply({ batchNo: 'today', createTime: '2026-10-20 10:00:00' }),
      reply({ batchNo: 'd8', createTime: '2026-10-12 10:00:00' }),
      reply({ batchNo: 'd20', createTime: '2026-09-30 10:00:00' }),
    ]
    expect(filterReplies(replies, '7d', now).map(item => item.batchNo)).toEqual(['today'])
    expect(filterReplies(replies, '30d', now).map(item => item.batchNo)).toEqual(['today', 'd8', 'd20'])
  })
})

describe('buildOverview', () => {
  it('统计回收/完成率/平均分/平均用时', () => {
    const replies = [
      reply({ score: 10, durationSec: 60 }),
      reply({ batchNo: 'B2', score: 20, durationSec: 120 }),
      reply({ batchNo: 'B3', state: '未完成', score: null, durationSec: 30 }),
    ]
    const overview = buildOverview(replies)
    expect(overview.total).toBe(3)
    expect(overview.completed).toBe(2)
    expect(overview.completionRate).toBeCloseTo(2 / 3)
    expect(overview.avgScore).toBe(15)
    expect(overview.maxScore).toBe(20)
    expect(overview.minScore).toBe(10)
    expect(overview.avgDurationSec).toBe(90)
  })

  it('空数据不产生 NaN', () => {
    const overview = buildOverview([])
    expect(overview).toMatchObject({
      total: 0,
      completed: 0,
      completionRate: 0,
      avgScore: null,
      avgDurationSec: null,
    })
  })
})

describe('buildTrend', () => {
  it('补齐没有提交的日期', () => {
    const now = new Date(2026, 9, 20, 12, 0, 0)
    const replies = [
      reply({ batchNo: 'A', createTime: '2026-10-20 09:00:00' }),
      reply({ batchNo: 'B', createTime: '2026-10-20 10:00:00' }),
      reply({ batchNo: 'C', createTime: '2026-10-17 10:00:00' }),
    ]
    const trend = buildTrend(replies, 5, now)
    expect(trend).toHaveLength(5)
    expect(trend[trend.length - 1]).toMatchObject({ date: '2026-10-20', count: 2 })
    expect(trend[1]).toMatchObject({ date: '2026-10-17', count: 1 })
    expect(trend[0]?.count).toBe(0)
  })
})

describe('buildScoreBuckets', () => {
  it('按满分五等分统计', () => {
    const buckets = buildScoreBuckets(
      [reply({ score: 0 }), reply({ batchNo: 'B2', score: 10 }), reply({ batchNo: 'B3', score: 20 })],
      20,
    )
    expect(buckets).toHaveLength(5)
    expect(buckets[0]?.count).toBe(1)
    expect(buckets[2]?.count).toBe(1)
    expect(buckets[4]?.count).toBe(1)
  })

  it('满分为 0 或没有分数时返回空', () => {
    expect(buildScoreBuckets([reply()], 0)).toEqual([])
    expect(buildScoreBuckets([reply({ score: null })], 20)).toEqual([])
  })
})

describe('buildQuestionStats', () => {
  const choice = field({
    key: 'q1',
    label: '你更喜欢哪种沟通方式？',
    index: 1,
    widget: 'radio',
    options: [
      { no: 'o1', value: '1', viewNo: 'A', label: '面对面', serialChar: 'A', isAnswer: false },
      { no: 'o2', value: '2', viewNo: 'B', label: '线上', serialChar: 'B', isAnswer: false },
    ],
  })

  const multi = field({
    key: 'q2',
    label: '你用过哪些功能？',
    index: 2,
    widget: 'checkbox',
    multi: true,
    options: [
      { no: 'm1', value: '1', viewNo: 'A', label: '报名', serialChar: 'A', isAnswer: false },
      { no: 'm2', value: '2', viewNo: 'B', label: '问卷', serialChar: 'B', isAnswer: false },
    ],
  })

  it('单选题：计数、百分比基数为作答人数、未答单独统计', () => {
    const stats = buildQuestionStats([choice], [
      detail('B1', { q1: 'o1' }),
      detail('B2', { q1: 'o2' }),
      detail('B3', {}),
    ])
    const stat = stats[0]
    expect(stat).toMatchObject({ kind: 'choice', answered: 2, unanswered: 1 })
    if (stat?.kind !== 'choice') {
      throw new Error('expected choice stat')
    }
    expect(stat.options.map(bar => [bar.label, bar.count, bar.percent])).toEqual([
      ['面对面', 1, 0.5],
      ['线上', 1, 0.5],
    ])
  })

  it('多选题：同一人重复值不重复计数，未知值归入其他', () => {
    const stats = buildQuestionStats([multi], [
      detail('B1', { q2: ['m1', 'm2', 'm1'] }),
      detail('B2', { q2: ['m1', 'oops'] }),
    ])
    const stat = stats[0]
    if (stat?.kind !== 'choice') {
      throw new Error('expected choice stat')
    }
    expect(stat.options.map(bar => [bar.label, bar.count])).toEqual([
      ['报名', 2],
      ['问卷', 1],
      ['其他', 1],
    ])
  })

  it('数字题：均值/中位数/极值与分段', () => {
    const numberField = field({ key: 'q3', label: '年龄', index: 3, widget: 'number' })
    const stats = buildQuestionStats([numberField], [
      detail('B1', { q3: '1' }),
      detail('B2', { q3: '2' }),
      detail('B3', { q3: '3' }),
      detail('B4', { q3: '4' }),
      detail('B5', { q3: '5' }),
      detail('B6', {}),
    ])
    const stat = stats[0]
    if (stat?.kind !== 'number') {
      throw new Error('expected number stat')
    }
    expect(stat.answered).toBe(5)
    expect(stat.unanswered).toBe(1)
    expect(stat.numeric).toEqual({ avg: 3, median: 3, min: 1, max: 5 })
    expect(stat.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(5)
  })

  it('文本题：样本最多 20 条，保留批次号', () => {
    const textField = field({ key: 'q4', label: '建议', index: 4, widget: 'textarea' })
    const details = Array.from({ length: 25 }, (_, index) => detail(`B${index + 1}`, { q4: `建议 ${index + 1}` }))
    const stats = buildQuestionStats([textField], details)
    const stat = stats[0]
    if (stat?.kind !== 'text') {
      throw new Error('expected text stat')
    }
    expect(stat.answered).toBe(25)
    expect(stat.samples).toHaveLength(20)
    expect(stat.samples[0]).toEqual({ batchNo: 'B1', value: '建议 1' })
  })

  it('分节符不参与统计；图片/地址归入其他', () => {
    const section = field({ key: 's1', label: '第一部分', index: 1, widget: 'section' })
    const image = field({ key: 'q5', label: '上传照片', index: 2, widget: 'image' })
    const address = field({ key: 'q6', label: '所在地', index: 3, widget: 'address' })
    const stats = buildQuestionStats([section, image, address], [
      detail('B1', { q5: ['file-1'], q6: '110101' }),
    ])
    expect(stats).toHaveLength(2)
    expect(stats.map(stat => stat.kind)).toEqual(['other', 'other'])
    expect(stats[0]?.answered).toBe(1)
  })
})

describe('widgetLabel', () => {
  it('题型中文名', () => {
    expect(widgetLabel('checkbox')).toBe('多选')
    expect(widgetLabel('ref')).toBe('引用')
  })
})

describe('cSV 导出', () => {
  it('汇总 CSV 含表头与转义', () => {
    const csv = buildRepliesCsv([
      reply({ userName: '张,三', state: '完成', score: 12.5 }),
    ])
    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('批次号')
    expect(lines[1]).toContain('"张,三"')
    expect(lines[1]).toContain('12.5')
  })
})

describe('服务端聚合', () => {
  it('状态聚合 → 概览（平均用时交给客户端补算）', () => {
    const overview = buildOverviewFromAggregates([
      { state: '完成', count: 2, scoreCount: 2, sumScore: 30, maxScore: 20, minScore: 10 },
      { state: '未完成', count: 1, scoreCount: 0, sumScore: null, maxScore: null, minScore: null },
    ])
    expect(overview.total).toBe(3)
    expect(overview.completed).toBe(2)
    expect(overview.completionRate).toBeCloseTo(2 / 3)
    expect(overview.avgScore).toBe(15)
    expect(overview.maxScore).toBe(20)
    expect(overview.minScore).toBe(10)
    expect(overview.avgDurationSec).toBeNull()
  })

  it('按天趋势补齐 0 值', () => {
    const trend = buildTrendFromAggregates(
      [{ date: '2026-10-20', count: 3 }, { date: '2026-10-18', count: 1 }],
      3,
      new Date(2026, 9, 20, 12, 0, 0),
    )
    expect(trend.map(point => point.count)).toEqual([1, 0, 3])
  })

  it('分数分布按满分五等分', () => {
    const buckets = buildScoreBucketsFromAggregates(
      [{ score: 0, count: 1 }, { score: 10, count: 2 }, { score: 20, count: 3 }],
      20,
    )
    expect(buckets.map(bucket => bucket.count)).toEqual([1, 0, 2, 0, 3])
  })

  it('逐题聚合：选项计数、未答与文本去重人数', () => {
    const choice = field({
      key: 'q1',
      label: '沟通方式',
      index: 1,
      widget: 'radio',
      options: [
        { no: 'o1', value: '1', viewNo: 'A', label: '面对面', serialChar: 'A', isAnswer: false },
        { no: 'o2', value: '2', viewNo: 'B', label: '线上', serialChar: 'B', isAnswer: false },
      ],
    })
    const text = field({ key: 'q2', label: '建议', index: 2, widget: 'textarea' })
    const stats = buildQuestionStatsFromAggregates([choice, text], [
      { batchNo: 'B1', rows: [
        { item_title: '沟通方式', svalue: '面对面', cnt: 1 },
        { item_title: '建议', svalue: '很好', cnt: 1 },
      ] },
      { batchNo: 'B2', rows: [
        { item_title: '沟通方式', svalue: '面对面', cnt: 1 },
        { item_title: '建议', svalue: '很好', cnt: 1 },
      ] },
      { batchNo: 'B3', rows: [
        { item_title: '沟通方式', svalue: null, cnt: 1 },
      ] },
    ])
    const first = stats[0]
    if (first?.kind !== 'choice') {
      throw new Error('expected choice stat')
    }
    expect(first.answered).toBe(2)
    expect(first.unanswered).toBe(1)
    expect(first.options.map(bar => bar.count)).toEqual([2, 0])
    const second = stats[1]
    if (second?.kind !== 'text') {
      throw new Error('expected text stat')
    }
    expect(second.answered).toBe(2)
    expect(second.samples).toEqual([{ value: '很好', count: 2 }])
  })

  /**
   * 回归：`answered` 的基数必须是**实际传入的批次数**
   *
   * 曾经调用方把「全量完成批次数」当第三个参数传进来，而未答只在抽样里统计，
   * 于是 `answered = 全量 − 抽样内未答`：完成答卷超过抽样上限（200）时系统性虚高。
   * 现在函数只从 `batches` 取基数，`answered + unanswered` 恒等于它的长度。
   */
  it('逐题统计：answered + unanswered 恒等于传入的批次数', () => {
    const choice = field({
      key: 'q1',
      label: '沟通方式',
      index: 1,
      widget: 'radio',
      options: [
        { no: 'o1', value: '1', viewNo: 'A', label: '面对面', serialChar: 'A', isAnswer: false },
      ],
    })
    const stats = buildQuestionStatsFromAggregates([choice], [
      { batchNo: 'B1', rows: [{ item_title: '沟通方式', svalue: '面对面', cnt: 1 }] },
      { batchNo: 'B2', rows: [] },
    ])
    const stat = stats[0]
    if (stat?.kind !== 'choice') {
      throw new Error('expected choice stat')
    }
    expect(stat.answered).toBe(1)
    expect(stat.unanswered).toBe(1)
    expect(stat.answered + stat.unanswered).toBe(2)
  })

  it('逐题分布 CSV 按题目展开', () => {
    const choice = field({
      key: 'q1',
      label: '沟通方式',
      index: 1,
      widget: 'radio',
      options: [
        { no: 'o1', value: '1', viewNo: 'A', label: '面对面', serialChar: 'A', isAnswer: false },
      ],
    })
    const stats = buildQuestionStatsFromAggregates([choice], [
      { batchNo: 'B1', rows: [{ item_title: '沟通方式', svalue: '面对面', cnt: 1 }] },
    ])
    const csv = buildQuestionAggregateCsv(stats)
    expect(csv).toContain('面对面')
    expect(csv).toContain('1')
  })
})
