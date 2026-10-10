<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  percent: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  height: 3,
})

const safePercent = computed(() => Math.min(100, Math.max(0, props.percent)))
</script>

<template>
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
  background-color: var(--bx-blue);
  transition: width 400ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
</style>
