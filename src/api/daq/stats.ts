/**
 * 统计页取数
 *
 * 只组装现有平台服务，不新增后端：
 * - `srvdaq_init_view_select`（plain）：问卷配置（题目 + 选项 + 活动）
 * - `srvdaq_init_view_select`（use + fill_batch_no）：该批次完整作答 `user_data`
 * - `srvdaq_record_reply_select`：作答记录（分页）
 * - `srvdaq_record_reply_merge_select`：`user_data` 缺失时的兜底逐题值
 *
 * 统计聚合不在这里做：API 层只返回原始行，聚合在 `domain/stats`。
 */

import type { DaqActivityRow, DaqRecordReplyRow } from './types'
import type { BxCondition, BxSelectParams } from '@/utils/request/types'

import { bxMultiSelect, bxSelect } from '@/utils/request'

import { initViewSelect } from './activity'
import { recordReplySelect } from './record'

/** 统计页每页拉取记录数 */
export const STATS_PAGE_SIZE = 200

/** 作答状态聚合行 */
export interface StatsStateAggRow {
  state: string
  /** 该状态答卷数（count_all） */
  count: number
  /** 有分数的答卷数（count 排除 null） */
  scoreCount: number
  avgScore: number | null
  sumScore: number | null
  maxScore: number | null
  minScore: number | null
}

/** 按天提交趋势行 */
export interface StatsTrendAggRow {
  date: string
  count: number
}

/** 分数分布行 */
export interface StatsScoreAggRow {
  score: number
  count: number
}

/** 服务端聚合结果 */
export interface StatsAggregates {
  states: StatsStateAggRow[]
  trend: StatsTrendAggRow[]
  scores: StatsScoreAggRow[]
  /** 参与逐题统计的批次（按筛选条件） */
  batches: string[]
}

/** 一个批次的逐题聚合行（merge group 结果） */
export interface BatchQuestionRow {
  batchNo: string
  rows: Array<Record<string, unknown>>
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null
  }
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * 优先 multi/select；平台 multi 偶发所有子项「系统繁忙」时逐条回退。
 *
 * parkDev 2026-10-23 实测：同一票据、同一服务，单查正常但 multi 全项失败，
 * 过一段时间 multi 又恢复。统计不能因此整页空白，所以保留逐条路径。
 */
async function runSelects(
  requests: BxSelectParams[],
): Promise<Array<{ data?: Record<string, unknown>[] | null }>> {
  try {
    return await bxMultiSelect<Record<string, unknown>>(requests)
  }
  catch {
    /*
     * 整块失败时逐条回退。
     *
     * 原来这里是**串行** `for + await`：一批 20 条、最多 200 批，弱网下最坏会退化成
     * 4000 次串行请求，首屏看起来像卡死。改成**小并发**（5 路）：
     * - 用 `Promise.all` + 每条自带 catch 而不是 `allSettled`，兼容低版本基础库；
     * - 单条失败只丢那一条的数据，不影响同批其它批次。
     */
    const CONCURRENCY = 5
    const fallback: Array<{ data?: Record<string, unknown>[] | null }> = []
    for (let start = 0; start < requests.length; start += CONCURRENCY) {
      const slice = requests.slice(start, start + CONCURRENCY)
      const settled = await Promise.all(
        slice.map(request => bxSelect<Record<string, unknown>>(request).catch(() => null)),
      )
      for (const item of settled) {
        fallback.push({ data: item?.data ?? null })
      }
    }
    return fallback
  }
}

/**
 * 服务端聚合：KPI / 趋势 / 分数分布 / 批次列表
 *
 * 一次 `multi/select` 发 4 个子请求，避免把全部记录拉到前端再算。
 * `group` 契约实测（2026-10-23）：
 * - `state by` + `count_all` / `count(score)` / `sum` / `avg` / `max` / `min`；
 * - `create_time by_date` 得到按天趋势；
 * - `score by` 得到精确分数分布；
 * - `fill_batch_no by` 得到该筛选下的全部批次。
 */
