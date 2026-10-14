<script setup lang="ts">
/**
 * 选项编辑器
 *
 * 选项行的字母（A/B/C）**由位置算出来**，不读 `option_view_no`：
 * 那个字段是平台用来在提交时回填 `option_flag` 的展示标识，
 * 重排后必须跟着位置走。若把它当数据读，重排后界面会出现「C、A、B」这种错乱序号。
 *
 * 行高固定为 `OPTION_ROW_HEIGHT`，理由与题目行相同（拖拽落点按固定行高反算），
 * 一致性由 `test/components/editor-layout.spec.ts` 守住。
 *
 * 拖拽浮层只覆盖选项列表区域：选项在题目面板内部，而题目面板在移动端本身就是一个
 * 全屏浮层，所以不能再放一个全屏浮层（会盖住面板的保存/关闭按钮）。
 */

import type { EditorOption } from '@/domain/editor'

import { computed } from 'vue'

import { usePointerReorder } from '@/composables/usePointerReorder'
import { MAX_OPTIONS, optionViewNo } from '@/domain/editor'
import { OPTION_ROW_HEIGHT } from './constants'

interface Props {
  options: EditorOption[]
  /** 是否为多选（多选才提示「可设多个正确答案」） */
  multi?: boolean
}

const props = withDefaults(defineProps<Props>(), { multi: false })

const emit = defineEmits<{
  add: []
  remove: [index: number]
  moveUp: [index: number]
  moveDown: [index: number]
  dragDrop: [from: number, to: number]
  updateValue: [index: number, value: string]
  updateAnswer: [index: number, isAnswer: boolean]
  updatePoints: [index: number, points: number]
}>()

const { dragging, fromIndex, overIndex, begin, onMove, onEnd, onCancel } = usePointerReorder({
  rowHeight: OPTION_ROW_HEIGHT,
  count: () => props.options.length,
  onDrop: (from, to) => emit('dragDrop', from, to),
})

const canAdd = computed(() => props.options.length < MAX_OPTIONS)

/** 选项行高（与样式里的字面值一致，由布局测试守住） */
const rowHeightStyle = computed(() => `${OPTION_ROW_HEIGHT}px`)

function letter(index: number): string {
  return optionViewNo(index) || `${index + 1}`
}

function onValueInput(index: number, event: unknown): void {
  const value = (event as { detail?: { value?: string } })?.detail?.value
  if (typeof value === 'string') {
    emit('updateValue', index, value)
  }
}

function onPointsInput(index: number, event: unknown): void {
  const value = Number((event as { detail?: { value?: string } })?.detail?.value)
  emit('updatePoints', index, Number.isFinite(value) ? value : 0)
}
</script>

