import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // 领域层与请求层都是纯 TS，用 node 环境即可；
    // 需要 uni 运行时的测试请在文件头用 `// @vitest-environment uniapp` 单独声明。
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
})
