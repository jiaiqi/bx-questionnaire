<script setup lang="ts">
import type { QuestionField } from '@/domain/questionnaire'

import { computed } from 'vue'

interface Props {
  field: QuestionField
  /** 错误提示，非空时展示红框 */
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  error: '',
})

/**
 * 题目文案
 *
 * 后端 `item_title` 通常自带序号（如「1. 单选题：你更喜欢哪种沟通方式？」），
 * 再拼一次 field.index 会渲染成「1. 1. 单选题：…」。老工程直接使用 item_title，
 * 这里对已带序号的标题原样使用，仅在确实没有序号时才补上。
 */
const title = computed(() => {
  const label = String(props.field.label ?? '').trim()
  if (!label) {
    return `${props.field.index}.`
  }
  return /^\d+\s*[.、)）]/.test(label) ? label : `${props.field.index}. ${label}`
})
</script>

<template>
  <view :id="`q-${props.field.key}`" class="bx-question" :class="{ 'bx-question--error': !!props.error }">
    <view class="bx-question__head">
      <text class="bx-question__title">{{ title }}</text>
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
