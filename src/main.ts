import * as Pinia from 'pinia'
import { createSSRApp } from 'vue'

import App from './App.vue'
import 'uno.css'

/**
 * H5 端兼容老工程路由
 *
 * 老工程页面源码位于项目根的 `questionnaire/` 下，链接形如
 * `#/questionnaire/index/index?activity_no=xxx`；
 * 新工程页面在 `src/pages/` 下，路由为 `#/pages/questionnaire/index/index`。
 * 这里在应用启动前把老 hash 重写为新路径，保证历史链接与二维码继续可用。
 */
if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
  const legacyHash = window.location.hash.replace(/^#/, '')
  if (legacyHash.startsWith('/questionnaire/')) {
    window.location.replace(
      `${window.location.pathname}${window.location.search}#/pages${legacyHash}`,
    )
  }
}

export function createApp() {
  const app = createSSRApp(App)
  app.use(Pinia.createPinia())
  return {
    app,
    Pinia,
  }
}
