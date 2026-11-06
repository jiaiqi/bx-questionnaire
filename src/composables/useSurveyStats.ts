/**
 * 问卷统计页编排（服务端聚合版）
 *
 * 统计口径优先用平台 `group` 聚合，不再把全部记录拉到前端再算：
 * - KPI / 分数分布：`srvdaq_record_reply_select` + `group`（count_all / count / avg / sum / max / min）
 * - 提交趋势：`group create_time by_date`
 * - 逐题分布：`srvdaq_record_reply_merge_select` + `group item_title/svalue`，
 *   通过 `multi/select` 按批次批量提交（merge 服务没有 activity_no，且 `in` 实测不可用）
 *
 * 记录列表仍保留分页拉取，用于「答卷明细」表格与 CSV 导出；
 * 逐题统计默认最多 200 份批次，页面显示覆盖范围，不假装全量。
 */

import type { Ref } from 'vue'
import type { BatchQuestionRow, StatsAggregates } from '@/api/daq/stats'
import type { DaqActivityRow, DaqRecordReplyRow } from '@/api/daq/types'
import type { QuestionField } from '@/domain/questionnaire/types'
import type { BatchQuestionAggregate, QuestionStat, ReplySummary, ScoreBucket, StatsOverview, StatsRange, TrendPoint } from '@/domain/stats'
import type { BxCondition } from '@/utils/request/types'

import { computed, ref, watch } from 'vue'

import {
  statsActivityConfig,
  statsAggregates,
  statsBatchQuestionRows,
  statsReplyPage,
} from '@/api/daq/stats'
import { toQuestionFields } from '@/domain/questionnaire/mapper'
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
} from '@/domain/stats'
import { BxError } from '@/utils/request'

/** 记录拉取上限（仅影响明细表/导出） */
export const STATS_MAX_REPLIES = 1000
/** 逐题聚合最多覆盖的批次数 */
export const STATS_MAX_AGG_BATCHES = 200

/** 记录状态筛选 */
export type ReplyStateFilter = 'all' | '完成' | '未完成'

