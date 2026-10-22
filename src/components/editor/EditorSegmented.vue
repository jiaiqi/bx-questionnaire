<script setup lang="ts">
/**
 * 分段选择器
 *
 * 用于 2~4 个取值的短枚举（必填、单选/多选、得分策略、展示方式…）。
 * 刻意不用 `<picker>`：这些枚举项都很少，直接铺开比「点开—滚动—确定」快得多，
 * 而且在 PC 上不需要额外一次点击。取值一律来自平台元数据的枚举，
 * 不做自由输入 —— 自由输入必然产生平台不接受的脏值。
 *
 * 版式是**一段连续的控件**而不是一排药丸：外框是一个浅底槽，选中项是一块
 * 抬起来的白片（规范 §6 的控件语言）。药丸排布在选项变多时会散成一地。
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
/* 槽：浅底 + 1px 描边，选中项是槽里的一块白片 */
.bx-seg {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.bx-seg__item {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  cursor: pointer;
  border-radius: var(--bx-radius-xs);
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 悬停反馈只给指针设备（触屏端没有悬停态） */
@media (hover: hover) {
  .bx-seg__item:hover {
    background-color: var(--bx-line-2);
  }
}

/* 选中：白片 + 极轻阴影（抬起来一点点，不是浮起来一大截） */
.bx-seg__item--on {
  background-color: var(--bx-surface);
  box-shadow: var(--bx-elev-1);
}

@media (hover: hover) {
  .bx-seg__item--on:hover {
    background-color: var(--bx-surface);
  }
}

.bx-seg__item:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.bx-seg__text {
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-text-2);
}

.bx-seg__item--on .bx-seg__text {
  color: var(--bx-primary);
  font-weight: 500;
}
</style>
