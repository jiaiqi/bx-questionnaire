import { fileURLToPath, URL } from 'node:url'

import Uni from '@uni-helper/plugin-uni'
import { uniuseAutoImports } from '@uni-helper/uni-use'
import Components from '@uni-helper/vite-plugin-uni-components'
import UniLayouts from '@uni-helper/vite-plugin-uni-layouts'
import UniManifest from '@uni-helper/vite-plugin-uni-manifest'
import UniPages from '@uni-helper/vite-plugin-uni-pages'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    // https://uni-helper.js.org/vite-plugin-uni-pages
    UniPages({ homePage: 'pages/questionnaire/index/index' }),
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
})
