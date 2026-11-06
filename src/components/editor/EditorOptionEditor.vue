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
 *
 * V6「清简」：字母用 11 元信息，输入框 32 高、白底细描边；正确答案是一枚小圆点
 * 开关（选中 = 成功绿 + 白勾）；上移 / 下移 / 删除是 24px 的图标按钮。
 */

import type { EditorOption } from '@/domain/editor'

import { computed, ref } from 'vue'

import { usePointerReorder } from '@/composables/usePointerReorder'
import { MAX_OPTIONS, optionViewNo } from '@/domain/editor'
import { confirmDialog } from '@/utils/ui'
import { OPTION_ROW_HEIGHT } from './constants'

interface Props {
  options: EditorOption[]
  /** 是否为多选（多选才提示「可设多个正确答案」） */
  multi?: boolean
}

const props = withDefaults(defineProps<Props>(), { multi: false })

const emit = defineEmits<{
  add: []
  /** 批量替换：一行一个选项文案 */
  replaceAll: [values: string[]]
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

/**
 * 批量编辑
 *
 * 选项多的时候一行行加太慢（一份清单十几个选项就要点十几次）。这里给一个
 * 「一行一个选项」的文本框，粘贴整份清单一次替换。
 *
 * 打开时用当前选项预填，方便在已有清单上改；确认后由上层按位置对齐替换，
 * 已设的「正确答案」标记会保留。
 */
const bulkOpen = ref(false)
const bulkText = ref('')

function openBulk(): void {
  bulkText.value = props.options.map(option => option.value).join('\n')
  bulkOpen.value = true
}

function confirmBulk(): void {
  emit('replaceAll', bulkText.value.split('\n'))
  bulkOpen.value = false
}

/** uni-app 的 input/textarea 事件把值放在 `detail.value`，H5 与小程序一致 */
function onBulkInput(event: unknown): void {
  const detail = (event as { detail?: { value?: string } })?.detail
  bulkText.value = detail?.value ?? ''
}

/**
 * 删除选项前确认
 *
 * 选项行只有 24px 的图标按钮，误触概率不低；删掉后只能重新输入找回来，
 * 而保存时的总数确认拦不住这种单条误删。
 */
async function onRemoveOption(index: number): Promise<void> {
  const option = props.options[index]
  const label = option?.value?.trim() || `选项 ${letter(index)}`
  const confirmed = await confirmDialog(`删除「${label}」？`)
  if (confirmed) {
    emit('remove', index)
  }
}

/**
 * 落点插在目标行的上边还是下边
 *
 * `moveOption(from, to)` 的语义是「把第 from 行挪到第 to 行」：
 * 往下拖落在目标行之后，往上拖落在目标行之前。插入线画错边，
 * 落点就与实际落位差一整行。
 */
const dropPosition = computed<'before' | 'after' | undefined>(() => {
  if (!dragging.value || overIndex.value < 0 || fromIndex.value === overIndex.value) {
    return undefined
  }
  return fromIndex.value < overIndex.value ? 'after' : 'before'
})

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
            @click="onRemoveOption(index)"
            @keydown.enter.prevent="onRemoveOption(index)"
          >
            <view class="bx-editor-option-row__btn-text bx-editor-option-row__btn-text--close" aria-hidden="true" />
          </view>

          <!-- 落点：2px 主色插入线（画在行与行之间） -->
          <view
            v-if="dragging && overIndex === index && dropPosition"
            class="bx-editor-option-row__insert"
            :class="`bx-editor-option-row__insert--${dropPosition}`"
            aria-hidden="true"
          />
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

    <!-- 计数：列表下方右对齐（「选项」标签由外层分组给出，这里只有计数） -->
    <view class="bx-editor-option__foot">
      <text class="bx-editor-option__count">{{ props.options.length }} / {{ MAX_OPTIONS }}</text>
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

    <!-- 批量编辑：一行一个选项，粘贴整份清单一次替换（选项多时比一行行加快得多） -->
    <view
      class="bx-editor-option__bulk"
      role="button"
      tabindex="0"
      :aria-expanded="bulkOpen"
      aria-label="批量编辑选项"
      @click="bulkOpen ? (bulkOpen = false) : openBulk()"
      @keydown.enter.prevent="bulkOpen ? (bulkOpen = false) : openBulk()"
    >
      <text class="bx-editor-option__bulk-text">{{ bulkOpen ? '收起批量编辑' : '批量编辑' }}</text>
    </view>

    <view v-if="bulkOpen" class="bx-editor-option__bulk-panel">
      <textarea
        class="bx-editor-option__bulk-input"
        :value="bulkText"
        aria-label="批量编辑选项"
        placeholder="一行一个选项，粘贴后点「应用」"
        @input="onBulkInput"
      />
      <view class="bx-editor-option__bulk-actions">
        <view
          class="bx-editor-option__bulk-btn"
          role="button"
          tabindex="0"
          @click="bulkOpen = false"
          @keydown.enter.prevent="bulkOpen = false"
        >
          <text class="bx-editor-option__bulk-btn-text">取消</text>
        </view>
        <view
          class="bx-editor-option__bulk-btn bx-editor-option__bulk-btn--primary"
          role="button"
          tabindex="0"
          @click="confirmBulk"
          @keydown.enter.prevent="confirmBulk"
        >
          <text class="bx-editor-option__bulk-btn-text bx-editor-option__bulk-btn-text--primary">应用</text>
        </view>
      </view>
    </view>

    <text v-if="props.multi" class="bx-editor-option__hint">多选：可以把多个选项都设为正确答案</text>
  </view>
</template>

<style lang="scss" scoped>
.bx-editor-option {
  display: flex;
  flex-direction: column;
}

/* 计数：列表下方右对齐 */
.bx-editor-option__foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.bx-editor-option__count {
  color: var(--bx-text-3);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.bx-editor-option__stage {
  position: relative;
}

.bx-editor-option-list {
  overflow: hidden;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
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
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 4px;
  overflow: hidden;
  border-bottom: 1px solid var(--bx-line-2);
  background-color: var(--bx-surface);
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-editor-option-row:last-child {
  border-bottom: none;
}

@media (hover: hover) {
  .bx-editor-option-row:hover {
    background-color: var(--bx-surface-2);
  }
}

/* 拖起：压下去一点 + 抬起来一点（与题纲行同一套反馈） */
.bx-editor-option-row--dragging {
  z-index: 2;
  transform: scale(0.98);
  box-shadow: var(--bx-elev-2);
}

/* 落点：2px 主色插入线（见模板里的 __insert），不改高度 */
.bx-editor-option-row--drop {
  border-bottom-color: var(--bx-primary-line);
}

.bx-editor-option-row__handle {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 100%;
  cursor: grab;
  user-select: none;
}

/*
 * 拖拽把手：2×3 点阵
 *
 * 用「一个小圆 + 5 个 box-shadow 偏移」画点阵，比文字符号稳，
 * 比 radial-gradient 背景稳（部分小程序内核不支持）。
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

/* 字母：11 元信息 + 等宽（选项位置由下标算出） */
.bx-editor-option-row__letter {
  flex: none;
  width: 18px;
  color: var(--bx-text-3);
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.bx-editor-option-row__input {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  color: var(--bx-text);
  font-size: 12px;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-xs);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-editor-option-row__input:focus-within {
  border-color: var(--bx-primary);
  box-shadow: var(--bx-focus-glow);
}

/* 正确答案：一枚小圆点开关 */
.bx-editor-option-row__answer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  margin-left: 4px;
  cursor: pointer;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line-strong);
  border-radius: 50%;
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    background-color var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-editor-option-row__answer:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.bx-editor-option-row__answer--on {
  border-color: var(--bx-success);
  background-color: var(--bx-success);
}

/*
 * 正确答案的对勾：两条边框旋转绘制。
 * 用 opacity 藏起来而不是把颜色设成 transparent —— 后者元素仍在布局里占位。
 */
.bx-editor-option-row__answer-text {
  width: 8px;
  height: 8px;
  opacity: 0;
  border-right: 2px solid var(--bx-surface);
  border-bottom: 2px solid var(--bx-surface);
  transform: rotate(45deg) translate(-1px, -1px);
}

.bx-editor-option-row__answer--on .bx-editor-option-row__answer-text {
  opacity: 1;
}

.bx-editor-option-row__points {
  box-sizing: border-box;
  width: 34px;
  height: 30px;
  margin-left: 4px;
  padding: 0 2px;
  color: var(--bx-text-2);
  font-size: 12px;
  text-align: center;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-xs);
  font-variant-numeric: tabular-nums;
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-editor-option-row__points:focus-within {
  border-color: var(--bx-primary);
  box-shadow: var(--bx-focus-glow);
}

.bx-editor-option-row__btn {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 26px;
  cursor: pointer;
  border-radius: var(--bx-radius-xs);
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .bx-editor-option-row__btn:hover {
    background-color: var(--bx-line-2);
  }

  .bx-editor-option-row__btn--danger:hover {
    background-color: var(--bx-danger-soft);
  }
}

.bx-editor-option-row__btn:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.bx-editor-option-row__btn-text {
  width: 7px;
  height: 7px;
}

/* 上 / 下移箭头：两条边框旋转 45°（不用 ↑ ↓ 文字符号） */
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

/* 删除：两条交叉线（不用 ✕ 文字符号） */
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
  opacity: 0.6;
  background-color: var(--bx-glow);
}

/* 落点插入线：2px 主色横线，画在行与行之间 */
.bx-editor-option-row__insert {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 3;
  height: 2px;
  background-color: var(--bx-primary);
}

.bx-editor-option-row__insert--before {
  top: 0;
}

.bx-editor-option-row__insert--after {
  bottom: 0;
}

/* 添加选项：静默文字按钮（加号 + 文案），不用整块虚线框抢注意力 */
.bx-editor-option__add {
  display: flex;
  align-items: center;
  align-self: flex-start;
  height: 30px;
  padding: 0 8px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* ── 批量编辑 ─────────────────────────────────────────────────────── */
.bx-editor-option__bulk {
  display: flex;
  align-items: center;
  align-self: flex-start;
  height: 30px;
  padding: 0 8px;
  cursor: pointer;
}

.bx-editor-option__bulk-text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-primary);
}

.bx-editor-option__bulk-panel {
  margin-top: 8px;
  padding: 10px;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.bx-editor-option__bulk-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 96px;
  padding: 8px;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text);
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.bx-editor-option__bulk-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.bx-editor-option__bulk-btn {
  padding: 6px 14px;
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
}

.bx-editor-option__bulk-btn--primary {
  background-color: var(--bx-primary);
}

.bx-editor-option__bulk-btn-text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
}

.bx-editor-option__bulk-btn-text--primary {
  color: #fff;
}

@media (hover: hover) {
  .bx-editor-option__add:hover {
    background-color: var(--bx-surface-2);
  }
}

.bx-editor-option__add:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.bx-editor-option__add--off {
  cursor: not-allowed;
  opacity: var(--bx-disabled-opacity);
}

/* 加号用两条线绘制（不用「＋」全角符号） */
.bx-editor-option__add-icon {
  position: relative;
  flex: none;
  width: 9px;
  height: 9px;
  margin-right: 6px;
}

.bx-editor-option__add-icon::before,
.bx-editor-option__add-icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 9px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: var(--bx-primary);
  border-radius: 1px;
}

.bx-editor-option__add-icon::after {
  transform: rotate(90deg);
}

.bx-editor-option__add-text {
  color: var(--bx-primary);
  font-size: 12px;
  line-height: 16px;
}

.bx-editor-option__hint {
  margin-top: 4px;
  color: var(--bx-text-3);
  font-size: 11px;
  line-height: 16px;
}
</style>
