import { presetUni } from '@uni-helper/unocss-preset-uni'

import {
  defineConfig,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    /**
     * `remRpx: false` —— 关闭预设的 rem ↔ rpx 换算。
     *
     * 换算开着的时候，UnoCSS 的 px 工具类会在小程序产物里变成 rpx
     * （实测产物里出现 `.ms{margin-inline-start:32rpx}`）。rpx 在小程序
     * PC 横屏窗口会按 750 基准等比放大，整页尺寸失控 —— 与本项目
     * 「统一用 px + max-width 居中」的约束直接冲突。
     *
     * 本项目**零** UnoCSS 工具类引用（类名全是自写的 `bx-*`），所以关掉
     * 没有任何渲染影响；关掉之后产物里不再出现 rpx，
     * test/style-units.spec.ts 的产物侧守卫也因此能收紧到零容忍。
     */
    presetUni({ remRpx: false }),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  theme: {
    colors: {
      /**
       * 与 `src/styles/tokens.scss` 同源，**每个色值都必须在那边存在**
       * （由 test/design-tokens.spec.ts 双向守护）。
       *
       * 这里的色值虽暂无工具类引用（src 里零 `bg-bx-*` 用法），仍完整镜像：
       * 守卫的价值在于「改一处忘另一处会报错」，留一半反而制造盲区。
       *
       * V2（2026-10-21）墨蓝版：主色 #2C46C8，中性色转近石墨，
       * 语义色整体提深到 AA 以上（对比度实测见 tokens.scss 头部注释）。
       */
      bx: {
        'blue': '#3B4EDB',
        'blue-hover': '#2F41C2',
        'blue-active': '#26359E',
        'blue-soft': '#EEF1FD',
        /* 语义主色别名只存在于 CSS 变量层（--bx-primary: var(--bx-blue)），
         * 不是十六进制，按 design-tokens.spec.ts 的口径不需要在这里镜像。 */
        'primary-line': '#C9D1F7',
        'glow': 'rgba(59, 78, 219, 0.07)',
        'bg': '#F5F6F8',
        'surface': '#FFFFFF',
        'surface-2': '#FAFBFC',
        'text': '#14161A',
        'text-2': '#4B5563',
        'text-3': '#667080',
        'text-4': '#9CA3AF',
        'line': '#E5E7EB',
        'line-2': '#F0F1F4',
        'line-strong': '#D3D7DE',
        'danger': '#C22F24',
        'danger-soft': '#FEF3F2',
        'danger-line': '#F4C7C3',
        'success': '#0F7A5A',
        'success-soft': '#ECF7F2',
        'success-line': '#B3DDCD',
        'warn': '#A34A08',
        'warn-soft': '#FDF5EA',
        'warn-line': '#EFD3AC',
        'health': '#0F7A5A',
        'health-soft': '#ECF7F2',
        'health-line': '#B3DDCD',
        'overlay': 'rgba(20, 24, 33, 0.34)',
        'skeleton-sheen': 'rgba(255, 255, 255, 0.65)',
      },
    },
  },
  // 这里刻意不定义 shortcuts：此前有一组 `bx-card` / `bx-btn-*` 组合类，
  // 但全工程零引用 —— 组件样式统一写在各自的 <style lang="scss"> 里并走
  // tokens.scss 的 CSS 变量（便于运行时主题覆盖），不再叠加第二套类名体系。
  // 将来确实要用组合类时再加回来，但请同时写使用点，避免又变成死配置。
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
