import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

import Uni from '@uni-helper/plugin-uni'
import { uniuseAutoImports } from '@uni-helper/uni-use'
import Components from '@uni-helper/vite-plugin-uni-components'
import UniLayouts from '@uni-helper/vite-plugin-uni-layouts'
import UniManifest from '@uni-helper/vite-plugin-uni-manifest'
import UniPages from '@uni-helper/vite-plugin-uni-pages'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
  // H5 部署在子路径时资源路径必须带前缀，否则整站 404（生产为 /questionnaire/）
    base: env.VITE_H5_BASE || '/',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
    // https://uni-helper.js.org/vite-plugin-uni-pages
      // 启动页 = 问卷列表。刻意不选作答页：作答页必须带 activity_no，
      // 从根路径直接打开只会落到「缺少活动编号」的死路上。
      // 这里与 `pages/editor/list/index.vue` 的 `definePage({ type: 'home' })` 必须一致。
      //
      // ⚠️ 改完首页后必须**先删掉磁盘上的 `src/pages.json` 再重启 dev server**：
      // 插件默认 `mergePages: true`，会与已存在的生成物合并，旧顺序会被保留
      // （实测还会出现重复条目），表现为「首页没变」，而干净检出的仓库里是正确的。
      // 不要试图用 `mergePages: false` 规避 —— 读插件源码可知那个开关会**跳过
      // src/pages 的扫描**（index.mjs 里 scanPages 就在这个分支内），
      // 结果是 pages.json 里一条路由都没有、启动时报 "No home page found"。
      UniPages({ homePage: 'pages/editor/list/index' }),
      // https://uni-helper.js.org/vite-plugin-uni-layouts
      UniLayouts(),
      // https://uni-helper.js.org/vite-plugin-uni-manifest
      UniManifest(),
      // https://github.com/unplugin/unplugin-auto-import
      // 不引入 @vueuse/core：uni-use 已提供适配 uni-app 的同名能力，重复引入会产生冲突告警
      AutoImport({
        imports: ['vue', 'uni-app', 'pinia', uniuseAutoImports()],
        dts: 'src/auto-imports.d.ts',
        dirs: ['src/composables', 'src/stores', 'src/utils'],
        vueTemplate: true,
      }),
      // https://uni-helper.js.org/vite-plugin-uni-components
      // 仅自动导入 src/components 下的自有组件；未引入第三方组件库，
      // 以保证 vue-tsc 类型检查不被第三方库缺陷阻塞。
      Components({
        dts: true,
      }),
      // https://uni-helper.js.org/plugin-uni
      Uni(),
      UnoCSS(),
    ],
    build: {
      target: 'es6',
      cssTarget: 'chrome61',
    },
    optimizeDeps: {
      exclude: ['vue-demi'],
    },
  }
})
