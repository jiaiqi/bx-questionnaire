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
        'blue': '#2C46C8',
        'blue-hover': '#2439A4',
        'blue-active': '#1D2F86',
        'blue-soft': '#EEF0FD',
        /* 语义主色别名只存在于 CSS 变量层（--bx-primary: var(--bx-blue)），
         * 不是十六进制，按 design-tokens.spec.ts 的口径不需要在这里镜像。 */
        'primary-line': '#D7DCF8',
        'glow': 'rgba(44, 70, 200, 0.06)',
        'bg': '#F4F5F7',
        'surface': '#FFFFFF',
        'surface-2': '#F7F8FA',
        'text': '#15181C',
        'text-2': '#4E555E',
        'text-3': '#6B7280',
        'text-4': '#9AA1A9',
        'line': '#E4E7EC',
        'line-2': '#F0F2F5',
        'line-strong': '#D3D8DE',
        'danger': '#C42B1F',
        'danger-soft': '#FDF1EF',
        'danger-line': '#F3C9C3',
        'success': '#17784A',
        'success-soft': '#EDF7F1',
        'success-line': '#BFE3CE',
        'warn': '#A85A0A',
        'warn-soft': '#FDF3E7',
        'warn-line': '#F0D3AE',
        'health': '#0F766E',
        'health-soft': '#F0F9F7',
        'health-line': '#A7E3DB',
        'overlay': 'rgba(21, 24, 28, 0.45)',
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
