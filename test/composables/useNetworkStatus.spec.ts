// @vitest-environment node

/**
 * 网络状态（useNetworkStatus）
 *
 * 用 stub 替换 `uni`：单测不碰真实设备网络，也不依赖浏览器 online/offline 事件。
 * 覆盖：初始检测、断网 / 弱网判定、订阅幂等、stop 解绑（同一回调引用）、
 * 以及「拿不到网络信息时不误报离线」这条兜底。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useNetworkStatus } from '@/composables/useNetworkStatus'

type ChangeListener = (result: { isConnected: boolean, networkType: string }) => void

/** 每个用例重建的 uni 桩：记录监听器与调用次数 */
function createUniStub(initialType = 'wifi') {
  const listeners = new Set<ChangeListener>()
  const uniStub = {
    getNetworkType: vi.fn((options: {
      success?: (result: { networkType: string }) => void
      fail?: () => void
      complete?: () => void
    }) => {
      options.success?.({ networkType: initialType })
      options.complete?.()
    }),
    onNetworkStatusChange: vi.fn((listener: ChangeListener) => {
      listeners.add(listener)
    }),
    offNetworkStatusChange: vi.fn((listener: ChangeListener) => {
      listeners.delete(listener)
    }),
  }
  return { uniStub, listeners }
}

/** 让 `void refresh()` 里的 promise 链跑完 */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.stubGlobal('uni', createUniStub().uniStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('初始检测', () => {
  it('start 后订阅变化并主动查询一次网络类型', async () => {
    const { uniStub } = createUniStub('wifi')
    vi.stubGlobal('uni', uniStub)

    const net = useNetworkStatus()
    expect(net.isOffline.value).toBe(false)

    net.start()
    await flush()

    expect(uniStub.onNetworkStatusChange).toHaveBeenCalledTimes(1)
    expect(uniStub.getNetworkType).toHaveBeenCalledTimes(1)
    expect(net.networkType.value).toBe('wifi')
    expect(net.isOnline.value).toBe(true)
    expect(net.networkLabel.value).toBe('Wi-Fi')
  })

  it('网络类型为 none 时判为离线', async () => {
    const { uniStub } = createUniStub('none')
    vi.stubGlobal('uni', uniStub)

    const net = useNetworkStatus()
    net.start()
    await flush()

    expect(net.isOffline.value).toBe(true)
    expect(net.isWeak.value).toBe(false)
  })

  it('查询失败不改状态：拿不到信息不等于离线', async () => {
    const { uniStub } = createUniStub('wifi')
    uniStub.getNetworkType.mockImplementationOnce((options: {
      fail?: () => void
      complete?: () => void
    }) => {
      options.fail?.()
      options.complete?.()
    })
    vi.stubGlobal('uni', uniStub)

    const net = useNetworkStatus()
    net.start()
    await flush()

    expect(net.isOffline.value).toBe(false)
    expect(net.networkType.value).toBe('unknown')
  })
})

describe('状态变化', () => {
  it('断网 / 恢复事件更新 isOffline', async () => {
    const { uniStub, listeners } = createUniStub('wifi')
    vi.stubGlobal('uni', uniStub)

    const net = useNetworkStatus()
    net.start()
    await flush()

    listeners.forEach(listener => listener({ isConnected: false, networkType: 'none' }))
    expect(net.isOffline.value).toBe(true)

    listeners.forEach(listener => listener({ isConnected: true, networkType: 'wifi' }))
    expect(net.isOffline.value).toBe(false)
  })

  it('2G / 3G 判为弱网，但不算离线', async () => {
    const { uniStub, listeners } = createUniStub('wifi')
    vi.stubGlobal('uni', uniStub)

    const net = useNetworkStatus()
    net.start()
    await flush()

    listeners.forEach(listener => listener({ isConnected: true, networkType: '3g' }))
    expect(net.isWeak.value).toBe(true)
    expect(net.isOffline.value).toBe(false)
    expect(net.networkLabel.value).toBe('3G')

    listeners.forEach(listener => listener({ isConnected: true, networkType: '4g' }))
    expect(net.isWeak.value).toBe(false)
  })

  it('事件说已连接但类型为 none 时仍按离线处理（以 none 为准）', async () => {
    const { uniStub, listeners } = createUniStub('wifi')
    vi.stubGlobal('uni', uniStub)

    const net = useNetworkStatus()
    net.start()
    await flush()

    listeners.forEach(listener => listener({ isConnected: true, networkType: 'none' }))
    expect(net.isOffline.value).toBe(true)
  })
})

describe('订阅生命周期', () => {
  it('start 幂等：重复调用不会重复订阅', async () => {
    const { uniStub } = createUniStub('wifi')
    vi.stubGlobal('uni', uniStub)

    const net = useNetworkStatus()
    net.start()
    net.start()
    await flush()

    expect(uniStub.onNetworkStatusChange).toHaveBeenCalledTimes(1)
  })

  it('stop 用同一个回调引用解绑，之后事件不再生效', async () => {
    const { uniStub, listeners } = createUniStub('wifi')
    vi.stubGlobal('uni', uniStub)

    const net = useNetworkStatus()
    net.start()
    await flush()

    const subscribed = [...listeners][0]
    net.stop()

    expect(uniStub.offNetworkStatusChange).toHaveBeenCalledTimes(1)
    expect(uniStub.offNetworkStatusChange).toHaveBeenCalledWith(subscribed)
    expect(listeners.size).toBe(0)

    // 解绑后即使还有旧回调在跑，也不再更新状态
    subscribed({ isConnected: false, networkType: 'none' })
    expect(net.isOffline.value).toBe(false)
  })

  it('stop 幂等：没有订阅时不会调用 off', () => {
    const { uniStub } = createUniStub('wifi')
    vi.stubGlobal('uni', uniStub)

    const net = useNetworkStatus()
    net.stop()

    expect(uniStub.offNetworkStatusChange).not.toHaveBeenCalled()
  })
})
