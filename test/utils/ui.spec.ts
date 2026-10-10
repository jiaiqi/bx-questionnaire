/**
 * 轻交互工具测试（toast / confirmDialog / scrollToSelector）
 *
 * 这些函数直接调全局 `uni.*`，测试环境是 node（无 uni、无 document），
 * 所以这里给 `globalThis` 挂桩，并在每个用例后还原。
 *
 * `scrollToSelector` 最值得测：它有 H5 与小程序两条分支，且 H5 分支带 try/catch
 * 回退。分支走错或回退失效都不会报错，只会「滚动没反应」—— 属于静默失效，
 * 只有单测能守住。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { confirmDialog, scrollToSelector, toast, toastSuccess } from '@/utils/ui'

interface UniStub {
  showToast: ReturnType<typeof vi.fn>
  showModal: ReturnType<typeof vi.fn>
  pageScrollTo: ReturnType<typeof vi.fn>
}

let uniStub: UniStub

/** 挂 document 桩，模拟 H5 环境 */
function stubDocument(queryResult: unknown): { scrollIntoView: ReturnType<typeof vi.fn> } {
  const scrollIntoView = vi.fn()
  ;(globalThis as Record<string, unknown>).document = {
    querySelector: vi.fn(() => (queryResult ? { scrollIntoView } : null)),
  }
  return { scrollIntoView }
}

describe('toast', () => {
  beforeEach(() => {
    uniStub = {
      showToast: vi.fn(),
      showModal: vi.fn(),
      pageScrollTo: vi.fn(),
    }
    ;(globalThis as Record<string, unknown>).uni = uniStub
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).uni
    delete (globalThis as Record<string, unknown>).document
  })

  it('默认以 none 图标提示 2000ms', () => {
    toast('已保存')

    expect(uniStub.showToast).toHaveBeenCalledWith({ title: '已保存', icon: 'none', duration: 2000 })
  })

  it('可指定图标', () => {
    toast('出错了', 'error')

    expect(uniStub.showToast).toHaveBeenCalledWith({ title: '出错了', icon: 'error', duration: 2000 })
  })

  it('toastSuccess 用 success 图标', () => {
    toastSuccess('提交成功')

    expect(uniStub.showToast).toHaveBeenCalledWith({ title: '提交成功', icon: 'success', duration: 2000 })
  })
})

describe('confirmDialog', () => {
  beforeEach(() => {
    uniStub = {
      showToast: vi.fn(),
      showModal: vi.fn(),
      pageScrollTo: vi.fn(),
    }
    ;(globalThis as Record<string, unknown>).uni = uniStub
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).uni
  })

  it('用户点确定时 resolve(true)', async () => {
    uniStub.showModal.mockImplementation((opts: { success: (r: { confirm: boolean }) => void }) => {
      opts.success({ confirm: true })
    })

    await expect(confirmDialog('确定提交吗？')).resolves.toBe(true)
  })

  it('用户点取消时 resolve(false)', async () => {
    uniStub.showModal.mockImplementation((opts: { success: (r: { confirm: boolean }) => void }) => {
      opts.success({ confirm: false })
    })

    await expect(confirmDialog('确定提交吗？')).resolves.toBe(false)
  })

  it('弹窗失败时 resolve(false) 而不是 reject（调用方不必 try/catch）', async () => {
    uniStub.showModal.mockImplementation((opts: { fail: () => void }) => {
      opts.fail()
    })

    await expect(confirmDialog('确定提交吗？')).resolves.toBe(false)
  })

  it('默认标题为「提示」，可自定义', async () => {
    uniStub.showModal.mockImplementation(() => {})

    void confirmDialog('内容')
    expect(uniStub.showModal.mock.calls[0][0].title).toBe('提示')

    void confirmDialog('内容', '删除确认')
    expect(uniStub.showModal.mock.calls[1][0].title).toBe('删除确认')
  })

  it('content 原样透传', async () => {
    uniStub.showModal.mockImplementation(() => {})

    void confirmDialog('提交后不可修改')

    expect(uniStub.showModal.mock.calls[0][0].content).toBe('提交后不可修改')
  })
})

describe('scrollToSelector', () => {
  beforeEach(() => {
    uniStub = {
      showToast: vi.fn(),
      showModal: vi.fn(),
      pageScrollTo: vi.fn(),
    }
    ;(globalThis as Record<string, unknown>).uni = uniStub
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).uni
    delete (globalThis as Record<string, unknown>).document
  })

  it('h5 下找到元素时用原生 scrollIntoView，不走 pageScrollTo', () => {
    const { scrollIntoView } = stubDocument(true)

    scrollToSelector('#q-1')

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(uniStub.pageScrollTo).not.toHaveBeenCalled()
  })

  it('h5 下找不到元素时回退到 uni.pageScrollTo', () => {
    stubDocument(false)

    scrollToSelector('#q-missing')

    expect(uniStub.pageScrollTo).toHaveBeenCalledWith({ selector: '#q-missing', duration: 260 })
  })

  it('无 document（小程序端）时走 uni.pageScrollTo', () => {
    // 不挂 document，模拟小程序环境
    scrollToSelector('#q-2')

    expect(uniStub.pageScrollTo).toHaveBeenCalledWith({ selector: '#q-2', duration: 260 })
  })

  it('querySelector 抛异常时回退，不把异常抛给调用方', () => {
    ;(globalThis as Record<string, unknown>).document = {
      querySelector: vi.fn(() => {
        throw new Error('无效选择器')
      }),
    }

    expect(() => scrollToSelector('>>>bad<<<')).not.toThrow()
    expect(uniStub.pageScrollTo).toHaveBeenCalledWith({ selector: '>>>bad<<<', duration: 260 })
  })
})
