<script setup lang="ts">
import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { computed } from 'vue'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [AnswerValue] }>()

const text = computed(() => {
  const value = props.modelValue
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
})

/** 时间日期题型：老工程用 item_type_attr.dateType 区分，缺省为 date */
const mode = computed(() => (props.field.widget === 'time' ? 'time' : 'date'))

function onChange(event: { detail: { value: string } }): void {
  emit('update:modelValue', event.detail.value)
}
</script>

<template>
  <picker :mode="mode" :value="text" :disabled="props.disabled" @change="onChange">
    <view class="bx-picker">
      <text :class="text ? 'bx-picker__value' : 'bx-picker__placeholder'">
        {{ text || (mode === 'time' ? '请选择时间' : '请选择日期') }}
      </text>
      <text class="bx-picker__arrow">›</text>
    </view>
  </picker>
</template>

<style lang="scss" scoped>
.bx-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 12px;
  background-color: var(--bx-bg);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-picker__value {
  font-size: 14px;
  color: var(--bx-text);
}

.bx-picker__placeholder {
  font-size: 14px;
  color: var(--bx-text-3);
}

.bx-picker__arrow {
  font-size: 18px;
  color: var(--bx-text-3);
}
</style>
