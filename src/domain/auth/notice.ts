/**
 * 登录页提示语
 *
 * 进入登录页的**原因**用枚举码在 URL 里传递，而不是直接传中文文案 ——
 * 实测中文参数经过各端叠加的 URL 编码后，会以 `%E7%99%BB%E5%BD%95...` 的原文
 * 显示在页面上（H5 的 `reLaunch`、小程序路由、宿主 iframe 各会再编码一次）。
 * 枚举码是纯 ASCII，不经过任何编码层。
 */

const NOTICE_BY_REASON = {
  /** 会话过期：请求层清票据后把用户送过来 */
  expired: '登录已过期，请重新登录',
  /** 用户主动点登录入口进来 */
  required: '请登录后继续',
} as const

/** 登录页认得的进入原因 */
export type LoginReason = keyof typeof NOTICE_BY_REASON

/** 原因缺失、或外部直接传 `notice` 文案时用的兜底提示 */
export const DEFAULT_LOGIN_NOTICE = '请登录后继续'

/**
 * 是否是我们登记过的原因
 *
 * 必须判**自有属性**（`Object.hasOwn`）而不是 `in`：`in` 会把原型链上的键
 * （`toString` / `constructor` 等）也判为已知，于是一个精心构造的
 * `?reason=toString` 就能让页面走到「已识别」分支。
 */
export function isKnownLoginReason(reason: string): reason is LoginReason {
  return Object.hasOwn(NOTICE_BY_REASON, reason)
}

/** 把进入原因翻译成提示语（认不出来时用兜底提示） */
export function loginNotice(reason: string): string {
  return isKnownLoginReason(reason) ? NOTICE_BY_REASON[reason] : DEFAULT_LOGIN_NOTICE
}
