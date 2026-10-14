import { fileURLToPath, URL } from 'node:url'

import { configDefaults, defineConfig } from 'vitest/config'

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
    /**
     * 真实网关集成测试默认排除
     *
     * `test/integration/gateway.spec.ts` 依赖联调票据（约 1.5 小时滑动过期）与内网网关。
     * 票据过期时它表现为 2 条失败，报 `0011 需要登录访问` —— 与代码无关，却让默认
     * 基线变红。而 `describe.skipIf(!ticket)` 只判票据**是否存在**、不判是否有效，
     * 于是「干净克隆全绿、本机却红」，测试基线不再可信。
     *
     * 因此默认 `pnpm test` 只跑自洽的用例；需要真实联调时单独跑 `pnpm test:integration`。
     */
    exclude: [...configDefaults.exclude, 'test/integration/**'],
  },
})
