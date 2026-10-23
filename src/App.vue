<script setup lang="ts">
/**
 * 应用入口
 *
 * ## 这里只做「全站级」的事，不渲染任何视图
 *
 * uni-app 的 App.vue **不支持 template**：
 * - H5 端 `@dcloudio/uni-h5` 的 `setupApp()` 会把 App 组件的 render 强制替换成
 *   内部 Layout（router-view），App.vue 的 template 不会渲染；
 * - 小程序端 App.vue 只编译成 app.js/app.json，没有 WXML。
 *
 * 所以网络提示分两层（见 task-4 约定）：
 * 1. **全局层（本文件）**：`onLaunch` 里启动 `useNetworkStatus` 监听，断网 / 恢复时
 *    用 `uni.showToast` 给全站提示 —— 任何页面都能感知，不依赖页面自己挂组件；
 * 2. **常驻条**：`BxNetworkBar` 挂在网络失败最相关的页面内容区顶部
 *    （设计器、作答记录列表），负责常驻说明与「重试」。
 *
 * 全局监听在 `onHide` 时解绑（应用退到后台没有 UI 可提示），`onShow` 时重新订阅并
 * 立刻检测一次；应用销毁时 JS 上下文整体回收，无需额外 `off`。
 */

import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { watch } from 'vue'

import { initAppearance } from '@/composables/useAppearance'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useSessionStore } from '@/stores/session'
import { setSessionExpiredHandler } from '@/utils/request'
import { toast } from '@/utils/ui'

const LOGIN_PATH = '/pages/login/index'

/** 当前页面路径 + 查询串，用于登录后回到原处 */
function currentPageUrl(): string {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1] as
    | { route?: string, options?: Record<string, string> }
    | undefined

  if (!page?.route) {
    return ''
  }

  const query = Object.entries(page.options ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('&')

  return `/${page.route}${query ? `?${query}` : ''}`
}

/**
 * 全局网络状态
 *
 * 只有「断网 / 恢复」两个跳变会 toast：网络类型在 4G 与 Wi-Fi 之间切换属于正常现象，
 * 每次都弹一句会变成噪音。弱网由页面上的 BxNetworkBar 常驻说明。
 */
const network = useNetworkStatus()

watch(network.isOffline, (offline, previous) => {
  if (offline === previous) {
    return
  }
  if (offline) {
    toast('网络已断开，请检查网络连接')
    return
  }
  toast('网络已恢复', 'success')
})

onLaunch(() => {
  const session = useSessionStore()

  // 会话过期统一入口：请求层清票据后回调这里，由这里决定跳登录并回跳
  setSessionExpiredHandler(() => {
    // 只清登录态，**不动批次号** —— 用户可能正在答题，
    // 清掉 fill_batch_no 会让已经答了一半的内容变成一条新记录。
    session.setTicket('')
    session.setUserInfo(null)

    const from = currentPageUrl()

    // 已经在登录页就不再跳：否则一次 0011 会引发 reLaunch 循环，
    // 用户连输入账号的机会都没有。
    if (from.startsWith(LOGIN_PATH)) {
      return
    }

    // 提示语用**枚举码**而不是中文文案：中文参数经过各端叠加的 URL 编码后，
    // 实测会以 `%E7%99%BB%E5%BD%95...` 的原文显示在页面上。文案由登录页自己映射，
    // URL 里只出现 ASCII。
    const redirect = encodeURIComponent(from)
    uni.reLaunch({ url: `${LOGIN_PATH}?reason=expired&redirect=${redirect}` })
  })

  // 全局网络监听：从启动起就工作，页面无需各自初始化
  network.start()

  // 外观偏好（深色 / 字号）：H5 写根节点，小程序端由 dark.scss 跟随系统
  initAppearance()
})

/** 应用回到前台：重新订阅并立即检测一次（后台期间可能已断网 / 恢复） */
onShow(() => {
  network.start()
})

/** 退到后台：没有 UI 可提示，解绑监听（回到前台由 onShow 重新订阅） */
onHide(() => {
  network.stop()
})
</script>

<style lang="scss">
@import './styles/tokens.scss';
@import './styles/themes.scss';
@import './styles/dark.scss';
@import './styles/global.scss';
</style>
