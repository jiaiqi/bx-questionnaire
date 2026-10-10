// @vitest-environment node

/**
 * 提交的重复调用保护
 *
 * 页面上按钮有 loading 态拦截，但那是 UI 层的保证。submit() 本身必须也能挡住重复调用，
 * 否则任何绕过 UI 的入口（快捷提交、事件重复触发）都会发出第二次提交，
 * 平台侧可能生成两条完成记录或返回「已完成」错误。
 */

import type { BxEnvelope } from '@/utils/request'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSubmit } from '@/composables/useSubmit'

const mocks = vi.hoisted(() => ({
  resultSubmit: vi.fn(),
}))

vi.mock('@/api/daq/record', () => ({
  resultSubmit: mocks.resultSubmit,
}))

function okWithBatch(batchNo: string): BxEnvelope {
  return { response: [{ response: { fill_batch_no: batchNo } }] } as unknown as BxEnvelope
}

function deferred() {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

beforeEach(() => {
  mocks.resultSubmit.mockReset()
})

describe('useSubmit · 防重复提交', () => {
  it('前一次提交未完成时，第二次调用直接返回且不发请求', async () => {
    const gate = deferred()
    mocks.resultSubmit.mockImplementationOnce(async () => {
      await gate.promise
      return okWithBatch('B1')
    })

    const { submit, submitting } = useSubmit()
    const first = submit({ activityNo: 'A1', fields: [], answers: {} })

    // 第一次仍在进行中
    expect(submitting.value).toBe(true)

    const second = await submit({ activityNo: 'A1', fields: [], answers: {} })
    expect(second.ok).toBe(false)
    expect(mocks.resultSubmit).toHaveBeenCalledTimes(1)

    gate.release()
    const firstResult = await first
    expect(firstResult.ok).toBe(true)
    expect(firstResult.batchNo).toBe('B1')
    expect(submitting.value).toBe(false)
  })

  it('前一次结束后可以再次提交（守卫不会永久锁死）', async () => {
    mocks.resultSubmit.mockResolvedValue(okWithBatch('B1'))

    const { submit, submitting } = useSubmit()
    await expect(submit({ activityNo: 'A1', fields: [], answers: {} })).resolves.toMatchObject({ ok: true })
    expect(submitting.value).toBe(false)

    await expect(submit({ activityNo: 'A1', fields: [], answers: {} })).resolves.toMatchObject({ ok: true })
    expect(mocks.resultSubmit).toHaveBeenCalledTimes(2)
  })

  it('请求失败时也要解除提交中状态，否则用户再也提交不了', async () => {
    mocks.resultSubmit.mockRejectedValueOnce(new Error('network down'))

    const { submit, submitting } = useSubmit()
    await expect(submit({ activityNo: 'A1', fields: [], answers: {} })).rejects.toThrow('network down')
    expect(submitting.value).toBe(false)
  })
})
