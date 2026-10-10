/**
 * 作答记录页适配的页面级逻辑
 *
 * 只测能在 node 里跑的部分：生命周期回调的注册与转发。`onLoad` / `onReachBottom` /
 * `onPullDownRefresh` 都来自 `@dcloudio/uni-app`，这里把它们换成捕获回调的桩，
 * 直接拿到页面注册的那个函数来调用 —— 不依赖 uni-app 运行时。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRecordHistoryPage } from '@/composables/useRecordHistoryPage'

/** 捕获页面注册的生命周期回调 */
const registered: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('@dcloudio/uni-app', () => ({
  onLoad: (fn: (...args: unknown[]) => unknown) => {
    registered.onLoad = fn
  },
  onReachBottom: (fn: (...args: unknown[]) => unknown) => {
    registered.onReachBottom = fn
  },
  onPullDownRefresh: (fn: (...args: unknown[]) => unknown) => {
    registered.onPullDownRefresh = fn
  },
}))

const stopPullDownRefresh = vi.fn()

describe('useRecordHistoryPage', () => {
  beforeEach(() => {
    for (const k of Object.keys(registered)) delete registered[k]
    stopPullDownRefresh.mockClear()
    ;(globalThis as unknown as { uni: unknown }).uni = { stopPullDownRefresh }
  })

  it('注册了 onLoad / onReachBottom / onPullDownRefresh', () => {
    useRecordHistoryPage()

    expect(Object.keys(registered).sort()).toEqual(['onLoad', 'onPullDownRefresh', 'onReachBottom'])
  })

  it('onLoad 读取 activity_no 与 title，title 缺失时用默认值', () => {
    const page = useRecordHistoryPage()
    registered.onLoad({ activity_no: 'A1' })
    expect(page.activityNo.value).toBe('A1')
    expect(page.title.value).toBe('作答记录')

    const page2 = useRecordHistoryPage('自定义标题')
    registered.onLoad({ activity_no: 'A2', title: '来自参数' })
    expect(page2.title.value).toBe('来自参数')

    const page3 = useRecordHistoryPage('自定义标题')
    registered.onLoad({ activity_no: 'A3' })
    expect(page3.title.value).toBe('自定义标题')
  })

  it('下拉刷新：等 refresh 结束后才收起指示器', async () => {
    const page = useRecordHistoryPage()
    let resolveRefresh: (() => void) | undefined
    page.pageRef.value = {
      refresh: () => new Promise<void>((resolve) => {
        resolveRefresh = resolve
      }),
    } as never

    const done = registered.onPullDownRefresh() as Promise<void>
    // refresh 还没结束，指示器不能提前收
    expect(stopPullDownRefresh).not.toHaveBeenCalled()

    resolveRefresh?.()
    await done
    expect(stopPullDownRefresh).toHaveBeenCalledTimes(1)
  })

  it('下拉刷新失败也要收起指示器（但异常不吞掉）', async () => {
    const page = useRecordHistoryPage()
    page.pageRef.value = {
      refresh: () => Promise.reject(new Error('网络错误')),
    } as never

    // 契约是两条：① 指示器一定收 —— 不加 try/finally 的话它会永远转，用户以为一直在加载；
    // ② 异常**不吞** —— 真正坏掉的刷新应该可见，而不是被静默掩盖。
    // （实际不会走到这里：RecordList.fetchPage 内部已 catch 并转成页面错误态。）
    await expect(registered.onPullDownRefresh()).rejects.toThrow('网络错误')
    expect(stopPullDownRefresh).toHaveBeenCalledTimes(1)
  })

  it('没有 listRef 时下拉刷新不报错，指示器照常收起', async () => {
    useRecordHistoryPage()

    await expect(registered.onPullDownRefresh()).resolves.toBeUndefined()
    expect(stopPullDownRefresh).toHaveBeenCalledTimes(1)
  })

  it('触底加载转发到 loadMore', () => {
    const page = useRecordHistoryPage()
    const loadMore = vi.fn()
    page.pageRef.value = { loadMore } as never

    registered.onReachBottom()
    expect(loadMore).toHaveBeenCalledTimes(1)
  })
})
