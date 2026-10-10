/// <reference types="vite/client" />
/// <reference types="@uni-helper/vite-plugin-uni-pages/client" />

interface ImportMetaEnv {
  /** 网关地址，如 http://192.168.0.214/bxapi */
  readonly VITE_BX_GATEWAY: string
  /** 业务应用名，问卷相关表在 daq 应用下 */
  readonly VITE_BX_APP: string
  /** 平台应用编号 */
  readonly VITE_BX_APP_NO: string
  /** 请求超时（毫秒） */
  readonly VITE_BX_TIMEOUT?: string
  /** 本地联调票据（只放 .env.local，禁止入库） */
  readonly VITE_BX_TICKET?: string
  /** 公众号 appid */
  readonly VITE_BX_WX_APPID?: string
  /** 小程序 appid */
  readonly VITE_BX_WX_MP_APPID?: string
  /** H5 路由基础路径 */
  readonly VITE_H5_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
