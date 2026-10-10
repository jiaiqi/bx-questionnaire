// @vitest-environment node

/**
 * 草稿保存的批次号竞态
 *
 * 逐题即时保存时，批次号来自首次保存的响应。如果把它在「入队时」快照进任务，
 * 那么首次请求尚未返回时用户继续作答，后续任务拿到的仍是空批次号，
 * 于是又被当作「首次保存」，平台会分配第二个批次号 —— 同一次作答被割裂到多个批次。
 * 快速连答是常见操作，所以这里必须锁住「执行时读取最新批次号」的行为。
 */

import type { QuestionField } from '@/domain/questionnaire'
import type { BxEnvelope } from '@/utils/request'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDraft } from '@/composables/useDraft'

const mocks = vi.hoisted(() => ({
  resultSave: vi.fn(),
}))

vi.mock('@/api/daq/record', () => ({
  resultSave: mocks.resultSave,
}))

function fieldOf(key: string): QuestionField {
  return {
    key,
    seq: 1,
    index: 1,
    label: key,
    widget: 'text',
    required: false,
    multi: false,
    points: 0,
    options: [],
    raw: {} as QuestionField['raw'],
  }
}

function okWithBatch(batchNo: string): BxEnvelope {
  return { response: [{ response: { fill_batch_no: batchNo } }] } as unknown as BxEnvelope
}

beforeEach(() => {
  mocks.resultSave.mockReset()
})

describe('useDraft · 批次号', () => {
  it('首次保存尚未返回时连续作答，后续草稿复用同一批次号，不会各自触发一次「首次保存」', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    mocks.resultSave
      .mockImplementationOnce(async () => {
        await gate
        return okWithBatch('B1')
      })
      .mockResolvedValue(okWithBatch('B1'))

    const draft = useDraft()
    const first = draft.save({
      activityNo: 'A1',
      field: fieldOf('k1'),
      answers: { k1: 'x' },
    })
    // 第一条请求还没回来就答第二题 —— 此刻调用方还拿不到批次号
    const second = draft.save({
      activityNo: 'A1',
      field: fieldOf('k2'),
      answers: { k2: 'y' },
    })

    release()
    await Promise.all([first, second])

    expect(mocks.resultSave).toHaveBeenCalledTimes(2)
    expect(mocks.resultSave.mock.calls[0]?.[0]).toMatchObject({ fillBatchNo: undefined })
    // 关键断言：第二条必须复用第一条返回的批次号
    expect(mocks.resultSave.mock.calls[1]?.[0]).toMatchObject({ fillBatchNo: 'B1' })
  })

  it('续答场景沿用调用方带来的批次号', async () => {
    mocks.resultSave.mockResolvedValue(okWithBatch('B1'))

    const draft = useDraft()
    await draft.save({
      activityNo: 'A1',
      fillBatchNo: 'B0',
      field: fieldOf('k1'),
      answers: { k1: 'x' },
    })

    expect(mocks.resultSave.mock.calls[0]?.[0]).toMatchObject({ fillBatchNo: 'B0' })
  })

  it('批次号回传给调用方，供后续保存与提交使用', async () => {
    mocks.resultSave.mockResolvedValue(okWithBatch('B9'))

    const draft = useDraft()
    const got: string[] = []
    await draft.save({
      activityNo: 'A1',
      field: fieldOf('k1'),
      answers: { k1: 'x' },
      onBatchNo: batchNo => got.push(batchNo),
    })

    expect(got).toEqual(['B9'])
  })
})

describe('useDraft · waitIdle', () => {
  it('等到队列排空才返回，保证提交前草稿已落库并拿到批次号', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mocks.resultSave.mockImplementationOnce(async () => {
      await gate
      return okWithBatch('B1')
    })

    const draft = useDraft()
    void draft.save({ activityNo: 'A1', field: fieldOf('k1'), answers: { k1: 'x' } })

    let idle = false
    const waiting = draft.waitIdle().then(() => {
      idle = true
    })

    // 请求尚未返回，waitIdle 不能提前结束，否则提交会与草稿并发
    await Promise.resolve()
    expect(idle).toBe(false)

    release()
    await waiting
    expect(idle).toBe(true)
    expect(mocks.resultSave).toHaveBeenCalledTimes(1)
  })

  it('没有进行中的保存时立即返回', async () => {
    const draft = useDraft()
    await expect(draft.waitIdle()).resolves.toBeUndefined()
    expect(mocks.resultSave).not.toHaveBeenCalled()
  })
})
