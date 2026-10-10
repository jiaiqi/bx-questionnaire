// @vitest-environment node

/**
 * 问卷加载的竞态
 *
 * activityNo / fillBatchNo 变化会触发重新加载。若旧请求后返回：
 * - 会把新数据覆盖成旧数据；
 * - 会在自己的 finally 里把 loading 置为 false，让加载态提前消失。
 * 两者都只在请求乱序时出现，正常网络下看不见，所以用测试固定住。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useQuestionnaire } from '@/composables/useQuestionnaire'

const mocks = vi.hoisted(() => ({
  initViewSelect: vi.fn(),
  activityCfgUpdate: vi.fn(),
}))

vi.mock('@/api/daq/activity', () => ({
  initViewSelect: mocks.initViewSelect,
  activityCfgUpdate: mocks.activityCfgUpdate,
}))

function envelopeWithTitle(title: string) {
  return {
    data: [{ activity_no: 'A', title, item_data: [], user_data: [] }],
  }
}

function deferred() {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

beforeEach(() => {
  mocks.initViewSelect.mockReset()
  mocks.activityCfgUpdate.mockReset()
})

describe('useQuestionnaire · 加载竞态', () => {
  it('旧请求后返回时不覆盖新请求的数据', async () => {
    const slow = deferred()
    mocks.initViewSelect
      .mockImplementationOnce(async () => {
        await slow.promise
        return envelopeWithTitle('旧数据')
      })
      .mockResolvedValueOnce(envelopeWithTitle('新数据'))

    const q = useQuestionnaire()
    const first = q.load('A1') // 先发，慢
    const second = q.load('A2') // 后发，快
    await second

    expect(q.activity.value?.title).toBe('新数据')

    slow.release()
    await expect(first).resolves.toBe(false)
    // 旧响应不得把已渲染的新数据改回去
    expect(q.activity.value?.title).toBe('新数据')
  })

  it('旧请求结束时不得收起最新请求的 loading', async () => {
    const slow = deferred()
    mocks.initViewSelect
      .mockResolvedValueOnce(envelopeWithTitle('旧数据')) // 先发，快
      .mockImplementationOnce(async () => {
        await slow.promise
        return envelopeWithTitle('新数据')
      })

    const q = useQuestionnaire()
    const first = q.load('A1')
    const second = q.load('A2') // 仍在进行中
    await first

    // 最新一次加载还没结束，加载态必须保持
    expect(q.loading.value).toBe(true)

    slow.release()
    await second
    expect(q.loading.value).toBe(false)
    expect(q.activity.value?.title).toBe('新数据')
  })

  it('顺序加载时正常返回结果并收起 loading', async () => {
    mocks.initViewSelect.mockResolvedValue(envelopeWithTitle('正常'))

    const q = useQuestionnaire()
    await expect(q.load('A1')).resolves.toBe(true)
    expect(q.activity.value?.title).toBe('正常')
    expect(q.loading.value).toBe(false)
    expect(q.errorMessage.value).toBe('')
  })
})
