<script setup lang="ts">
/**
 * 分享面板（H5）
 *
 * 一个面板承担三件事：复制链接、系统分享（Web Share API）、分享海报。
 * 微信内置浏览器没有 Web Share，给「右上角菜单」引导；海报在面板内预览并可保存。
 *
 * 平台策略（docs/UI-UX-V6-设计系统.md §5/§6）：
 * - 入口在页面里用条件编译隐藏，本组件只在 H5 被渲染；
 * - 海报用 `uni.createCanvasContext` + `uni.canvasToTempFilePath` 绘制导出，
 *   这是 uni-app 的跨端写法（小程序端保留降级提示，不渲染保存按钮）；
 * - 画布按 DPR 放大导出（`destWidth/destHeight`），H5 的 hidpi 画布再保证故障级清晰度；
 * - 不用 `<svg>`、`color-mix`、`:has`；图标全部由 CSS 图形拼出。
 */

import type { PosterData } from './poster'

import { getCurrentInstance, nextTick, onUnmounted, ref, watch } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
import { useDialogFocus } from '@/composables/useDialogFocus'
import { useShare } from '@/composables/useShare'
import { toast } from '@/utils/ui'
import {
  POSTER_CTA_TEXT,
  POSTER_FOOT_TEXT,
  POSTER_HEIGHT,
  POSTER_INVITE_TEXT,
  POSTER_PADDING,
  POSTER_PALETTE,
  POSTER_WIDTH,
  posterFileName,
  wrapPosterText,
} from './poster'

interface Props {
  open: boolean
  /** 绝对分享链接（调用方用 `useShare().shareLink(route)` 生成） */
  url: string
  /** 系统分享用的标题 */
  title: string
  /** 有值时面板内提供海报预览与保存 */
  poster?: PosterData | null
}

const props = withDefaults(defineProps<Props>(), { poster: null })

const emit = defineEmits<{ close: [] }>()

const { isWechat, canNativeShare, copyLink, systemShare } = useShare()

const panelEl = ref<HTMLElement | null>(null)
const posterUrl = ref('')
const posterLoading = ref(false)
const posterError = ref('')

/**
 * 组件实例
 *
 * `uni.createCanvasContext(id, instance)` 需要它来做页面级隔离；
 * 必须在 setup 期间取 —— 在 draw 回调里调 `getCurrentInstance()` 会拿到 null。
 */
const componentInstance = getCurrentInstance()

const dialogFocus = useDialogFocus(panelEl, () => emit('close'))

function requestClose(): void {
  emit('close')
}

function onActivateKey(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  action()
}

async function onCopy(): Promise<void> {
  await copyLink(props.url)
}

async function onSystemShare(): Promise<void> {
  const result = await systemShare({
    title: props.title,
    text: '邀请你填写这份问卷',
    url: props.url,
  })
  if (result === 'fail') {
    toast('系统分享不可用，请复制链接发送')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      dialogFocus.activate()
      void nextTick().then(() => {
        dialogFocus.focusPanel()
        if (props.poster) {
          generatePoster()
        }
      })
    }
    else {
      dialogFocus.deactivate()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (props.open) {
    dialogFocus.deactivate()
  }
})

// ── 海报绘制（H5） ───────────────────────────────────────────────

/** 画布字体：canvas 读不到 CSS 变量，字族只能写死；中文由系统字体兜底 */
const POSTER_FONT = '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif'

/** 导出倍数：至少 2x，最多 3x（4x 以上的内存与体积收益很低） */
function posterDpr(): number {
  // #ifdef H5
  if (typeof window !== 'undefined') {
    return Math.min(3, Math.max(2, window.devicePixelRatio || 2))
  }
  // #endif
  return 2
}

// #ifdef H5
function fillRoundRect(
  ctx: UniNamespace.CanvasContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.arc(x + width - r, y + r, r, -Math.PI / 2, 0)
  ctx.lineTo(x + width, y + height - r)
  ctx.arc(x + width - r, y + height - r, r, 0, Math.PI / 2)
  ctx.lineTo(x + r, y + height)
  ctx.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + r)
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5)
  ctx.closePath()
  ctx.fill()
}

/**
 * 绘制海报
 *
 * 版式：品牌行 → 2 行标题 → 分数（或「已提交」）→ 合格标签 → 分隔线 →
 * 完成/生成时间 → 通栏 CTA → 页脚。所有尺寸都在 300×480 的设计空间里，
 * 导出时整体按 DPR 放大，绘制代码不需要感知 DPR。
 */
