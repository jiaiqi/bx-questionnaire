<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  type?: 'primary' | 'ghost' | 'text' | 'danger'
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
    <!--
      加载态用真 spinner 而不是「···」：三个点读起来像「省略」，而且宽度会跳。
      文案保留在插槽里，只多出一个 16px 的环，按钮宽度不抖。
    -->
    <view v-if="props.loading" class="bx-button__loading" aria-hidden="true" />
    <slot />
  </view>
</template>

<style lang="scss" scoped>
.bx-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--bx-control-height);
  padding: 0 20px;
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  /* 所有变体都带同宽的透明边框：primary 与 ghost 的盒模型一致，并排时不差 1px */
  border: 1px solid transparent;
  border-radius: var(--bx-radius);
  /* 可点击元素要有手型光标，否则用户看不出它能点（实测原来是 auto） */
  cursor: pointer;
  transition:
    background-color var(--bx-duration-base) var(--bx-ease-out),
    border-color var(--bx-duration-base) var(--bx-ease-out),
    color var(--bx-duration-base) var(--bx-ease-out),
    opacity var(--bx-duration-base) var(--bx-ease-out);
}

/*
 * 焦点可见性：uni-app 内置样式把 outline 设成 none。用 :focus-visible 补回来，
 * 只在键盘聚焦时显示。注意选择器要落到 uni-app 真正渲染出的元素上 —— 这里
 * `.bx-button` 本身就在 <uni-view> 上，不需要 :deep()。
 */
.bx-button:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.bx-button--block {
  width: 100%;
}

.bx-button--small {
  height: var(--bx-control-height-sm);
  padding: 0 12px;
  font-size: 13px;
  border-radius: var(--bx-radius-sm);
}

.bx-button--primary {
  color: #fff;
  background-color: var(--bx-primary);
}

.bx-button--ghost {
  color: var(--bx-text-2);
  background-color: var(--bx-surface);
  border-color: var(--bx-line);
}

.bx-button--danger {
  color: var(--bx-danger);
  background-color: var(--bx-surface);
  border-color: var(--bx-danger-line);
}

.bx-button--text {
  height: auto;
  padding: 0;
  color: var(--bx-primary);
  background-color: transparent;
}

/*
 * 按下反馈
 *
 * hover-class 在小程序端是「按住」态，在 H5 端是鼠标悬停 —— 两端共用同一个类。
 * 统一改背景/描边而不是整体 opacity：半透明会让白字压在蓝底上显脏。
 */
.bx-button--hover {
  opacity: 0.9;
}

.bx-button--primary.bx-button--hover {
  background-color: var(--bx-primary-hover);
  opacity: 1;
}

.bx-button--ghost.bx-button--hover {
  color: var(--bx-primary);
  background-color: var(--bx-primary-soft);
  border-color: var(--bx-primary-line);
  opacity: 1;
}

.bx-button--danger.bx-button--hover {
  background-color: var(--bx-danger-soft);
  opacity: 1;
}

.bx-button--text.bx-button--hover {
  background-color: var(--bx-primary-soft);
  opacity: 1;
}

.bx-button--disabled {
  cursor: not-allowed;
  opacity: var(--bx-disabled-opacity);
}

.bx-button__loading {
  flex: none;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: bx-button-spin 700ms linear infinite;
}

/* 浅底按钮上的转环要换成深色，否则白环压在白底上完全看不见 */
.bx-button--ghost .bx-button__loading,
.bx-button--danger .bx-button__loading,
.bx-button--text .bx-button__loading {
  border-color: var(--bx-line);
  border-top-color: currentColor;
}

@keyframes bx-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
