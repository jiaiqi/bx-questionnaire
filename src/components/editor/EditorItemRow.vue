<script setup lang="ts">
/**
 * 题目列表里的一行（收起态）—— 设计器的**题纲**
 *
 * 一行三件事：题号（01 / 02…）、题干摘要、元信息（题型 · 选项数 · 分值）。
 * 选中态用「左侧 2px 主色条 + 浅主色底」，与画布上的落笔色是同一支墨。
 *
 * **高度必须等于 `ITEM_ROW_HEIGHT`**：拖拽重排用固定行高反算落点，
 * 行高与常量不一致就会把行搬到用户没指的位置。
 * 样式里的 `height` 与常量的一致性由 `test/components/editor-layout.spec.ts` 守住。
 *
 * 行间用 `border-bottom` 而不是 `margin` —— 有间隙的话「第 n 行」的区间就不再是
 * `[n*h, (n+1)*h)`，落点会算偏。
 *
 * 上移 / 下移 / 删除三个按钮**默认隐形**（与原型一致）：悬停、键盘聚焦或选中
 * 这一行时才出现。选中即常驻，触屏端先点行再操作，不会没有入口。
 */

import type { EditorItem } from '@/domain/editor'

import { computed } from 'vue'

import { typeHasOptions } from '@/domain/editor'
import { stripQuestionTitleIndex } from '@/domain/questionnaire'
import { plainText } from './plainText'

interface Props {
  item: EditorItem
  index: number
  total: number
  selected?: boolean
  /** 正在被拖起 */
  dragging?: boolean
  /** 拖拽落点停在本行 */
  dropTarget?: boolean
  /** 落点插在行的上边还是下边：决定插入线画在哪一侧 */
  dropPosition?: 'before' | 'after'
  /** 本行有校验问题 */
  hasIssues?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  dragging: false,
  dropTarget: false,
  dropPosition: undefined,
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

/**
 * 标题
 *
 * 后端 `item_title` 常自带「1. 」前缀，而这一行左侧已经有独立的序号列 ——
 * 不剥离就会把同一个序号显示两遍（序号列一次、标题里一次）。与作答页的
 * BxQuestionItem 走同一个函数，避免两处对同一件事给出两种处理。
 *
 * 题干也可能带着后台编辑器的标签，先净化再剥序号。
 */
const title = computed(() => stripQuestionTitleIndex(plainText(props.item.title)) || '未命名题目')

/** 题号补零到两位（原型：01 / 02 …） */
const displayNo = computed(() => String(props.index + 1).padStart(2, '0'))

/** 元信息：题型 · 选项数 · 分值（没有的部分不占位） */
const metaParts = computed(() => {
  const parts: string[] = [props.item.type]
  if (typeHasOptions(props.item.type)) {
    parts.push(`${props.item.options.length} 项`)
  }
  if (props.item.points > 0) {
    parts.push(`${props.item.points} 分`)
  }
  return parts
})
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

    <text class="bx-editor-item-row__index">{{ displayNo }}</text>

    <view class="bx-editor-item-row__main" @click="emit('select')">
      <text class="bx-editor-item-row__title">{{ title }}</text>
      <view class="bx-editor-item-row__meta">
        <view v-if="props.item.required" class="bx-editor-item-row__reqdot" aria-hidden="true" />
        <text v-if="props.item.required" class="bx-editor-item-row__req">必答</text>
        <text class="bx-editor-item-row__meta-item">{{ metaParts[0] }}</text>
        <text
          v-for="part in metaParts.slice(1)"
          :key="part"
          class="bx-editor-item-row__meta-item"
        >
          · {{ part }}
        </text>
      </view>
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

    <!--
      插入线：落点是一条 2px 的主色横线，画在行与行之间。
      用绝对定位而不是加边框 —— 改高度会让落点计算自相矛盾。
    -->
    <view
      v-if="props.dropTarget && props.dropPosition"
      class="bx-editor-item-row__insert"
      :class="`bx-editor-item-row__insert--${props.dropPosition}`"
      aria-hidden="true"
    />
  </view>
</template>

<style lang="scss" scoped>
.bx-editor-item-row {
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  /* 与 ITEM_ROW_HEIGHT 必须一致（拖拽落点按固定行高计算） */
  height: 56px;
  padding: 0 8px;
  overflow: hidden;
  /* 左侧 2px 常驻（选中时换成主色）：不占位的话选中瞬间内容会横向跳一下 */
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--bx-line-2);
  background-color: var(--bx-surface);
  transition:
    background-color var(--bx-duration-base) var(--bx-ease-out),
    border-color var(--bx-duration-base) var(--bx-ease-out);
}

/* 悬停：只提一档浅底，不抢选中态 */
@media (hover: hover) {
  .bx-editor-item-row:hover {
    background-color: var(--bx-surface-2);
  }
}

/* 选中：左侧 2px 主色条 + 浅主色底 */
.bx-editor-item-row--selected {
  border-left-color: var(--bx-primary);
  background-color: var(--bx-primary-soft);
}

