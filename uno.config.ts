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
  shortcuts: {
    // 问卷卡片
    'bx-card': 'bg-bx-surface rounded-xl',
    // 主按钮 / 次按钮
    'bx-btn': 'flex items-center justify-center rounded-lg text-15px font-500',
    'bx-btn-primary': 'bx-btn bg-bx-blue text-white',
    'bx-btn-ghost': 'bx-btn bg-bx-surface text-bx-text',
    // 题目题干
    'bx-question-title': 'text-15px font-500 leading-relaxed text-bx-text',
    // 辅助文字
    'bx-hint': 'text-12px text-bx-text-3',
  },
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
