<script setup lang="ts">
/**
 * 二维码
 *
 * 用 `utils/qrcode` 生成 GIF data URL 后交给 `<image>` 渲染，因此 H5 与小程序
 * 共用同一套实现（小程序不支持 SVG，canvas 两端 API 又不一致）。
 *
 * 尺寸由 `size` 控制（正方形）；`value` 为空或内容超长时不渲染任何东西，
 * 避免页面上出现一个空白方块。
 *
 * 点图片可放大到全屏查看：列表页 / 封面上的二维码通常只有 110–130px，
 * 手机隔着屏幕扫码容易失败，放大后扫码成功率高得多。
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { toQrCodeDataUrl } from '@/utils/qrcode'

interface Props {
  /** 二维码内容（通常是问卷首页的绝对地址） */
  value: string
  /** 边长（px），默认 132 */
  size?: number
  /** 图注，渲染在二维码下方 */
  caption?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 132,
  caption: '',
})

const dataUrl = computed(() => toQrCodeDataUrl(props.value, { cellSize: 4, margin: 2 }))

/**
 * 图片加载失败兜底
 *
 * 生成结果是 GIF data URL。微信小程序官方支持 GIF 格式与 base64，但为防个别
 * 低版本基础库对 `data:image/gif` 前缀支持不全，加载失败时**整块不渲染**，
 * 而不是留一个破图或空白方块。
 */
const failed = ref(false)

/** 是否处于全屏放大态 */
const zoomed = ref(false)

watch(() => props.value, () => {
  failed.value = false
  // 内容变了（切换活动 / 换页）就把放大层收掉，避免展示上一张码
  zoomed.value = false
})

function openZoom(): void {
  zoomed.value = true
  // #ifdef H5
  setScrollLock(true)
  // #endif
}

function closeZoom(): void {
  zoomed.value = false
  // #ifdef H5
  setScrollLock(false)
  // #endif
}

/* #ifdef H5 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && zoomed.value) {
    event.preventDefault()
    closeZoom()
  }
}

/**
 * 锁底层页面滚动
 *
 * `@touchmove.stop.prevent` 只挡得住触摸滚动，桌面端是鼠标滚轮，得从根节点关掉
 * overflow 才彻底。放大层本身是 fixed，不受影响。
 */
function setScrollLock(locked: boolean): void {
  document.documentElement.style.overflow = locked ? 'hidden' : ''
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  // 组件在放大态被卸载时（例如切页）要把滚动恢复，否则整页再也滚不动
  setScrollLock(false)
})
/* #endif */
</script>

<template>
  <view v-if="dataUrl && !failed" class="bx-qr">
    <view
      class="bx-qr__trigger"
      role="button"
      tabindex="0"
      :aria-label="`${caption || '问卷二维码'}，点击放大查看`"
      @click="openZoom"
      @keydown.enter.prevent="openZoom"
      @keydown.space.prevent="openZoom"
    >
      <image
        class="bx-qr__img"
        :src="dataUrl"
        :style="{ width: `${size}px`, height: `${size}px` }"
        mode="aspectFit"
        :alt="caption || '问卷二维码'"
        @error="failed = true"
      />
    </view>
    <text v-if="caption" class="bx-qr__caption">{{ caption }}</text>

    <!--
      全屏放大层：点任意处关闭，并拦截 touchmove 防止底层页面跟着滚。
      用 top/right/bottom/left 而不是 `inset`，也不依赖 `min()` —— 小程序 WXSS 对这两者支持不全。
    -->
    <view
      v-if="zoomed"
      class="bx-qr__zoom"
      role="dialog"
      aria-modal="true"
      :aria-label="caption || '问卷二维码大图'"
      @click="closeZoom"
      @touchmove.stop.prevent
    >
      <image
        class="bx-qr__zoom-img"
        :src="dataUrl"
        mode="aspectFit"
        :alt="caption || '问卷二维码大图'"
      />
      <text class="bx-qr__zoom-tip">点击任意处关闭</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

/* 触发区：整块可点，视觉上仍只有图片本身 */
.bx-qr__trigger {
  display: flex;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
}

.bx-qr__trigger:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

/* 白底 + 细描边：二维码必须落在浅底上，否则暗色主题下反色会扫不出来 */
.bx-qr__img {
  display: block;
  padding: 8px;
  background-color: #fff;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.bx-qr__caption {
  display: block;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  text-align: center;
}

/* 放大层：固定全屏遮罩，给足扫码尺寸 */
.bx-qr__zoom {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--bx-z-modal, 1000);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  background-color: rgba(0, 0, 0, 0.74);
}

/* 大图：px 定尺寸 + vw 上限，窄屏自动收窄 */
.bx-qr__zoom-img {
  display: block;
  box-sizing: border-box;
  width: 300px;
  height: 300px;
  max-width: 78vw;
  max-height: 78vw;
  padding: 16px;
  background-color: #fff;
  border-radius: 12px;
}

.bx-qr__zoom-tip {
  display: block;
  font-size: 13px;
  line-height: 20px;
  color: rgba(255, 255, 255, 0.82);
  text-align: center;
}
</style>
