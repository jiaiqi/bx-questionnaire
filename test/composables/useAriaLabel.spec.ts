import type { Ref } from 'vue'

import type { AriaLabelScheduler } from '@/composables/useAriaLabel'

/**
 * useAriaLabel 测试
 *
 * 为什么需要：Chrome 可访问性树实测发现，`aria-label` 写在 uni-app 的 `<input>`
 * 上会被留在外层 `uni-input`（role=generic），内层原生 input 的 name 是空的 ——
 * 屏幕阅读器读不到名称。这个函数负责把名称补到内层控件上。
 *
 * **为什么不再是自定义指令**：小程序端的 vue 编译器不支持自定义指令，模板里出现
 * `v-aria-label` 会让构建直接失败（`[vite:vue] unknown directive`）。用 `#ifdef H5`
 * 包住钩子也不行 —— 导出的指令会变成空对象，报错照旧。所以改成组合式函数。
 *
 * 测试环境是 node（无 DOM），手写最小 DOM 桩，只实现用到的四个方法。
 */
import { describe, expect, it } from 'vitest'

import {
  applyAriaLabel,
  ARIA_LABEL_RETRY_DELAY,
  onAriaLabelChanged,
  writeAriaLabelWithRetry,
} from '@/composables/useAriaLabel'

interface FakeElement {
  tagName: string
  attrs: Record<string, string>
  children: FakeElement[]
  matches: (selector: string) => boolean
  querySelector: (selector: string) => FakeElement | null
  getAttribute: (name: string) => string | null
  setAttribute: (name: string, value: string) => void
}

/** 只认识 `input, textarea` 这一个选择器 —— 函数也只用它 */
function makeElement(tagName: string, children: FakeElement[] = []): FakeElement {
  return {
    tagName,
    attrs: {},
    children,
    matches(selector: string) {
      return selector.split(',').map(s => s.trim()).includes(tagName)
    },
    querySelector(selector: string) {
      for (const child of children) {
        if (child.matches(selector)) {
          return child
        }
        const nested = child.querySelector(selector)
        if (nested) {
          return nested
        }
      }
      return null
    },
    getAttribute(name: string) {
      return this.attrs[name] ?? null
    },
    setAttribute(name: string, value: string) {
      this.attrs[name] = value
    },
  }
}

/** 模拟 uni-app 的 H5 结构：uni-input > div > input */
function makeUniInput(): { outer: FakeElement, inner: FakeElement } {
  const inner = makeElement('input')
  const wrapper = makeElement('div', [inner])
  const outer = makeElement('uni-input', [wrapper])
  return { outer, inner }
}

/** node 环境没有 document；函数靠它判断是否在小程序端 */
function withDocument(): void {
  ;(globalThis as Record<string, unknown>).document = {}
}
function withoutDocument(): void {
  delete (globalThis as Record<string, unknown>).document
}

