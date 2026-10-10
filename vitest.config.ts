import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // 领域层与请求层都是纯 TS，用 node 环境即可。
    // 需要 DOM 的测试（如 v-aria-label 指令）自己手写最小 DOM 桩，
    // 不引入 jsdom —— 桩只覆盖用到的那几个方法，够用且零依赖。
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
})
