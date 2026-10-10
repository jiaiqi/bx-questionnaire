<script setup lang="ts">
import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { toArray } from '@/domain/questionnaire'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [AnswerValue] }>()

function isSelected(optionNo: string): boolean {
  return toArray(props.modelValue).includes(optionNo)
}

function toggle(optionNo: string): void {
  if (props.disabled) {
    return
  }

  if (props.field.multi) {
    const current = toArray(props.modelValue)
    const next = current.includes(optionNo)
      ? current.filter(no => no !== optionNo)
      : [...current, optionNo]
    emit('update:modelValue', next)
    return
  }

  // 单选再次点击不取消，避免产生空作答
  emit('update:modelValue', optionNo)
}

/**
 * 键盘激活
 *
 * 选项用 <view> 渲染，天然不可聚焦（与 BxButton 同一类问题）。问卷的**核心
 * 操作就是选选项**，键盘用户够不到就等于无法答题。
 *
 * 用 Enter / Space 激活，符合 radio 与 checkbox 的键盘约定。Space 要
 * preventDefault，否则页面会滚动。
 */
function onKeydown(event: KeyboardEvent, optionNo: string): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  toggle(optionNo)
}
</script>

<template>
  <view
    class="bx-options"
    :role="props.field.multi ? 'group' : 'radiogroup'"
    :aria-label="props.field.label"
  >
    <view
      v-for="option in props.field.options"
      :key="option.no"
      class="bx-option"
      :class="{ 'bx-option--on': isSelected(option.no), 'bx-option--disabled': props.disabled }"
      :role="props.field.multi ? 'checkbox' : 'radio'"
      :aria-checked="isSelected(option.no) ? 'true' : 'false'"
      :aria-disabled="props.disabled ? 'true' : 'false'"
      :tabindex="props.disabled ? -1 : 0"
      hover-class="bx-option--hover"
      :hover-stay-time="60"
      @click="toggle(option.no)"
      @keydown="onKeydown($event, option.no)"
    >
      <view class="bx-option__mark" :class="props.field.multi ? 'bx-option__mark--box' : 'bx-option__mark--dot'">
        <view v-if="isSelected(option.no)" class="bx-option__inner" />
      </view>
      <text class="bx-option__label">{{ option.label }}</text>
    </view>

    <view v-if="props.field.options.length === 0" class="bx-options__empty">
      <text class="bx-options__empty-text">该题暂无可选项</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-options {
  display: flex;
  flex-direction: column;
}

.bx-option {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 8px 10px;
  margin-bottom: 2px;
  border: 1px solid transparent;
  border-radius: var(--bx-radius);
  /* 可点击元素要有手型光标 */
  cursor: pointer;
}

.bx-option--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/*
 * 焦点可见性：uni-app 内置样式把 outline 设成 none。用 :focus-visible 补回来，
 * 只在键盘聚焦时显示。`.bx-option` 本身就在 <uni-view> 上，不需要 :deep()。
 */
.bx-option:focus-visible {
  outline: 2px solid var(--bx-blue);
  outline-offset: 1px;
}

.bx-option--hover {
  background-color: var(--bx-line-2);
}

.bx-option--on {
  background-color: var(--bx-blue-soft);
  border-color: var(--bx-blue);
}

.bx-option__mark {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 10px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
}

.bx-option__mark--dot {
  border-radius: 50%;
}

.bx-option__mark--box {
  border-radius: 4px;
}

.bx-option--on .bx-option__mark {
  border-color: var(--bx-blue);
}

.bx-option__inner {
  width: 10px;
  height: 10px;
  background-color: var(--bx-blue);
  border-radius: 50%;
}

.bx-option__mark--box .bx-option__inner {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.bx-option__label {
  flex: 1;
  font-size: 14px;
  line-height: 1.6;
  color: var(--bx-text);
  word-break: break-all;
}

.bx-option--on .bx-option__label {
  color: var(--bx-blue);
}

.bx-options__empty {
  padding: 12px 0;
}

.bx-options__empty-text {
  font-size: 13px;
  color: var(--bx-text-3);
}
</style>
