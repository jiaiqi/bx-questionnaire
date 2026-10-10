<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  type?: 'primary' | 'ghost' | 'text'
  size?: 'normal' | 'small'
  block?: boolean
  disabled?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'primary',
  size: 'normal',
  block: false,
  disabled: false,
  loading: false,
})

const emit = defineEmits<{ click: [] }>()

const inactive = computed(() => props.disabled || props.loading)

function onClick(): void {
  if (inactive.value) {
    return
  }
  emit('click')
}

/**
 * 键盘激活
 *
 * 用 <view> 渲染的按钮天然不可聚焦（实测 tabIndex=-1、role 为空），键盘用户
 * 根本到不了 —— 连提交问卷都做不到。这里补齐：
 *   - role="button" 让屏幕阅读器认出这是按钮
 *   - tabindex 让它进入 Tab 序列（禁用时移出，避免停在不可用的控件上）
 *   - Enter / Space 激活，符合按钮的键盘约定
 *
 * Space 要 preventDefault，否则页面会滚动。小程序端没有 DOM 键盘事件，
 * 这几个属性和事件由 uni-app 忽略或转译，不影响小程序。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  // Space 默认会滚动页面，Enter 在表单里可能触发提交
  event.preventDefault()
  onClick()
}
</script>

<template>
  <view
    class="bx-button"
    :class="[
      `bx-button--${props.type}`,
      `bx-button--${props.size}`,
      { 'bx-button--block': props.block, 'bx-button--disabled': inactive },
    ]"
    role="button"
    :tabindex="inactive ? -1 : 0"
    :aria-disabled="inactive ? 'true' : 'false'"
    :aria-busy="props.loading ? 'true' : 'false'"
    hover-class="bx-button--hover"
    :hover-stay-time="60"
    @click="onClick"
    @keydown="onKeydown"
  >
    <text v-if="props.loading" class="bx-button__loading">···</text>
    <slot />
  </view>
</template>

<style lang="scss" scoped>
.bx-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 18px;
  font-size: 15px;
  font-weight: 500;
  border-radius: var(--bx-radius);
  /* 可点击元素要有手型光标，否则用户看不出它能点（实测原来是 auto） */
  cursor: pointer;
}

.bx-button--disabled {
  cursor: not-allowed;
}

/*
 * 焦点可见性：uni-app 内置样式把 outline 设成 none。用 :focus-visible 补回来，
 * 只在键盘聚焦时显示。注意选择器要落到 uni-app 真正渲染出的元素上 —— 这里
 * `.bx-button` 本身就在 <uni-view> 上，不需要 :deep()。
 */
.bx-button:focus-visible {
  outline: 2px solid var(--bx-blue);
  outline-offset: 2px;
}

.bx-button--block {
  width: 100%;
}

.bx-button--small {
  height: 36px;
  padding: 0 14px;
  font-size: 14px;
}

.bx-button--primary {
  color: #fff;
  background-color: var(--bx-blue);
}

.bx-button--ghost {
  color: var(--bx-text);
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
}

.bx-button--text {
  height: auto;
  padding: 0;
  color: var(--bx-blue);
  background-color: transparent;
}

.bx-button--hover {
  opacity: 0.86;
}

.bx-button--disabled {
  opacity: 0.45;
}

.bx-button__loading {
  margin-right: 6px;
  letter-spacing: 1px;
}
</style>
