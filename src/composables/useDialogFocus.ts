/**
 * 弹层焦点管理（H5）
 *
 * 弹层必须满足三件事，靠「记得写」是保不住的，所以收敛成一个 composable：
 * 1. 打开时记住触发元素，关闭后把焦点还回去 —— 否则键盘用户会被丢回页面顶部；
 * 2. Esc 关闭；
 * 3. Tab 在面板内循环，不能跑到背后的页面上。
 *
 * 小程序端没有 DOM 焦点与键盘，整段逻辑落在 `#ifdef H5` 里，
 * 非 H5 构建得到一组空实现（调用方不需要判断平台）。
 */

import type { Ref } from 'vue'

/** 面板里可聚焦的元素：uni-app 的按钮/开关都是带 tabindex 的 view */
const FOCUSABLE_SELECTOR = '[tabindex="0"], input, textarea, button, a[href]'

export interface DialogFocusController {
  /** 打开弹层时调用：记住触发元素、绑定 Esc/Tab 监听 */
  activate: () => void
  /** 关闭弹层时调用：解绑监听并把焦点还给触发元素 */
  deactivate: () => void
  /** 把焦点送进面板（等 DOM 渲染完再调） */
  focusPanel: () => void
}

export function useDialogFocus(
  panelRef: Ref<HTMLElement | null>,
  onClose: () => void,
): DialogFocusController {
  // #ifdef H5
  let lastActive: HTMLElement | null = null
  // #endif
  let bound = false

  /**
   * 把模板 ref 归一成 DOM 元素
   *
   * uni-app H5 的 `<view>` 是 Vue 组件，ref 拿到的是组件实例（`$el` 才是 uni-view），
   * 直接当 HTMLElement 用会报「querySelector is not a function」。
   */
  function resolveElement(value: unknown): HTMLElement | null {
    // #ifdef H5
    if (!value) {
      return null
    }
    if (Array.isArray(value)) {
      return resolveElement(value[0])
    }
    if (value instanceof HTMLElement) {
      return value
    }
    const el = (value as { $el?: unknown }).$el
    return el instanceof HTMLElement ? el : null
    // #endif
    return null
  }

  function onKeydown(event: KeyboardEvent): void {
    // #ifdef H5
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') {
      return
    }

    const panel = resolveElement(panelRef.value)
    const items = panel
      ? [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
          .filter(element => element.offsetParent !== null)
      : []

    if (items.length === 0) {
      event.preventDefault()
      panel?.focus?.()
      return
    }

    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    const inside = !!panel && !!active && panel.contains(active)

    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault()
      last?.focus()
    }
    else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault()
      first?.focus()
    }
    // #endif
  }

  function activate(): void {
    // #ifdef H5
    lastActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // #endif
    if (!bound) {
      // #ifdef H5
      document.addEventListener('keydown', onKeydown)
      // #endif
      bound = true
    }
  }

  function deactivate(): void {
    if (bound) {
      // #ifdef H5
      document.removeEventListener('keydown', onKeydown)
      // #endif
      bound = false
    }
    // #ifdef H5
    const target = lastActive
    lastActive = null
    if (target && typeof target.focus === 'function') {
      target.focus()
    }
    // #endif
  }

  function focusPanel(): void {
    // #ifdef H5
    const panel = resolveElement(panelRef.value)
    if (!panel) {
      return
    }
    const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(first ?? panel).focus?.()
    // #endif
  }

  return { activate, deactivate, focusPanel }
}
