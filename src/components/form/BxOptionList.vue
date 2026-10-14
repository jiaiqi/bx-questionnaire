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

/*
 * 整行可点的选项
 *
 * 旧版是「18px 的裸圆点 + 一行文字」，既没有可点范围，也看不出选中状态。
 * 现在每个选项都是一条带描边的 48px 行：整行可点、悬停有反馈、选中态由
 * 底色 + 描边 + 标记三处同时表达（不只靠颜色，色觉障碍用户也能分辨）。
 */
.bx-option {
  display: flex;
  align-items: center;
  min-height: var(--bx-control-height);
  padding: 12px 14px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
  /* 可点击元素要有手型光标 */
  cursor: pointer;
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    border-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 相邻兄弟间距 8px：满足「触摸目标间距 ≥8px」的要求，也不用 :last-child 收尾 */
.bx-option + .bx-option {
  margin-top: 8px;
}

.bx-option--disabled {
  cursor: not-allowed;
  opacity: var(--bx-disabled-opacity);
}

/*
 * 焦点可见性：uni-app 内置样式把 outline 设成 none。用 :focus-visible 补回来，
 * 只在键盘聚焦时显示。`.bx-option` 本身就在 <uni-view> 上，不需要 :deep()。
 */
.bx-option:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.bx-option--hover {
  background-color: var(--bx-primary-soft);
  border-color: var(--bx-primary-line);
}

.bx-option--on {
  background-color: var(--bx-primary-soft);
  border-color: var(--bx-primary);
  /* 内阴影补足 1px：描边仍是 1px，选中态的边界更实，但不会撑开行高 */
  box-shadow: inset 0 0 0 1px var(--bx-primary);
}

.bx-option__mark {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 12px;
  background-color: var(--bx-surface);
  border: 1.5px solid var(--bx-text-4);
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    border-color var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-option__mark--dot {
  border-radius: 50%;
}

.bx-option__mark--box {
  border-radius: 6px;
}

.bx-option--on .bx-option__mark {
  background-color: var(--bx-primary);
  border-color: var(--bx-primary);
}

/* 单选：实心圆点落在蓝色底上，用白色而不是蓝色，避免「蓝底蓝点」糊成一团 */
.bx-option__mark--dot .bx-option__inner {
  width: 8px;
  height: 8px;
  background-color: #fff;
  border-radius: 50%;
}

/* 多选：白色对勾，用两条边框旋转而成（小程序不支持 <svg>） */
.bx-option__mark--box .bx-option__inner {
  position: relative;
  width: 12px;
  height: 12px;
}

.bx-option__mark--box .bx-option__inner::after {
  content: '';
  position: absolute;
  top: 0;
  left: 3px;
  width: 5px;
  height: 9px;
  border-right: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: rotate(45deg);
}

.bx-option__label {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--bx-text-2);
  word-break: break-all;
}

/* 选中只提字重与深度，不用彩色文字：长选项整行变蓝会显得吵 */
.bx-option--on .bx-option__label {
  font-weight: 500;
  color: var(--bx-text);
}

.bx-options__empty {
  padding: 12px 0;
}

.bx-options__empty-text {
  font-size: 13px;
  color: var(--bx-text-3);
}
</style>
