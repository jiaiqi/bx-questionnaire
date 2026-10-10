<script setup lang="ts">
import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { computed } from 'vue'

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

function onInput(event: { detail: { value: string } }): void {
  emit('update:modelValue', event.detail.value)
}
</script>

<template>
  <view class="bx-text">
    <textarea
      v-if="isTextarea"
      v-aria-label="props.field.label"
      class="bx-text__control bx-text__control--area"
      :value="text"
      :disabled="props.disabled"
      :maxlength="props.maxlength"
      placeholder="请输入"
      placeholder-class="bx-text__placeholder"
      @input="onInput"
    />
    <input
      v-else
      v-aria-label="props.field.label"
      class="bx-text__control"
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

.bx-text__control {
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  padding: 0 12px;
  font-size: 14px;
  color: var(--bx-text);
  background-color: var(--bx-bg);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-text__control--area {
  height: 96px;
  padding: 10px 12px 24px;
  line-height: 1.6;
}

.bx-text__placeholder {
  color: var(--bx-text-3);
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
 */
:deep(.bx-text__control .uni-input-input:focus-visible),
:deep(.bx-text__control .uni-textarea-textarea:focus-visible) {
  border-color: var(--bx-blue);
  outline: 2px solid var(--bx-blue);
  outline-offset: 1px;
}

.bx-text__counter {
  position: absolute;
  right: 10px;
  bottom: 6px;
  font-size: 12px;
  color: var(--bx-text-3);
}
</style>