function drawPoster(ctx: UniNamespace.CanvasContext, data: PosterData): void {
  const width = POSTER_WIDTH
  const height = POSTER_HEIGHT
  const pad = POSTER_PADDING
  const contentWidth = width - pad * 2
  const palette = POSTER_PALETTE
  const measure = (text: string): number => ctx.measureText(text).width

  ctx.setFillStyle(palette.surface)
  ctx.fillRect(0, 0, width, height)

  // 顶部唯一强调色：4px 靛蓝细条
  ctx.setFillStyle(palette.primary)
  ctx.fillRect(0, 0, width, 4)

  // 品牌行
  ctx.setFillStyle(palette.primary)
  fillRoundRect(ctx, pad, 22, 20, 20, 6)
  ctx.setFillStyle(palette.surface)
  ctx.setTextAlign('center')
  ctx.setTextBaseline('middle')
  ctx.font = `600 11px ${POSTER_FONT}`
  ctx.fillText('问', pad + 10, 32.5)

  ctx.setTextAlign('left')
  ctx.setFillStyle(palette.ink3)
  ctx.font = `500 11px ${POSTER_FONT}`
  ctx.fillText('园区问卷', pad + 30, 32.5)
  ctx.setTextAlign('right')
  ctx.fillText('作答结果', width - pad, 32.5)

  // 标题：最多两行，超出以省略号收尾
  ctx.setTextAlign('left')
  ctx.setTextBaseline('top')
  ctx.setFillStyle(palette.ink)
  ctx.font = `600 20px ${POSTER_FONT}`
  const titleLines = wrapPosterText(data.title || '问卷', contentWidth, measure, 2)

  /**
   * 纵向排布：品牌行与 CTA 之间均匀留白
   *
   * 直接写死 y=64 时，短标题会在「时间」与 CTA 之间留下过半屏空白。
   * 这里按实际内容块高度把标题→时间整体居中到可用区域，长短标题都不会失衡。
   */
  const ctaY = height - 96
  const contentTop = 58
  const contentBottom = ctaY - 26
  const titleHeight = titleLines.length * 27
  const scoreHeight = data.score ? 76 : 42
  const levelHeight = data.level ? 32 : 0
  const contentHeight = titleHeight + 20 + scoreHeight + levelHeight + 36
  let y = Math.max(contentTop, contentTop + (contentBottom - contentTop - contentHeight) / 2)

  for (const line of titleLines) {
    ctx.fillText(line, pad, y)
    y += 27
  }

  y += 20

  if (data.score) {
    ctx.setFillStyle(palette.ink3)
    ctx.font = `500 11px ${POSTER_FONT}`
    ctx.fillText('你的得分', pad, y)
    y += 18

    ctx.setFillStyle(palette.ink)
    ctx.font = `600 46px ${POSTER_FONT}`
    ctx.fillText(data.score, pad, y)
    const scoreWidth = measure(data.score)
    ctx.setFillStyle(palette.ink3)
    ctx.font = `500 13px ${POSTER_FONT}`
    ctx.fillText(`/ ${data.total}`, pad + scoreWidth + 6, y + 28)
    y += 58
  }
  else {
    ctx.setFillStyle(palette.ink)
    ctx.font = `600 30px ${POSTER_FONT}`
    ctx.fillText('已提交', pad, y)
    y += 42
  }

  if (data.level) {
    ctx.font = `600 11px ${POSTER_FONT}`
    const levelWidth = measure(data.level)
    const pillHeight = 22
    const pillWidth = levelWidth + 20
    const tone = data.levelTone === 'fail'
      ? { bg: palette.dangerSoft, fg: palette.danger }
      : { bg: palette.successSoft, fg: palette.success }

    ctx.setFillStyle(tone.bg)
    fillRoundRect(ctx, pad, y, pillWidth, pillHeight, pillHeight / 2)
    ctx.setFillStyle(tone.fg)
    ctx.setTextBaseline('middle')
    ctx.fillText(data.level, pad + 10, y + pillHeight / 2 + 0.5)
    ctx.setTextBaseline('top')
    y += pillHeight + 10
  }

  // 分隔线 + 时间：解析不出完成时间时用「生成于」，不谎报
  y += 10
  ctx.setFillStyle(palette.line)
  ctx.fillRect(pad, y, contentWidth, 1)
  y += 14
  ctx.setFillStyle(palette.ink3)
  ctx.font = `500 11px ${POSTER_FONT}`
  ctx.fillText(data.timeText || '', pad, y)

  // 通栏 CTA
  ctx.setTextAlign('center')
  ctx.setFillStyle(palette.ink3)
  ctx.font = `500 11px ${POSTER_FONT}`
  ctx.fillText(POSTER_INVITE_TEXT, width / 2, ctaY - 16)

  ctx.setFillStyle(palette.primary)
  fillRoundRect(ctx, pad, ctaY, contentWidth, 44, 10)
  ctx.setFillStyle(palette.surface)
  ctx.font = `600 13px ${POSTER_FONT}`
  ctx.setTextBaseline('middle')
  ctx.fillText(POSTER_CTA_TEXT, width / 2, ctaY + 22)
  ctx.setTextBaseline('top')

  // 页脚
  ctx.setFillStyle(palette.ink3)
  ctx.font = `500 9px ${POSTER_FONT}`
  ctx.fillText(POSTER_FOOT_TEXT, width / 2, height - 30)
  ctx.setTextAlign('left')
}

