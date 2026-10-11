<script setup lang="ts">
/**
 * 题目列表里的一行（收起态）
 *
 * **高度必须等于 `ITEM_ROW_HEIGHT`**：拖拽重排用固定行高反算落点，
 * 行高与常量不一致就会把行搬到用户没指的位置。
 * 样式里的 `height` 与常量的一致性由 `test/components/editor-layout.spec.ts` 守住。
 *
 * 行间用 `border-bottom` 而不是 `margin` —— 有间隙的话「第 n 行」的区间就不再是
 * `[n*h, (n+1)*h)`，落点会算偏。
 */

import type { EditorItem } from '@/domain/editor'

import { computed } from 'vue'

import { typeHasOptions } from '@/domain/editor'

interface Props {
  item: EditorItem
  index: number
  total: number
  selected?: boolean
  /** 正在被拖起 */
  dragging?: boolean
  /** 拖拽落点停在本行 */
  dropTarget?: boolean
  /** 本行有校验问题 */
  hasIssues?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  dragging: false,
  dropTarget: false,
  hasIssues: false,
})

const emit = defineEmits<{
  select: []
  remove: []
  moveUp: []
  moveDown: []
  /** 带上原始事件：拖拽需要按下时的坐标（没有坐标就不进入拖拽态） */
  dragStart: [event: unknown]
}>()

/** 副标题：题型 + 必填 + 分值/选项数，一眼看出这题是什么 */
const meta = computed(() => {
  const parts = [props.item.type]
  if (props.item.required) {
    parts.push('必填')
  }
  if (typeHasOptions(props.item.type)) {
    parts.push(`${props.item.options.length} 个选项`)
  }
  if (props.item.points > 0) {
    parts.push(`${props.item.points} 分`)
  }
  return parts.join(' · ')
})

const title = computed(() => props.item.title.trim() || '未命名题目')
</script>

<template>
  <view
    class="bx-editor-item-row"
    :class="{
      'bx-editor-item-row--selected': props.selected,
      'bx-editor-item-row--dragging': props.dragging,
      'bx-editor-item-row--drop': props.dropTarget,
      'bx-editor-item-row--issue': props.hasIssues,
    }"
  >
    <view
      class="bx-editor-item-row__handle"
      role="button"
      tabindex="0"
      aria-label="拖动排序"
      @touchstart.stop="emit('dragStart', $event)"
      @mousedown.stop="emit('dragStart', $event)"
    >
      <text class="bx-editor-item-row__handle-dots">⋮⋮</text>
    </view>

    <text class="bx-editor-item-row__index">{{ props.index + 1 }}</text>

    <view class="bx-editor-item-row__main" @click="emit('select')">
      <text class="bx-editor-item-row__title">{{ title }}</text>
      <text class="bx-editor-item-row__meta">{{ meta }}</text>
    </view>

    <view class="bx-editor-item-row__actions">
      <view
        class="bx-editor-item-row__btn"
        :class="{ 'bx-editor-item-row__btn--off': props.index === 0 }"
        role="button"
        tabindex="0"
        aria-label="上移"
        @click.stop="emit('moveUp')"
        @keydown.enter.prevent="emit('moveUp')"
      >
        <text class="bx-editor-item-row__btn-text">↑</text>
      </view>
      <view
        class="bx-editor-item-row__btn"
        :class="{ 'bx-editor-item-row__btn--off': props.index === props.total - 1 }"
        role="button"
        tabindex="0"
        aria-label="下移"
        @click.stop="emit('moveDown')"
        @keydown.enter.prevent="emit('moveDown')"
      >
        <text class="bx-editor-item-row__btn-text">↓</text>
      </view>
      <view
        class="bx-editor-item-row__btn bx-editor-item-row__btn--danger"
        role="button"
        tabindex="0"
        aria-label="删除题目"
        @click.stop="emit('remove')"
        @keydown.enter.prevent="emit('remove')"
      >
        <text class="bx-editor-item-row__btn-text">✕</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-editor-item-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  /* 与 ITEM_ROW_HEIGHT 必须一致（拖拽落点按固定行高计算） */
  height: 56px;
  padding: 0 8px;
  overflow: hidden;
  border-bottom: 1px solid var(--bx-line-2);
  background-color: var(--bx-surface);
}

.bx-editor-item-row--selected {
  background-color: var(--bx-blue-soft);
}

.bx-editor-item-row--dragging {
  opacity: 0.6;
}

/* 落点提示：用左侧色条，不改变高度（改高度会让落点计算自相矛盾） */
.bx-editor-item-row--drop {
  box-shadow: inset 3px 0 0 var(--bx-blue);
}

.bx-editor-item-row--issue .bx-editor-item-row__title {
  color: var(--bx-danger);
}

.bx-editor-item-row__handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 100%;
  cursor: grab;
  user-select: none;
}

.bx-editor-item-row__handle-dots {
  font-size: 14px;
  color: var(--bx-text-3);
  letter-spacing: -2px;
}

.bx-editor-item-row__index {
  width: 24px;
  font-size: 13px;
  color: var(--bx-text-3);
  text-align: center;
}

.bx-editor-item-row__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  height: 100%;
  cursor: pointer;
}

/* 单行省略：题目行必须保持固定高度，两行文字会溢出 */
.bx-editor-item-row__title {
  overflow: hidden;
  font-size: 14px;
  color: var(--bx-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bx-editor-item-row__meta {
  margin-top: 2px;
  overflow: hidden;
  font-size: 12px;
  color: var(--bx-text-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bx-editor-item-row__actions {
  display: flex;
  align-items: center;
}

.bx-editor-item-row__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--bx-radius);
}

.bx-editor-item-row__btn:active {
  background-color: var(--bx-line-2);
}

.bx-editor-item-row__btn--off .bx-editor-item-row__btn-text {
  color: var(--bx-line);
}

.bx-editor-item-row__btn--danger .bx-editor-item-row__btn-text {
  color: var(--bx-danger);
}

.bx-editor-item-row__btn-text {
  font-size: 14px;
  color: var(--bx-text-2);
}
</style>
