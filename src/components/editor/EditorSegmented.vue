<script setup lang="ts">
/**
 * 分段选择器
 *
 * 用于 2~4 个取值的短枚举（必填、单选/多选、得分策略、展示方式…）。
 * 刻意不用 `<picker>`：这些枚举项都很少，直接铺开比「点开—滚动—确定」快得多，
 * 而且在 PC 上不需要额外一次点击。取值一律来自平台元数据的枚举，
 * 不做自由输入 —— 自由输入必然产生平台不接受的脏值。
 */

interface Option {
  label: string
  value: string
}

interface Props {
  modelValue: string
  options: Option[]
}

const props = defineProps<Props>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <view class="bx-seg">
    <view
      v-for="option in props.options"
      :key="option.value"
      class="bx-seg__item"
      :class="{ 'bx-seg__item--on': option.value === props.modelValue }"
      role="button"
      tabindex="0"
      :aria-label="option.label"
      :aria-pressed="option.value === props.modelValue"
      @click="emit('update:modelValue', option.value)"
      @keydown.enter.prevent="emit('update:modelValue', option.value)"
    >
      <text class="bx-seg__text">{{ option.label }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-seg {
  display: flex;
  flex-wrap: wrap;
  margin: -3px;
}

.bx-seg__item {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  margin: 3px;
  padding: 0 12px;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
  background-color: var(--bx-surface);
}

.bx-seg__item--on {
  border-color: var(--bx-blue);
  background-color: var(--bx-blue-soft);
}

.bx-seg__text {
  font-size: 13px;
  color: var(--bx-text-2);
}

.bx-seg__item--on .bx-seg__text {
  color: var(--bx-blue);
  font-weight: 500;
}
</style>
