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
      // 与 styles/tokens.scss 保持同源：主色 #007AFF
      bx: {
        'blue': '#007AFF',
        'blue-hover': '#0067DB',
        'blue-active': '#0059BD',
        'blue-soft': '#EAF3FF',
        'bg': '#F5F6F8',
        'surface': '#FFFFFF',
        'text': '#1F2329',
        'text-2': '#646A73',
        'text-3': '#8F959E',
        'line': '#E5E6EB',
        'line-2': '#F0F1F3',
        'danger': '#F53F3F',
        'success': '#00B42A',
        'warn': '#FF7D00',
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