function errorText(error: unknown): string {
  if (error instanceof BxError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function dateText(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function useSurveyStats(activityNo: Ref<string>) {
  const activity = ref<DaqActivityRow | null>(null)
  const fields = ref<QuestionField[]>([])
  const replies = ref<ReplySummary[]>([])
  const replyTotal = ref(0)

  const aggregates = ref<StatsAggregates | null>(null)
  const batchRows = ref<BatchQuestionAggregate[]>([])

  const loading = ref(false)
  const loadingDetails = ref(false)
  const error = ref('')
  const detailError = ref('')

  const range = ref<StatsRange>('all')
  const stateFilter = ref<ReplyStateFilter>('all')
  const detailProgress = ref({ done: 0, total: 0 })

  const activityTitle = computed(() => String(activity.value?.title ?? ''))
  const activityStatus = computed(() => String(activity.value?.status ?? ''))

  const filteredReplies = computed(() => {
    const inRange = filterReplies(replies.value, range.value)
    if (stateFilter.value === 'all') {
      return inRange
    }
    return inRange.filter(reply => reply.state === stateFilter.value)
  })

  const overview = computed<StatsOverview>(() => {
    if (aggregates.value) {
      const summary = buildOverviewFromAggregates(aggregates.value.states)
      // 服务端 group 没有起止时间差，平均用时仍用已加载记录补算
      return {
        ...summary,
        avgDurationSec: buildOverview(filteredReplies.value).avgDurationSec,
      }
    }
    return buildOverview(filteredReplies.value)
  })

  /**
   * 趋势跨度跟随筛选
   *
   * 原来固定 14 天：选「近 7 天」时后 7 天恒为 0、标题也不变，看起来像数据丢了。
   */
  const trendDays = computed(() => {
    if (range.value === '7d') {
      return 7
    }
    if (range.value === '30d') {
      return 30
    }
    return 14
  })

  const trend = computed<TrendPoint[]>(() => {
    if (aggregates.value) {
      return buildTrendFromAggregates(aggregates.value.trend, trendDays.value)
    }
    return buildTrend(filteredReplies.value, trendDays.value)
  })

  const maxScore = computed(() => {
    const fromActivity = Number(activity.value?.total_points)
    if (Number.isFinite(fromActivity) && fromActivity > 0) {
      return fromActivity
    }
    return fields.value.reduce((sum, field) => sum + (Number.isFinite(field.points) ? field.points : 0), 0)
  })

  const scoreBuckets = computed<ScoreBucket[]>(() => {
    if (aggregates.value) {
      return buildScoreBucketsFromAggregates(aggregates.value.scores, maxScore.value)
    }
    return buildScoreBuckets(filteredReplies.value, maxScore.value)
  })

  const questionStats = computed<QuestionStat[]>(() => {
    if (aggregates.value) {
      // 基数由函数内部取 batchRows.length（实际被检查的抽样份数），不再传全量完成批次数 ——
      // 未答只在抽样里统计，用全量做基数会让 answered 在完成答卷超过抽样上限时系统性虚高。
      return buildQuestionStatsFromAggregates(fields.value, batchRows.value)
    }
    return buildQuestionStats(fields.value, [])
  })

  const coverage = computed(() => {
    const completedInFilter = aggregates.value?.states
      .filter(row => row.state === '完成')
      .reduce((sum, row) => sum + row.count, 0) ?? 0
    const detailCount = batchRows.value.length
    return {
      completedInFilter,
      detailCount,
      capped: completedInFilter > detailCount,
    }
  })

  const replyCapped = computed(() => replyTotal.value > replies.value.length)

  function conditionsFor(filter: ReplyStateFilter): BxCondition[] {
    const conditions: BxCondition[] = []
    if (range.value !== 'all') {
      const days = range.value === '7d' ? 7 : 30
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
      conditions.push({
        colName: 'create_time',
        ruleType: 'between',
        value: [dateText(start), `${dateText(now)} 23:59:59`],
      })
    }
    if (filter !== 'all') {
      conditions.push({ colName: 'state', ruleType: 'eq', value: filter })
    }
    return conditions
  }

  async function loadReplies(): Promise<void> {
    const rows: DaqRecordReplyRow[] = []
    let total = 0
    let pageNo = 1
    while (rows.length < STATS_MAX_REPLIES) {
      const page = await statsReplyPage(activityNo.value, pageNo)
      total = page.total
      rows.push(...page.rows)
      if (page.rows.length === 0 || rows.length >= total || pageNo > 50) {
        break
      }
      pageNo += 1
    }
    replyTotal.value = total
    replies.value = rows.map(row => normalizeReply(row))
  }

  async function loadAggregates(): Promise<void> {
    if (!activityNo.value) {
      return
    }
    loadingDetails.value = true
    detailError.value = ''
    batchRows.value = []
    try {
      const result = await statsAggregates(
        activityNo.value,
        conditionsFor(stateFilter.value),
      )
      aggregates.value = result
      const batches = result.batches.slice(0, STATS_MAX_AGG_BATCHES)
      detailProgress.value = { done: 0, total: batches.length }
      if (batches.length > 0) {
        const rows: BatchQuestionRow[] = await statsBatchQuestionRows(batches)
        batchRows.value = rows.map(item => ({ batchNo: item.batchNo, rows: item.rows }))
        detailProgress.value = { done: batches.length, total: batches.length }
      }
    }
    catch (aggregateError) {
      detailError.value = errorText(aggregateError)
    }
    finally {
      loadingDetails.value = false
    }
  }

  async function load(): Promise<void> {
    if (!activityNo.value) {
      return
    }
    loading.value = true
    error.value = ''
    aggregates.value = null
    batchRows.value = []
    try {
      const config = await statsActivityConfig(activityNo.value)
      activity.value = config
      fields.value = toQuestionFields(config?.item_data)
      await Promise.all([loadReplies(), loadAggregates()])
    }
    catch (loadError) {
      error.value = errorText(loadError)
    }
    finally {
      loading.value = false
    }
  }

  watch(activityNo, (value) => {
    if (value) {
      void load()
    }
  })

  watch([range, stateFilter], () => {
    if (activityNo.value && !loading.value) {
      void loadAggregates()
    }
  })

  /** 下载 CSV（H5）；小程序端只提示 */
  function downloadCsv(filename: string, content: string): void {
    // #ifdef H5
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    return
    // #endif
    // #ifndef H5
    uni.showToast({ title: '请在网页端导出', icon: 'none' })
    // #endif
  }

  function exportReplies(): void {
    if (filteredReplies.value.length === 0) {
      uni.showToast({ title: '当前筛选没有记录', icon: 'none' })
      return
    }
    downloadCsv(`问卷答卷-${activityNo.value}.csv`, buildRepliesCsv(filteredReplies.value))
  }

  function exportDetails(): void {
    if (questionStats.value.length === 0) {
      uni.showToast({ title: '还没有逐题数据可导出', icon: 'none' })
      return
    }
    downloadCsv(
      `问卷逐题分布-${activityNo.value}.csv`,
      buildQuestionAggregateCsv(questionStats.value),
    )
  }

  return {
    activity,
    activityTitle,
    activityStatus,
    fields,
    replies,
    filteredReplies,
    replyTotal,
    replyCapped,
    loading,
    loadingDetails,
    error,
    detailError,
    detailProgress,
    range,
    stateFilter,
    overview,
    trend,
    maxScore,
    scoreBuckets,
    questionStats,
    coverage,
    trendDays,
    load,
    exportReplies,
    exportDetails,
  }
}
