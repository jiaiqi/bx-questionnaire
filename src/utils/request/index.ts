/**
 * 百想平台请求层
 *
 * 复刻老工程语义、重写实现：
 * - URL：`{gateway}/{app}/{select|operate|add|update|delete}/{service}`，select 末尾按平台惯例拼 `?{service}`；
 * - 票据 header 双发 `bx_auth_ticket` 与 `bx-auth-ticket`；
 * - `0011` 会话过期**只上报不重试**；`429` 不重试轰炸；operate 数组体逐项校验。
 */

import type { BxAction, BxEnvelope, BxMultiItem, BxSelectParams, BxWriteItem } from './types'

import { notifyParent } from '@/utils/embed'
import { SHARED_KEYS, storage } from '@/utils/storage'
import { buildServiceUrl, ENV, resolveGateway, resolveTicket } from './env'
import { BX_CODE, BxError } from './types'

export interface BxRequestOptions {
  /** 应用名，默认取 ENV.app（问卷相关表在 daq 应用下） */
  app?: string
  action: BxAction
  service: string
  /** 请求体：select 传平铺对象，写操作传数组 */
  data: unknown
  /** 超时（毫秒），默认 20s */
  timeout?: number
}

interface RawResult {
  status: number
  envelope: BxEnvelope | null
}

/** 会话过期回调（由 session store 注册，避免请求层反向依赖 store） */
let sessionExpiredHandler: (() => void) | null = null

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}

const FAILURE_CODES = new Set<string>([
  BX_CODE.SESSION_EXPIRED,
  BX_CODE.SECOND_PASSWORD,
  BX_CODE.UNKNOWN,
  BX_CODE.PWD_EXPIRE,
  BX_CODE.UNAUTHORIZED,
  BX_CODE.RATE_LIMIT,
  BX_CODE.FAILURE,
])

/**
 * 票据 header（与传输方式无关）
 *
 * 票据优先级（本地存储 > 构建期 VITE_BX_TICKET）统一由 resolveTicket 决定，
 * 不在各处内联同一段逻辑，避免两处口径漂移。
 *
 * 单独抽出来是因为 `Content-Type` 属于**传输方式**的属性，不是票据的属性：
 * JSON 请求要 `application/json`，而 multipart 上传必须让运行时自己带 boundary，
 * 手写 Content-Type 会把 boundary 覆盖掉、服务端直接解析失败。
 */
export function buildTicketHeaders(): Record<string, string> {
  const ticket = resolveTicket()
  const headers: Record<string, string> = {}
  if (ticket) {
    // 平台新旧 header 名同时发
    headers.bx_auth_ticket = ticket
    headers['bx-auth-ticket'] = ticket
  }
  return headers
}

function buildHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...buildTicketHeaders(),
  }
}

function request(options: BxRequestOptions): Promise<RawResult> {
  const app = options.app ?? ENV.app
  // multi/select 一次提交多个子请求：URL 里没有 service 段
  const baseUrl = options.action === 'multi'
    ? `${resolveGateway()}/${app}/multi/select`
    : buildServiceUrl(app, options.action, options.service)
  const url = options.action === 'select' ? `${baseUrl}?${options.service}` : baseUrl
  const body = JSON.stringify(options.data ?? {})

  return new Promise<RawResult>((resolve, reject) => {
    uni.request({
      url,
      method: 'POST',
      data: body,
      header: buildHeaders(),
      timeout: options.timeout ?? ENV.timeout,
      // 保留凭证：网关对「按用户维度查询」（condition 带 user_no）会按调用者的
      // **平台会话**鉴权，真实用户已登录平台（带会话 cookie）时才查得到自己的记录。
      //
      // 实测对照（同一条件）：record_reply_select 带 user_no=jq 时，
      // Node 直连返回 11 条，浏览器（localhost，无网关域会话）返回 0 条 ——
      // state=SUCCESS 但 data 为空，**不报错**。
      //
      // 注意：早先「改为 false 也无法让服务可用，说明与 cookie 无关」的推断**不成立** ——
      // 那是在无会话环境下测的，恰恰说明需要会话。故保持 true。
      withCredentials: true,
      success: (res) => {
        resolve({
          status: res.statusCode ?? 0,
          envelope: (res.data ?? null) as BxEnvelope | null,
        })
      },
      fail: (err) => {
        reject(new BxError(err?.errMsg || '网络异常，请稍后重试', 'NETWORK'))
      },
    })
  })
}

