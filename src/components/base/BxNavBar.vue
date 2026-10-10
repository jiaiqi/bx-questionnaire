<script setup lang="ts">
interface Props {
  title?: string
  showBack?: boolean
  /** 右侧插槽占位高度，避免标题偏移 */
  border?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  showBack: true,
  border: true,
})

function goBack(): void {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.reLaunch({ url: '/pages/questionnaire/cover/index' })
}

/**
 * 键盘激活
 *
 * 返回键用 <view> 渲染，天然不可聚焦 —— 键盘用户无法返回上一页。
 * 与 BxButton / BxOptionList 是同一类问题，扫描时一并修掉。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  goBack()
}
</script>

<template>
  <view class="bx-navbar" :class="{ 'bx-navbar--border': props.border }">
    <view class="bx-navbar__side">
      <view
        v-if="props.showBack"
        class="bx-navbar__back"
        role="button"
        aria-label="返回"
        tabindex="0"
        @click="goBack"
        @keydown="onKeydown"
      >
        <text class="bx-navbar__arrow">‹</text>
      </view>
    </view>
    <text class="bx-navbar__title">{{ props.title }}</text>
    <view class="bx-navbar__side bx-navbar__side--right">
      <slot name="extra" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-navbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding-top: var(--status-bar-height, 0);
  background-color: var(--bx-surface);
}

.bx-navbar--border {
  border-bottom: 1px solid var(--bx-line-2);
}

.bx-navbar__side {
  display: flex;
  align-items: center;
  min-width: 60px;
}

.bx-navbar__side--right {
  justify-content: flex-end;
}

.bx-navbar__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  cursor: pointer;
  border-radius: var(--bx-radius);
}

/* 焦点可见性：uni-app 内置样式把 outline 设成 none */
.bx-navbar__back:focus-visible {
  outline: 2px solid var(--bx-blue);
  outline-offset: -2px;
}

.bx-navbar__arrow {
  font-size: 26px;
  line-height: 1;
  color: var(--bx-text);
}

.bx-navbar__title {
  flex: 1;
  overflow: hidden;
  font-size: 16px;
  font-weight: 500;
  color: var(--bx-text);
  text-align: center;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
