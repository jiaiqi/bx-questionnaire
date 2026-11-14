<script setup lang="ts">
/**
 * 登录页
 *
 * 只是 `LoginScreen` 的壳：读参数、登录成功后回跳。
 *
 * 参数：
 * - `reason`   进入原因枚举码（如 `expired`），文案由 `@/domain/auth/notice` 翻译
 * - `notice`   外部直接传入的提示文案（`reason` 认不出来时才用它）
 * - `redirect` 登录成功后回到哪一页（会话过期时是「当时正在看的那一页」）
 */

import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'

import LoginScreen from '@/components/auth/LoginScreen.vue'
import { DEFAULT_LOGIN_NOTICE, isKnownLoginReason, loginNotice } from '@/domain/auth/notice'
import { useSessionStore } from '@/stores/session'
import { readQueryDeeply } from '@/utils/query'

/**
 * 回跳兜底：真正的首页
 *
 * 必须是**不需要入参**的页面。这里曾经指向答题页 `pages/questionnaire/index/index`，
 * 而它要求 `activity_no`，裸登录（没有 redirect）成功后就会落到「缺少活动编号」空页，
 * 用户以为系统坏了。
 */
const HOME_PATH = '/pages/editor/list/index'

const notice = ref(DEFAULT_LOGIN_NOTICE)
const redirect = ref('')

/**
 * 只接受本应用内的相对路径
 *
 * `redirect` 来自 URL，是**外部可控输入**。虽然本工程没有跨站跳转能力，
 * 但「把用户送到任意地址」本身就是开放重定向，必须挡掉。
 */
function safeRedirect(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) {
    return ''
  }
  return value
}

onLoad((query) => {
  const reason = readQueryDeeply(query, 'reason')
  // 优先用枚举码翻译（不受编码层数影响）；其次才认外部直接传入的文案
  notice.value = isKnownLoginReason(reason)
    ? loginNotice(reason)
    : readQueryDeeply(query, 'notice', DEFAULT_LOGIN_NOTICE)
  redirect.value = safeRedirect(readQueryDeeply(query, 'redirect'))

  // 宿主带票打开登录页（或本地已有有效登录态）时直接回跳，不再展示登录表单。
  // 票据可能已被 App.vue 的 onLaunch 先采纳、并从地址栏清掉，所以这里看**会话状态**，
  // 而不是只看本次 query 是否带票 —— 否则会停在登录页，免登录失效。
  const session = useSessionStore()
  session.adoptUrlTicket(query)
  if (session.isLogin) {
    uni.reLaunch({ url: redirect.value || HOME_PATH })
  }
})

function onSuccess(): void {
  uni.reLaunch({ url: redirect.value || HOME_PATH })
}
</script>

<template>
  <LoginScreen :notice="notice" @success="onSuccess" />
</template>