/** 把失败信封转成统一错误，并处理会话过期 */
function toBxError(envelope: BxEnvelope | null, status: number, service: string): BxError | null {
  if (status === 429) {
    return new BxError('请求过于频繁，请稍后再试', BX_CODE.RATE_LIMIT, envelope, status)
  }
  if (status >= 400 && !envelope) {
    return new BxError(`服务异常（HTTP ${status}）`, String(status), envelope, status)
  }
  if (!envelope) {
    return new BxError('服务无响应', 'EMPTY_RESPONSE', null, status)
  }

  const code = String(envelope.resultCode ?? '')
  const failed = envelope.state === 'FAILURE' || FAILURE_CODES.has(code) || status >= 400
  if (!failed) {
    return null
  }

  const message = envelope.resultMessage || '请求失败'
  const error = new BxError(message || `服务 ${service} 调用失败`, code || 'UNKNOWN', envelope, status)

  if (code === BX_CODE.SESSION_EXPIRED) {
    // 会话过期：清票据并上报，绝不静默重试
    storage.remove(SHARED_KEYS.TICKET)
    sessionExpiredHandler?.()
    // 嵌入场景还要告诉父页面 —— 否则父页面不知道子页已经掉线，
    // 用户会以为「填完了但提交没反应」。父页面收到后跳登录（契约文档 9.3）。
    notifyParent('TICKET_EXPIRED')
  }
  return error
}

/**
 * select：返回完整信封（调用方通常需要 page 与 data）
 *
 * `params.app` **必须参与 URL 拼接**，不能只当请求体字段。
 * 这是踩过的坑：早先只从第二个参数 `options` 读 `app`，而 `area.ts` / `attachment.ts`
 * 把 `app` 写在 `params` 里 —— 于是 app 被静默忽略、URL 用了默认的 `daq`，
 * 服务返回「无权限访问」，地址题**永远**显示「暂无地区数据」，
 * 图片回显也永远读不到附件列表。而 `params` 整体又是请求体，body 里 `app: 'config'`
 * 看着完全正确，把 bug 藏住了（同一个错误报了两次「平台无权限」，其实都是自己调错了应用）。
 */
export async function bxSelect<T = Record<string, unknown>>(
  params: BxSelectParams,
  options: Partial<Omit<BxRequestOptions, 'action' | 'service' | 'data'>> = {},
): Promise<BxEnvelope<T>> {
  const result = await request({
    ...options,
    app: options.app ?? (typeof params.app === 'string' ? params.app : undefined),
    action: 'select',
    service: params.serviceName,
    data: params,
  })
  const error = toBxError(result.envelope, result.status, params.serviceName)
  if (error) {
    throw error
  }
  return result.envelope as BxEnvelope<T>
}

/**
 * multi/select：一次 HTTP 提交多个 select 子请求
 *
 * 官方契约：`POST /{app}/multi/select`，body 是 select 请求数组；
 * 响应 `data` 与请求同序，每项 `{ data, page, state }`。
 * **顶层 SUCCESS 不代表每个子请求成功**，这里逐项检查 `state === 'FAILURE'`。
 */
