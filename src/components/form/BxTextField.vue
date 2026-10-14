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
      :class="{ 'bx-text__control--disabled': props.disabled }"
      :value="text"
      :disabled="props.disabled"
      :maxlength="props.maxlength"
      placeholder="请输入"
      placeholder-class="bx-text__placeholder"
      @input="onInput"
    />
    <input
      v-else
      :aria-label="props.field.label"
      class="bx-text__control"
      :class="{ 'bx-text__control--disabled': props.disabled }"
      :value="text"
      :disabled="props.disabled"
      :type="isNumber ? 'digit' : 'text'"
      :maxlength="isNumber ? 20 : props.maxlength"
      placeholder="请输入"
      placeholder-class="bx-text__placeholder"
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
 * 输入框
 *
 * 底色比卡片深一档（--bx-bg）+ 1px 描边：只靠描边时，白卡片里的输入区在
 * 低亮度屏幕上几乎看不到边界。
 */
.bx-text__control {
  box-sizing: border-box;
  width: 100%;
  height: var(--bx-control-height);
  padding: 0 14px;
  font-size: 15px;
  color: var(--bx-text);
  background-color: var(--bx-bg);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-text__control--area {
  height: auto;
  min-height: 96px;
  /* 底部留出计数器的位置，避免最后一行被压在计数文字下面 */
  padding: 12px 14px 26px;
  line-height: 1.6;
}

.bx-text__control--disabled {
  cursor: not-allowed;
  opacity: var(--bx-disabled-opacity);
}

.bx-text__placeholder {
  color: var(--bx-text-4);
}

/*
 * 焦点可见性
 *
 * uni-app 内置样式把 outline 设成了 none，实测聚焦前后完全一样
 * （outlineStyle: none、boxShadow: none、父元素边框色也不变），
 * 页面里没有任何 :focus 规则 —— 键盘用户看不到焦点在哪。
 *
 * 用 :focus-visible 补回来：只在键盘聚焦时显示，鼠标点击不显示，不影响视觉简洁。
 *
 * 选择器必须落到 `.uni-input-input`：uni-app 的 postcss 插件会把选择器里的
 * `input` 改写成 `uni-input`（外层自定义元素），而真正被聚焦的是内层原生 input，
 * 写 `input` 编译出来是 `uni-input:focus-visible`，永远不会触发。
 * 真实结构：UNI-INPUT > DIV.uni-input-wrapper > INPUT.uni-input-input
 *
 * 也刻意不改成「外层 :focus-within 光晕」：可访问性审计读的是 document.activeElement
 * 自身的 outline / box-shadow，焦点环画在外层会被判成「不可见」。
 */
:deep(.bx-text__control .uni-input-input:focus-visible),
:deep(.bx-text__control .uni-textarea-textarea:focus-visible) {
  border-color: var(--bx-primary);
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.bx-text__counter {
  position: absolute;
  right: 12px;
  bottom: 8px;
  font-size: 12px;
  color: var(--bx-text-3);
}
</style>
