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
            <text class="bx-editor-option-row__dots">⋮⋮</text>
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
            <text class="bx-editor-option-row__answer-text">✓</text>
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
            <text class="bx-editor-option-row__btn-text">↑</text>
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
            <text class="bx-editor-option-row__btn-text">↓</text>
          </view>
          <view
            class="bx-editor-option-row__btn bx-editor-option-row__btn--danger"
            role="button"
            tabindex="0"
            aria-label="删除选项"
            @click="emit('remove', index)"
            @keydown.enter.prevent="emit('remove', index)"
          >
            <text class="bx-editor-option-row__btn-text">✕</text>
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
      <text class="bx-editor-option__add-text">
        {{ canAdd ? '＋ 添加选项' : `已达上限 ${MAX_OPTIONS} 个` }}
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
  background-color: var(--bx-blue-soft);
}

.bx-editor-option-row--drop {
  box-shadow: inset 3px 0 0 var(--bx-blue);
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

.bx-editor-option-row__dots {
  font-size: 12px;
  color: var(--bx-text-3);
  letter-spacing: -2px;
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
  border: 1px solid var(--bx-line);
  border-radius: 50%;
  background-color: var(--bx-surface);
}

.bx-editor-option-row__answer--on {
  border-color: var(--bx-success);
  background-color: var(--bx-success);
}

.bx-editor-option-row__answer-text {
  font-size: 12px;
  color: transparent;
}

.bx-editor-option-row__answer--on .bx-editor-option-row__answer-text {
  color: #ffffff;
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
  width: 22px;
  height: 28px;
  border-radius: var(--bx-radius);
}

.bx-editor-option-row__btn:active {
  background-color: var(--bx-line-2);
}

.bx-editor-option-row__btn--off .bx-editor-option-row__btn-text {
  color: var(--bx-line);
}

.bx-editor-option-row__btn--danger .bx-editor-option-row__btn-text {
  color: var(--bx-danger);
}

.bx-editor-option-row__btn-text {
  font-size: 12px;
  color: var(--bx-text-2);
}

.bx-editor-option__layer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  background-color: rgba(0, 122, 255, 0.04);
}

.bx-editor-option__add {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  margin-top: 8px;
  border: 1px dashed var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-editor-option__add:active {
  border-color: var(--bx-blue);
  background-color: var(--bx-blue-soft);
}

.bx-editor-option__add--off {
  opacity: 0.5;
}

.bx-editor-option__add-text {
  font-size: 13px;
  color: var(--bx-blue);
}

.bx-editor-option__hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--bx-text-3);
}
</style>
