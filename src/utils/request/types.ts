/**
 * 百想平台接口契约类型
 *
 * 契约基线来自真实网关响应（见 test/fixtures/raw/），迁移期间保持不变。
 */

/** 请求动作段 */
export type BxAction = 'select' | 'operate' | 'add' | 'update' | 'delete'

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
  ruleType: 'asc' | 'desc' | (string & {})
}

/** select 请求体（平铺） */
export interface BxSelectParams {
  serviceName: string
  colNames?: string[]
  condition?: BxCondition[]
  relation_condition?: unknown[]
  order?: BxOrder[]
  page?: { pageNo: number; rownumber: number }
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

export type BxWriteParams = BxWriteItem[]

/** 写操作的子响应 */
export interface BxWriteResponse<T = unknown> {
  code?: string
  state?: string | null
  resultCode?: string
  resultMessage?: string
  response?: {
    effect_data?: T[]
    bx_auth_ticket?: string
    expire_time?: string | number
    login_user_info?: BxLoginUserInfo
    [key: string]: unknown
  }
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