export async function bxMultiSelect<T = Record<string, unknown>>(
  requests: BxSelectParams[],
  options: Partial<Omit<BxRequestOptions, 'action' | 'service' | 'data'>> = {},
): Promise<BxMultiItem<T>[]> {
  const result = await request({
    ...options,
    action: 'multi',
    service: 'multi',
    data: requests,
  })
  const error = toBxError(result.envelope, result.status, 'multi/select')
  if (error) {
    throw error
  }
  const items = (result.envelope?.data ?? []) as unknown as BxMultiItem<T>[]
  for (const [index, item] of items.entries()) {
    if (item?.state === 'FAILURE') {
      throw new BxError(
        item.resultMessage || `multi/select 第 ${index + 1} 个子请求失败`,
        item.resultCode || 'MULTI_FAILURE',
        result.envelope,
        result.status,
      )
    }
  }
  return items
}

/**
 * 写操作（operate / add / update / delete）
 *
 * 平台 operate 是数组批量：顶层 SUCCESS 不代表全部成功，
 * 必须逐项检查 `response[i].state`；`state` 为 null 视为成功（平台部分服务不回填）。
 */
export async function bxWrite<T = Record<string, unknown>>(
  action: Exclude<BxAction, 'select'>,
  items: BxWriteItem[],
  options: Partial<Omit<BxRequestOptions, 'action' | 'service' | 'data'>> = {},
): Promise<BxEnvelope<T>> {
  const service = items[0]?.serviceName ?? ''
  const result = await request({ ...options, action, service, data: items })
  const error = toBxError(result.envelope, result.status, service)
  if (error) {
    throw error
  }

  const envelope = result.envelope as BxEnvelope<T>
  for (const item of envelope.response ?? []) {
    const state = item?.state
    if (state && String(state).toUpperCase() !== 'SUCCESS') {
      throw new BxError(
        item.resultMessage || envelope.resultMessage || '操作失败',
        item.resultCode || envelope.resultCode || 'UNKNOWN',
        envelope,
        result.status,
      )
    }
  }
  return envelope
}

/**
 * 取写操作返回的 response 负载。
 *
 * 曾经有一个 extractEffectData（按 `effect_data` 解析），但实测证明平台把 `fill_batch_no`
 * 这类回填字段放在 `response` 而不是 `effect_data`，该函数从头到尾没有生产调用，已删除。
 * 若将来确认某服务确实回填 `effect_data`，再按需添加，不要凭字段名推测。
 */
export function extractResponsePayload<T = Record<string, unknown>>(envelope: BxEnvelope): T | null {
  const payload = envelope.response?.[0]?.response
  return (payload as T) ?? null
}

/**
 * 取新增类服务回填的 `effect_data`
 *
 * 平台把**落库后的完整行**放在 `response[0].response.effect_data` 里，
 * 其中包含自动生成的业务主键。实测（parkDev，2026-10-11）：
 *
 * ```text
 * srvdaq_activity_cfg_add → effect_data[0].activity_no = "20261011165001000009"
 * srvdaq_item_cfg_add     → effect_data[0].item_no     = "20261011165001000057"
 * srvdaq_option_cfg_add   → effect_data[0].option_no   = "20261011165001000019"
 * ```
 *
 * 因此新增后**不必回查**就能拿到主键。回查不仅多一次往返，还会因为
 * 「按 title 查活动」这类条件命中多行而取错行。
 *
 * 注意与 `extractResponsePayload` 的区别：两者在**同一个 response 对象的不同键**上 ——
 * `fill_batch_no` 直接在 `response` 上，主键在 `response.effect_data` 里。
 * 早先删除过一个同名函数，理由是「平台把回填放在 response 而不是 effect_data」；
 * 该结论只对 `fill_batch_no` 成立，不能推广到主键。
 */
export function extractEffectData<T = Record<string, unknown>>(envelope: BxEnvelope): T[] {
  const rows = envelope.response?.[0]?.response?.effect_data
  return Array.isArray(rows) ? rows as T[] : []
}

export { BX_CODE, BxError }
export type { BxEnvelope, BxSelectParams, BxWriteItem }
