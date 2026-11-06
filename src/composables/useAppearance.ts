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

/**
 * 把偏好写进根节点；小程序端没有 document，交给系统媒体查询
 *
 * ## 为什么 H5 还要写到页面容器上
 *
 * `tokens.scss` 与 `dark.scss` 都用 `page, :root` 这类**双选择器**声明整套变量
 * （`page` 是给没有 `:root` 的小程序准备的）。uni-app 编译到 H5 时会把 `page`
 * 变成 `uni-page-body`，于是**页面容器上也有一份完整的默认值副本**。
 *
 * CSS 变量的取值遵循「就近声明优先于继承」，容器自己声明了 `--bx-font-scale: 1`
 * 和浅色 `--bx-bg`，就会把根节点上的覆盖整个遮蔽掉。只改 `<html>` 的后果是：
 * 面板里点了深色 / 特大，`document.documentElement` 看起来变了，但页面内容纹丝不动
 * —— 这正是「外观设置好像不生效」的真实原因。
 *
 * 所以 H5 端必须同时覆盖容器。容器会被 uni-app 在路由切换时重建，重建后要补一次，
 * 由 `watchContainers()` 负责。
 */
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

  paintContainers()
  watchContainers()
  // #endif
  // #ifndef H5
  // 小程序端不支持运行时改根节点 CSS 变量；主题由 dark.scss 的媒体查询跟随系统。
  // #endif
}

/** 把当前偏好写到所有页面容器上（H5） */
function paintContainers(): void {
  for (const el of pageContainers()) {
    if (theme.value === 'system') {
      el.removeAttribute('data-theme')
    }
    else {
      el.setAttribute('data-theme', theme.value)
    }
    el.style.setProperty('--bx-font-scale', String(scaleFactor.value))
  }
}

/** H5 页面容器：`page` 编译后就是 `uni-page-body` */
function pageContainers(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('uni-page-body, page'))
}

let observer: MutationObserver | null = null
let rafId = 0

/**
 * 监听页面容器重建
 *
 * 只监听 `childList`（不监听属性）：`paintContainers` 写的是 attributes 与 inline style，
 * 不会反过来触发自身，避免死循环。回调节流到一帧一次。
 */
function watchContainers(): void {
  if (observer || typeof MutationObserver !== 'function') {
    return
  }
  observer = new MutationObserver(() => {
    if (rafId) {
      return
    }
    rafId = requestAnimationFrame(() => {
      rafId = 0
      paintContainers()
    })
  })
  observer.observe(document.body, { childList: true, subtree: true })
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