function drawAndExport(): void {
  const ctx = uni.createCanvasContext('bx-share-poster', componentInstance?.proxy)
  const data = props.poster
  if (!data) {
    return
  }

  drawPoster(ctx, data)
  // #ifdef H5
  const dpr = posterDpr()
  ctx.draw(false, () => {
    uni.canvasToTempFilePath({
      canvasId: 'bx-share-poster',
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      destWidth: Math.round(POSTER_WIDTH * dpr),
      destHeight: Math.round(POSTER_HEIGHT * dpr),
      success: (result) => {
        posterUrl.value = result.tempFilePath
        posterLoading.value = false
      },
      fail: () => {
        posterLoading.value = false
        posterError.value = '海报生成失败，请稍后重试'
      },
    }, componentInstance?.proxy)
  })
  // #endif
}

function downloadPoster(): void {
  // #ifdef H5
  if (!posterUrl.value) {
    return
  }
  const link = document.createElement('a')
  link.href = posterUrl.value
  link.download = posterFileName(props.poster?.title || '作答结果')
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  toast('海报已保存，可在下载目录中查看')
  // #endif
}
// #endif

function generatePoster(): void {
  if (!props.poster) {
    return
  }
  posterLoading.value = true
  posterError.value = ''
  posterUrl.value = ''

  // #ifdef H5
  void nextTick().then(() => {
    drawAndExport()
  })
  return
  // #endif

  // #ifndef H5
  posterLoading.value = false
  posterError.value = '当前环境不支持下载海报，可截屏保存页面'
  // #endif
}

function onRetryKeydown(event: KeyboardEvent): void {
  onActivateKey(event, generatePoster)
}
</script>

