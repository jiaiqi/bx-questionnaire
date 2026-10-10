/**
 * 运行时环境解析
 *
 * 网关优先级：H5 宿主注入（iframe 嵌入老门户） > 构建期环境变量。
 * 没有兜底默认值：环境变量缺失时直接报错，避免生产静默连到内网开发环境。
 * 票据优先级：本地存储（登录/授权链路写入） > 构建期联调票据（仅开发环境）。
 */

import { SHARED_KEYS, storage } from '@/utils/storage'

/** 宿主门户注入的运行时配置（老门户 iframe 场景） */
interface HostPathConfig {
  gateway?: string
  application?: string
  [key: string]: unknown
}

function readHostPathConfig(): HostPathConfig | null {
  // #ifdef H5
  try {
    const top = window.top as (Window & { pathConfig?: HostPathConfig }) | null
    if (top && top.pathConfig) {
      return top.pathConfig
    }
  }
  catch {
    // 跨域 iframe 读取 top 会抛异常，忽略即可
  }
  // #endif
  return null
}

function normalizeGateway(value: string | undefined | null): string {
  const gateway = (value ?? '').trim()
  if (!gateway) {
    return ''
  }
  return gateway.endsWith('/') ? gateway.slice(0, -1) : gateway
}

export const ENV = {
  /** 业务应用名：问卷相关表在 daq 应用下 */
  app: import.meta.env.VITE_BX_APP || 'daq',
  appNo: import.meta.env.VITE_BX_APP_NO || 'APPNO20250709152308',
  wxAppId: import.meta.env.VITE_BX_WX_APPID || '',
  wxMpAppId: import.meta.env.VITE_BX_WX_MP_APPID || '',
  timeout: Number(import.meta.env.VITE_BX_TIMEOUT ?? 20000) || 20000,
  h5Base: import.meta.env.VITE_H5_BASE || '/',
  /** 仅开发联调使用；生产环境为空 */
  devTicket: import.meta.env.VITE_BX_TICKET || '',
} as const

/** 解析当前生效的网关地址 */
export function resolveGateway(): string {
  const fromHost = normalizeGateway(readHostPathConfig()?.gateway)
  if (fromHost) {
    return fromHost
  }
  const gateway = normalizeGateway(import.meta.env.VITE_BX_GATEWAY)
  if (!gateway) {
    // 刻意不提供默认值：缺失时立刻暴露，否则生产环境会静默请求内网开发网关
    throw new Error('未配置网关地址（VITE_BX_GATEWAY）')
  }
  return gateway
}

/** 解析当前生效的票据 */
export function resolveTicket(): string {
  const fromStorage = storage.getString(SHARED_KEYS.TICKET)
  if (fromStorage) {
    return fromStorage
  }
  return ENV.devTicket
}

/** 拼接服务 URL：{gateway}/{app}/{action}/{service} */
export function buildServiceUrl(app: string, action: string, service: string): string {
  return `${resolveGateway()}/${app}/${action}/${service}`
}