export async function statsAggregates(
  activityNo: string,
  conditions: BxCondition[] = [],
): Promise<StatsAggregates> {
  // 注意：group 不会自动带 activity_no，必须显式拼进每个子请求的 condition，
  // 否则会把整张记录表（所有问卷）聚合到一起。
  const baseCondition: BxCondition[] = [
    { colName: 'activity_no', ruleType: 'eq', value: activityNo },
    ...conditions,
  ]
  const base = { serviceName: 'srvdaq_record_reply_select', colNames: ['*'], condition: baseCondition }
  const completed = [...baseCondition, { colName: 'state', ruleType: 'eq', value: '完成' }]
  const items = await runSelects([
    {
      ...base,
      group: [
        { colName: 'state', type: 'by' },
        { colName: 'fill_batch_no', type: 'count_all', aliasName: 'cnt' },
        { colName: 'score', type: 'count', aliasName: 'score_cnt' },
        { colName: 'score', type: 'avg', aliasName: 'avg_score' },
        { colName: 'score', type: 'sum', aliasName: 'sum_score' },
        { colName: 'score', type: 'max', aliasName: 'max_score' },
        { colName: 'score', type: 'min', aliasName: 'min_score' },
      ],
      page: { pageNo: 1, rownumber: 20 },
    },
    {
      ...base,
      group: [
        { colName: 'create_time', type: 'by_date' },
        { colName: 'fill_batch_no', type: 'count_all', aliasName: 'cnt' },
      ],
      order: [{ colName: 'create_time', orderType: 'asc' }],
      page: { pageNo: 1, rownumber: 400 },
    },
    {
      ...base,
      condition: completed,
      group: [
        { colName: 'score', type: 'by' },
        { colName: 'fill_batch_no', type: 'count_all', aliasName: 'cnt' },
      ],
      order: [{ colName: 'score', orderType: 'asc' }],
      page: { pageNo: 1, rownumber: 400 },
    },
    {
      ...base,
      condition: completed,
      group: [{ colName: 'fill_batch_no', type: 'by' }],
      page: { pageNo: 1, rownumber: 1000 },
    },
  ])

  const states = (items[0]?.data ?? []).map(row => ({
    state: String(row.state ?? ''),
    count: Number(row.cnt ?? 0),
    scoreCount: Number(row.score_cnt ?? 0),
    avgScore: numberOrNull(row.avg_score),
    sumScore: numberOrNull(row.sum_score),
    maxScore: numberOrNull(row.max_score),
    minScore: numberOrNull(row.min_score),
  }))
  const trend = (items[1]?.data ?? []).map(row => ({
    date: String(row.create_time ?? ''),
    count: Number(row.cnt ?? 0),
  }))
  const scores = (items[2]?.data ?? [])
    .map(row => ({ score: numberOrNull(row.score), count: Number(row.cnt ?? 0) }))
    .filter((row): row is { score: number, count: number } => row.score !== null)
  const batches = (items[3]?.data ?? [])
    .map(row => String(row.fill_batch_no ?? ''))
    .filter(Boolean)

  return { states, trend, scores, batches }
}

/**
 * 逐题聚合：按批次批量调用 merge 的 `group`
 *
 * 每个子请求仍按 `fill_batch_no` 精确过滤（merge 服务没有 activity_no，
 * 且实测 `in` 会返回「系统繁忙」）；用 `multi/select` 把多个批次合成一次 HTTP。
 * 返回行只含 `item_title / svalue / cnt`，比逐份拉 `user_data` 小得多。
 */
export async function statsBatchQuestionRows(
  batches: string[],
  chunkSize = 20,
): Promise<BatchQuestionRow[]> {
  const result: BatchQuestionRow[] = []
  for (let start = 0; start < batches.length; start += chunkSize) {
    const chunk = batches.slice(start, start + chunkSize)
    const items = await runSelects(chunk.map(batchNo => ({
      serviceName: 'srvdaq_record_reply_merge_select',
      colNames: ['*'],
      condition: [{ colName: 'fill_batch_no', ruleType: 'eq', value: batchNo }],
      group: [
        { colName: 'item_title', type: 'by' },
        { colName: 'svalue', type: 'by' },
        { colName: 'fill_batch_no', type: 'count_all', aliasName: 'cnt' },
      ],
      page: { pageNo: 1, rownumber: 1000 },
    })))
    items.forEach((item, index) => {
      const batchNo = chunk[index]
      if (batchNo) {
        result.push({ batchNo, rows: item.data ?? [] })
      }
    })
  }
  return result
}

/** 问卷配置（含 item_data） */
export async function statsActivityConfig(activityNo: string): Promise<DaqActivityRow | null> {
  const result = await initViewSelect({ activityNo })
  return result.data?.[0] ?? null
}

/** 分页拉取作答记录 */
export async function statsReplyPage(
  activityNo: string,
  pageNo = 1,
  rownumber = STATS_PAGE_SIZE,
): Promise<{ rows: DaqRecordReplyRow[], total: number }> {
  const result = await recordReplySelect({ activityNo, pageNo, rownumber })
  return {
    rows: result.data ?? [],
    total: result.page?.total ?? 0,
  }
}
