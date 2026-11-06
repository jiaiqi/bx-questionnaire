/**
 * 统计聚合纯函数
 *
 * 输入只有「平台记录行 / 领域字段 / 归一化答案」，不读全局状态、不发请求；
 * 页面与 composable 只负责取数与编排。所有函数都可在 Node 环境直接单测。
 */

import type {
  ChoiceQuestionStat,
  NumberQuestionStat,
  NumericBucket,
  OptionBar,
  QuestionStat,
  ReplySummary,
  ScoreBucket,
  StatsDetail,
  StatsOverview,
  StatsRange,
  TextSample,
  TrendPoint,
} from './types'
import type { AnswerValue, QuestionField, QuestionWidget } from '@/domain/questionnaire/types'

import { stripQuestionTitleIndex } from '@/domain/questionnaire/format'
import { toArray } from '@/domain/questionnaire/types'

/** 平台时间格式 `YYYY-MM-DD HH:mm:ss` 的宽松解析（本地时区） */
const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/

/** 解析为毫秒时间戳；非法/空值返回 null */
export function parseDateTime(text: string | null | undefined): number | null {
  if (!text) {
    return null
  }
  const match = DATE_TIME_RE.exec(String(text).trim())
  if (!match) {
    return null
  }
  const [, year, month, day, hour, minute, second] = match
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0),
  ).getTime()
}

/** 平台记录行（只声明本层用到的列，避免依赖 api 类型） */
export interface RawReplyRow {
  fill_batch_no?: string | null
  state?: string | null
  score?: string | number | null
  start_time?: string | null
  end_time?: string | null
  create_time?: string | null
  nickname?: string | null
  user_name?: string | null
  user_no?: string | null
  user_type?: string | null
}

/** 归一化一次作答记录 */
export function normalizeReply(row: RawReplyRow): ReplySummary {
  const start = parseDateTime(row.start_time)
  const end = parseDateTime(row.end_time)
  let durationSec: number | null = null
  if (start !== null && end !== null && end >= start) {
    durationSec = Math.round((end - start) / 1000)
  }
  const score = row.score === null || row.score === undefined || String(row.score).trim() === ''
    ? null
    : Number(row.score)
  return {
    batchNo: String(row.fill_batch_no ?? ''),
    state: String(row.state ?? ''),
    score: score !== null && Number.isFinite(score) ? score : null,
    startTime: String(row.start_time ?? ''),
    endTime: String(row.end_time ?? ''),
    createTime: String(row.create_time ?? row.start_time ?? row.end_time ?? ''),
    userName: String(row.nickname ?? '').trim()
      || String(row.user_name ?? '').trim()
      || String(row.user_no ?? '').trim()
      || '匿名',
    userType: String(row.user_type ?? ''),
    durationSec,
  }
}

/** 按时间范围过滤（以提交时间/创建时间倒推） */
export function filterReplies(
  replies: ReplySummary[],
  range: StatsRange,
  now: number = Date.now(),
): ReplySummary[] {
  if (range === 'all') {
    return replies
  }
  const days = range === '7d' ? 7 : 30
  const cutoff = now - days * 24 * 60 * 60 * 1000
  return replies.filter((reply) => {
    const time = parseDateTime(reply.createTime)
      ?? parseDateTime(reply.endTime)
      ?? parseDateTime(reply.startTime)
    return time !== null && time >= cutoff
  })
}

/** 概览指标 */
export function buildOverview(replies: ReplySummary[]): StatsOverview {
  const total = replies.length
  const completedReplies = replies.filter(reply => reply.state === '完成')
  const scores = completedReplies
    .map(reply => reply.score)
    .filter((score): score is number => score !== null && Number.isFinite(score))
  const durations = completedReplies
    .map(reply => reply.durationSec)
    .filter((seconds): seconds is number => seconds !== null && seconds >= 0)
  const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0)
  return {
    total,
    completed: completedReplies.length,
    completionRate: total === 0 ? 0 : completedReplies.length / total,
    avgScore: scores.length === 0 ? null : sum(scores) / scores.length,
    maxScore: scores.length === 0 ? null : Math.max(...scores),
    minScore: scores.length === 0 ? null : Math.min(...scores),
    avgDurationSec: durations.length === 0 ? null : sum(durations) / durations.length,
  }
}

