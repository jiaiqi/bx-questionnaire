import { presetUni } from '@uni-helper/unocss-preset-uni'

import {
  defineConfig,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetUni(),
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
       */
      bx: {
        'blue': '#0067DB',
        'blue-hover': '#0059BD',
        'blue-active': '#004DA3',
        'blue-soft': '#EAF3FF',
        /* 语义主色别名只存在于 CSS 变量层（--bx-primary: var(--bx-blue)），
         * 不是十六进制，按 design-tokens.spec.ts 的口径不需要在这里镜像。 */
        'primary-line': '#DCE9FF',
        'bg': '#F2F4F7',
        'surface': '#FFFFFF',
        'surface-2': '#FAFBFC',
        'text': '#1F2329',
        'text-2': '#646A73',
        'text-3': '#667085',
        'text-4': '#98A2B3',
        'line': '#E5E6EB',
        'line-2': '#F0F1F3',
        'danger': '#D92C2C',
        'danger-soft': '#FEF1F1',
        'danger-line': '#F5C2C2',
        'success': '#0F7B2F',
        'success-soft': '#EAF7EE',
        'success-line': '#B7E0C2',
        'warn': '#C2410C',
        'warn-soft': '#FDF3E7',
        'warn-line': '#F0D0AE',
        'health': '#0D9488',
        'health-soft': '#ECFDF5',
        'health-line': '#99F6E4',
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
