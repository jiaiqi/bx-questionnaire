<script setup lang="ts">
import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { computed, ref } from 'vue'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  disabled?: boolean
  maxlength?: number
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  maxlength: 200,
})

const emit = defineEmits<{ 'update:modelValue': [AnswerValue] }>()

const text = computed(() => {
  const value = props.modelValue
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
})

const isTextarea = computed(() => props.field.widget === 'textarea')
const isNumber = computed(() => props.field.widget === 'number')

/**
 * 聚焦态
 *
 * 小程序端没有 `:focus-within` 这类可靠的选择器，改用 focus / blur 事件挂类，
 * 两端表现一致（规范 §6.2：聚焦 = 描边转主色 + 3px 柔光）。
 */
const focused = ref(false)

function onFocus(): void {
  focused.value = true
}

function onBlur(): void {
  focused.value = false
}

// 把可读名称补到内层原生控件上：aria-label 留在外层 uni-input 时屏幕阅读器读不到
const rootRef = ref<HTMLElement | null>(null)
useAriaLabel(rootRef, () => props.field.label)

function onInput(event: { detail: { value: string } }): void {
  emit('update:modelValue', event.detail.value)
}
</script>

<template>
  <view ref="rootRef" class="bx-text">
    <textarea
      v-if="isTextarea"
      :aria-label="props.field.label"
      class="bx-text__control bx-text__control--area"
      :class="{
        'bx-text__control--disabled': props.disabled,
        'bx-text__control--focus': focused,
      }"
      :value="text"
      :disabled="props.disabled"
      :maxlength="props.maxlength"
      placeholder="请输入"
      placeholder-class="bx-text__placeholder"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput"
    />
    <input
      v-else
      :aria-label="props.field.label"
      class="bx-text__control"
      :class="{
        'bx-text__control--disabled': props.disabled,
        'bx-text__control--focus': focused,
      }"
      :value="text"
      :disabled="props.disabled"
      :type="isNumber ? 'digit' : 'text'"
      :maxlength="isNumber ? 20 : props.maxlength"
      placeholder="请输入"
      placeholder-class="bx-text__placeholder"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput"
    >

    <text v-if="isTextarea" class="bx-text__counter">{{ text.length }}/{{ props.maxlength }}</text>
  </view>
</template>

<style lang="scss" scoped>
.bx-text {
  position: relative;
}

/*
 * 输入框（规范 §6.2）
 *
 * 内嵌档底色 `--bx-surface-2` + 1px `--bx-line-strong` 描边 + 12px 圆角 + 44px 高。
 * 「这里可以输入」要看得出来：白底白卡里的输入区在低亮度屏幕上等于隐形。
 */
.bx-text__control {
  box-sizing: border-box;
  width: 100%;
  height: var(--bx-control-height-md);
  padding: 0 14px;
  font-size: var(--bx-font-body);
  line-height: var(--bx-leading-body);
  color: var(--bx-text);
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-radius);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-text__control--area {
  height: auto;
  min-height: 96px;
  /* 底部留出计数器的位置，避免最后一行被压在计数文字下面 */
  padding: 12px 14px 26px;
  line-height: var(--bx-leading-body);
}

/* 只读态：底色不变，描边去掉（规范 §6.2） */
.bx-text__control--disabled {
  cursor: not-allowed;
  color: var(--bx-text-2);
  background-color: var(--bx-surface-2);
  border-color: transparent;
}

.bx-text__placeholder {
  color: var(--bx-text-4);
}

/*
 * 聚焦：描边转主色 + 3px 柔光
 *
 * 用 box-shadow 而不是 outline：outline 在小程序端的表现不统一，
 * 而 box-shadow 两端一致（规范 §6.2）。
 *
 * H5 端靠 :focus-within（样式直接挂在控件上），小程序端靠 focus/blur 事件挂类。
 */
.bx-text__control:focus-within,
.bx-text__control--focus {
  border-color: var(--bx-primary);
  box-shadow: var(--bx-focus-glow);
}

/*
 * 焦点环同时画在真正被聚焦的内层原生控件上
 *
 * 可访问性审计（scripts/a11y.mjs）读的是 document.activeElement 自身的
 * outline / box-shadow；环只画在外层 :focus-within 上会被判成「焦点不可见」。
 * 这里在内层画一圈内描边，与外层柔光叠在一起仍是同一套「墨蓝」语言。
 */
:deep(.bx-text__control .uni-input-input:focus-visible),
:deep(.bx-text__control .uni-textarea-textarea:focus-visible) {
  box-shadow: inset 0 0 0 3px var(--bx-blue-soft);
}

/* 字数统计：元信息色 + 等宽数字（规范 §6.2） */
.bx-text__counter {
  position: absolute;
  right: 12px;
  bottom: 8px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}
</style>
