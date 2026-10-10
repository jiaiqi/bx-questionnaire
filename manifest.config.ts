import process from 'node:process'

import { defineManifestConfig } from '@uni-helper/vite-plugin-uni-manifest'
import { loadEnv } from 'vite'

/**
 * 子路径部署前缀
 *
 * 必须与 vite.config.ts 的 `base` 用同一个来源，否则会出现
 * 「JS/CSS 带前缀、favicon 与路由 base 不带前缀」的不一致
 * —— 构建产物里 favicon 会变成 `static/logo.svg`，子路径部署后 404。
 *
 * 这里显式用 loadEnv 读取：.env.* 文件的内容不会自动出现在 process.env 里，
 * 直接取 process.env.VITE_H5_BASE 会永远拿到 undefined 并回退到 '/'。
 */
const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'
const h5Base = loadEnv(mode, process.cwd(), 'VITE_').VITE_H5_BASE || '/'

export default defineManifestConfig({
  'name': '问卷',
  'appid': '__UNI__5210306',
  'description': '园区问卷与健康测评',
  'versionName': '1.0.0',
  'versionCode': '100',
  // 不使用 px 自动转 rpx，布局单位由组件自行决定
  'transformPx': false,
  'mp-weixin': {
    // 沿用老工程小程序 appid，后端 app_no 不变
    appid: 'wxa8574a1e93d8e8d0',
    setting: {
      urlCheck: false,
      es6: true,
      minified: true,
      postcss: true,
    },
    usingComponents: true,
    // 不启用 darkmode，避免额外的 theme.json 维护成本
  },
  'h5': {
    title: '问卷',
    // 与 vite.config.ts 的 base 保持同源，否则子路径部署后 favicon 404
    favicon: `${h5Base}static/logo.svg`,
    router: {
      mode: 'hash',
      base: h5Base,
    },
  },
  'uniStatistics': {
    enable: false,
  },
  'vueVersion': '3',
})
