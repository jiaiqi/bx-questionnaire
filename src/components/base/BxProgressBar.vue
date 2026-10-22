<script setup lang="ts">
import { computed } from 'vue'

/**
 * 进度条
 *
 * V2（规范 §6.1）：3px 高、圆角，底色 `--bx-line-2`，填充主色，
 * 宽度过渡 320ms（`--bx-duration-slow`）—— 推进是**可感知的反馈**，
 * 不是装饰。
 */
interface Props {
  percent: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  // 3px（规范 §6.1）：2px 太细，在低亮度屏幕上几乎看不出「有进度」
  height: 3,
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
  /* 两端都圆：轨道与填充同半径，推进时右端不会出现硬切的直角 */
  border-radius: var(--bx-radius-pill);
}

.bx-progress__bar {
  height: 100%;
  background-color: var(--bx-primary);
  border-radius: var(--bx-radius-pill);
  transition: width var(--bx-duration-slow) var(--bx-ease-out);
}
</style>
