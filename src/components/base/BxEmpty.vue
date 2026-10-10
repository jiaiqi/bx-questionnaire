<script setup lang="ts">
interface Props {
  text?: string
  tip?: string
}

const props = withDefaults(defineProps<Props>(), {
  text: '暂无数据',
  tip: '',
})
</script>

<template>
  <view class="bx-empty">
    <view class="bx-empty__icon">
      <text class="bx-empty__icon-text">∅</text>
    </view>
    <text class="bx-empty__text">{{ props.text }}</text>
    <text v-if="props.tip" class="bx-empty__tip">{{ props.tip }}</text>
    <slot />
  </view>
</template>

<style lang="scss" scoped>
.bx-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
}

.bx-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  background-color: var(--bx-blue-soft);
  border-radius: 50%;
}

.bx-empty__icon-text {
  font-size: 26px;
  color: var(--bx-blue);
}

.bx-empty__text {
  font-size: 15px;
  color: var(--bx-text-2);
}

.bx-empty__tip {
  margin-top: 8px;
  font-size: 13px;
  color: var(--bx-text-3);
}
</style>
