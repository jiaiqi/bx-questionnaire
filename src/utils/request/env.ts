/**
 * 运行时环境解析
 *
 * 网关优先级：运行时注入（同域根目录 `/js/server.js` 写入的 `pathConfig`，被老门户 iframe 嵌入时即宿主注入）
 *             > 构建期环境变量 `VITE_BX_GATEWAY`（仅兜底）。
 * 没有兜底默认值：两者都缺失时直接报错，避免生产静默连到内网开发环境。
 * 票据优先级：本地存储（登录/授权链路写入） > 构建期联调票据（仅开发环境）。
 */

import { SHARED_KEYS, storage } from '@/utils/storage'

/** 宿主门户注入的运行时配置（老门户 iframe 场景 / 同域 js/server.js 注入） */
interface HostPathConfig {
  gateway?: string
  application?: string
  [key: string]: unknown
}

/**
 * 读取运行时 pathConfig（接口前缀等），按可靠性依次尝试：
 *
 * 1. `window.top.pathConfig` —— 被老门户 iframe 嵌入时，顶层窗口已由门户的 js/server.js 注入；
 * 2. `window.pathConfig` —— 独立打开（公众号 H5 / 小程序 web-view）时，同域根目录的
 *    `/js/server.js` 直接把配置挂在当前窗口（它内部写的是 `top.window.pathConfig`，非 iframe 时 top 即自身）；
 * 3. `sessionStorage.pathConfig` —— server.js 同时写入了该键。跨域 iframe 读 top 会抛异常，
 *    此时只能靠这份同源副本兜底。
 *
 * 三处都没有（本地 dev 没有 server.js）就返回 null，由调用方回退到构建期 VITE_BX_GATEWAY。
 */
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
  try {
    const self = window as Window & { pathConfig?: HostPathConfig }
    if (self.pathConfig) {
      return self.pathConfig
    }
  }
  catch {
    // 非浏览器环境（小程序 / 单测）没有 window
  }
  try {
    const raw = typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem('pathConfig')
    if (raw) {
      const parsed = JSON.parse(raw) as HostPathConfig
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    }
  }
  catch {
    // sessionStorage 不可用（隐私模式 / 非浏览器）或 JSON 损坏：忽略
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
