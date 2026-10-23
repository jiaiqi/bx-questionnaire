<script setup lang="ts">
/**
 * 表单字段外壳：标签 + 必填星号 + 内容 + 错误/提示
 *
 * 抽出来的理由是**错误态只有一处实现**：如果每个字段各自决定怎么显示错误，
 * 迟早会出现「有的字段红字提示、有的字段只变个边框」，用户就得学会两套暗示。
 * 这里保证所有字段的报错位置与样式一致。
 *
 * 字段间距 16px、分组标题 12/600（规范 §7.6）。
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
  /* 字段之间 16px（规范 §7.6） */
  margin-bottom: 16px;
}

.bx-efield__head {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

/* 字段标签：12 / 500，次要墨色（V6 管理端密度） */
.bx-efield__label {
  color: var(--bx-text-2);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

/* 必填星号紧跟标签，红色 */
.bx-efield__req {
  margin-left: 3px;
  color: var(--bx-danger);
  font-size: 12px;
  line-height: 18px;
}

.bx-efield__error {
  margin-top: 6px;
  color: var(--bx-danger);
  font-size: 12px;
  line-height: 18px;
}

/* 提示：12px 是 --bx-text-3 可用的下限，不再往下压 */
.bx-efield__hint {
  margin-top: 6px;
  color: var(--bx-text-3);
  font-size: 12px;
  line-height: 18px;
}
</style>
