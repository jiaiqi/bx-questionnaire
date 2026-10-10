/**
 * 把可读名称写到 uni-app 真正渲染出来的表单控件上
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
 * **为什么不用自定义指令**：小程序端的 vue 编译器不支持自定义指令，模板里出现
 * `v-aria-label` 会让构建**直接失败**：
 *
 *     [vite:vue] unknown directive "v-aria-label"
 *     file: src/pages/questionnaire/index/submitInfo.vue
 *
 * 用 `#ifdef H5` 包住指令的钩子也不行 —— 那样导出的指令会变成空对象 `{}`，
 * 模板里的指令名仍然存在，报错照旧。所以改成组合式函数：`onMounted` 在两端
 * 都会执行，平台差异放在**运行时**判断（小程序端没有 `document`，直接跳过）。
 */
import type { Ref } from 'vue'

import { nextTick, onMounted, watch } from 'vue'

/** 需要写入名称的原生控件选择器（uni-app 会把它们包一层自定义元素） */
const NATIVE_SELECTOR = 'input, textarea'

/**
 * 把 `ref` 拿到的东西解析成 DOM 元素
 *
 * 关键坑（CDP 实测发现）：`ref` 绑在 uni-app 的**内置组件**（`<input>` /
 * `<textarea>`）上时，Vue 赋给 ref 的是**组件实例**，不是 DOM 元素 —— 组件实例上
 * 没有 `matches` / `querySelector`，直接当元素用会静默失败（`onMounted` 里的异常
 * 不冒泡到页面，表现为「什么都没发生」，内层 input 的 aria-label 始终是 null）。
 *
 * 绑在普通 `<view>` 上时拿到的才是元素。两种都要支持，所以统一解包 `$el`。
 */
function toElement(ref: unknown): Element | null {
  if (!ref || typeof ref !== 'object') {
    return null
  }
  // 已经是元素（有 matches）
  const asElement = ref as Element
  if (typeof asElement.matches === 'function') {
    return asElement
  }
  // 组件实例：取它的根 DOM
  const el = (ref as { $el?: unknown }).$el
  if (el && typeof (el as Element).matches === 'function') {
    return el as Element
  }
  return null
}

/**
 * 在元素内部找到真正承担控件角色的原生元素并写入 `aria-label`
 *
 * @param root 组件根元素（uni-app 的外层自定义元素，或组件实例）
 * @param name 可读名称，空值直接跳过
 * @param force 是否覆盖已有名称。
 *
 * 首次**不覆盖**：调用方可能已经显式写了 `aria-label`，那是更明确的意图。
 * 后续变化**必须覆盖**：名称变了就说明组件想改，此时不覆盖会导致名称停在旧值。
 *
 * 导出仅为便于单测（`test/composables/useAriaLabel.spec.ts`）：`onMounted` 与
 * `watch` 需要组件上下文，核心的查找与写入逻辑在这里，直接测它更稳。
 *
 * @returns 是否成功写入（调用方据此决定要不要重试）
 */
export function applyAriaLabel(root: unknown, name: string, force = false): boolean {
  if (!name)
    return false
  // 小程序端没有 DOM；用运行时判断而不是条件编译，避免指令被剥成空对象
  if (typeof document === 'undefined') {
    return false
  }
  const el = toElement(root)
  if (!el)
    return false
  try {
    const target = el.matches(NATIVE_SELECTOR) ? el : el.querySelector(NATIVE_SELECTOR)
    if (!target)
      return false
    if (force || !target.getAttribute('aria-label')) {
      target.setAttribute('aria-label', name)
    }
    return true
  }
  catch {
    // 拿到的不是真正的元素（例如组件实例上缺少 DOM 方法）——不抛，交给调用方重试
    return false
  }
}

/** 重试调度器：抽出来是为了让重试逻辑能在 node 环境（无组件上下文）下被测试 */
export interface AriaLabelScheduler {
  nextTick: (fn: () => void) => void
  setTimeout: (fn: () => void, delay: number) => void
}

