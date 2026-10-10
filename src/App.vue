<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

import { setSessionExpiredHandler } from '@/utils/request'

onLaunch(() => {
  // 会话过期统一入口：请求层清票据后回调这里，由页面决定后续跳转
  setSessionExpiredHandler(() => {
    // 目前仅清理本地会话；登录回跳在接入登录链路后补上
  })
})
</script>

<style lang="scss">
@import './styles/tokens.scss';
@import './styles/global.scss';
</style>
