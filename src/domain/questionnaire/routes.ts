/**
 * 问卷相关页面地址（纯函数）
 *
 * 这些地址的参数是**有约束的**：封面页、结果页、续答页都要求 `activity_no`。
 * 此前 URL 字符串散在 8 个文件里手写，漏一个参数就会把用户送进
 * 「缺少活动编号」错误页 —— 结果页的「返回问卷首页」与导航栏的返回键都出过这个问题。
 *
 * 集中到一处后，参数由函数签名强制，调用方没有「忘记带」的机会。
 * 保持纯函数：不依赖 Vue / uni-app，可直接单测。
 */

/** 问卷页面路径（不含参数） */
export const QUESTIONNAIRE_ROUTES = {
  /** 问卷封面：题目数 / 状态 / 作答次数 + 开始作答 */
  cover: '/pages/questionnaire/cover/index',
  /** 答题页（老工程入口页） */
  answer: '/pages/questionnaire/index/index',
  /** 作答结果（分数 + 逐题回顾） */
  result: '/pages/questionnaire/index/result',
  /** 登记信息 */
  submitInfo: '/pages/questionnaire/index/submitInfo',
  /** 作答记录 */
  history: '/pages/questionnaire/history/history',
  /** 调研答题页 */
  surveyAnswer: '/pages/questionnaire/survey/survey',
  /** 调研结果 */
  surveyResult: '/pages/questionnaire/survey/result',
  /** 评估结果（建议区间） */
  suggestion: '/pages/questionnaire/assessmentResult/assessmentResult',
  /** 我的测评 */
  couple: '/pages/questionnaire/couple/couple',
} as const

/** 查询参数值：`undefined` / `null` / 空串会被跳过，不产生空参数 */
export type QueryValue = string | number | undefined | null

/**
 * 拼查询串（不含 `?`）
 *
 * **不做 URL 编码**：`status` 的值是中文（`进行中`），而各端对查询串的自动解码行为不一致，
 * 编码后反而可能让 `readQuery` 拿到 `%E8%BF%9B...`。现有取值都是活动号与固定中文枚举，
 * 保持与老工程一致的裸值传递。
 */
export function queryString(params: Record<string, QueryValue>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&')
}

/** 拼完整地址：没有有效参数时不留下孤立的 `?` */
export function withQuery(path: string, params: Record<string, QueryValue>): string {
  const query = queryString(params)
  return query ? `${path}?${query}` : path
}

/** 问卷封面地址（`activity_no` 必填） */
export function coverUrl(activityNo: string): string {
  return withQuery(QUESTIONNAIRE_ROUTES.cover, { activity_no: activityNo })
}

export interface AnswerUrlOptions {
  /** `form` 作答 / `detail` 只读查看，默认 `form` */
  formType?: string
  /** 活动状态，传入后用于只读判定 */
  status?: string
  /** 续答 / 查看已有批次时传入 */
  fillBatchNo?: string
}

/** 答题页地址（`activity_no` 必填） */
export function answerUrl(activityNo: string, options: AnswerUrlOptions = {}): string {
  return withQuery(QUESTIONNAIRE_ROUTES.answer, {
    formType: options.formType ?? 'form',
    activity_no: activityNo,
    status: options.status,
    fill_batch_no: options.fillBatchNo,
  })
}

/** 作答结果地址（`activity_no` 必填；`fill_batch_no` 决定能否逐题回顾） */
export function resultUrl(activityNo: string, fillBatchNo?: string): string {
  return withQuery(QUESTIONNAIRE_ROUTES.result, {
    activity_no: activityNo,
    fill_batch_no: fillBatchNo,
  })
}

/** 评估结果地址（两个参数都必填，否则面板会拒绝加载） */
export function suggestionUrl(activityNo: string, fillBatchNo: string): string {
  return withQuery(QUESTIONNAIRE_ROUTES.suggestion, {
    activity_no: activityNo,
    fill_batch_no: fillBatchNo,
  })
}

/** 作答记录地址 */
export function historyUrl(activityNo: string, title?: string): string {
  return withQuery(QUESTIONNAIRE_ROUTES.history, { activity_no: activityNo, title })
}

/**
 * 小程序分享路径（不带前导 `/`，`onShareAppMessage` 要求）
 *
 * 好友点开可直接作答，因此固定带 `formType=form` 与 `status=进行中`。
 */
export function shareAnswerPath(activityNo: string): string {
  return `${QUESTIONNAIRE_ROUTES.answer.slice(1)}?${queryString({
    formType: 'form',
    activity_no: activityNo,
    status: '进行中',
  })}`
}
