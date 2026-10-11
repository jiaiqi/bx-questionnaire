// @vitest-environment node

/**
 * 本机批次号记录（作答记录归属判定的唯一本地依据）
 *
 * 用真实的内存 map 桩而不是 mock 返回值：这一层要验证的是
 * 「写入后读得到、按活动隔离、去重、有上限」，mock 掉读写就什么都没验证。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getMyBatches, rememberMyBatch, STORAGE_KEYS } from '@/utils/storage'

const A = '20261010100256000001'
const B = '20260824204301000001'
const BATCH = 'd9102bc941064d198405380e53431554'

let memory: Map<string, unknown>

beforeEach(() => {
  memory = new Map()
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => memory.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => {
      memory.set(key, value)
    },
    removeStorageSync: (key: string) => {
      memory.delete(key)
    },
  })
})

describe('storage · 本机批次号记录', () => {
  it('写入后读得到', () => {
    rememberMyBatch(A, BATCH)
    expect(getMyBatches(A)).toEqual([BATCH])
  })

  it('没记过的活动返回空数组，而不是 undefined —— 调用方直接 includes 不该炸', () => {
    expect(getMyBatches(A)).toEqual([])
  })

  it('重复写入去重 —— 逐题自动保存会反复回传同一个批次号', () => {
    rememberMyBatch(A, BATCH)
    rememberMyBatch(A, BATCH)
    rememberMyBatch(A, BATCH)
    expect(getMyBatches(A)).toEqual([BATCH])
  })

  it('按活动隔离 —— 共用一份列表会让 A 问卷的记录在 B 问卷里被认成自己的', () => {
    rememberMyBatch(A, BATCH)
    rememberMyBatch(B, 'other-batch')
    expect(getMyBatches(A)).toEqual([BATCH])
    expect(getMyBatches(B)).toEqual(['other-batch'])
  })

  it('活动号或批次号为空时忽略 —— 空批次号写进去会让所有无批次号的记录都被认领', () => {
    rememberMyBatch('', BATCH)
    rememberMyBatch(A, '')
    expect(getMyBatches(A)).toEqual([])
    expect(memory.has(STORAGE_KEYS.MY_BATCHES)).toBe(false)
  })

  it('超过 200 条时丢最旧的 —— 不能让长期使用把 storage 撑爆', () => {
    for (let i = 0; i < 210; i++) {
      rememberMyBatch(A, `batch-${i}`)
    }
    const list = getMyBatches(A)
    expect(list).toHaveLength(200)
    expect(list).not.toContain('batch-0')
    expect(list).toContain('batch-209')
  })

  it('存储内容损坏（不是对象）时返回空数组，不抛异常', () => {
    memory.set(STORAGE_KEYS.MY_BATCHES, 'corrupted')
    expect(getMyBatches(A)).toEqual([])
  })

  it('存储里该活动的值不是数组时返回空数组', () => {
    memory.set(STORAGE_KEYS.MY_BATCHES, { [A]: 'not-an-array' })
    expect(getMyBatches(A)).toEqual([])
  })

  it('读存储抛异常时返回空数组 —— 隐私模式 / 配额满都不该让记录页白屏', () => {
    vi.stubGlobal('uni', {
      getStorageSync: () => {
        throw new Error('SecurityError')
      },
      setStorageSync: () => {},
      removeStorageSync: () => {},
    })
    expect(getMyBatches(A)).toEqual([])
  })
})