describe('applyAriaLabel', () => {
  it('把名称写到外层容器内部的原生控件上', () => {
    withDocument()
    const { outer, inner } = makeUniInput()

    applyAriaLabel(outer as unknown as Element, '所属单位')

    // 名称必须落在内层 input —— 那才是 role=textbox 的元素
    expect(inner.getAttribute('aria-label')).toBe('所属单位')
    // 外层不该被写（写在外层对屏幕阅读器无效，且会与 uni-app 自身行为混淆）
    expect(outer.getAttribute('aria-label')).toBeNull()
    withoutDocument()
  })

  it('元素本身就是原生控件时直接写在它上面', () => {
    withDocument()
    const el = makeElement('input')

    applyAriaLabel(el as unknown as Element, '姓名')

    expect(el.getAttribute('aria-label')).toBe('姓名')
    withoutDocument()
  })

  it('textarea 同样支持（uni-app 的 textarea 内部结构一致）', () => {
    withDocument()
    const inner = makeElement('textarea')
    const outer = makeElement('uni-textarea', [makeElement('div', [inner])])

    applyAriaLabel(outer as unknown as Element, '请留下你的建议')

    expect(inner.getAttribute('aria-label')).toBe('请留下你的建议')
    withoutDocument()
  })

  it('空值不写入，避免产生空的 aria-label', () => {
    withDocument()
    const { outer, inner } = makeUniInput()

    applyAriaLabel(outer as unknown as Element, '')

    expect(inner.getAttribute('aria-label')).toBeNull()
    withoutDocument()
  })

  it('根元素为 null 时静默跳过，不抛异常', () => {
    withDocument()

    expect(() => applyAriaLabel(null, '标题')).not.toThrow()
    withoutDocument()
  })

  it('容器内没有原生控件时静默跳过，不抛异常', () => {
    withDocument()
    const outer = makeElement('uni-view', [makeElement('text')])

    expect(() => applyAriaLabel(outer as unknown as Element, '标题')).not.toThrow()
    expect(outer.getAttribute('aria-label')).toBeNull()
    withoutDocument()
  })

  it('已有名称时不被覆盖（尊重调用方显式写的 aria-label）', () => {
    withDocument()
    const { outer, inner } = makeUniInput()
    inner.setAttribute('aria-label', '外部指定的名称')

    applyAriaLabel(outer as unknown as Element, '组件推断的名称')

    expect(inner.getAttribute('aria-label')).toBe('外部指定的名称')
    withoutDocument()
  })

  it('force 为真时覆盖已有名称（名称变化走这条）', () => {
    withDocument()
    const { outer, inner } = makeUniInput()
    applyAriaLabel(outer as unknown as Element, '旧标题')

    applyAriaLabel(outer as unknown as Element, '新标题', true)

    expect(inner.getAttribute('aria-label')).toBe('新标题')
    withoutDocument()
  })

  /**
   * 小程序端：没有 document，且 uni-app 也不会调用指令钩子。函数必须**静默返回**
   * 而不是抛错 —— 小程序端一旦抛错会直接白屏，而它本来就不需要这段逻辑。
   */
  it('没有 document（小程序端）时静默跳过，不触碰元素也不抛异常', () => {
    withoutDocument()
    const { outer, inner } = makeUniInput()

    expect(() => applyAriaLabel(outer as unknown as Element, '所属单位')).not.toThrow()
    expect(inner.getAttribute('aria-label')).toBeNull()
  })

  /**
   * 这条是 CDP 实测抓出来的真实坑：`ref` 绑在 uni-app 的**内置组件**上时，
   * Vue 赋给 ref 的是**组件实例**而不是 DOM 元素。组件实例没有 `matches` /
   * `querySelector`，直接当元素用会静默失败 —— 表现是内层 input 的 aria-label
   * 永远是 null，而页面看不出任何异常（`onMounted` 里的异常不冒泡到页面）。
   */
  it('传入组件实例（有 $el）时解包出根元素再写入', () => {
    withDocument()
    const { outer, inner } = makeUniInput()
    const componentInstance = { $el: outer }

    const ok = applyAriaLabel(componentInstance, '所属单位')

    expect(ok).toBe(true)
    expect(inner.getAttribute('aria-label')).toBe('所属单位')
    withoutDocument()
  })

  it('传入无法解包的普通对象时返回 false，交给调用方重试', () => {
    withDocument()

    expect(applyAriaLabel({}, '标题')).toBe(false)
    expect(applyAriaLabel(123, '标题')).toBe(false)
    expect(applyAriaLabel(undefined, '标题')).toBe(false)
    withoutDocument()
  })

  it('元素上没有 querySelector 时返回 false 而不是抛异常', () => {
    withDocument()
    // 有 matches（看起来像元素）但没有 querySelector —— 解包逻辑会把它当元素用
    const fake = { matches: () => false }

    expect(() => applyAriaLabel(fake, '标题')).not.toThrow()
    expect(applyAriaLabel(fake, '标题')).toBe(false)
    withoutDocument()
  })

  it('写入成功返回 true，供调用方判断是否还需要重试', () => {
    withDocument()
    const el = makeElement('input')

    expect(applyAriaLabel(el as unknown as Element, '姓名')).toBe(true)
    // 名称缺失时没写，返回 false
    expect(applyAriaLabel(el as unknown as Element, '')).toBe(false)
    withoutDocument()
  })
})

