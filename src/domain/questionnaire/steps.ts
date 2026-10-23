/**
 * 「逐个」展示模式的纯逻辑
 *
 * 活动配置 `item_disp_way` 的取值为「全部 / 逐个」：
 * - 全部：一份连续的卷，所有题目一屏可滚动到底（既有行为，不能变）；
 * - 逐个：一次只显示一道题，配「上一题 / 下一题」与「3 / 11」进度，最后一题变提交。
 *
 * 这一层只做计算（步骤列表、前后步、必答判断、错误定位到步骤），不依赖 Vue / uni-app，
 * 可直接单测。滚动、聚焦、草稿保存等副作用留在 `QuestionnaireRunner.vue` 里。
 */

import type { AnswerMap, QuestionField } from './types'
import type { ValidationIssue } from './validator'

import { validateRequired } from './validator'

/** 平台配置里表示「逐个」的取值（其余一律按整卷处理，含空值与「全部」） */
const STEP_WAY = '逐个'

/** 作答页展示方式：整卷 / 逐题 */
export type DisplayMode = 'all' | 'step'

/**
 * 把活动配置归一到展示方式
 *
 * 只认「逐个」这一个精确取值（去首尾空白）：`item_disp_way` 缺失、为空、
 * 写成「全部」或任何未知取值，都按既有整卷行为处理 —— 不能因为配置脏数据
 * 把老用户挡在一次一题的流程里。
 */
export function resolveDisplayMode(value: string | null | undefined): DisplayMode {
  return String(value ?? '').trim() === STEP_WAY ? 'step' : 'all'
}

/** 一个步骤：一道要作答的题 + 它所属的分节标题 */
export interface StepItem {
  /** 这一步要作答的题（分节符不会成为步骤） */
  field: QuestionField
  /** 该题所属分节的标题（最近的前一个分节符）；没有分节时为空串 */
  sectionLabel: string
}

/**
 * 题目列表 → 步骤列表
 *
 * 分节符不是题目，不占步骤：逐个模式里它只作为「小节标题」贴到其后的第一道题上，
 * 这样一次一题时用户仍知道自己在问卷的哪一部分，而不会多出一个没有控件的空步骤。
 */
export function toSteps(fields: QuestionField[]): StepItem[] {
  const steps: StepItem[] = []
  let sectionLabel = ''

  for (const field of fields) {
    if (field.widget === 'section') {
      sectionLabel = field.label
      continue
    }
    steps.push({ field, sectionLabel })
  }

  return steps
}

/**
 * 把步骤下标夹到合法范围
 *
 * 题目数量可能在加载 / 切换活动后变化，旧下标会越界；越界时退回首题而不是
 * 渲染空白（`steps[current]` 为 undefined 会让整卷看起来「没有题目」）。
 */
export function clampStepIndex(index: number, total: number): number {
  const count = Number.isFinite(total) ? Math.floor(total) : 0
  if (count <= 0) {
    return 0
  }
  if (!Number.isFinite(index)) {
    return 0
  }
  return Math.min(count - 1, Math.max(0, Math.floor(index)))
}

/** 下一步（已到末题时停在末题） */
export function nextStepIndex(current: number, total: number): number {
  return clampStepIndex(clampStepIndex(current, total) + 1, total)
}

/** 上一步（已在首题时停在首题） */
export function prevStepIndex(current: number, total: number): number {
  return clampStepIndex(clampStepIndex(current, total) - 1, total)
}

/** 是否最后一题（没有题目时恒为 false，「下一题」不该变成「提交」） */
export function isLastStep(current: number, total: number): boolean {
  const count = Number.isFinite(total) ? Math.floor(total) : 0
  return count > 0 && clampStepIndex(current, count) === count - 1
}

/** 进度「3 / 11」的计算结果 */
export interface StepProgress {
  /** 当前第几题（1 起；没有题目时为 0） */
  current: number
  total: number
  /** 按「当前步 / 总步数」计算的百分比（四舍五入），没有题目时为 0 */
  percent: number
}

/**
 * 当前步骤 → 进度
 *
 * 逐个模式的进度条表达「位置」而不是「已答数」：用户翻到第 3 题时，进度条
 * 与「3 / 11」说的是同一件事；已答多少由右侧的「已答 M」单独表达。
 */
export function stepProgress(current: number, total: number): StepProgress {
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  if (count === 0) {
    return { current: 0, total: 0, percent: 0 }
  }

  const index = clampStepIndex(current, count)
  return {
    current: index + 1,
    total: count,
    percent: Math.round(((index + 1) / count) * 100),
  }
}

/**
 * 单题必答校验
 *
 * 复用整卷校验的同一实现，保证「下一题」拦下的提示文案与提交时完全一致
 * （「第 3 题为必填项」），不会出现两套说法。
 */
export function stepIssue(field: QuestionField, answers: AnswerMap): ValidationIssue | null {
  return validateRequired([field], answers)[0] ?? null
}

/** 按题目主键定位步骤下标，找不到返回 -1 */
export function stepIndexForKey(steps: StepItem[], key: string): number {
  return steps.findIndex(step => step.field.key === key)
}

/**
 * 提交校验失败后，定位第一道出错题所在的步骤
 *
 * 逐个模式里用户只能看到当前题，错误可能落在看不见的题上；按提交校验产出的
 * 问题顺序找第一个能映射到步骤的，切过去。返回 -1 表示没有可跳转的步骤
 * （例如问题项不在步骤列表里，调用方应退回原有的错误摘要行为）。
 */
export function firstIssueStepIndex(steps: StepItem[], issues: ValidationIssue[]): number {
  for (const issue of issues) {
    const index = stepIndexForKey(steps, issue.key)
    if (index >= 0) {
      return index
    }
  }
  return -1
}
