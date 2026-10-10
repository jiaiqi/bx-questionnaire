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

.bx-text__counter {
  position: absolute;
  right: 10px;
  bottom: 6px;
  font-size: 12px;
  color: var(--bx-text-3);
}
</style>
