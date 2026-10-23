<script setup lang="ts">
/**
 * 网络状态提示条（离线 / 弱网）
 *
 * 常驻在**内容区顶部**（不遮挡页面顶栏），只在离线或弱网时出现，恢复后自动消失。
 * 文案说清「是什么问题 + 能做什么」，而不是只给一个感叹号：
 * - 离线：网络已断开，部分内容可能无法加载 → 「重试」重新检测；
 * - 弱网：当前网络较慢（2G/3G），加载可能变慢。
 *
 * 视觉走 V6 令牌：语义色三件套（文字 / 浅底 / 描边）+ 6px 状态点，无 svg 标签、
 * 无文字符号图标；px 单位。`role="status"` 让读屏在网络恢复/断开时自动播报。
 *
 * 状态来自 `useNetworkStatus`：组件挂载时订阅、卸载时解绑（composable 内部处理）。
 */

import { computed } from 'vue'

import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { toast } from '@/utils/ui'

const { isOffline, isWeak, checking, networkLabel, refresh } = useNetworkStatus()

/** 只在真有问题时出现：在线且网络正常时整条不渲染（不占位） */
const visible = computed(() => isOffline.value || isWeak.value)

/** 语气：离线用危险色，弱网用警告色 */
const tone = computed(() => (isOffline.value ? 'offline' : 'weak'))

const message = computed(() =>
  isOffline.value
    ? '网络已断开，部分内容可能无法加载'
    : `当前网络较慢（${networkLabel.value}），加载可能变慢`,
)

/**
 * 重试：主动重新检测一次网络
 *
 * 不直接重发业务请求 —— 各页面有各自的失败重试入口，这里只负责把「网络是否恢复」
 * 这个事实刷新出来。检测后仍离线才提示一句，避免用户以为按钮没反应。
 */
async function onRetry(): Promise<void> {
  if (checking.value) {
    return
  }
  const wasOffline = isOffline.value
  await refresh()
  if (wasOffline && isOffline.value) {
    toast('网络仍不可用，请检查网络连接')
  }
}
</script>

<template>
  <view
    v-if="visible"
    class="bx-netbar"
    :class="`bx-netbar--${tone}`"
    role="status"
    aria-live="polite"
  >
    <view class="bx-netbar__dot" aria-hidden="true" />
    <text class="bx-netbar__text">{{ message }}</text>
    <view
      class="bx-netbar__retry"
      :class="{ 'bx-netbar__retry--busy': checking }"
      role="button"
      tabindex="0"
      :aria-disabled="checking ? 'true' : 'false'"
      aria-label="重新检测网络"
      @click="onRetry"
      @keydown.enter.prevent="onRetry"
    >
      <text class="bx-netbar__retry-text">{{ checking ? '检测中…' : '重试' }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-netbar {
  display: flex;
  box-sizing: border-box;
  flex: none;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 16px;
  border-bottom: 1px solid transparent;
}

/* 离线：危险色三件套 */
.bx-netbar--offline {
  color: var(--bx-danger);
  background-color: var(--bx-danger-soft);
  border-bottom-color: var(--bx-danger-line);
}

/* 弱网：警告色三件套 */
.bx-netbar--weak {
  color: var(--bx-warn);
  background-color: var(--bx-warn-soft);
  border-bottom-color: var(--bx-warn-line);
}

/* 状态点：6px 圆点，颜色跟随文字（状态不只靠颜色，旁边有文字说明） */
.bx-netbar__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentcolor;
}

.bx-netbar__text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
  color: currentcolor;
}

/* 重试：描边小按钮，颜色跟随语义色 */
.bx-netbar__retry {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid currentcolor;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    opacity var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .bx-netbar__retry:hover {
    background-color: var(--bx-surface);
  }
}

.bx-netbar__retry:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.bx-netbar__retry--busy {
  cursor: default;
  opacity: 0.6;
}

.bx-netbar__retry-text {
  color: currentcolor;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
</style>
