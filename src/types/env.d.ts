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
  /** H5 路由基础路径（生产为 /quest/） */
  readonly VITE_H5_BASE?: string
  /** 运行时配置脚本地址，默认 /js/server.js（站点根目录，与 vpages、dataview 等 H5 共用） */
  readonly VITE_SERVER_CONFIG_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
