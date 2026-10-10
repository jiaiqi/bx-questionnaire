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
import type { ObjectDirective } from 'vue'

/** 需要写入名称的原生控件选择器（uni-app 会把它们包一层自定义元素） */
const NATIVE_SELECTOR = 'input, textarea'

/**
 * 把名称写到原生控件上
 *
 * @param el 指令挂载的元素（uni-app 的外层自定义元素或原生控件本身）
 * @param name 可读名称，空值直接跳过
 * @param force 是否覆盖已有名称。
 *
 * 挂载时**不覆盖**：调用方可能已经显式写了 `aria-label`，那是更明确的意图。
 * 更新时**必须覆盖**：值变了就说明组件想改名称，此时不覆盖会导致名称永远停在
 * 旧值上（这个 bug 是被 `test/directives/aria-label.spec.ts` 抓出来的）。
 */
function applyName(el: Element, name: string, force = false): void {
  if (!name)
    return
  const target = el.matches(NATIVE_SELECTOR) ? el : el.querySelector(NATIVE_SELECTOR)
  if (!target)
    return
  if (force || !target.getAttribute('aria-label')) {
    target.setAttribute('aria-label', name)
  }
}

/**
 * 用法：`v-aria-label="'所属单位'"`
 *
 * 值变化时同步更新；空值不动（避免把已有名称清掉）。
 *
 * 类型用 `ObjectDirective` 而不是 `Directive`：后者是「函数式或对象式」的联合，
 * 声明成它之后 TS 只认函数式那个分支，访问 `mounted` / `updated` 会报
 * 「Property 'updated' does not exist on type 'FunctionDirective'」。
 */
export const vAriaLabel: ObjectDirective<HTMLElement, string> = {
  // #ifdef H5
  mounted(el, binding) {
    applyName(el, binding.value)
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      applyName(el, binding.value, true)
    }
  },
  // #endif
}