/** 最多重试次数 */
export const ARIA_LABEL_MAX_RETRY = 5

/** 两次重试之间的间隔（毫秒） */
export const ARIA_LABEL_RETRY_DELAY = 50

/**
 * 带重试地写入名称
 *
 * **为什么要重试**：uni-app 的内置表单组件在 `onMounted` 时可能还没把内部的原生
 * `<input>` 渲染出来，此时 `querySelector` 返回 null。一次性写入会静默失效 ——
 * 表现为内层 input 的 aria-label 永远是 null，而页面看不出任何异常。
 *
 * 每次尝试先等一个微任务（`nextTick`），失败则等一个宏任务（`setTimeout`）后再试，
 * 覆盖异步渲染完成的时刻。
 *
 * 调度函数由调用方注入，这样单测可以传同步实现，直接断言尝试次数 —— 否则这段
 * 重试逻辑在 node 环境下无法覆盖，`attempt < MAX_RETRY` 之类的边界改错了也没人知道。
 *
 * @param rootRef 根元素引用
 * @param getName 名称取值函数
 * @param force 是否覆盖已有名称
 * @param scheduler 调度器（生产传 `nextTick` / `setTimeout`）
 * @returns 是否最终写入成功
 */
export function writeAriaLabelWithRetry(
  rootRef: Ref<unknown>,
  getName: () => string,
  force: boolean,
  scheduler: AriaLabelScheduler,
): boolean {
  let attempt = 0
  let written = false

  function tryOnce(): void {
    scheduler.nextTick(() => {
      if (applyAriaLabel(rootRef.value, getName(), force)) {
        written = true
        return
      }
      if (attempt < ARIA_LABEL_MAX_RETRY) {
        attempt += 1
        scheduler.setTimeout(tryOnce, ARIA_LABEL_RETRY_DELAY)
      }
    })
  }

  tryOnce()
  return written
}

/**
 * 名称变化时的处理
 *
 * 抽成独立函数是为了可测：`watch` 需要组件上下文，在 node 环境下无法触发，
 * 而 `next !== prev` 写成 `==` 会让**名称变化后不再同步**（只在没变化时才写，
 * 等于更新永远不生效）—— 这种反向条件改错了，只靠 e2e 很难发现。
 *
 * 变化时 `force` 传 true：挂载时"不覆盖已有名称"是尊重调用方的显式意图，
 * 但名称变了就说明组件想改，此时不覆盖会让名称永远停在旧值上。
 *
 * @param next 新名称
 * @param prev 旧名称
 * @param rootRef 根元素引用
 * @param scheduler 调度器
 */
export function onAriaLabelChanged(
  next: string,
  prev: string,
  rootRef: Ref<unknown>,
  scheduler: AriaLabelScheduler,
): void {
  if (next !== prev) {
    writeAriaLabelWithRetry(rootRef, () => next, true, scheduler)
  }
}

/**
 * 用法：
 *
 *     const rootRef = ref<HTMLElement | null>(null)
 *     useAriaLabel(rootRef, () => props.field.label)
 *
 * 把 `ref` 绑到**组件根元素**上（uni-app 的 `<uni-input>` / `<uni-textarea>`，或
 * 包着它们的 `<view>`），函数会在它内部查找原生控件。
 *
 * @param rootRef 根元素引用
 * @param getName 名称取值函数（用函数是为了让名称变化时能重新读取）
 */
export function useAriaLabel(
  rootRef: Ref<HTMLElement | null>,
  getName: () => string,
): void {
  const scheduler: AriaLabelScheduler = {
    nextTick: fn => void nextTick(fn),
    setTimeout: (fn, delay) => void setTimeout(fn, delay),
  }

  onMounted(() => {
    writeAriaLabelWithRetry(rootRef, getName, false, scheduler)
  })

  watch(getName, (next, prev) => {
    onAriaLabelChanged(next, prev, rootRef, scheduler)
  })
}
