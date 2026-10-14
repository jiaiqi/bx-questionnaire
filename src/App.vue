<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

import { useSessionStore } from '@/stores/session'
import { setSessionExpiredHandler } from '@/utils/request'

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
})
</script>

<style lang="scss">
@import './styles/tokens.scss';
@import './styles/global.scss';
</style>