<template>
  <view class="bx-editor-option">
    <view class="bx-editor-option__head">
      <text class="bx-editor-option__title">选项</text>
      <text class="bx-editor-option__count">{{ props.options.length }} / {{ MAX_OPTIONS }}</text>
    </view>

    <view class="bx-editor-option__stage">
      <view class="bx-editor-option-list">
        <view
          v-for="(option, index) in props.options"
          :key="option.clientKey"
          class="bx-editor-option-row"
          :class="{
            'bx-editor-option-row--dragging': dragging && fromIndex === index,
            'bx-editor-option-row--drop': dragging && overIndex === index,
          }"
          :style="{ height: rowHeightStyle }"
        >
          <view
            class="bx-editor-option-row__handle"
            role="button"
            tabindex="0"
            aria-label="拖动排序"
            @touchstart.stop="begin(index, $event)"
            @mousedown.stop="begin(index, $event)"
          >
            <view class="bx-editor-option-row__dots" aria-hidden="true" />
          </view>

          <text class="bx-editor-option-row__letter">{{ letter(index) }}</text>

          <input
            class="bx-editor-option-row__input"
            type="text"
            :value="option.value"
            :aria-label="`选项 ${letter(index)} 内容`"
            placeholder="选项内容"
            @input="onValueInput(index, $event)"
          >

          <view
            class="bx-editor-option-row__answer"
            :class="{ 'bx-editor-option-row__answer--on': option.isAnswer }"
            role="button"
            tabindex="0"
            :aria-label="option.isAnswer ? '已设为正确答案' : '设为正确答案'"
            @click="emit('updateAnswer', index, !option.isAnswer)"
            @keydown.enter.prevent="emit('updateAnswer', index, !option.isAnswer)"
          >
            <view class="bx-editor-option-row__answer-text" aria-hidden="true" />
          </view>

          <input
            class="bx-editor-option-row__points"
            type="number"
            :value="String(option.points)"
            :aria-label="`选项 ${letter(index)} 分值`"
            placeholder="0"
            @input="onPointsInput(index, $event)"
          >

          <view
            class="bx-editor-option-row__btn"
            :class="{ 'bx-editor-option-row__btn--off': index === 0 }"
            role="button"
            tabindex="0"
            aria-label="选项上移"
            @click="emit('moveUp', index)"
            @keydown.enter.prevent="emit('moveUp', index)"
          >
            <view class="bx-editor-option-row__btn-text bx-editor-option-row__btn-text--up" aria-hidden="true" />
          </view>
          <view
            class="bx-editor-option-row__btn"
            :class="{ 'bx-editor-option-row__btn--off': index === props.options.length - 1 }"
            role="button"
            tabindex="0"
            aria-label="选项下移"
            @click="emit('moveDown', index)"
            @keydown.enter.prevent="emit('moveDown', index)"
          >
            <view class="bx-editor-option-row__btn-text bx-editor-option-row__btn-text--down" aria-hidden="true" />
          </view>
          <view
            class="bx-editor-option-row__btn bx-editor-option-row__btn--danger"
            role="button"
            tabindex="0"
            aria-label="删除选项"
            @click="emit('remove', index)"
            @keydown.enter.prevent="emit('remove', index)"
          >
            <view class="bx-editor-option-row__btn-text bx-editor-option-row__btn-text--close" aria-hidden="true" />
          </view>
        </view>
      </view>

      <!-- 拖拽浮层：只盖住选项列表，不遮挡面板其它按钮 -->
      <view
        v-if="dragging"
        class="bx-editor-option__layer"
        @touchmove.stop.prevent="onMove"
        @touchend="onEnd"
        @touchcancel="onCancel"
        @mousemove="onMove"
        @mouseup="onEnd"
      />
    </view>

    <view
      class="bx-editor-option__add"
      :class="{ 'bx-editor-option__add--off': !canAdd }"
      role="button"
      tabindex="0"
      aria-label="添加选项"
      @click="canAdd && emit('add')"
      @keydown.enter.prevent="canAdd && emit('add')"
    >
      <view v-if="canAdd" class="bx-editor-option__add-icon" aria-hidden="true" />
      <text class="bx-editor-option__add-text">
        {{ canAdd ? '添加选项' : `已达上限 ${MAX_OPTIONS} 个` }}
      </text>
    </view>

    <text v-if="props.multi" class="bx-editor-option__hint">多选：可以把多个选项都设为正确答案</text>
  </view>
</template>

<style lang="scss" scoped>
.bx-editor-option {
  display: flex;
  flex-direction: column;
}

.bx-editor-option__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.bx-editor-option__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--bx-text);
}

.bx-editor-option__count {
  font-size: 12px;
  color: var(--bx-text-3);
}

.bx-editor-option__stage {
  position: relative;
}

.bx-editor-option-list {
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
  overflow: hidden;
}

/*
 * 选项行
 *
 * 契约（test/components/editor-layout.spec.ts 守住）：**不得声明 height**
 * —— 行高由内联 style 提供（拖拽落点按 OPTION_ROW_HEIGHT 反算），
 * CSS 再写一遍 height 会与内联样式打架。也不得有纵向 margin。
 */
.bx-editor-option-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  padding: 0 4px;
  overflow: hidden;
  border-bottom: 1px solid var(--bx-line-2);
  background-color: var(--bx-surface);
}

.bx-editor-option-row:last-child {
  border-bottom: none;
}

.bx-editor-option-row--dragging {
  opacity: 0.6;
  background-color: var(--bx-primary-soft);
}

.bx-editor-option-row--drop {
  box-shadow: inset 3px 0 0 var(--bx-primary);
}

.bx-editor-option-row__handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 100%;
  cursor: grab;
  user-select: none;
}