function dateKeyOf(reply: ReplySummary): string {
  const time = parseDateTime(reply.createTime)
    ?? parseDateTime(reply.endTime)
    ?? parseDateTime(reply.startTime)
  if (time === null) {
    return ''
  }
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 最近 N 天的提交趋势（含 0 的日期） */
export function buildTrend(
  replies: ReplySummary[],
  days = 14,
  now: Date = new Date(),
): TrendPoint[] {
  const safeDays = Math.max(1, Math.floor(days))
  const countByDate = new Map<string, number>()
  for (const reply of replies) {
    const key = dateKeyOf(reply)
    if (key) {
      countByDate.set(key, (countByDate.get(key) ?? 0) + 1)
    }
  }
  const points: TrendPoint[] = []
  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    points.push({
      date: dateText,
      label: `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      count: countByDate.get(dateText) ?? 0,
    })
  }
  return points
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** 分数段（固定 5 段，边界按满分均分） */
export function buildScoreBuckets(
  replies: ReplySummary[],
  maxScore: number,
): ScoreBucket[] {
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return []
  }
  const scores = replies
    .filter(reply => reply.state === '完成')
    .map(reply => reply.score)
    .filter((score): score is number => score !== null && Number.isFinite(score))
  if (scores.length === 0) {
    return []
  }
  const bucketCount = 5
  const width = maxScore / bucketCount
  const buckets: ScoreBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const low = index * width
    const high = index === bucketCount - 1 ? maxScore : (index + 1) * width
    return {
      label: `${round1(low)}–${round1(high)} 分`,
      count: 0,
    }
  })
  for (const score of scores) {
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor(score / width)))
    buckets[index]!.count += 1
  }
  return buckets
}

/** 答案是否是「有内容」：空串、空数组都算未答 */
function answerValues(answer: AnswerValue | undefined): string[] {
  return toArray(answer)
    .map(value => String(value).trim())
    .filter(Boolean)
}

function matchOption(field: QuestionField, value: string) {
  return field.options.find(option =>
    option.no === value
    || option.value === value
    || option.label === value
    || option.viewNo === value,
  )
}

/** 选项题的分布 */
function buildChoiceStat(
  field: QuestionField,
  details: StatsDetail[],
  base: Omit<ChoiceQuestionStat, 'kind' | 'multi' | 'options'>,
): ChoiceQuestionStat {
  const bars: OptionBar[] = field.options.map(option => ({
    value: option.value,
    label: option.label,
    count: 0,
    percent: 0,
  }))
  const barByKey = new Map<string, OptionBar>()
  field.options.forEach((option, index) => {
    const bar = bars[index]!
    barByKey.set(option.no, bar)
    barByKey.set(option.value, bar)
    barByKey.set(option.label, bar)
    barByKey.set(option.viewNo, bar)
  })

  let otherCount = 0
  for (const detail of details) {
    const values = answerValues(detail.answers[field.key])
    if (values.length === 0) {
      continue
    }
    const counted = new Set<OptionBar>()
    for (const value of values) {
      const option = matchOption(field, value)
      const bar = option ? barByKey.get(option.no) : undefined
      if (bar && !counted.has(bar)) {
        bar.count += 1
        counted.add(bar)
      }
      else if (!option) {
        otherCount += 1
      }
    }
  }
  if (otherCount > 0) {
    bars.push({ value: '__other__', label: '其他', count: otherCount, percent: 0 })
  }
  for (const bar of bars) {
    bar.percent = base.answered === 0 ? 0 : bar.count / base.answered
  }
  return { ...base, kind: 'choice', multi: field.multi, options: bars }
}

/** 数字题的统计与分段 */
function buildNumberStat(
  field: QuestionField,
  details: StatsDetail[],
  base: Omit<NumberQuestionStat, 'kind' | 'numeric' | 'buckets'>,
): NumberQuestionStat {
  const values = details
    .map(detail => Number(answerValues(detail.answers[field.key])[0] ?? Number.NaN))
    .filter(value => Number.isFinite(value))
  if (values.length === 0) {
    return {
      ...base,
      kind: 'number',
      numeric: { avg: 0, median: 0, min: 0, max: 0 },
      buckets: [],
    }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0)
  const min = sorted[0] ?? 0
  const max = sorted[sorted.length - 1] ?? 0
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length

  const buckets: NumericBucket[] = []
  if (min === max) {
    buckets.push({ label: String(min), count: values.length })
  }
  else {
    const count = 5
    const width = (max - min) / count
    for (let index = 0; index < count; index += 1) {
      const low = min + index * width
      const high = index === count - 1 ? max : min + (index + 1) * width
      buckets.push({
        label: `${round1(low)}–${round1(high)}`,
        count: 0,
      })
    }
    for (const value of values) {
      const index = Math.min(count - 1, Math.max(0, Math.floor((value - min) / width)))
      buckets[index]!.count += 1
    }
  }
  return {
    ...base,
    kind: 'number',
    numeric: { avg, median, min, max },
    buckets,
  }
}

/** 文本/其他题型的样本（最多 20 条） */
function buildSamples(field: QuestionField, details: StatsDetail[]): TextSample[] {
  const samples: TextSample[] = []
  for (const detail of details) {
    const values = answerValues(detail.answers[field.key])
    if (values.length === 0) {
      continue
    }
    samples.push({
      batchNo: detail.batchNo,
      value: values.join('、'),
    })
    if (samples.length >= 20) {
      break
    }
  }
  return samples
}

function widgetKind(widget: QuestionWidget): QuestionStat['kind'] {
  if (widget === 'radio' || widget === 'checkbox') {
    return 'choice'
  }
  if (widget === 'number') {
    return 'number'
  }
  if (widget === 'text' || widget === 'textarea') {
    return 'text'
  }
  return 'other'
}

/** 逐题统计 */
export function buildQuestionStats(
  fields: QuestionField[],
  details: StatsDetail[],
): QuestionStat[] {
  const answerable = fields.filter(field => field.widget !== 'section')
  return answerable.map((field) => {
    const answered = details.filter(detail => answerValues(detail.answers[field.key]).length > 0).length
    const base = {
      key: field.key,
      index: field.index,
      label: field.label,
      widget: field.widget,
      required: field.required,
      answered,
      unanswered: Math.max(0, details.length - answered),
    }
    const kind = widgetKind(field.widget)
    if (kind === 'choice') {
      return buildChoiceStat(field, details, base)
    }
    if (kind === 'number') {
      return buildNumberStat(field, details, base)
    }
    const samples = buildSamples(field, details)
    if (kind === 'text') {
      return { ...base, kind: 'text', samples }
    }
    return { ...base, kind: 'other', samples }
  })
}

/** 题型展示名（导出 CSV 用） */
export function buildQuestionAggregateCsv(
  stats: QuestionStat[],
): string {
  const header = ['题号', '题干', '题型', '答案 / 区间', '人数']
  const lines = [header.map(escapeCsvCsv).join(',')]
  for (const stat of stats) {
    if (stat.kind === 'choice') {
      for (const bar of stat.options) {
        lines.push([stat.index, stat.label, widgetLabel(stat.widget), bar.label, bar.count].map(escapeCsvCsv).join(','))
      }
      continue
    }
    if (stat.kind === 'number') {
      for (const bucket of stat.buckets) {
        lines.push([stat.index, stat.label, widgetLabel(stat.widget), bucket.label, bucket.count].map(escapeCsvCsv).join(','))
      }
      continue
    }
    for (const sample of stat.samples) {
      lines.push([stat.index, stat.label, widgetLabel(stat.widget), sample.value, sample.count ?? ''].map(escapeCsvCsv).join(','))
    }
  }
  return lines.join('\r\n')
}

function escapeCsvCsv(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** 服务端聚合输入：状态行 */
export interface AggregateStateRow {
  state: string
  count: number
  scoreCount: number
  sumScore: number | null
  maxScore: number | null
  minScore: number | null
}

/** 服务端聚合输入：按天趋势行 */
export interface AggregateTrendRow {
  date: string
  count: number
}

/** 服务端聚合输入：分数分布行 */
export interface AggregateScoreRow {
  score: number
  count: number
}

/** 服务端聚合输入：逐题行（merge group） */
export interface AggregateQuestionRow {
  item_title?: string | null
  item_seq?: string | number | null
  svalue?: string | null
  cnt?: string | number | null
}

/** 一个批次的逐题聚合 */
export interface BatchQuestionAggregate {
  batchNo: string
  rows: AggregateQuestionRow[]
}

/** 服务端状态聚合 → 概览（注意：聚合接口没有起止时间，平均用时为 null） */
export function buildOverviewFromAggregates(rows: AggregateStateRow[]): StatsOverview {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const completed = rows
    .filter(row => row.state === '完成')
    .reduce((sum, row) => sum + row.count, 0)
  const scoredCount = rows.reduce((sum, row) => sum + row.scoreCount, 0)
  const totalScore = rows.reduce((sum, row) => sum + (row.sumScore ?? 0), 0)
  const maxes = rows.map(row => row.maxScore).filter((value): value is number => value !== null)
  const mins = rows.map(row => row.minScore).filter((value): value is number => value !== null)
  return {
    total,
    completed,
    completionRate: total === 0 ? 0 : completed / total,
    avgScore: scoredCount === 0 ? null : totalScore / scoredCount,
    maxScore: maxes.length === 0 ? null : Math.max(...maxes),
    minScore: mins.length === 0 ? null : Math.min(...mins),
    avgDurationSec: null,
  }
}

/** 服务端按天趋势 → 最近 N 天（含 0） */
export function buildTrendFromAggregates(
  rows: AggregateTrendRow[],
  days = 14,
  now: Date = new Date(),
): TrendPoint[] {
  const safeDays = Math.max(1, Math.floor(days))
  const countByDate = new Map(rows.map(row => [row.date, row.count]))
  const points: TrendPoint[] = []
  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    points.push({
      date: dateText,
      label: `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      count: countByDate.get(dateText) ?? 0,
    })
  }
  return points
}