/**
 * 重试逻辑
 *
 * 抽出来测的原因：uni-app 内置表单组件在 `onMounted` 时可能还没渲染出内部原生
 * `<input>`，一次性写入会**静默失效**（内层 aria-label 永远是 null，页面看不出异常）。
 * 这段重试在 node 环境原本无法覆盖 —— 上一版就是这么漏掉的：`attempt < MAX_RETRY`
 * 改成 `>=`、次数常量改成 6、间隔改成 51ms，测试全绿。
 *
 * 调度器由调用方注入，这里传同步实现，直接数尝试次数。
 */
describe('writeAriaLabelWithRetry', () => {
  /** 同步调度器：立刻执行，不等待 */
  function makeSyncScheduler(): {
    scheduler: AriaLabelScheduler
    counters: { microtasks: number, macrotasks: number, delays: number[] }
  } {
    const counters = { microtasks: 0, macrotasks: 0, delays: [] as number[] }
    const scheduler: AriaLabelScheduler = {
      nextTick(fn) {
        counters.microtasks += 1
        fn()
      },
      setTimeout(fn, delay) {
        counters.macrotasks += 1
        counters.delays.push(delay)
        fn()
      },
    }
    return { scheduler, counters }
  }

  it('第一次就成功时不安排任何重试', () => {
    withDocument()
    const { outer, inner } = makeUniInput()
    const { scheduler } = makeSyncScheduler()
    const rootRef = { value: outer } as unknown as Ref<unknown>

    const ok = writeAriaLabelWithRetry(rootRef, () => '所属单位', false, scheduler)

    expect(ok).toBe(true)
    expect(inner.getAttribute('aria-label')).toBe('所属单位')
    withoutDocument()
  })

  it('控件还没渲染出来时按上限重试，最终成功', () => {
    withDocument()
    const { outer, inner } = makeUniInput()
    // 前两次查不到控件，之后才有 —— 模拟 uni-app 的异步渲染
    let visible = 0
    const flaky = {
      ...outer,
      querySelector(selector: string) {
        visible += 1
        return visible > 2 ? outer.querySelector(selector) : null
      },
    }
    const { scheduler, counters } = makeSyncScheduler()
    const rootRef = { value: flaky } as unknown as Ref<unknown>

    const ok = writeAriaLabelWithRetry(rootRef, () => '所属单位', false, scheduler)

    expect(ok).toBe(true)
    expect(inner.getAttribute('aria-label')).toBe('所属单位')
    // 第 1 次失败 → 第 2 次失败 → 第 3 次成功，中间安排 2 次宏任务重试
    expect(counters.macrotasks).toBe(2)
    // 每次重试的间隔都是 50ms
    expect(counters.delays).toEqual([50, 50])
    withoutDocument()
  })

  it('始终查不到控件时最多尝试 MAX_RETRY + 1 次后放弃，不无限重试', () => {
    withDocument()
    const empty = makeElement('uni-view', [makeElement('text')])
    const { scheduler, counters } = makeSyncScheduler()
    const rootRef = { value: empty } as unknown as Ref<unknown>

    const ok = writeAriaLabelWithRetry(rootRef, () => '标题', false, scheduler)

    expect(ok).toBe(false)
    // 首次 + MAX_RETRY 次重试。
    //
    // 这里**必须断言字面量 5**，不能写 `toBe(ARIA_LABEL_MAX_RETRY)` ——
    // 那样变异器把常量改成 6 时等式两边一起变，测试仍然绿。
    // 常量的值本身就是规格（「最多重试 5 次」），期望值要显式声明。
    expect(counters.macrotasks).toBe(5)
    withoutDocument()
  })

  it('重试间隔是 50ms（间隔改错会让重试窗口过窄或过宽）', () => {
    withDocument()
    const empty = makeElement('uni-view', [makeElement('text')])
    const { scheduler, counters } = makeSyncScheduler()
    const rootRef = { value: empty } as unknown as Ref<unknown>

    writeAriaLabelWithRetry(rootRef, () => '标题', false, scheduler)

    expect(counters.delays.length).toBeGreaterThan(0)
    expect(counters.delays.every(d => d === ARIA_LABEL_RETRY_DELAY)).toBe(true)
    withoutDocument()
  })

  it('force 为真时覆盖已有名称', () => {
    withDocument()
    const { outer, inner } = makeUniInput()
    inner.setAttribute('aria-label', '旧标题')
    const { scheduler } = makeSyncScheduler()
    const rootRef = { value: outer } as unknown as Ref<unknown>

    writeAriaLabelWithRetry(rootRef, () => '新标题', true, scheduler)

    expect(inner.getAttribute('aria-label')).toBe('新标题')
    withoutDocument()
  })

  it('force 为假时保留已有名称（首次不覆盖）', () => {
    withDocument()
    const { outer, inner } = makeUniInput()
    inner.setAttribute('aria-label', '外部指定的名称')
    const { scheduler } = makeSyncScheduler()
    const rootRef = { value: outer } as unknown as Ref<unknown>

    writeAriaLabelWithRetry(rootRef, () => '组件推断的名称', false, scheduler)

    expect(inner.getAttribute('aria-label')).toBe('外部指定的名称')
    withoutDocument()
  })

  it('小程序端（无 document）不会无限重试 —— 直接判定失败并停止', () => {
    withoutDocument()
    const { outer } = makeUniInput()
    const { scheduler, counters } = makeSyncScheduler()
    const rootRef = { value: outer } as unknown as Ref<unknown>

    const ok = writeAriaLabelWithRetry(rootRef, () => '所属单位', false, scheduler)

    expect(ok).toBe(false)
    // 没有 DOM 时 applyAriaLabel 恒返回 false，仍会走满重试次数后停止（不会挂住）。
    // 同样断言字面量而非常量，否则常量被改时测不出来。
    expect(counters.macrotasks).toBe(5)
  })
})

