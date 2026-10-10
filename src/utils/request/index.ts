/**
 * 百想平台请求层
 *
 * 复刻老工程语义、重写实现：
 * - URL：`{gateway}/{app}/{select|operate|add|update|delete}/{service}`，select 末尾按平台惯例拼 `?{service}`；
 * - 票据 header 双发 `bx_auth_ticket` 与 `bx-auth-ticket`；
 * - `0011` 会话过期**只上报不重试**；`429` 不重试轰炸；operate 数组体逐项校验。
 */

import type { BxAction, BxEnvelope, BxSelectParams, BxWriteItem } from './types'

import { SHARED_KEYS, storage } from '@/utils/storage'
import { buildServiceUrl, ENV } from './env'
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

function buildHeaders(): Record<string, string> {
  const ticket = storage.getString(SHARED_KEYS.TICKET) || ENV.devTicket
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (ticket) {
    // 平台新旧 header 名同时发
    headers.bx_auth_ticket = ticket
    headers['bx-auth-ticket'] = ticket
  }
  return headers
}

function request(options: BxRequestOptions): Promise<RawResult> {
  const app = options.app ?? ENV.app
  const baseUrl = buildServiceUrl(app, options.action, options.service)
  const url = options.action === 'select' ? `${baseUrl}?${options.service}` : baseUrl
  const body = JSON.stringify(options.data ?? {})

  return new Promise<RawResult>((resolve, reject) => {
    uni.request({
      url,
      method: 'POST',
      data: body,
      header: buildHeaders(),
      timeout: options.timeout ?? ENV.timeout,
      // 保留凭证：微信登录后网关按会话鉴权。
      // 已实测：改为 false 并不能让 srvdaq_record_reply_select / srvdaq_record_reply_merge_select 在未登录时可用
      // （分别返回「系统繁忙」与「需要登录访问」），说明这两个服务要求会话，与 cookie 无关，故保持 true。
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
  }
  return error
}

/** select：返回完整信封（调用方通常需要 page 与 data） */
export async function bxSelect<T = Record<string, unknown>>(
  params: BxSelectParams,
  options: Partial<Omit<BxRequestOptions, 'action' | 'service' | 'data'>> = {},
): Promise<BxEnvelope<T>> {
  const result = await request({
    ...options,
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

/** 取写操作返回的 effect_data 首项 */
export function extractEffectData<T = Record<string, unknown>>(envelope: BxEnvelope<T>): T | null {
  const effectData = envelope.response?.[0]?.response?.effect_data
  if (Array.isArray(effectData) && effectData.length > 0) {
    return effectData[0] as T
  }
  return null
}

/** 取写操作返回的 response 负载（如 fill_batch_no 这类不在 effect_data 里的字段） */
export function extractResponsePayload<T = Record<string, unknown>>(envelope: BxEnvelope): T | null {
  const payload = envelope.response?.[0]?.response
  return (payload as T) ?? null
}

export { BX_CODE, BxError }
export type { BxEnvelope, BxSelectParams, BxWriteItem }
