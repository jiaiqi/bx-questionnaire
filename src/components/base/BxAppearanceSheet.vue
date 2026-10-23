<script setup lang="ts">
/**
 * 外观设置面板（深色主题 / 字号）
 *
 * 只改偏好，不写业务状态。H5 立即生效；小程序端主题跟随系统，
 * 面板会明确说明，避免用户点了没反应却不知道为什么。
 */

import { nextTick, onBeforeUnmount, onMounted } from 'vue'

import {
  FONT_SCALE_OPTIONS,
  THEME_OPTIONS,
  useAppearance,
} from '@/composables/useAppearance'

const emit = defineEmits<{ close: [] }>()

const { theme, fontScale, setTheme, setFontScale } = useAppearance()

const PANEL_ID = 'bx-appearance-panel'

function close(): void {
  emit('close')
}

/* #ifdef H5 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

onMounted(() => {
  nextTick(() => {
    document.getElementById(PANEL_ID)?.focus()
  })
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
/* #endif */
</script>

<template>
  <view class="ap">
    <view class="ap__scrim" @click="close" />

    <view
      :id="PANEL_ID"
      class="ap__panel"
      role="dialog"
      aria-modal="true"
      aria-label="外观设置"
      tabindex="-1"
      @click.stop
    >
      <view class="ap__head">
        <text class="ap__title">外观</text>
        <view
          class="ap__close"
          role="button"
          tabindex="0"
          aria-label="关闭外观设置"
          @click="close"
          @keydown.enter.prevent="close"
        >
          <view class="ap__close-line ap__close-line--a" aria-hidden="true" />
          <view class="ap__close-line ap__close-line--b" aria-hidden="true" />
        </view>
      </view>

      <view class="ap__group">
        <text class="ap__label">主题</text>
        <view class="ap__options" role="group" aria-label="主题">
          <view
            v-for="option in THEME_OPTIONS"
            :key="option.value"
            class="ap__option"
            :class="{ 'is-active': theme === option.value }"
            role="button"
            tabindex="0"
            :aria-pressed="theme === option.value ? 'true' : 'false'"
            @click="setTheme(option.value)"
            @keydown.enter.prevent="setTheme(option.value)"
          >
            {{ option.label }}
          </view>
        </view>
      </view>

      <view class="ap__group">
        <text class="ap__label">字号</text>
        <view class="ap__options" role="group" aria-label="字号">
          <view
            v-for="option in FONT_SCALE_OPTIONS"
            :key="option.value"
            class="ap__option"
            :class="{ 'is-active': fontScale === option.value }"
            role="button"
            tabindex="0"
            :aria-pressed="fontScale === option.value ? 'true' : 'false'"
            @click="setFontScale(option.value)"
            @keydown.enter.prevent="setFontScale(option.value)"
          >
            {{ option.label }}
          </view>
        </view>
        <text class="ap__preview">预览：问卷标题与正文会一起放大，行高同步调整。</text>
      </view>

      <text class="ap__note">小程序端主题与字号跟随系统设置；网页端可在此自定义。</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ap {
  position: fixed;
  inset: 0;
  z-index: var(--bx-z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--bx-space-md);
}

.ap__scrim {
  position: absolute;
  inset: 0;
  background-color: var(--bx-overlay);
}

.ap__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--bx-space-lg);
  width: 360px;
  max-width: 100%;
  padding: 18px 20px 20px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-3);
  outline: none;
}

.ap__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ap__title {
  font-size: var(--bx-font-h2);
  font-weight: 600;
  color: var(--bx-text);
}

.ap__close {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
}

.ap__close:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.ap__close-line {
  position: absolute;
  width: 13px;
  height: 1.5px;
  background-color: var(--bx-text-2);
  border-radius: 1px;
}

.ap__close-line--a {
  transform: rotate(45deg);
}

.ap__close-line--b {
  transform: rotate(-45deg);
}

.ap__group {
  display: flex;
  flex-direction: column;
  gap: var(--bx-space-sm);
}

.ap__label {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
}

.ap__options {
  display: flex;
  gap: var(--bx-space-sm);
}

.ap__option {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  height: 40px;
  font-size: var(--bx-font-sub);
  color: var(--bx-text-2);
  cursor: pointer;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.ap__option.is-active {
  color: var(--bx-primary);
  background-color: var(--bx-primary-soft);
  border-color: var(--bx-primary-line);
}

.ap__option:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.ap__preview {
  font-size: var(--bx-font-caption);
  line-height: 1.6;
  color: var(--bx-text-3);
}

.ap__note {
  padding-top: var(--bx-space-sm);
  font-size: 11px;
  line-height: 1.6;
  color: var(--bx-text-4);
  border-top: 1px solid var(--bx-line-2);
}
</style>
