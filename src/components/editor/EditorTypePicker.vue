<script setup lang="ts">
/**
 * 题型选择面板
 *
 * 题型列表来自 `ITEM_TYPE_SPECS`，**不在这里再硬编码一份**：
 * 两份列表一旦不同步，就会出现「面板里能选、保存时被平台拒」——
 * 而那正是最容易被当成「后端不稳定」的一类问题。
 */

import { ITEM_TYPE_SPECS } from '@/domain/editor'

const emit = defineEmits<{
  select: [type: string]
  close: []
}>()
</script>

<template>
  <view class="type-picker">
    <view class="type-picker__head">
      <text class="type-picker__title">选择题型</text>
      <text class="type-picker__close" @click="emit('close')">取消</text>
    </view>

    <view class="type-picker__grid">
      <view
        v-for="spec in ITEM_TYPE_SPECS"
        :key="spec.type"
        class="type-picker__cell"
        @click="emit('select', spec.type)"
      >
        <text class="type-picker__name">{{ spec.label }}</text>
        <text class="type-picker__hint">{{ spec.hint }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.type-picker {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background-color: var(--bx-surface);
}

.type-picker__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.type-picker__title {
  font-size: 17px;
  font-weight: 600;
  line-height: 26px;
  color: var(--bx-text);
}

.type-picker__close {
  font-size: 13px;
  color: var(--bx-text-2);
}

.type-picker__grid {
  display: flex;
  flex-wrap: wrap;
  margin: -4px;
}

/* 两列：手机上每题型的说明才放得下；宽屏转三列（见下方媒体查询） */
.type-picker__cell {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: calc(50% - 8px);
  margin: 4px;
  padding: 12px;
  cursor: pointer;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
  background-color: var(--bx-surface-2);
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    border-color var(--bx-duration-fast) var(--bx-ease-out);
}

.type-picker__cell:active {
  border-color: var(--bx-primary);
  background-color: var(--bx-primary-soft);
}

.type-picker__name {
  font-size: 15px;
  font-weight: 500;
  line-height: 22px;
  color: var(--bx-text);
}

.type-picker__hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-3);
}

@media (min-width: 600px) {
  .type-picker__cell {
    width: calc(33.333% - 8px);
  }
}
</style>
