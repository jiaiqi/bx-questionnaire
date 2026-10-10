<script setup lang="ts">
/**
 * 题型分发器
 *
 * 与 `mapper.resolveWidget()` 的产出保持一一对应；
 * 未覆盖的题型给出明确提示，而不是静默丢题。
 */

import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { computed } from 'vue'
import BxAddressPicker from './BxAddressPicker.vue'
import BxDatePicker from './BxDatePicker.vue'
import BxImageField from './BxImageField.vue'
import BxOptionList from './BxOptionList.vue'
import BxQuestionItem from './BxQuestionItem.vue'
import BxRefSelector from './BxRefSelector.vue'
import BxTextField from './BxTextField.vue'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  error?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  error: '',
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [AnswerValue] }>()

const value = computed<AnswerValue>({
  get: () => props.modelValue,
  set: next => emit('update:modelValue', next),
})

const kind = computed(() => {
  switch (props.field.widget) {
    case 'radio':
    case 'checkbox':
      return 'options'
    case 'text':
    case 'textarea':
    case 'number':
      return 'text'
    case 'date':
    case 'time':
    case 'datetime':
      return 'date'
    case 'address':
      return 'address'
    case 'ref':
      return 'ref'
    case 'image':
      return 'image'
    default:
      return 'unsupported'
  }
})
</script>

<template>
  <BxQuestionItem :field="props.field" :error="props.error">
    <BxOptionList
      v-if="kind === 'options'"
      v-model="value"
      :field="props.field"
      :disabled="props.disabled"
    />
    <BxTextField
      v-else-if="kind === 'text'"
      v-model="value"
      :field="props.field"
      :disabled="props.disabled"
    />
    <BxDatePicker
      v-else-if="kind === 'date'"
      v-model="value"
      :field="props.field"
      :disabled="props.disabled"
    />
    <BxAddressPicker
      v-else-if="kind === 'address'"
      v-model="value"
      :field="props.field"
      :disabled="props.disabled"
    />
    <BxRefSelector
      v-else-if="kind === 'ref'"
      v-model="value"
      :field="props.field"
      :disabled="props.disabled"
    />
    <BxImageField
      v-else-if="kind === 'image'"
      v-model="value"
      :field="props.field"
      :disabled="props.disabled"
    />
    <view v-else class="bx-field-unsupported">
      <text class="bx-field-unsupported__text">
        该题型（{{ props.field.raw.item_type }}）暂未支持
      </text>
    </view>
  </BxQuestionItem>
</template>

<style lang="scss" scoped>
.bx-field-unsupported {
  padding: 10px 12px;
  background-color: var(--bx-bg);
  border: 1px dashed var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-field-unsupported__text {
  font-size: 13px;
  color: var(--bx-text-3);
}
</style>
