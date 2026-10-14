import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * 真实网关集成测试专用配置
 *
 * 与 `vitest.config.ts` 的唯一区别是**只跑** `test/integration/**`：
 * 默认基线刻意排除了这一组，因为它们需要有效的联调票据与内网网关可达。
 *
 * 运行：`pnpm test:integration`
 * 票据过期时用例会在预检处直接给出换票命令（见 gateway.spec.ts 的 beforeAll）。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    // 真实网络往返比单测慢一个量级，全局放宽超时（用例内仍可单独覆盖）
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