<template>
  <view v-if="props.open" class="ss-layer">
    <view class="ss-scrim" @click="requestClose" />

    <view
      ref="panelEl"
      class="ss-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bx-share-title"
      tabindex="-1"
    >
      <view class="ss-grab" aria-hidden="true" />

      <view class="ss-head">
        <text id="bx-share-title" class="ss-title">分享</text>
        <view
          class="ss-close"
          role="button"
          tabindex="0"
          aria-label="关闭分享面板"
          @click="requestClose"
          @keydown="onActivateKey($event, requestClose)"
        >
          <view class="ss-close__icon" aria-hidden="true" />
        </view>
      </view>

      <!-- 微信内置浏览器：没有 Web Share，只引导用右上角菜单 -->
      <view v-if="isWechat" class="ss-note">
        <view class="ss-note__dots" aria-hidden="true">
          <view class="ss-note__dot" />
          <view class="ss-note__dot" />
          <view class="ss-note__dot" />
        </view>
        <text class="ss-note__text">
          在微信内请点右上角菜单，选择「发送给朋友」或「分享到朋友圈」。
        </text>
      </view>

      <view class="ss-actions">
        <view
          class="ss-action"
          role="button"
          tabindex="0"
          aria-label="复制分享链接"
          @click="onCopy"
          @keydown="onActivateKey($event, onCopy)"
        >
          <view class="ss-icon ss-icon--link" aria-hidden="true" />
          <view class="ss-action__main">
            <text class="ss-action__title">复制链接</text>
            <text class="ss-action__desc">粘贴到聊天或文档，对方点开即可作答</text>
          </view>
          <view class="ss-action__chev" aria-hidden="true" />
        </view>

        <view
          v-if="canNativeShare && !isWechat"
          class="ss-action"
          role="button"
          tabindex="0"
          aria-label="使用系统分享"
          @click="onSystemShare"
          @keydown="onActivateKey($event, onSystemShare)"
        >
          <view class="ss-icon ss-icon--share" aria-hidden="true">
            <view class="ss-share-dot ss-share-dot--top" />
            <view class="ss-share-dot ss-share-dot--bottom" />
            <view class="ss-share-dot ss-share-dot--right" />
            <view class="ss-share-line ss-share-line--top" />
            <view class="ss-share-line ss-share-line--bottom" />
          </view>
          <view class="ss-action__main">
            <text class="ss-action__title">系统分享</text>
            <text class="ss-action__desc">选择聊天工具、邮件或隔空投送</text>
          </view>
          <view class="ss-action__chev" aria-hidden="true" />
        </view>
      </view>

      <!-- 分享海报：有海报数据时在面板内生成、预览、保存 -->
      <view v-if="props.poster" class="ss-poster">
        <view class="ss-poster__head">
          <text class="ss-poster__title">分享海报</text>
          <text class="ss-poster__meta">含标题、得分与完成时间</text>
        </view>

        <view class="ss-poster__preview">
          <view v-if="posterLoading" class="ss-poster__loading" aria-busy="true">
            <view class="ss-poster__skeleton" />
            <text class="ss-poster__hint">正在生成海报…</text>
          </view>

          <image
            v-else-if="posterUrl"
            class="ss-poster__img"
            :src="posterUrl"
            mode="widthFix"
            alt="分享海报预览"
          />

          <view v-else class="ss-poster__error">
            <text class="ss-poster__hint">{{ posterError || '海报暂时无法生成' }}</text>
            <view
              class="ss-poster__retry"
              role="button"
              tabindex="0"
              @click="generatePoster"
              @keydown="onRetryKeydown"
            >
              重新生成
            </view>
          </view>
        </view>

        <!-- #ifdef H5 -->
        <view class="ss-poster__actions">
          <BxButton type="primary" block :disabled="!posterUrl" @click="downloadPoster">
            保存图片
          </BxButton>
          <text class="ss-poster__tip">海报不含账号、票据与二维码，可直接发到聊天。</text>
        </view>
        <!-- #endif -->

        <!-- #ifndef H5 -->
        <text class="ss-poster__tip">当前环境不支持下载海报，可截屏保存页面。</text>
        <!-- #endif -->
      </view>

      <text class="ss-foot">链接只包含问卷编号，不包含你的账号或票据</text>

      <!--
        离屏画布：尺寸固定 300×480，绘制坐标用设计尺寸；
        导出时通过 destWidth/destHeight 按 DPR 放大，画面清晰且不占面板布局。
      -->
      <canvas
        v-if="props.poster"
        id="bx-share-poster"
        canvas-id="bx-share-poster"
        class="ss-canvas"
        :style="{ width: `${POSTER_WIDTH}px`, height: `${POSTER_HEIGHT}px` }"
      />
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* ── 弹层 ───────────────────────────────────────────────────────── */
.ss-layer {
  position: fixed;
  inset: 0;
  z-index: var(--bx-z-overlay);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.ss-scrim {
  position: absolute;
  inset: 0;
  background-color: var(--bx-overlay);
  animation: ss-fade var(--bx-duration-base) var(--bx-ease-out);
}

.ss-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 8px 20px calc(20px + env(safe-area-inset-bottom));
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-bottom: 0;
  border-radius: var(--bx-radius-card) var(--bx-radius-card) 0 0;
  box-shadow: var(--bx-elev-3);
  animation: ss-up var(--bx-duration-base) var(--bx-ease-out);
}

/* 焦点环不能被裁：panel 自己可聚焦（tabindex=-1），只在键盘聚焦时给环 */
.ss-panel:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.ss-grab {
  flex: none;
  width: 36px;
  height: 4px;
  margin: 4px auto 0;
  border-radius: var(--bx-radius-pill);
  background-color: var(--bx-line-strong);
}

.ss-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 4px;
}

.ss-title {
  flex: 1;
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1.4;
  color: var(--bx-text);
}

.ss-close {
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .ss-close:hover {
    background-color: var(--bx-surface-2);
  }
}

.ss-close:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

/* 关闭图标：两根 45° 细线，不用文字符号 */
.ss-close__icon {
  position: relative;
  width: 16px;
  height: 16px;
}

.ss-close__icon::before,
.ss-close__icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 16px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: var(--bx-text-2);
  border-radius: 1px;
}

.ss-close__icon::before {
  transform: rotate(45deg);
}

.ss-close__icon::after {
  transform: rotate(-45deg);
}

/* ── 微信引导 ───────────────────────────────────────────────────── */
.ss-note {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  padding: 12px;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-md);
}

