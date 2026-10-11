/**
 * 文档校验（纯函数）
 *
 * ## 为什么要在前端拦
 *
 * 平台的必填校验发生在**写入之后**：请求失败时用户已经填了半天，
 * 而编辑器并没有把内容弄丢（内容还在本地），但用户会看到一次「保存失败」，
 * 且不知道是哪一题的问题。前端先校验可以：
 * 1. 一次性列出**所有**问题，而不是平台那样只报第一个；
 * 2. 指出是第几题，而不是只有一句「xxx为必填信息」。
 *
 * ## 长度上限从哪来
 *
 * 全部来自 `srvsys_service_columnex_v2_select` 的 `validators` 字段（`ngMaxlength=N`），
 * 不是拍脑袋定的。例如活动 `title` 是 `;required;ngMaxlength=255`、
 * `submitted_tip` 是 `ngMaxlength=200`、选项 `option_value` 是 `ngMaxlength=20000`。
 */

import type { EditorDocument, EditorItem } from './types'

import { isKnownItemType, isSingleChoice, MAX_OPTIONS, typeHasOptions } from './itemTypes'

export interface EditorIssue {
  /** 关联的题目 `clientKey`；活动级问题为空 */
  itemKey?: string
  /** 关联的选项 `clientKey` */
  optionKey?: string
  /** 出问题的字段（英文标识，供程序判定与聚焦用） */
  field: string
  /** 给用户看的中文说明 */
  message: string
}

/** 活动字段的长度上限（来自平台元数据 `validators`） */
const ACTIVITY_MAX = {
  title: 255,
  keyword: 64,
  activityImage: 255,
  remark: 20000,
  summary: 20000,
  startRemark: 20000,
  endRemark: 20000,
  submittedTip: 200,
  submitLabel: 50,
  passingMark: 20,
} as const

/**
 * 把日期时间压成可比较的 14 位数字串
 *
 * 平台的时间列是 `YYYY-MM-DD HH:mm:ss`，但日期选择器可能只给 `YYYY-MM-DD`。
 * 直接字符串比较会让 `'2026-10-11'` 排在 `'2026-10-11 00:00:00'` 前面（更短即更小），
 * 于是「同一天」被误判成先后。补零到 14 位后比较才成立。
 */
function timeKey(value: string): string {
  return value.replace(/\D/g, '').padEnd(14, '0').slice(0, 14)
}

function required(
  issues: EditorIssue[],
  value: string,
  field: string,
  message: string,
): boolean {
  if (value.trim()) {
    return false
  }
  issues.push({ field, message })
  return true
}

function tooLong(
  issues: EditorIssue[],
  value: string,
  max: number,
  field: string,
  label: string,
): void {
  if (value.length > max) {
    issues.push({ field, message: `${label}不能超过 ${max} 个字符（当前 ${value.length}）` })
  }
}

/** 校验整个文档；返回空数组表示可以保存 */
export function validateDocument(doc: EditorDocument): EditorIssue[] {
  const issues: EditorIssue[] = []
  const { activity } = doc

  // ── 活动必填（平台 `validators` 里带 `;required;` 的列） ──
  required(issues, activity.title, 'activity.title', '请填写问卷标题')
  required(issues, activity.classify, 'activity.classify', '请选择分类')
  required(issues, activity.keyword, 'activity.keyword', '请填写关键字')
  required(issues, activity.activityImage, 'activity.activityImage', '请上传封面图')
  required(issues, activity.startTime, 'activity.startTime', '请选择启用时间')
  required(issues, activity.endTime, 'activity.endTime', '请选择结束时间')
  required(issues, activity.remark, 'activity.remark', '请填写问卷描述')

  // ── 活动长度 ──
  tooLong(issues, activity.title, ACTIVITY_MAX.title, 'activity.title', '问卷标题')
  tooLong(issues, activity.keyword, ACTIVITY_MAX.keyword, 'activity.keyword', '关键字')
  tooLong(issues, activity.remark, ACTIVITY_MAX.remark, 'activity.remark', '问卷描述')
  tooLong(issues, activity.summary, ACTIVITY_MAX.summary, 'activity.summary', '分享摘要')
  tooLong(issues, activity.startRemark, ACTIVITY_MAX.startRemark, 'activity.startRemark', '开始语')
  tooLong(issues, activity.endRemark, ACTIVITY_MAX.endRemark, 'activity.endRemark', '结束语')
  tooLong(issues, activity.submittedTip, ACTIVITY_MAX.submittedTip, 'activity.submittedTip', '提交后提示语')
  tooLong(issues, activity.submitLabel, ACTIVITY_MAX.submitLabel, 'activity.submitLabel', '提交按钮标签')
  tooLong(issues, activity.passingMark, ACTIVITY_MAX.passingMark, 'activity.passingMark', '通过分数')

  // ── 时间先后 ──
  if (activity.startTime && activity.endTime && timeKey(activity.endTime) < timeKey(activity.startTime)) {
    issues.push({ field: 'activity.endTime', message: '结束时间不能早于启用时间' })
  }

  // ── 题目 ──
  if (doc.items.length === 0) {
    issues.push({ field: 'items', message: '至少需要一道题目' })
  }

  for (const item of doc.items) {
    validateItem(issues, item)
  }

  return issues
}