/** 服务端分数分布 → 五段 */
export function buildScoreBucketsFromAggregates(
  rows: AggregateScoreRow[],
  maxScore: number,
): ScoreBucket[] {
  if (!Number.isFinite(maxScore) || maxScore <= 0 || rows.length === 0) {
    return []
  }
  const bucketCount = 5
  const width = maxScore / bucketCount
  const buckets: ScoreBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const low = index * width
    const high = index === bucketCount - 1 ? maxScore : (index + 1) * width
    return { label: `${round1(low)}–${round1(high)} 分`, count: 0 }
  })
  for (const row of rows) {
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor(row.score / width)))
    buckets[index]!.count += row.count
  }
  return buckets
}

function aggregateTitle(label: string): string {
  return stripQuestionTitleIndex(label).trim()
}

function positiveCount(value: unknown): number {
  const num = Number(value ?? 0)
  return Number.isFinite(num) && num > 0 ? num : 1
}

/**
 * 服务端逐题聚合 → 题目统计
 *
 * 输入是「每批次 × item_title/svalue/count_all」的聚合行，不再有逐份明细：
 * - 选项题：按选项累加人数；多选每人每个选项各一行，累加即选择次数；
 * - 数字题：按「值 × 人数」还原加权分布；
 * - 文本题：只保留去重后的答案与人数（没有逐份昵称，这是聚合口径的取舍）。
 *
 * **基数就是传进来的 `batches.length`，没有单独的全量参数**：未答数只在这批样本里
 * 统计，一旦允许调用方传「全量完成批次数」当基数，`answered = 全量 − 抽样内未答`
 * 会在完成答卷超过抽样上限时系统性虚高。抽样口径由调用方在页面上注明。
 */
