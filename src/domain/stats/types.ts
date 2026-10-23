/**
 * 统计页领域模型（纯类型）
 *
 * 统一把平台行、题目定义和逐题作答收敛成页面可消费的结构，
 * 让统计计算不依赖 Vue / uni-app / 网络层，可直接单测。
 */

import type { AnswerMap, QuestionWidget } from '@/domain/questionnaire/types'

/** 统计时间范围 */
export type StatsRange = 'all' | '7d' | '30d'

/** 一次作答的归一化摘要（来自 `srvdaq_record_reply_select`） */
export interface ReplySummary {
  batchNo: string
  /** 完成 / 未完成 */
  state: string
  /** 服务端得分；未判分为 null */
  score: number | null
  startTime: string
  endTime: string
  createTime: string
  userName: string
  userType: string
  /** 用时（秒）；起止时间缺失或倒挂时为 null */
  durationSec: number | null
}

/** 概览指标 */
export interface StatsOverview {
  total: number
  completed: number
  /** 0–1 */
  completionRate: number
  /** 已判分答卷的平均分；没有分数时为 null */
  avgScore: number | null
  maxScore: number | null
  minScore: number | null
  /** 完成答卷的平均用时（秒）；无可用数据时为 null */
  avgDurationSec: number | null
}

/** 提交趋势的一天 */
export interface TrendPoint {
  /** YYYY-MM-DD */
  date: string
  /** MM-DD，页面直接展示 */
  label: string
  count: number
}

/** 分数段 */
export interface ScoreBucket {
  label: string
  count: number
}

/** 选项分布的一条 */
export interface OptionBar {
  value: string
  label: string
  count: number
  /** 0–1，基数为该题作答人数 */
  percent: number
}

/** 文本/其他题型的样本 */
export interface TextSample {
  /** 明细模式下的批次号；服务端聚合模式没有批次 */
  batchNo?: string
  value: string
  /** 服务端聚合模式下的出现人数 */
  count?: number
}

/** 数字题的统计 */
export interface NumericSummary {
  avg: number
  median: number
  min: number
  max: number
}

/** 数字题的分段 */
export interface NumericBucket {
  label: string
  count: number
}

/** 题目统计的公共字段 */
export interface QuestionStatBase {
  key: string
  index: number
  label: string
  widget: QuestionWidget
  required: boolean
  /** 有作答的人数（基数为传入的明细份数） */
  answered: number
  /** 未作答的人数 */
  unanswered: number
}

export interface ChoiceQuestionStat extends QuestionStatBase {
  kind: 'choice'
  multi: boolean
  options: OptionBar[]
}

export interface NumberQuestionStat extends QuestionStatBase {
  kind: 'number'
  numeric: NumericSummary
  buckets: NumericBucket[]
}

export interface TextQuestionStat extends QuestionStatBase {
  kind: 'text'
  samples: TextSample[]
}

export interface OtherQuestionStat extends QuestionStatBase {
  kind: 'other'
  samples: TextSample[]
}

export type QuestionStat
  = | ChoiceQuestionStat
    | NumberQuestionStat
    | TextQuestionStat
    | OtherQuestionStat

/** 一次作答的逐题答案（已由 `applyBackfill` 归一化） */
export interface StatsDetail {
  batchNo: string
  answers: AnswerMap
}
