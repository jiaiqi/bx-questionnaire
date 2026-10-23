<script setup lang="ts">
/**
 * 题型选择面板
 *
 * 题型列表来自 `ITEM_TYPE_SPECS`，**不在这里再硬编码一份**：
 * 两份列表一旦不同步，就会出现「面板里能选、保存时被平台拒」——
 * 而那正是最容易被当成「后端不稳定」的一类问题。
 *
 * V6「清简」：一个两列（宽屏三列）的选项网格，每格「题型名 + 一句说明」，
 * 描边卡片而不是彩色块 —— 题型不表达语义，不该占语义色。
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
      <view
        class="type-picker__close"
        role="button"
        tabindex="0"
        aria-label="取消选择题型"
        @click="emit('close')"
        @keydown.enter.prevent="emit('close')"
      >
        <text class="type-picker__close-text">取消</text>
      </view>
    </view>

    <view class="type-picker__grid">
      <view
        v-for="spec in ITEM_TYPE_SPECS"
        :key="spec.type"
        class="type-picker__cell"
        role="button"
        tabindex="0"
        :aria-label="`选择题型：${spec.label}`"
        @click="emit('select', spec.type)"
        @keydown.enter.prevent="emit('select', spec.type)"
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
}

.type-picker__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.type-picker__title {
  color: var(--bx-text);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}

.type-picker__close {
  display: flex;
  align-items: center;
  height: 26px;
  padding: 0 6px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
}

@media (hover: hover) {
  .type-picker__close:hover {
    background-color: var(--bx-surface-2);
  }
}

.type-picker__close:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.type-picker__close-text {
  color: var(--bx-text-3);
  font-size: 12px;
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
  padding: 10px 12px;
  cursor: pointer;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    border-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .type-picker__cell:hover {
    background-color: var(--bx-surface-2);
    border-color: var(--bx-line-strong);
  }
}

.type-picker__cell:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.type-picker__name {
  color: var(--bx-text);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
}

.type-picker__hint {
  margin-top: 2px;
  color: var(--bx-text-3);
  font-size: 12px;
  line-height: 18px;
}

@media (min-width: 600px) {
  .type-picker__cell {
    width: calc(33.333% - 8px);
  }
}
</style>
