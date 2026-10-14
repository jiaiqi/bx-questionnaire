<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  percent: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  // 2px：进度条是「背景状态」而不是主角，细一点就不会和题干抢注意力
  height: 2,
})

const safePercent = computed(() => Math.min(100, Math.max(0, props.percent)))
</script>

<template>
  <!--
    刻意不给 role="progressbar"：进度是「第 N 题 / 共 M 题」这行可见文字承载的，
    屏幕阅读器读那行即可；给这个纯矩形加 role 反而会在可访问性审计里被要求
    可读名称与 tabindex（一个不该被 Tab 到的装饰元素）。
  -->
  <view class="bx-progress" :style="{ height: `${props.height}px` }">
    <view class="bx-progress__bar" :style="{ width: `${safePercent}%` }" />
  </view>
</template>

<style lang="scss" scoped>
.bx-progress {
  width: 100%;
  overflow: hidden;
  background-color: var(--bx-line-2);
}

.bx-progress__bar {
  height: 100%;
  background-color: var(--bx-primary);
  /* 右端圆角：进度条推进时不会出现硬切的直角 */
  border-radius: 0 var(--bx-radius-mark) var(--bx-radius-mark) 0;
  transition: width var(--bx-duration-slow) var(--bx-ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .bx-progress__bar {
    transition: none;
  }
}
</style>
