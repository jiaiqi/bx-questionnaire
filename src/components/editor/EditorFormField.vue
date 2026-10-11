<script setup lang="ts">
/**
 * 表单字段外壳：标签 + 必填星号 + 内容 + 错误/提示
 *
 * 抽出来的理由是**错误态只有一处实现**：如果每个字段各自决定怎么显示错误，
 * 迟早会出现「有的字段红字提示、有的字段只变个边框」，用户就得学会两套暗示。
 * 这里保证所有字段的报错位置与样式一致。
 */

interface Props {
  label: string
  required?: boolean
  /** 校验错误（有值时优先显示，并替换提示） */
  error?: string
  /** 无错误时的灰色说明 */
  hint?: string
}

const props = withDefaults(defineProps<Props>(), {
  required: false,
  error: '',
  hint: '',
})
</script>

<template>
  <view class="bx-efield">
    <view class="bx-efield__head">
      <text class="bx-efield__label">{{ props.label }}</text>
      <text v-if="props.required" class="bx-efield__req">*</text>
    </view>
    <slot />
    <text v-if="props.error" class="bx-efield__error">{{ props.error }}</text>
    <text v-else-if="props.hint" class="bx-efield__hint">{{ props.hint }}</text>
  </view>
</template>

<style lang="scss" scoped>
.bx-efield {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}

.bx-efield__head {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.bx-efield__label {
  font-size: 13px;
  color: var(--bx-text-2);
}

.bx-efield__req {
  margin-left: 3px;
  font-size: 13px;
  color: var(--bx-danger);
}

.bx-efield__error {
  margin-top: 5px;
  font-size: 12px;
  color: var(--bx-danger);
}

.bx-efield__hint {
  margin-top: 5px;
  font-size: 12px;
  color: var(--bx-text-3);
}
</style>
