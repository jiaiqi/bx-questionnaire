import uniHelper from '@uni-helper/eslint-config'

export default uniHelper({
  ignores: [
    // 网关原始响应快照：保持原始格式，不做任何格式化
    'test/fixtures/raw/**',
    // 构建期生成物
    'src/pages.json',
    'src/manifest.json',
    'src/auto-imports.d.ts',
    'src/components.d.ts',
  ],
})