/**
 * 名称变化时的同步
 *
 * `watch` 需要组件上下文，node 环境下触发不了，所以判断逻辑抽成了
 * `onAriaLabelChanged` 单独测。
 *
 * 关键在反向条件：`next !== prev` 写成 `==` 会让更新**完全失效** ——
 * 只有名称「没变」时才去写，等于名称永远停在旧值上。这类反向条件改错了
 * 靠 e2e 很难发现（页面不报错，只是名称不对）。
 */
describe('onAriaLabelChanged', () => {
  function makeSyncScheduler(): {
    scheduler: AriaLabelScheduler
    counters: { macrotasks: number }
  } {
    const counters = { macrotasks: 0 }
    return {
      counters,
      scheduler: {
        nextTick: fn => fn(),
        setTimeout(fn) {
          counters.macrotasks += 1
          fn()
        },
      },
    }
  }

  it('名称变化时写入新名称并覆盖旧值', () => {
    withDocument()
    const { outer, inner } = makeUniInput()
    const { scheduler } = makeSyncScheduler()
    const rootRef = { value: outer } as unknown as Ref<unknown>

    onAriaLabelChanged('新标题', '旧标题', rootRef, scheduler)

    expect(inner.getAttribute('aria-label')).toBe('新标题')
    withoutDocument()
  })

  it('名称未变化时不做任何事（避免无谓的 DOM 写入）', () => {
    withDocument()
    const { outer, inner } = makeUniInput()
    const { scheduler, counters } = makeSyncScheduler()
    const rootRef = { value: outer } as unknown as Ref<unknown>

    onAriaLabelChanged('同一个标题', '同一个标题', rootRef, scheduler)

    expect(inner.getAttribute('aria-label')).toBeNull()
    expect(counters.macrotasks).toBe(0)
    withoutDocument()
  })

  it('名称变化时会覆盖已有名称（更新路径必须 force）', () => {
    withDocument()
    const { outer, inner } = makeUniInput()
    inner.setAttribute('aria-label', '旧标题')
    const { scheduler } = makeSyncScheduler()
    const rootRef = { value: outer } as unknown as Ref<unknown>

    onAriaLabelChanged('新标题', '旧标题', rootRef, scheduler)

    // 挂载时不覆盖是尊重调用方，但变化时必须覆盖，否则名称永远停在旧值
    expect(inner.getAttribute('aria-label')).toBe('新标题')
    withoutDocument()
  })
})