function validateItem(issues: EditorIssue[], item: EditorItem): void {
  if (!item.title.trim()) {
    issues.push({ itemKey: item.clientKey, field: 'title', message: '请填写题目标题' })
  }
  if (item.title.length > 256) {
    issues.push({
      itemKey: item.clientKey,
      field: 'title',
      message: `题目标题不能超过 256 个字符（当前 ${item.title.length}）`,
    })
  }

  if (!isKnownItemType(item.type)) {
    issues.push({
      itemKey: item.clientKey,
      field: 'type',
      message: item.type ? `未知题型「${item.type}」` : '请选择题型',
    })
    // 题型都不认识时不再校验选项，避免一串连带报错淹没真正的原因
    return
  }

  if (item.answer.length > 100) {
    issues.push({
      itemKey: item.clientKey,
      field: 'answer',
      message: `正确答案不能超过 100 个字符（当前 ${item.answer.length}）`,
    })
  }

  if (!typeHasOptions(item.type)) {
    return
  }

  if (item.options.length === 0) {
    issues.push({ itemKey: item.clientKey, field: 'options', message: '选项类题目至少需要一个选项' })
    return
  }
  if (item.options.length > MAX_OPTIONS) {
    issues.push({
      itemKey: item.clientKey,
      field: 'options',
      message: `选项不能超过 ${MAX_OPTIONS} 个（平台选项标识只有 A..Z）`,
    })
  }

  item.options.forEach((option) => {
    if (!option.value.trim()) {
      issues.push({
        itemKey: item.clientKey,
        optionKey: option.clientKey,
        field: 'optionValue',
        message: '选项内容不能为空',
      })
    }
    if (option.value.length > 20000) {
      issues.push({
        itemKey: item.clientKey,
        optionKey: option.clientKey,
        field: 'optionValue',
        message: `选项内容不能超过 20000 个字符（当前 ${option.value.length}）`,
      })
    }
  })

  // 单选形态最多一个正确答案。
  // 交互上勾选第二个会顶掉第一个（见 useEditorDocument.setOptionAnswer），
  // 这里是兜底：载入的历史数据、或将来别处直接改 isAnswer，都可能出现两个正确答案，
  // 而服务端不会替我们拦。
  if (isSingleChoice(item.type, item.attr)) {
    const answerCount = item.options.filter(option => option.isAnswer).length
    if (answerCount > 1) {
      issues.push({
        itemKey: item.clientKey,
        field: 'options',
        message: `单选题只能有一个正确答案（当前标了 ${answerCount} 个）`,
      })
    }
  }
}

/** 取某个题目下的问题（题目本身 + 它的选项） */
export function issuesForItem(issues: EditorIssue[], itemKey: string): EditorIssue[] {
  return issues.filter(issue => issue.itemKey === itemKey)
}

/** 取活动级问题（不属于任何题目） */
export function activityIssues(issues: EditorIssue[]): EditorIssue[] {
  return issues.filter(issue => !issue.itemKey)
}

/** 把问题列表压成一句话（给 toast / 提示条用） */
export function describeIssues(issues: EditorIssue[]): string {
  if (issues.length === 0) {
    return ''
  }
  if (issues.length === 1) {
    return issues[0]!.message
  }
  return `${issues[0]!.message}（共 ${issues.length} 项待修正）`
}

/**
 * 校验未通过
 *
 * 单独一个错误类型，是为了让调用方能区分「用户填得不对」与「网络/权限出错」：
 * 前者应该把问题**逐条标注在对应题目上**并留在编辑页，后者才该提示重试。
 * 混成一个字符串错误的话，界面只能弹一个 toast，用户不知道改哪一题。
 */
export class EditorValidationError extends Error {
  readonly issues: EditorIssue[]

  constructor(issues: EditorIssue[]) {
    super(describeIssues(issues) || '校验未通过')
    this.name = 'EditorValidationError'
    this.issues = issues
  }
}
