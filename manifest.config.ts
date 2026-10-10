import { defineManifestConfig } from '@uni-helper/vite-plugin-uni-manifest'

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
    router: {
      mode: 'hash',
      base: '/',
    },
  },
  'uniStatistics': {
    enable: false,
  },
  'vueVersion': '3',
})