/*
 * 拖拽把手：2×3 点阵
 *
 * 原为「⋮⋮」文字符号 —— 字形随字体变化、间距不一致。这里用「一个小圆 + 5 个
 * box-shadow 偏移」画点阵，比 radial-gradient 背景更稳（部分小程序内核不支持）。
 */
.bx-editor-option-row__dots {
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

.bx-editor-option-row__letter {
  width: 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--bx-text-2);
  text-align: center;
}

.bx-editor-option-row__input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 6px;
  font-size: 13px;
  color: var(--bx-text);
}

.bx-editor-option-row__answer {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  cursor: pointer;
  border: 1px solid var(--bx-line);
  border-radius: 50%;
  background-color: var(--bx-surface);
}

.bx-editor-option-row__answer--on {
  border-color: var(--bx-success);
  background-color: var(--bx-success);
}

/*
 * 正确答案的对勾
 *
 * 用两条边框旋转绘制（原为「✓」文字符号）。未选中时用 opacity 藏起来，
 * 而不是像原来那样把文字颜色设成 transparent —— 后者的元素仍在布局里占位。
 */
.bx-editor-option-row__answer-text {
  width: 9px;
  height: 9px;
  opacity: 0;
  border-right: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: rotate(45deg) translate(-1px, -1px);
}

.bx-editor-option-row__answer--on .bx-editor-option-row__answer-text {
  opacity: 1;
}

.bx-editor-option-row__points {
  width: 36px;
  height: 30px;
  margin-left: 4px;
  font-size: 13px;
  color: var(--bx-text);
  text-align: center;
}

.bx-editor-option-row__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 28px;
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
}

.bx-editor-option-row__btn:hover,
.bx-editor-option-row__btn:active {
  background-color: var(--bx-line-2);
}

.bx-editor-option-row__btn-text {
  width: 7px;
  height: 7px;
}

/* 上 / 下移箭头：两条边框旋转 45°（不再用 ↑ ↓ 文字符号） */
.bx-editor-option-row__btn-text--up {
  border-top: 1.5px solid var(--bx-text-2);
  border-left: 1.5px solid var(--bx-text-2);
  transform: rotate(45deg);
}

.bx-editor-option-row__btn-text--down {
  border-right: 1.5px solid var(--bx-text-2);
  border-bottom: 1.5px solid var(--bx-text-2);
  transform: rotate(45deg);
}

/* 已是首 / 尾：箭头变浅表示不可用 */
.bx-editor-option-row__btn--off .bx-editor-option-row__btn-text--up,
.bx-editor-option-row__btn--off .bx-editor-option-row__btn-text--down {
  border-color: var(--bx-line);
}

/* 删除：两条交叉线（不再用 ✕ 文字符号） */
.bx-editor-option-row__btn-text--close {
  position: relative;
  width: 9px;
  height: 9px;
}

.bx-editor-option-row__btn-text--close::before,
.bx-editor-option-row__btn-text--close::after {
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

.bx-editor-option-row__btn-text--close::before {
  transform: rotate(45deg);
}

.bx-editor-option-row__btn-text--close::after {
  transform: rotate(-45deg);
}

.bx-editor-option__layer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  /* 原来写死的 rgba(0,122,255,.04) 是旧蓝；用主色浅底 + 透明度，主题可跟随 */
  opacity: 0.6;
  background-color: var(--bx-primary-soft);
}

.bx-editor-option__add {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  margin-top: 8px;
  cursor: pointer;
  border: 1px dashed var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-editor-option__add:hover,
.bx-editor-option__add:active {
  border-color: var(--bx-primary);
  background-color: var(--bx-primary-soft);
}

.bx-editor-option__add--off {
  cursor: not-allowed;
  opacity: var(--bx-disabled-opacity);
}

/* 加号用两条线绘制（原为「＋ 添加选项」里的全角加号） */
.bx-editor-option__add-icon {
  position: relative;
  flex: none;
  width: 10px;
  height: 10px;
  margin-right: 6px;
}

.bx-editor-option__add-icon::before,
.bx-editor-option__add-icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 10px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: var(--bx-primary);
  border-radius: 1px;
}

.bx-editor-option__add-icon::after {
  transform: rotate(90deg);
}

.bx-editor-option__add-text {
  font-size: 13px;
  color: var(--bx-primary);
}

.bx-editor-option__hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--bx-text-3);
}
</style>
