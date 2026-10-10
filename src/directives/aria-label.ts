/**
 * 可访问性指令：把可读名称写到 uni-app 真正渲染出来的表单控件上
 *
 * 背景（Chrome 可访问性树实测）：
 *
 *     <uni-input aria-label="所属单位">   → role=generic   name=「所属单位」
 *       └─ <input>                        → role=textbox   name=「」   ← 空
 *
 * `aria-label` 写在 `<input>` 上会被 uni-app 留在外层 `uni-input`，而外层是
 * `role=generic`，**不是表单控件** —— 屏幕阅读器读到的仍然是一个没有名称的
 * textbox。ARIA 属性不会继承，所以只能设到真正承担控件角色的那个元素上。
 *
 * 这里用指令在挂载后把名称同步到内层原生控件。小程序端没有 DOM，用
 * `#ifdef H5` 排除；小程序自身用 `aria-label` 属性由 uni-app 处理。
 */
import type { Directive } from 'vue'

/** 需要写入名称的原生控件选择器（uni-app 会把它们包一层自定义元素） */
const NATIVE_SELECTOR = 'input, textarea'

function applyName(el: Element, name: string): void {
  if (!name)
    return
  const target = el.matches(NATIVE_SELECTOR) ? el : el.querySelector(NATIVE_SELECTOR)
  if (!target)
    return
  if (!target.getAttribute('aria-label')) {
    target.setAttribute('aria-label', name)
  }
}

/**
 * 用法：`v-aria-label="'所属单位'"`
 *
 * 值变化时同步更新；空值不动（避免把已有名称清掉）。
 */
export const vAriaLabel: Directive<HTMLElement, string> = {
  // #ifdef H5
  mounted(el, binding) {
    applyName(el, binding.value)
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      applyName(el, binding.value)
    }
  },
  // #endif
}