export function buildQuestionStatsFromAggregates(
  fields: QuestionField[],
  batches: BatchQuestionAggregate[],
): QuestionStat[] {
  const valueCounts = new Map<string, Map<string, number>>()
  const unanswered = new Map<string, number>()
  for (const field of fields) {
    valueCounts.set(field.key, new Map())
    unanswered.set(field.key, 0)
  }

  for (const batch of batches) {
    const rowsByTitle = new Map<string, AggregateQuestionRow[]>()
    for (const row of batch.rows) {
      const title = aggregateTitle(String(row.item_title ?? ''))
      if (!title) {
        continue
      }
      const list = rowsByTitle.get(title) ?? []
      list.push(row)
      rowsByTitle.set(title, list)
    }
    for (const field of fields) {
      const matchedRows = rowsByTitle.get(aggregateTitle(field.label)) ?? []
      const values = matchedRows.filter(row => String(row.svalue ?? '').trim() !== '')
      if (values.length === 0) {
        // 该批次没有这道题的聚合行，或只有 null：都算未答
        unanswered.set(field.key, (unanswered.get(field.key) ?? 0) + 1)
        continue
      }
      const counts = valueCounts.get(field.key)
      if (!counts) {
        continue
      }
      for (const row of values) {
        const value = String(row.svalue ?? '').trim()
        counts.set(value, (counts.get(value) ?? 0) + positiveCount(row.cnt))
      }
    }
  }

  const answerable = fields.filter(field => field.widget !== 'section')
  return answerable.map((field) => {
    const counts = valueCounts.get(field.key) ?? new Map<string, number>()
    const missing = unanswered.get(field.key) ?? 0
    const answered = Math.max(0, batches.length - missing)
    const base = {
      key: field.key,
      index: field.index,
      label: field.label,
      widget: field.widget,
      required: field.required,
      answered,
      unanswered: missing,
    }
    const kind = widgetKind(field.widget)

    if (kind === 'choice') {
      const bars: OptionBar[] = field.options.map(option => ({
        value: option.value,
        label: option.label,
        count: 0,
        percent: 0,
      }))
      let other = 0
      for (const [value, count] of counts) {
        const option = matchOption(field, value)
        const index = option ? field.options.findIndex(item => item.no === option.no) : -1
        if (index >= 0) {
          const bar = bars[index]
          if (bar) {
            bar.count += count
          }
        }
        else {
          other += count
        }
      }
      if (other > 0) {
        bars.push({ value: '__other__', label: '其他', count: other, percent: 0 })
      }
      for (const bar of bars) {
        bar.percent = answered === 0 ? 0 : bar.count / answered
      }
      const stat: ChoiceQuestionStat = { ...base, kind: 'choice', multi: field.multi, options: bars }
      return stat
    }

    if (kind === 'number') {
      const weighted: number[] = []
      for (const [value, count] of counts) {
        const num = Number(value)
        if (Number.isFinite(num)) {
          for (let index = 0; index < Math.min(count, 1000); index += 1) {
            weighted.push(num)
          }
        }
      }
      const fakeDetails: StatsDetail[] = weighted.map((value, index) => ({
        batchNo: String(index),
        answers: { [field.key]: String(value) },
      }))
      const numberStat = buildNumberStat(
        field,
        fakeDetails,
        base as Omit<NumberQuestionStat, 'kind' | 'numeric' | 'buckets'>,
      )
      return numberStat
    }

    const samples: TextSample[] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({ value, count }))
    if (kind === 'text') {
      return { ...base, kind: 'text', samples }
    }
    return { ...base, kind: 'other', samples }
  })
}

/** 题型展示名（导出 CSV 用） */
export function widgetLabel(widget: QuestionWidget): string {
  const labels: Record<string, string> = {
    text: '单行文本',
    textarea: '多行文本',
    number: '数字',
    radio: '单选',
    checkbox: '多选',
    date: '日期',
    time: '时间',
    datetime: '日期时间',
    image: '图片',
    address: '地址',
    ref: '引用',
    section: '分节符',
    unknown: '未知',
  }
  return labels[widget] ?? widget
}

/** 把一次作答的某题答案转成可读文本 */
function escapeCsv(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** 答卷汇总 CSV（一行一次作答） */
export function buildRepliesCsv(replies: ReplySummary[]): string {
  const header = ['批次号', '昵称', '用户类型', '状态', '得分', '开始时间', '结束时间', '用时(秒)', '提交时间']
  const lines = [header.map(escapeCsv).join(',')]
  for (const reply of replies) {
    lines.push([
      reply.batchNo,
      reply.userName,
      reply.userType,
      reply.state,
      reply.score ?? '',
      reply.startTime,
      reply.endTime,
      reply.durationSec ?? '',
      reply.createTime,
    ].map(escapeCsv).join(','))
  }
  return lines.join('\r\n')
}
