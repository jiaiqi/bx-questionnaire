/**
 * 外观偏好（深色主题 / 字号）
 *
 * - 主题：系统 / 浅色 / 深色；H5 通过 `:root[data-theme]` 手动切换，
 *   选「系统」时移除属性，交给 `prefers-color-scheme`；小程序端不提供手动切换，
 *   只跟随系统（`styles/dark.scss` 的媒体查询）。
 * - 字号：标准 / 大 / 特大，映射为 `--bx-font-scale`，tokens.scss 的字阶与行高
 *   已按该系数计算，所以所有用 `--bx-font-*` 的文本一起放大。
 * - 偏好存 uni storage，跨会话保留；H5 端在 App `onLaunch` 时应用一次。
 */

import type { Ref } from 'vue'

import { computed, ref } from 'vue'

export type ThemePreference = 'system' | 'light' | 'dark'
export type FontScalePreference = 'standard' | 'large' | 'xlarge'

const THEME_KEY = 'bx_appearance_theme'
const FONT_SCALE_KEY = 'bx_appearance_font_scale'

export const THEME_OPTIONS: Array<{ value: ThemePreference, label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

export const FONT_SCALE_OPTIONS: Array<{ value: FontScalePreference, label: string, scale: number }> = [
  { value: 'standard', label: '标准', scale: 1 },
  { value: 'large', label: '大', scale: 1.12 },
  { value: 'xlarge', label: '特大', scale: 1.24 },
]

function readStorage(key: string): string {
  try {
    return String(uni.getStorageSync(key) ?? '')
  }
  catch {
    return ''
  }
}

function writeStorage(key: string, value: string): void {
  try {
    uni.setStorageSync(key, value)
  }
  catch {
    // storage 满/隐私模式：偏好丢失可以接受，不阻塞切换
  }
}

function normalizeTheme(value: string): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

function normalizeFontScale(value: string): FontScalePreference {
  return value === 'large' || value === 'xlarge' ? value : 'standard'
}

const theme = ref<ThemePreference>(normalizeTheme(readStorage(THEME_KEY)))
const fontScale = ref<FontScalePreference>(normalizeFontScale(readStorage(FONT_SCALE_KEY)))

const scaleFactor = computed(() => {
  return FONT_SCALE_OPTIONS.find(option => option.value === fontScale.value)?.scale ?? 1
})

/** 把偏好写进根节点；小程序端没有 document，交给系统媒体查询 */
function apply(): void {
  // #ifdef H5
  const root = document.documentElement
  if (theme.value === 'system') {
    delete root.dataset.theme
  }
  else {
    root.dataset.theme = theme.value
  }
  root.style.setProperty('--bx-font-scale', String(scaleFactor.value))
  // #endif
  // #ifndef H5
  // 小程序端不支持运行时改根节点 CSS 变量；主题由 dark.scss 的媒体查询跟随系统。
  // #endif
}

export function useAppearance() {
  function setTheme(value: ThemePreference): void {
    theme.value = value
    writeStorage(THEME_KEY, value)
    apply()
  }

  function setFontScale(value: FontScalePreference): void {
    fontScale.value = value
    writeStorage(FONT_SCALE_KEY, value)
    apply()
  }

  return {
    theme: theme as Ref<ThemePreference>,
    fontScale: fontScale as Ref<FontScalePreference>,
    scaleFactor,
    setTheme,
    setFontScale,
    apply,
  }
}

/** App onLaunch 调用一次：把已存偏好应用到当前会话 */
export function initAppearance(): void {
  apply()
}
