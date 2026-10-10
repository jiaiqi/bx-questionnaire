/**
 * v-aria-label 指令测试
 *
 * 为什么需要这个测试：Chrome 可访问性树实测发现，`aria-label` 写在 uni-app 的
 * `<input>` 上会被留在外层 `uni-input`（role=generic），内层原生 input 的
 * name 是空的 —— 屏幕阅读器读不到名称。指令负责把名称补到内层控件上。
 *
 * 测试环境是 node（无 DOM），所以这里手写最小 DOM 桩。指令只用到
 * `matches` / `querySelector` / `getAttribute` / `setAttribute` 四个方法，
 * 桩覆盖这四个就足够，不必引入 jsdom。
 */
import { describe, expect, it } from 'vitest'

import { vAriaLabel } from '@/directives/aria-label'

interface FakeElement {
  tagName: string
  attrs: Record<string, string>
  children: FakeElement[]
  matches: (selector: string) => boolean
  querySelector: (selector: string) => FakeElement | null
  getAttribute: (name: string) => string | null
  setAttribute: (name: string, value: string) => void
}

/** 只认识 `input, textarea` 这一个选择器 —— 指令也只用它 */
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

function mount(el: FakeElement, value: string, oldValue?: string): void {
  vAriaLabel.mounted?.(
    el as unknown as HTMLElement,
    { value, oldValue } as never,
    null as never,
    null as never,
  )
}

function update(el: FakeElement, value: string, oldValue: string): void {
  vAriaLabel.updated?.(
    el as unknown as HTMLElement,
    { value, oldValue } as never,
    null as never,
    null as never,
  )
}

describe('v-aria-label 指令', () => {
  it('把名称写到外层容器内部的原生控件上', () => {
    const { outer, inner } = makeUniInput()

    mount(outer, '所属单位')

    // 名称必须落在内层 input —— 那才是 role=textbox 的元素
    expect(inner.getAttribute('aria-label')).toBe('所属单位')
    // 外层不该被写（写在外层对屏幕阅读器无效，且会与 uni-app 自身行为混淆）
    expect(outer.getAttribute('aria-label')).toBeNull()
  })

  it('元素本身就是原生控件时直接写在它上面', () => {
    const el = makeElement('input')

    mount(el, '姓名')

    expect(el.getAttribute('aria-label')).toBe('姓名')
  })

  it('textarea 同样支持（uni-app 的 textarea 内部结构一致）', () => {
    const inner = makeElement('textarea')
    const outer = makeElement('uni-textarea', [makeElement('div', [inner])])

    mount(outer, '请留下你的建议')

    expect(inner.getAttribute('aria-label')).toBe('请留下你的建议')
  })

  it('空值不写入，避免产生空的 aria-label', () => {
    const { outer, inner } = makeUniInput()

    mount(outer, '')

    expect(inner.getAttribute('aria-label')).toBeNull()
  })

  it('容器内没有原生控件时静默跳过，不抛异常', () => {
    const outer = makeElement('uni-view', [makeElement('text')])

    expect(() => mount(outer, '标题')).not.toThrow()
    expect(outer.getAttribute('aria-label')).toBeNull()
  })

  it('已有名称时不被覆盖（尊重调用方显式写的 aria-label）', () => {
    const { outer, inner } = makeUniInput()
    inner.setAttribute('aria-label', '外部指定的名称')

    mount(outer, '组件推断的名称')

    expect(inner.getAttribute('aria-label')).toBe('外部指定的名称')
  })

  it('值变化时同步更新内层名称', () => {
    const { outer, inner } = makeUniInput()
    mount(outer, '旧标题')

    update(outer, '新标题', '旧标题')

    expect(inner.getAttribute('aria-label')).toBe('新标题')
  })

  it('值未变化时不重复写入', () => {
    const { outer, inner } = makeUniInput()
    mount(outer, '标题')
    // 手动改掉，若 updated 在值未变时仍然写入，就会被改回来
    inner.setAttribute('aria-label', '被外部改过')

    update(outer, '标题', '标题')

    expect(inner.getAttribute('aria-label')).toBe('被外部改过')
  })
})
