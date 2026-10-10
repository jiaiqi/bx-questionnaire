<script setup lang="ts">
import type { QuestionField } from '@/domain/questionnaire'

interface Props {
  field: QuestionField
  /** 错误提示，非空时展示红框 */
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  error: '',
})
</script>

<template>
  <view :id="`q-${props.field.key}`" class="bx-question" :class="{ 'bx-question--error': !!props.error }">
    <view class="bx-question__head">
      <text class="bx-question__index">{{ props.field.index }}.</text>
      <text class="bx-question__title">{{ props.field.label }}</text>
      <text v-if="props.field.required" class="bx-question__required">*</text>
    </view>

    <text v-if="props.field.multi" class="bx-question__hint">多选题</text>

    <view class="bx-question__body">
      <slot />
    </view>

    <text v-if="props.error" class="bx-question__error">{{ props.error }}</text>
  </view>
</template>

<style lang="scss" scoped>
.bx-question {
  padding: 18px 16px;
  background-color: var(--bx-surface);
}

.bx-question--error {
  background-color: #fff5f5;
  box-shadow: inset 3px 0 0 var(--bx-danger);
}

.bx-question__head {
  display: flex;
  align-items: flex-start;
}

.bx-question__index {
  flex-shrink: 0;
  margin-right: 4px;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--bx-text);
}

.bx-question__title {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--bx-text);
  word-break: break-all;
}

.bx-question__required {
  flex-shrink: 0;
  margin-left: 4px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--bx-danger);
}

.bx-question__hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--bx-text-3);
}

.bx-question__body {
  margin-top: 14px;
}

.bx-question__error {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: var(--bx-danger);
}
</style>
