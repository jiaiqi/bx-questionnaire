<script setup lang="ts">
/**
 * 二维码
 *
 * 用 `utils/qrcode` 生成 GIF data URL 后交给 `<image>` 渲染，因此 H5 与小程序
 * 共用同一套实现（小程序不支持 SVG，canvas 两端 API 又不一致）。
 *
 * 尺寸由 `size` 控制（正方形）；`value` 为空或内容超长时不渲染任何东西，
 * 避免页面上出现一个空白方块。
 */

import { computed, ref, watch } from 'vue'

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

watch(() => props.value, () => {
  failed.value = false
})
</script>

<template>
  <view v-if="dataUrl && !failed" class="bx-qr">
    <image
      class="bx-qr__img"
      :src="dataUrl"
      :style="{ width: `${size}px`, height: `${size}px` }"
      mode="aspectFit"
      :alt="caption || '问卷二维码'"
      @error="failed = true"
    />
    <text v-if="caption" class="bx-qr__caption">{{ caption }}</text>
  </view>
</template>

<style lang="scss" scoped>
.bx-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
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
</style>
