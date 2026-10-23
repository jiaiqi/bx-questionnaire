/**
 * 百想平台接口契约类型
 *
 * 契约基线来自真实网关响应（见 test/fixtures/raw/），迁移期间保持不变。
 */

/** 请求动作段 */
export type BxAction = 'select' | 'multi' | 'operate' | 'add' | 'update' | 'delete'

/** 平台返回的整体状态 */
export type BxState = 'SUCCESS' | 'FAILURE' | (string & {})

/** 分页信息 */
export interface BxPage {
  total: number
  pageNo: number
  rownumber: number
}

/** 查询条件 */
export interface BxCondition {
  colName: string
  ruleType: 'eq' | 'neq' | 'like' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | (string & {})
  value?: unknown
}

/** 排序条件 */
export interface BxOrder {
  colName: string
  /** 官方字段名（order 段） */
  orderType?: 'asc' | 'desc'
  /** @deprecated 历史代码别名，平台分组查询会报错；新代码一律用 orderType */
  ruleType?: 'asc' | 'desc' | (string & {})
}

/**
 * 聚合分组（官方 select 参数文档）
 *
 * `by` 分组；`sum/min/max/avg/count/count_all/distinct_count` 聚合；
 * `by_year/by_month/by_week/by_date/by_hour/...` 时间维度分组。
 * 聚合列可以 `aliasName`，`order` 里用别名排序。
 */
export interface BxGroup {
  colName: string
  type: 'by' | 'sum' | 'min' | 'max' | 'avg' | 'count' | 'count_all' | 'distinct_count'
    | 'by_year' | 'by_month' | 'by_week' | 'by_date' | 'by_hour' | 'by_minute' | 'by_second'
    | 'by_month_of_year' | 'by_week_of_year' | 'by_date_of_year'
    | 'by_hour_of_date' | 'by_minute_of_date' | 'by_cus_minute_of_date'
    | (string & {})
  aliasName?: string
  /** `by_cus_minute_of_date` 的粒度值（分钟，0-60） */
  value?: string | number
}

/** multi/select 单个子请求的响应 */
export interface BxMultiItem<T = unknown> {
  data?: T[] | null
  page?: BxPage | null
  state?: BxState
  resultCode?: string
  resultMessage?: string
}

/** select 请求体（平铺） */
export interface BxSelectParams {
  serviceName: string
  /**
   * 应用名，决定 URL 里的 `{app}` 段（服务在哪个应用下）
   *
   * 不传时用 `ENV.app`（默认 `daq`）。**必须写在这里而不是第二个参数里** ——
   * `bxSelect` 会读它来拼 URL，写错地方会静默走默认应用并拿到「无权限访问」。
   */
  app?: string
  colNames?: string[]
  condition?: BxCondition[]
  relation_condition?: unknown[]
  order?: BxOrder[]
  group?: BxGroup[]
  page?: { pageNo: number, rownumber: number }
  colsel_v2?: string
  [key: string]: unknown
}

/** operate/add/update/delete 请求体（数组，每项一个子请求） */
export interface BxWriteItem {
  serviceName: string
  data?: unknown[]
  condition?: BxCondition[]
  [key: string]: unknown
}

/** 写操作的子响应 */
export interface BxWriteResponse<T = unknown> {
  code?: string
  state?: string | null
  resultCode?: string
  resultMessage?: string
  /** 平台实测：草稿保存等场景会返回 response: null */
  response?: {
    effect_data?: T[]
    bx_auth_ticket?: string
    expire_time?: string | number
    login_user_info?: BxLoginUserInfo
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

/** 登录用户信息（平台回传，字段以实际为准） */
export interface BxLoginUserInfo {
  user_no?: string
  user_name?: string
  nick_name?: string
  phone?: string
  [key: string]: unknown
}

/** 平台统一响应信封 */
export interface BxEnvelope<T = unknown> {
  state: BxState
  resultCode: string
  resultMessage?: string
  serviceInfo?: unknown
  data: T[] | null
  errorType?: string | null
  page?: BxPage | null
  response?: BxWriteResponse<T>[] | null
}

/**
 * 平台 resultCode 语义（迁移期间与老工程保持一致）
 *
 * - `0000`        成功
 * - `0011`        需要登录访问（会话过期）：**禁止静默重试**，必须走重新登录
 * - `0111`        需要二级密码
 * - `9998`        平台未知异常
 * - `PWD_EXPIRE`  密码过期
 * - `401`         未授权
 * - `429`         触发限流
 * - `FAILURE`     业务失败（真实响应中 resultCode 也会出现该字符串）
 */
export const BX_CODE = {
  SUCCESS: '0000',
  SESSION_EXPIRED: '0011',
  SECOND_PASSWORD: '0111',
  UNKNOWN: '9998',
  PWD_EXPIRE: 'PWD_EXPIRE',
  UNAUTHORIZED: '401',
  RATE_LIMIT: '429',
  FAILURE: 'FAILURE',
} as const

/** 请求层统一错误 */
export class BxError extends Error {
  readonly code: string
  readonly envelope: BxEnvelope | null
  readonly httpStatus: number

  constructor(message: string, code: string, envelope: BxEnvelope | null = null, httpStatus = 0) {
    super(message)
    this.name = 'BxError'
    this.code = code
    this.envelope = envelope
    this.httpStatus = httpStatus
  }

  /** 会话过期：调用方据此跳登录，不要重试 */
  get isSessionExpired(): boolean {
    return this.code === BX_CODE.SESSION_EXPIRED
  }
}
