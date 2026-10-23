<script setup lang="ts">
/**
 * 时间日期选择
 *
 * 老工程把 `dateType` 直接当作低代码表单组件的 type（`date` / `time` / `datetime`），
 * 由组件库处理三种模式。新工程用 uni 原生 `<picker>`，而它**没有 datetime 模式**，
 * 因此这里对 `datetime` 用「日期 + 时间」两个 picker 组合，避免退化成只能选日期。
 *
 * 同时限制可选年份：uni 的日期 picker 默认从 1876 年开始，选生日要滚很久。
 *
 * V6（设计系统 §5.2）：与其它输入类同款 —— 白底 + 1px `--bx-line` 描边 +
 * 10px 圆角 + 44px 高；悬停描边强一档，禁用回落到浅面。
 */

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

const isTime = computed(() => props.field.widget === 'time')
const isDatetime = computed(() => props.field.widget === 'datetime')

/** datetime 的值形态为「YYYY-MM-DD HH:mm」，拆成两段分别给两个 picker */
const datePart = computed(() => text.value.slice(0, 10))
const timePart = computed(() => text.value.slice(11, 16))

/** 年份范围：不设的话 uni 默认从 1876 年开始 */
const DATE_START = '1900-01-01'
const DATE_END = '2100-12-31'

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function onDateChange(event: { detail: { value: string } }): void {
  emitValue(event.detail.value, 'date')
}

function onTimeChange(event: { detail: { value: string } }): void {
  emitValue(event.detail.value, 'time')
}

/** 非 datetime 模式下两个 picker 的取值语义相同，直接透传 */
function emitValue(next: string, part: 'date' | 'time'): void {
  if (!isDatetime.value) {
    emit('update:modelValue', next)
    return
  }
  emit(
    'update:modelValue',
    part === 'date'
      ? `${next} ${timePart.value || '00:00'}`
      : `${datePart.value || today()} ${next}`,
  )
}
</script>

<template>
  <!-- datetime：日期 + 时间两个 picker，拼接成「YYYY-MM-DD HH:mm」 -->
  <view v-if="isDatetime" class="bx-picker-row">
    <picker
      mode="date"
      :value="datePart"
      :start="DATE_START"
      :end="DATE_END"
      :disabled="props.disabled"
      @change="onDateChange"
    >
      <view class="bx-picker" :class="{ 'bx-picker--disabled': props.disabled }">
        <text :class="datePart ? 'bx-picker__value' : 'bx-picker__placeholder'">
          {{ datePart || '请选择日期' }}
        </text>
        <view class="bx-picker__arrow" aria-hidden="true" />
      </view>
    </picker>

    <picker
      mode="time"
      :value="timePart"
      :disabled="props.disabled"
      @change="onTimeChange"
    >
      <view class="bx-picker" :class="{ 'bx-picker--disabled': props.disabled }">
        <text :class="timePart ? 'bx-picker__value' : 'bx-picker__placeholder'">
          {{ timePart || '请选择时间' }}
        </text>
        <view class="bx-picker__arrow" aria-hidden="true" />
      </view>
    </picker>
  </view>

  <picker
    v-else
    :mode="isTime ? 'time' : 'date'"
    :value="text"
    :start="DATE_START"
    :end="DATE_END"
    :disabled="props.disabled"
    @change="onDateChange"
  >
    <view class="bx-picker" :class="{ 'bx-picker--disabled': props.disabled }">
      <text :class="text ? 'bx-picker__value' : 'bx-picker__placeholder'">
        {{ text || (isTime ? '请选择时间' : '请选择日期') }}
      </text>
      <view class="bx-picker__arrow" aria-hidden="true" />
    </view>
  </picker>
</template>

<style lang="scss" scoped>
.bx-picker-row {
  display: flex;
  gap: var(--bx-space-sm);
}

.bx-picker-row .bx-picker {
  flex: 1;
}

/* 与 BxTextField 同一套输入规范：白底 + 1px 描边 + 10px 圆角 + 44px 高（V6 §5.2） */
.bx-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: var(--bx-control-height-md);
  padding: 0 12px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    background-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 悬停只加强描边，不给浅灰底：与「禁用」的浅面对比开，避免误读 */
@media (hover: hover) {
  .bx-picker:hover {
    border-color: var(--bx-line-strong);
  }
}

/* 禁用：内嵌浅面 + 保留描边，边界仍可见 */
.bx-picker--disabled {
  cursor: not-allowed;
  background-color: var(--bx-surface-2);
  border-color: var(--bx-line);
}

.bx-picker__value {
  font-size: var(--bx-font-body);
  line-height: 1.4;
  color: var(--bx-text);
}

.bx-picker__placeholder {
  font-size: var(--bx-font-body);
  line-height: 1.4;
  /* 占位符色只做提示，不承载信息（V6 §2.1） */
  color: var(--bx-text-4);
}

.bx-picker--disabled .bx-picker__value,
.bx-picker--disabled .bx-picker__placeholder {
  color: var(--bx-text-3);
}

/*
 * 右向箭头用两条边框旋转绘制，不用「›」文字符号：
 * 文字符号的字形随系统字体变化（iOS / Android / 微信 PC 端粗细与角度都不同），
 * 而 <svg> 在微信小程序里不被支持。
 */
.bx-picker__arrow {
  flex: none;
  width: 8px;
  height: 8px;
  margin-left: 10px;
  border-top: 1.5px solid var(--bx-text-3);
  border-right: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg);
}
</style>