/* 拖起：压下去一点 + 抬起来一点（阴影），行本身不离开原位，落点计算不受影响 */
.bx-editor-item-row--dragging {
  z-index: 2;
  transform: scale(0.98);
  box-shadow: var(--bx-elev-2);
}

/*
 * 落点提示：主信号是那条 2px 主色插入线（见模板里的 __insert），不改高度、
 * 也不改底色 —— 底色是「选中」的信号，落点与选中混成一样就分不清了。
 * 这里只把行自己的下边线染成主色浅调，让落点更显眼一点。
 */
.bx-editor-item-row--drop {
  border-bottom-color: var(--bx-primary-line);
}

.bx-editor-item-row--issue .bx-editor-item-row__title {
  color: var(--bx-danger);
}

.bx-editor-item-row__handle {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 100%;
  cursor: grab;
  user-select: none;
}

/*
 * 拖拽把手：2×3 点阵
 *
 * 用「一个小圆 + 5 个 box-shadow 偏移」画点阵，比文字符号稳
 * （字形随字体变化），也比 radial-gradient 背景稳（部分小程序内核不支持）。
 */
.bx-editor-item-row__handle-dots {
  width: 3px;
  height: 3px;
  background-color: var(--bx-text-4);
  border-radius: 50%;
  box-shadow:
    4px 0 0 var(--bx-text-4),
    0 4px 0 var(--bx-text-4),
    4px 4px 0 var(--bx-text-4),
    0 8px 0 var(--bx-text-4),
    4px 8px 0 var(--bx-text-4);
}

/* 题号：11 / 500 + 等宽数字（与画布题号同一套） */
.bx-editor-item-row__index {
  flex: none;
  width: 22px;
  padding-top: 1px;
  color: var(--bx-text-3);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.bx-editor-item-row--selected .bx-editor-item-row__index {
  color: var(--bx-primary);
}

/* 右侧给操作按钮留出位置（按钮绝对定位，悬停才出现） */
.bx-editor-item-row__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  height: 100%;
  padding-right: 76px;
  cursor: pointer;
}

/* 单行省略：题目行必须保持固定高度，两行文字会溢出 */
.bx-editor-item-row__title {
  overflow: hidden;
  color: var(--bx-text);
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bx-editor-item-row--selected .bx-editor-item-row__title {
  color: var(--bx-primary);
}

/* 元信息：11 元信息灰，一行排开 */
.bx-editor-item-row__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  margin-top: 1px;
  color: var(--bx-text-3);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}

.bx-editor-item-row__meta-item {
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 必答：一颗 4px 主色小点 + 文字（状态不只靠颜色） */
.bx-editor-item-row__reqdot {
  flex: none;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--bx-primary);
}

.bx-editor-item-row__req {
  flex: none;
  color: var(--bx-primary);
}

/* 操作：绝对定位在行右侧，默认隐形 */
.bx-editor-item-row__actions {
  position: absolute;
  top: 50%;
  right: 4px;
  display: flex;
  gap: 0;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-editor-item-row:hover .bx-editor-item-row__actions,
.bx-editor-item-row:focus-within .bx-editor-item-row__actions,
.bx-editor-item-row--selected .bx-editor-item-row__actions {
  opacity: 1;
}

@media (hover: none) {
  /* 触屏没有悬停：选中行才显形，先点行再操作 */
  .bx-editor-item-row__actions {
    opacity: 1;
  }
}

.bx-editor-item-row__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  border-radius: var(--bx-radius-xs);
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .bx-editor-item-row__btn:hover {
    background-color: var(--bx-line-2);
  }
}

.bx-editor-item-row__btn:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.bx-editor-item-row__btn-text {
  width: 8px;
  height: 8px;
}

/* 上 / 下移箭头：两条边框旋转 45°（不用 ↑ ↓ 文字符号） */
.bx-editor-item-row__btn-text--up {
  border-top: 1.5px solid var(--bx-text-2);
  border-left: 1.5px solid var(--bx-text-2);
  transform: rotate(45deg);
}

.bx-editor-item-row__btn-text--down {
  border-right: 1.5px solid var(--bx-text-2);
  border-bottom: 1.5px solid var(--bx-text-2);
  transform: rotate(45deg);
}

/* 已是首 / 尾：箭头变浅表示不可用 */
.bx-editor-item-row__btn--off .bx-editor-item-row__btn-text--up,
.bx-editor-item-row__btn--off .bx-editor-item-row__btn-text--down {
  border-color: var(--bx-line);
}

/* 删除：两条交叉线（不用 ✕ 文字符号） */
.bx-editor-item-row__btn-text--close {
  position: relative;
  width: 9px;
  height: 9px;
}

.bx-editor-item-row__btn-text--close::before,
.bx-editor-item-row__btn-text--close::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 9px;
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

/* 落点插入线：2px 主色横线，画在行与行之间 */
.bx-editor-item-row__insert {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 3;
  height: 2px;
  background-color: var(--bx-primary);
}

.bx-editor-item-row__insert--before {
  top: 0;
}

.bx-editor-item-row__insert--after {
  bottom: 0;
}
</style>
