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
import { stripQuestionTitleIndex } from '@/domain/questionnaire'

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

/**
 * 标题
 *
 * 后端 `item_title` 常自带「1. 」前缀，而这一行左侧已经有独立的序号列 ——
 * 不剥离就会把同一个序号显示两遍（序号列一次、标题里一次）。与作答页的
 * BxQuestionItem 走同一个函数，避免两处对同一件事给出两种处理。
 */
const title = computed(() => stripQuestionTitleIndex(props.item.title) || '未命名题目')
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
      <view class="bx-editor-item-row__handle-dots" aria-hidden="true" />
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
        <view class="bx-editor-item-row__btn-text bx-editor-item-row__btn-text--up" aria-hidden="true" />
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
        <view class="bx-editor-item-row__btn-text bx-editor-item-row__btn-text--down" aria-hidden="true" />
      </view>
      <view
        class="bx-editor-item-row__btn bx-editor-item-row__btn--danger"
        role="button"
        tabindex="0"
        aria-label="删除题目"
        @click.stop="emit('remove')"
        @keydown.enter.prevent="emit('remove')"
      >
        <view class="bx-editor-item-row__btn-text bx-editor-item-row__btn-text--close" aria-hidden="true" />
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
  background-color: var(--bx-primary-soft);
}

.bx-editor-item-row--dragging {
  opacity: 0.6;
}

/* 落点提示：用左侧色条，不改变高度（改高度会让落点计算自相矛盾） */
.bx-editor-item-row--drop {
  box-shadow: inset 3px 0 0 var(--bx-primary);
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

/*
 * 拖拽把手：2×3 点阵
 *
 * 原先是一个「⋮⋮」文字符号 —— 字形随字体变化，两个竖排点在各平台的间距也不一致。
 * 这里用「一个小圆 + 5 个 box-shadow 偏移」画点阵，比 radial-gradient 背景更稳
 * （部分小程序内核不支持 radial-gradient）。
 */
.bx-editor-item-row__handle-dots {
  width: 3px;
  height: 3px;
  background-color: var(--bx-text-4);
  border-radius: 50%;
  box-shadow:
    5px 0 0 var(--bx-text-4),
    0 5px 0 var(--bx-text-4),
    5px 5px 0 var(--bx-text-4),
    0 10px 0 var(--bx-text-4),
    5px 10px 0 var(--bx-text-4);
}

.bx-editor-item-row__index {
  width: 24px;
  font-size: 12px;
  color: var(--bx-text-3);
  text-align: center;
  font-variant-numeric: tabular-nums;
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
  font-size: 15px;
  line-height: 20px;
  color: var(--bx-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bx-editor-item-row__meta {
  margin-top: 2px;
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
  color: var(--bx-text-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bx-editor-item-row__actions {
  display: flex;
  align-items: center;
}

/* 36px 点击区：56px 的行高装得下，比原 32px 更接近触摸目标下限 */
.bx-editor-item-row__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
}

.bx-editor-item-row__btn:hover,
.bx-editor-item-row__btn:active {
  background-color: var(--bx-line-2);
}

.bx-editor-item-row__btn-text {
  width: 8px;
  height: 8px;
}

/* 上 / 下移箭头：两条边框旋转 45°（不再用 ↑ ↓ 文字符号） */
.bx-editor-item-row__btn-text--up {
  border-top: 2px solid var(--bx-text-2);
  border-left: 2px solid var(--bx-text-2);
  transform: rotate(45deg);
}

.bx-editor-item-row__btn-text--down {
  border-right: 2px solid var(--bx-text-2);
  border-bottom: 2px solid var(--bx-text-2);
  transform: rotate(45deg);
}

/* 已是首 / 尾：箭头变浅表示不可用 */
.bx-editor-item-row__btn--off .bx-editor-item-row__btn-text--up,
.bx-editor-item-row__btn--off .bx-editor-item-row__btn-text--down {
  border-color: var(--bx-line);
}

/* 删除：两条交叉线（不再用 ✕ 文字符号） */
.bx-editor-item-row__btn-text--close {
  position: relative;
  width: 10px;
  height: 10px;
}

.bx-editor-item-row__btn-text--close::before,
.bx-editor-item-row__btn-text--close::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 10px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: var(--bx-danger);
  border-radius: 1px;
}

.bx-editor-item-row__btn-text--close::before {
  transform: rotate(45deg);
}

.bx-editor-item-row__btn-text--close::after {
  transform: rotate(-45deg);
}
</style>
