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

  /**
   * 变异测试补漏：把 `!currentBatchNo && params.fillBatchNo` 改成 `||` 后测试全绿。
   * 那会让「本地已锁定批次号 + 调用方又传一个」时用传入值覆盖本地 ——
   * 与「服务端回传后以本地为准」的语义相反，作答又会被割裂到多条草稿。
   * 上面的用例只覆盖了「本地为空 + 调用方带来批次号」，没覆盖这个方向。
   */
  it('本地已锁定批次号时，调用方再传也不覆盖（服务端优先）', async () => {
    mocks.resultSave.mockResolvedValue(okWithBatch('B1'))

    const draft = useDraft()
    // 第一次保存锁定 B1
    await draft.save({ activityNo: 'A1', field: fieldOf('k1'), answers: { k1: 'x' } })
    // 第二次带了不同的批次号，不得覆盖已锁定的 B1
    await draft.save({
      activityNo: 'A1',
      fillBatchNo: 'B-other',
      field: fieldOf('k2'),
      answers: { k2: 'y' },
    })

    expect(mocks.resultSave.mock.calls[1]?.[0]).toMatchObject({ fillBatchNo: 'B1' })
  })

  it('后续保存不覆盖已锁定的批次号', async () => {
    mocks.resultSave.mockResolvedValue(okWithBatch('B1'))

    const draft = useDraft()
    await draft.save({ activityNo: 'A1', field: fieldOf('k1'), answers: { k1: 'x' } })
    await draft.save({
      activityNo: 'A1',
      fillBatchNo: 'B-other',
      field: fieldOf('k2'),
      answers: { k2: 'y' },
    })

    expect(mocks.resultSave.mock.calls[1]?.[0]).toMatchObject({ fillBatchNo: 'B1' })
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

  /**
   * 实测（CDP 抓真实请求）：服务端每次保存都会回传一个**新的** fill_batch_no，
   * 即便请求里带了批次号。所以「无条件采用响应批次号」会让批次号每次都被推进：
   * 同一次作答被割裂到多条草稿记录，提交只能挂到最后一条上，其余成为孤儿。
   *
   * 老工程 indexyax.vue 的写法是 `if (data.fill_batch_no && !self.fill_batch_no)`，
   * 即只在首次锁定。本用例固定住这一语义 —— 注意响应必须返回**不同**批次号，
   * 否则覆盖行为不可见（这正是该缺陷此前能溜过测试的原因）。
   */
  it('服务端回传新批次号时不覆盖已锁定的批次号，避免作答被割裂到多条草稿', async () => {
    mocks.resultSave
      .mockResolvedValueOnce(okWithBatch('B1'))
      .mockResolvedValueOnce(okWithBatch('B2'))
      .mockResolvedValueOnce(okWithBatch('B3'))

    const draft = useDraft()
    const got: string[] = []
    for (const key of ['k1', 'k2', 'k3']) {
      await draft.save({
        activityNo: 'A1',
        field: fieldOf(key),
        answers: { [key]: 'x' },
        onBatchNo: batchNo => got.push(batchNo),
      })
    }

    expect(mocks.resultSave).toHaveBeenCalledTimes(3)
    // 首次保存：无批次号
    expect(mocks.resultSave.mock.calls[0]?.[0]).toMatchObject({ fillBatchNo: undefined })
    // 后续两次：都锁在首次返回的 B1 上，不被 B2 / B3 推进
    expect(mocks.resultSave.mock.calls[1]?.[0]).toMatchObject({ fillBatchNo: 'B1' })
    expect(mocks.resultSave.mock.calls[2]?.[0]).toMatchObject({ fillBatchNo: 'B1' })
    // 回调也只应播报一次，避免调用方（session）把批次号改掉
    expect(got).toEqual(['B1'])
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
