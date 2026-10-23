<script setup lang="ts">
/**
 * 顶部导航栏
 *
 * V2（规范 §6.1）：高 48px + 状态栏占位，标题 17/600 居中，
 * 返回键点击区 44×44，底部分隔线 `--bx-line`。
 *
 * H5 端允许半透明 + 毛玻璃（内容从栏下滑过时能看见层次）；
 * **小程序端不用 backdrop-filter** —— 微信基础库对它的支持不稳定，
 * 表现各机型不一，宁可给一块实色。
 */
interface Props {
  title?: string
  showBack?: boolean
  /** 右侧插槽占位高度，避免标题偏移 */
  border?: boolean
  /**
   * 页面栈为空时的兜底跳转地址
   *
   * 从分享链接 / 扫码直接打开时页面栈只有 1 层，`navigateBack()` 无处可回，
   * 需要一个兜底页面。**必须由调用方显式给出** —— 这里曾写死
   * `/pages/questionnaire/cover/index`，但封面页要求 `activity_no`，
   * 直接 reLaunch 过去会把用户送到「缺少活动编号」错误页，比不跳更糟。
   */
  fallbackUrl?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  showBack: true,
  border: true,
  fallbackUrl: '',
})

function goBack(): void {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  // 没给兜底地址就不跳：宁可返回键不生效，也不要猜一个缺参数的地址把用户送进错误页
  if (props.fallbackUrl) {
    uni.reLaunch({ url: props.fallbackUrl })
  }
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
        <!--
          返回箭头用 CSS 边框画，不用「‹」文字符号：文字符号的字形随系统字体变化，
          在 iOS / Android / 微信 PC 端粗细与角度都不一致。
          也不用 <svg>：微信小程序不支持该标签（详见 BxEmpty 的同一处说明）。
        -->
        <view class="bx-navbar__arrow" aria-hidden="true" />
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
  z-index: var(--bx-z-sticky);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--bx-navbar-height);
  padding-top: var(--status-bar-height, 0);
  background-color: var(--bx-surface);
}

/*
 * H5：半透明 + 毛玻璃
 *
 * 规范 §6.1 给的色值是 `#FFFFFFE6`（白 90% 不透明）—— 半透明只做在 H5，
 * 小程序端保持上面的实色 `--bx-surface`。
 */
/* #ifdef H5 */
.bx-navbar {
  background-color: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* #endif */

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

/* 44px：图标只有 10px，但点击区必须够大 —— 返回是最高频的误触位 */
.bx-navbar__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 悬停反馈只给指针设备（规范 §5.3） */
@media (hover: hover) {
  .bx-navbar__back:hover {
    background-color: var(--bx-surface-2);
  }
}

/* 焦点可见性：uni-app 内置样式把 outline 设成 none */
.bx-navbar__back:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.bx-navbar__arrow {
  width: 10px;
  height: 10px;
  /* 视觉居中：旋转后的箭头在几何上会偏右，左移一点才落在正中 */
  margin-left: 3px;
  border-bottom: 2px solid var(--bx-text);
  border-left: 2px solid var(--bx-text);
  transform: rotate(45deg);
}

.bx-navbar__title {
  flex: 1;
  overflow: hidden;
  font-size: var(--bx-font-body);
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: -0.01em;
  color: var(--bx-text);
  text-align: center;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
