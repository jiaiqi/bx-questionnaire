// @vitest-environment node

/**
 * 长列表分片渲染（useChunkedList）
 *
 * 覆盖：首屏条数、追加、`ensureVisible`（选中 / 拖拽落点）、总量收缩时的夹取、
 * reset、非法入参兜底。这些行为直接决定「题纲只渲染前缀」时下标是否仍然正确，
 * 所以用纯逻辑测试固定住，不依赖页面渲染。
 */

import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { CHUNK_INITIAL, CHUNK_STEP, useChunkedList } from '@/composables/useChunkedList'

function setup(total = 100, initial?: number, step?: number) {
  const totalRef = ref(total)
  const chunk = useChunkedList({
    total: () => totalRef.value,
    ...(initial === undefined ? {} : { initial }),
    ...(step === undefined ? {} : { step }),
  })
  return { totalRef, chunk }
}

describe('首屏与追加', () => {
  it('默认首屏只渲染 20 条，并报出剩余条数', () => {
    const { chunk } = setup(100)

    expect(chunk.renderedCount.value).toBe(CHUNK_INITIAL)
    expect(chunk.hasMore.value).toBe(true)
    expect(chunk.remaining.value).toBe(100 - CHUNK_INITIAL)
  })

  it('每次追加一屏，直到全部渲染后不再追加', () => {
    const { chunk } = setup(100)

    expect(chunk.loadMore()).toBe(true)
    expect(chunk.renderedCount.value).toBe(CHUNK_INITIAL + CHUNK_STEP)

    // 一路追加到 100
    while (chunk.loadMore()) {
      // 继续
    }
    expect(chunk.renderedCount.value).toBe(100)
    expect(chunk.hasMore.value).toBe(false)
    expect(chunk.remaining.value).toBe(0)
    // 已经全部渲染：再调用不产生变化，也不越界
    expect(chunk.loadMore()).toBe(false)
    expect(chunk.renderedCount.value).toBe(100)
  })

  it('总量小于首屏条数时不会渲染出多余的行', () => {
    const { chunk } = setup(3)

    expect(chunk.renderedCount.value).toBe(3)
    expect(chunk.hasMore.value).toBe(false)
    expect(chunk.loadMore()).toBe(false)
  })

  it('总量为 0 时渲染 0 条', () => {
    const { chunk } = setup(0)

    expect(chunk.renderedCount.value).toBe(0)
    expect(chunk.hasMore.value).toBe(false)
  })
})

describe('ensureVisible（选中 / 拖拽落点）', () => {
  it('展开到包含目标下标，且不越过总量', () => {
    const { chunk } = setup(100)

    expect(chunk.ensureVisible(45)).toBe(true)
    expect(chunk.renderedCount.value).toBe(46)

    // 已经可见：不重复展开，也不收缩窗口
    expect(chunk.ensureVisible(3)).toBe(false)
    expect(chunk.renderedCount.value).toBe(46)

    // 越界下标按总量夹住
    expect(chunk.ensureVisible(999)).toBe(true)
    expect(chunk.renderedCount.value).toBe(100)
  })

  it('非法下标直接忽略（已删除题目的旧下标可能为 -1）', () => {
    const { chunk } = setup(100)

    expect(chunk.ensureVisible(-1)).toBe(false)
    expect(chunk.ensureVisible(Number.NaN)).toBe(false)
    expect(chunk.renderedCount.value).toBe(CHUNK_INITIAL)
  })
})

describe('数据量变化与 reset', () => {
  it('总量收缩时渲染条数跟着夹住，不会渲染不存在的数据', () => {
    const { totalRef, chunk } = setup(100)
    chunk.ensureVisible(80)
    expect(chunk.renderedCount.value).toBe(81)

    totalRef.value = 5
    expect(chunk.renderedCount.value).toBe(5)
    expect(chunk.hasMore.value).toBe(false)
  })

  it('总量增长后 hasMore 自动跟上（响应式取值函数）', () => {
    const { totalRef, chunk } = setup(0)
    expect(chunk.hasMore.value).toBe(false)

    totalRef.value = 30
    expect(chunk.hasMore.value).toBe(true)
    expect(chunk.remaining.value).toBe(30 - CHUNK_INITIAL)
  })

  it('reset 回到首屏条数（切换筛选 / 刷新时用）', () => {
    const { chunk } = setup(100)
    chunk.loadMore()
    chunk.loadMore()
    expect(chunk.renderedCount.value).toBe(CHUNK_INITIAL + CHUNK_STEP * 2)

    chunk.reset()
    expect(chunk.renderedCount.value).toBe(CHUNK_INITIAL)
  })
})

describe('入参兜底', () => {
  it('initial / step 非法时回退到默认值', () => {
    const { chunk } = setup(100, 0, -5)

    expect(chunk.renderedCount.value).toBe(CHUNK_INITIAL)
    expect(chunk.loadMore()).toBe(true)
    expect(chunk.renderedCount.value).toBe(CHUNK_INITIAL + CHUNK_STEP)
  })
})
