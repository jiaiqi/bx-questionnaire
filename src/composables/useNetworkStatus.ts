/**
 * 网络状态（离线 / 弱网）
 *
 * ## 为什么需要它
 *
 * 问卷产品的作答与管理端都强依赖网关：断网时列表、设计器、作答页都会进入失败态，
 * 但界面此前只会显示一句「加载失败」，用户不知道是**网络断了**还是服务坏了 ——
 * 前者等一会儿就好，后者重试也没用。把网络状态单独拎出来，界面就能说清原因。
 *
 * ## 数据来源
 *
 * 1. `uni.getNetworkType()` —— 拿到当前网络类型（wifi / 4g / 3g / 2g / none / unknown）；
 * 2. `uni.onNetworkStatusChange()` —— 订阅连接变化（`isConnected` + `networkType`）。
 *
 * 两者都有兜底：
 * - 初始 `online` 取 `true`，拿不到网络类型时**不误报离线**（宁可少提示，不可吓用户）；
 * - 只有 `networkType === 'none'` 或事件明确 `isConnected === false` 才算离线；
 * - `unknown` 不参与弱网判断。
 *
 * ## 生命周期
 *
 * 组件里使用时自动在 `onMounted` 订阅、`onUnmounted` 解绑（`offNetworkStatusChange`
 * 必须传同一个回调引用，否则解绑不掉，监听会随组件销毁累积）。
 * 也暴露 `start()` / `stop()` 给 `App.vue` 这类「没有组件挂载时机」的地方显式调用。
 *
 * 单测见 `test/composables/useNetworkStatus.spec.ts`（`uni` 用 stub 替换）。
 */

import type { ComputedRef, Ref } from 'vue'

import { computed, getCurrentInstance, onMounted, onUnmounted, ref } from 'vue'

/** 弱网判定：2G / 3G 视为「能连但慢」 */
export const WEAK_NETWORK_TYPES = ['2g', '3g'] as const

/** 网络类型的中文标签（用于提示文案） */
const NETWORK_LABELS: Record<string, string> = {
  'wifi': 'Wi-Fi',
  '2g': '2G',
  '3g': '3G',
  '4g': '4G',
  '5g': '5G',
  'ethernet': '有线网络',
  'none': '无网络',
  'unknown': '未知网络',
}

interface NetworkChangeResult {
  isConnected: boolean
  networkType: string
}

export interface NetworkStatusController {
  /** 是否可联网（默认 true；拿不到信息时不误报） */
  online: Ref<boolean>
  /** 当前网络类型（wifi / 4g / 3g / 2g / none / unknown） */
  networkType: Ref<string>
  /** 是否正在主动检测（重试按钮用） */
  checking: Ref<boolean>
  /** 是否离线 */
  isOffline: ComputedRef<boolean>
  /** 是否弱网（2G / 3G） */
  isWeak: ComputedRef<boolean>
  /** 是否在线（`!isOffline` 的别名，读起来更顺） */
  isOnline: ComputedRef<boolean>
  /** 网络类型标签，如「Wi-Fi」「4G」 */
  networkLabel: ComputedRef<string>
  /** 主动重新检测一次网络类型 */
  refresh: () => Promise<void>
  /** 开始监听（幂等） */
  start: () => void
  /** 停止监听并解绑（幂等） */
  stop: () => void
}

/** `uni` 在单测环境可能不存在；所有 API 调用都先确认可用 */
function hasUniApi(name: 'getNetworkType' | 'onNetworkStatusChange' | 'offNetworkStatusChange'): boolean {
  return typeof uni !== 'undefined' && typeof (uni as unknown as Record<string, unknown>)[name] === 'function'
}

export function useNetworkStatus(): NetworkStatusController {
  const online = ref(true)
  const networkType = ref('unknown')
  const checking = ref(false)

  /**
   * 事件回调
   *
   * 必须是**同一个函数引用**：`offNetworkStatusChange` 按引用解绑，
   * 每次新建箭头函数会解绑不掉（监听随组件销毁不断累积）。
   */
  let listener: ((result: NetworkChangeResult) => void) | null = null

  const isOffline = computed(() => !online.value || networkType.value === 'none')
  const isWeak = computed(() =>
    !isOffline.value && (WEAK_NETWORK_TYPES as readonly string[]).includes(networkType.value),
  )
  const isOnline = computed(() => !isOffline.value)
  const networkLabel = computed(() => NETWORK_LABELS[networkType.value] ?? networkType.value)

  function apply(type: string, connected: boolean): void {
    const normalized = type || 'unknown'
    networkType.value = normalized
    // 事件里的 isConnected 最权威；网络类型为 none 时即使事件说连上也按离线处理
    online.value = connected && normalized !== 'none'
  }

  function onChange(result: NetworkChangeResult): void {
    // 解绑后残留的旧回调不再改状态：组件卸载 / 应用退后台后，界面不该再被旧事件推动
    if (listener !== onChange) {
      return
    }
    apply(result.networkType, result.isConnected)
  }

  async function refresh(): Promise<void> {
    if (!hasUniApi('getNetworkType')) {
      return
    }
    checking.value = true
    try {
      await new Promise<void>((resolve) => {
        uni.getNetworkType({
          success: (result: { networkType: string }) => {
            // getNetworkType 只给类型、不给 isConnected：类型不是 none 就视为在线
            apply(result.networkType, result.networkType !== 'none')
          },
          fail: () => {
            // 查询失败不改状态：拿不到信息不等于离线
          },
          complete: () => resolve(),
        })
      })
    }
    finally {
      checking.value = false
    }
  }

  function start(): void {
    if (listener || !hasUniApi('onNetworkStatusChange')) {
      return
    }
    listener = onChange
    uni.onNetworkStatusChange(listener)
    void refresh()
  }

  function stop(): void {
    if (!listener) {
      return
    }
    if (hasUniApi('offNetworkStatusChange')) {
      uni.offNetworkStatusChange(listener)
    }
    listener = null
  }

  // 组件内使用时自动订阅 / 解绑；App.vue 等没有组件挂载时机的场景由调用方显式 start/stop
  if (getCurrentInstance()) {
    onMounted(start)
    onUnmounted(stop)
  }

  return { online, networkType, checking, isOffline, isWeak, isOnline, networkLabel, refresh, start, stop }
}
