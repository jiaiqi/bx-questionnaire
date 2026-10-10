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
import { BxError } from '@/utils/request'

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

  /**
   * 变异测试补漏：`if (token !== loadToken) return false` 改成 `===` 后测试全绿。
   * 那会让**旧请求**的失败信息写进 errorMessage，用户看到的是已经作废的那次加载
   * 报的错（甚至在新请求已成功之后），比「不提示」更误导。
   */
  it('旧请求失败时不写错误信息，避免作废的失败覆盖当前状态', async () => {
    const slow = deferred()
    mocks.initViewSelect
      .mockImplementationOnce(async () => {
        await slow.promise
        throw new BxError('旧请求失败', 'FAILURE')
      })
      .mockResolvedValueOnce(envelopeWithTitle('新数据'))

    const q = useQuestionnaire()
    const first = q.load('A1') // 先发，慢
    const second = q.load('A2') // 后发，快
    await second
    expect(q.errorMessage.value).toBe('')

    slow.release()
    await expect(first).resolves.toBe(false)
    // 作废的旧请求不得把自己的错误写进来
    expect(q.errorMessage.value).toBe('')
  })

  /**
   * 变异测试补漏：`options.autoUpdateState !== false && message.includes('活动已结束')`
   * 改成 `||` 后测试全绿 —— 那会让**任何**加载失败都把活动状态改成「已结束」。
   * 活动状态是服务端数据，误改会真的结束掉一个正常活动。
   */
  it('仅「活动已结束」才自动置状态，其他失败不置', async () => {
    mocks.initViewSelect.mockRejectedValueOnce(new BxError('活动编号不存在', 'FAILURE'))

    const q = useQuestionnaire()
    await expect(q.load('A1')).resolves.toBe(false)
    expect(q.errorMessage.value).toBe('活动编号不存在')
    expect(mocks.activityCfgUpdate).not.toHaveBeenCalled()
  })

  it('提示「活动已结束」时自动把活动状态改为已结束', async () => {
    mocks.initViewSelect.mockRejectedValueOnce(new BxError('活动已结束', 'FAILURE'))
    mocks.activityCfgUpdate.mockResolvedValue({})

    const q = useQuestionnaire()
    await expect(q.load('A1')).resolves.toBe(false)
    expect(mocks.activityCfgUpdate).toHaveBeenCalledWith('A1', '已结束')
  })

  it('autoUpdateState 为 false 时不置状态', async () => {
    mocks.initViewSelect.mockRejectedValueOnce(new BxError('活动已结束', 'FAILURE'))

    const q = useQuestionnaire()
    await expect(q.load('A1', { autoUpdateState: false })).resolves.toBe(false)
    expect(mocks.activityCfgUpdate).not.toHaveBeenCalled()
  })
})