.ss-note__dots {
  display: flex;
  flex: none;
  align-items: center;
  gap: 3px;
  height: 18px;
  padding: 0 2px;
}

.ss-note__dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--bx-text-3);
}

.ss-note__text {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-caption);
  line-height: 1.7;
  color: var(--bx-text-2);
}

/* ── 动作行 ─────────────────────────────────────────────────────── */
.ss-actions {
  display: flex;
  flex-direction: column;
  margin-top: 8px;
}

.ss-action {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 8px 0;
  border-top: 1px solid var(--bx-line-2);
  cursor: pointer;
}

.ss-action:first-child {
  border-top: 0;
}

.ss-action:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
  border-radius: var(--bx-radius-sm);
}

@media (hover: hover) {
  .ss-action:hover .ss-action__title {
    color: var(--bx-primary);
  }
}

.ss-action__main {
  flex: 1;
  min-width: 0;
}

.ss-action__title {
  display: block;
  font-size: var(--bx-font-body);
  font-weight: 500;
  line-height: 1.5;
  color: var(--bx-text);
  transition: color var(--bx-duration-fast) var(--bx-ease-out);
}

.ss-action__desc {
  display: block;
  margin-top: 1px;
  font-size: var(--bx-font-caption);
  line-height: 1.6;
  color: var(--bx-text-3);
}

/* 行尾箭头：两条边框旋转，不用「›」文字符号 */
.ss-action__chev {
  flex: none;
  width: 7px;
  height: 7px;
  border-top: 1.5px solid var(--bx-text-3);
  border-right: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg);
}

/* 图标位：40×40 的浅底方块，图形由子元素绘制 */
.ss-icon {
  position: relative;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: var(--bx-radius);
  background-color: var(--bx-primary-soft);
  color: var(--bx-primary);
}

/* 链接图标：两个斜置的圆角环 */
.ss-icon--link::before,
.ss-icon--link::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 7px;
  border: 1.5px solid currentColor;
  border-radius: 4px;
}

.ss-icon--link::before {
  top: 13px;
  left: 11px;
  transform: rotate(-40deg);
}

.ss-icon--link::after {
  top: 20px;
  left: 17px;
  transform: rotate(-40deg);
}

/* 分享图标：三个圆点 + 两条斜线 */
.ss-share-dot {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: currentColor;
}

.ss-share-dot--top {
  top: 11px;
  left: 11px;
}

.ss-share-dot--bottom {
  bottom: 11px;
  left: 11px;
}

.ss-share-dot--right {
  top: 17px;
  right: 11px;
}

.ss-share-line {
  position: absolute;
  width: 9px;
  height: 1.5px;
  background-color: currentColor;
  border-radius: 1px;
  transform-origin: left center;
}

.ss-share-line--top {
  top: 14px;
  left: 16px;
  transform: rotate(-26deg);
}

.ss-share-line--bottom {
  top: 24px;
  left: 16px;
  transform: rotate(26deg);
}

/* ── 海报 ───────────────────────────────────────────────────────── */
.ss-poster {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--bx-line-2);
}

.ss-poster__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.ss-poster__title {
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-text);
}

.ss-poster__meta {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.ss-poster__preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 12px;
}

.ss-poster__img {
  width: 200px;
  height: auto;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
  box-shadow: var(--bx-elev-1);
}

.ss-poster__loading,
.ss-poster__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.ss-poster__skeleton {
  width: 200px;
  height: 320px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-sm);
}

.ss-poster__hint {
  font-size: var(--bx-font-caption);
  line-height: 1.7;
  color: var(--bx-text-3);
  text-align: center;
}

.ss-poster__retry {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 8px;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  color: var(--bx-primary);
  cursor: pointer;
}

.ss-poster__retry:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
  border-radius: var(--bx-radius-xs);
}

.ss-poster__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.ss-poster__tip {
  font-size: var(--bx-font-caption);
  line-height: 1.7;
  color: var(--bx-text-3);
  text-align: center;
}

/* 面板底部的隐私说明 */
.ss-foot {
  margin-top: 12px;
  font-size: var(--bx-font-caption);
  line-height: 1.6;
  color: var(--bx-text-3);
  text-align: center;
}

/* 离屏画布：保留尺寸以便测量与导出，但不参与布局、不可点 */
.ss-canvas {
  position: absolute;
  top: 0;
  left: -10000px;
  pointer-events: none;
  opacity: 0;
}

@keyframes ss-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes ss-up {
  from {
    transform: translateY(16px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
