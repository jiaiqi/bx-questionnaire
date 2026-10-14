/**
 * 平台登录（`sso` 应用）
 *
 * 契约取自 `scripts/bx-login.mjs`（已实测可用）：
 * 1. 取 RSA 公钥：`POST {gateway}/sso/select/srvsso_user_pwd_sign_select`
 * 2. 登录：`POST {gateway}/sso/operate/srvuser_login`
 *    body = `[{ serviceName: 'srvuser_login', data: [{ user_no, pwd: RSA(pwd), enc: 'RSA', terminal_type }] }]`
 * 3. 票据在 `response[0].response.bx_auth_ticket`，用户信息在同层的 `login_user_info`
 *
 * ⚠️ **登录有频次限制：连续失败会锁号 1 小时**。因此这一层刻意：
 * - 不做任何自动重试；
 * - 不缓存失败结果；
 * - 由调用方（`useLogin`）负责防重，避免用户连点把账号打到锁定。
 */

import type { BxLoginUserInfo } from '@/utils/request/types'

import { rsaEncrypt } from '@/utils/crypto/rsa'
import { BxError, bxSelect, bxWrite, extractResponsePayload } from '@/utils/request'

/** 登录相关服务都在 `sso` 应用下，不是问卷的 `daq` */
const SSO_APP = 'sso'

/**
 * 终端类型
 *
 * 与 `bx-login.mjs` 和参考工程保持一致，统一上报 `PC`。
 * 不要凭「小程序该报 MP」的直觉改这里 —— 该取值未经实测，改了可能被平台拒绝。
 */
export type LoginTerminalType = 'PC' | 'APP' | 'MP'

export interface LoginResult {
  /** 平台票据，写入 session store 后请求层会自动带上 */
  ticket: string
  /** 平台回传的登录用户信息（字段以实际为准） */
  userInfo: BxLoginUserInfo
}

/**
 * 取登录用的 RSA 公钥
 *
 * 实测平台下发的 `public_key` 可能是**裸 base64**，也可能包在 PEM 里；
 * 响应本身也可能是对象或单元素数组（`bx-login.mjs` 两种都兼容过）。
 */
export async function fetchLoginPublicKey(): Promise<string> {
  const envelope = await bxSelect(
    { serviceName: 'srvsso_user_pwd_sign_select', colNames: ['*'], condition: [] },
    { app: SSO_APP },
  )

  const raw = envelope.data as unknown
  const publicKey = Array.isArray(raw)
    ? (raw[0] as { public_key?: string } | undefined)?.public_key
    : (raw as { public_key?: string } | null)?.public_key

  if (!publicKey) {
    throw new BxError('未取到登录公钥，请联系管理员', 'NO_PUBLIC_KEY', envelope)
  }

  return String(publicKey)
}

/**
 * 账号密码登录
 *
 * 密码先用平台公钥做 RSA 加密再提交，**明文绝不离开设备**。
 */
export async function loginWithPassword(params: {
  userNo: string
  password: string
  terminalType?: LoginTerminalType
}): Promise<LoginResult> {
  const publicKey = await fetchLoginPublicKey()
  const encrypted = rsaEncrypt(publicKey, params.password)

  const envelope = await bxWrite(
    'operate',
    [
      {
        serviceName: 'srvuser_login',
        data: [
          {
            user_no: params.userNo,
            pwd: encrypted,
            enc: 'RSA',
            terminal_type: params.terminalType ?? 'PC',
          },
        ],
      },
    ],
    { app: SSO_APP },
  )

  const payload = extractResponsePayload<{
    bx_auth_ticket?: string
    login_user_info?: BxLoginUserInfo
  }>(envelope)

  const ticket = payload?.bx_auth_ticket
  if (!ticket) {
    throw new BxError('登录成功但未返回票据', 'NO_TICKET', envelope)
  }

  return {
    ticket: String(ticket),
    userInfo: payload?.login_user_info ?? {},
  }
}
