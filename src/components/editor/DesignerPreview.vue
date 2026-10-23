<script setup lang="ts">
/**
 * 设计器 · 手机实时预览
 *
 * 目的：改题时立刻看到「作答者会看到什么」，不用保存、不用跳页。
 * 与「打开真实作答页」的区别：
 * - 这里预览的是**当前草稿**（含未保存的修改），所以不依赖活动编号；
 * - 只做版式检查，不提交数据、不触发校验。
 *
 * 跨端约束：不用 `<svg>`（小程序不支持），箭头/对勾用 CSS 画；
 * 单位统一 px；颜色只用 tokens。H5 端补了焦点陷阱与 Esc 关闭，
 * 小程序端只保留点击关闭（无键盘）。
 */
import type { EditorItem } from '@/domain/editor/types'

import { computed, nextTick, onBeforeUnmount, onMounted } from 'vue'

interface Props {
  title: string
  summary?: string
  intro?: string
  items: EditorItem[]
  submitLabel?: string
  status?: string
  endTime?: string
  canOpenLive?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  summary: '',
  intro: '',
  submitLabel: '',
  status: '',
  endTime: '',
  canOpenLive: false,
})

const emit = defineEmits<{ 'close': [], 'open-live': [] }>()

const ROOT_ID = 'designer-preview'

const visibleItems = computed(() => props.items)

const deadline = computed(() => String(props.endTime || '').slice(0, 10))

function noText(index: number): string {
  return String(index + 1).padStart(2, '0')
}

function itemTitle(item: EditorItem): string {
  return item.title.trim() || '未填写题干'
}

/** 题型的补充说明：与作答端的口径保持一致，但更短 */
function typeHint(item: EditorItem): string {
  if (item.type === '多选') {
    return '多选'
  }
  if (item.type === '单选') {
    return '单选'
  }
  if (item.type === '选项') {
    return item.attr.radioType === 'multi' ? '多选' : '单选'
  }
  if (item.type === '文本') {
    return item.attr.view_model === 'textarea' ? '多行文本' : '单行文本'
  }
  if (item.type === '数字') {
    return '数字'
  }
  if (item.type === '时间日期') {
    return item.attr.dateType === 'time' ? '时间' : item.attr.dateType === 'datetime' ? '日期时间' : '日期'
  }
  if (item.type === '图片') {
    return `最多 ${Number(item.attr.fileNum ?? 9)} 张`
  }
  if (item.type === '地址') {
    return '省 / 市 / 区'
  }
  if (item.type === '引用') {
    return '从列表中选择'
  }
  return item.type
}

/** 选项类题目：单选画圆、多选画方 */
function isMulti(item: EditorItem): boolean {
  if (item.type === '多选') {
    return true
  }
  if (item.type === '选项') {
    return item.attr.radioType === 'multi'
  }
  return false
}

/** 选项为空时给一行占位，避免预览出现「空壳题」 */
function optionText(item: EditorItem, value: string, index: number): string {
  return value.trim() || `选项 ${index + 1}`
}

function optionsOf(item: EditorItem): string[] {
  return item.options.map(option => option.value).some(value => value.trim().length > 0)
    ? item.options.map(option => option.value)
    : ['', '']
}

function isTextarea(item: EditorItem): boolean {
  return item.type === '文本' && item.attr.view_model === 'textarea'
}

function close(): void {
  emit('close')
}

function openLive(): void {
  emit('open-live')
}

/* #ifdef H5 */
function focusables(): HTMLElement[] {
  const root = document.getElementById(ROOT_ID)
  if (!root) {
    return []
  }
  return [...root.querySelectorAll<HTMLElement>('[role="button"], [tabindex="0"], button')]
    .filter(element => element.offsetParent !== null)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab') {
    return
  }
  const list = focusables()
  if (list.length === 0) {
    return
  }
  const first = list[0]
  const last = list[list.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  nextTick(() => {
    document.getElementById(ROOT_ID)?.focus()
  })
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
/* #endif */
</script>

<template>
  <!-- 遮罩：点击空白关闭；点击面板内部不冒泡关闭 -->
  <view class="dp">
    <view class="dp__scrim" @click="close" />

    <view
      :id="ROOT_ID"

      class="dp__panel"
      role="dialog"
      aria-modal="true"
      aria-label="问卷手机预览"
      tabindex="-1"
      @click.stop
    >
      <view class="dp__head">
        <view class="dp__head-main">
          <view class="dp__live">
            <view class="dp__live-dot" aria-hidden="true" />
            <text class="dp__head-title">手机预览</text>
          </view>
          <text class="dp__head-hint">当前草稿 · 含未保存的修改</text>
        </view>
        <view
          class="dp__close"
          role="button"
          tabindex="0"
          aria-label="关闭预览"
          @click="close"
          @keydown.enter.prevent="close"
          @keydown.space.prevent="close"
        >
          <view class="dp__close-line dp__close-line--a" aria-hidden="true" />
          <view class="dp__close-line dp__close-line--b" aria-hidden="true" />
        </view>
      </view>

      <view class="dp__stage">
        <view class="dp__phone">
          <view class="dp__appbar">
            <view class="dp__appbar-back" aria-hidden="true" />
            <text class="dp__appbar-title">{{ props.title || '未命名问卷' }}</text>
            <view class="dp__appbar-more" aria-hidden="true">
              <view class="dp__appbar-dot" />
              <view class="dp__appbar-dot" />
              <view class="dp__appbar-dot" />
            </view>
          </view>

          <scroll-view scroll-y class="dp__screen">
            <view class="dp__cover">
              <text class="dp__kicker">{{ props.status || '进行中' }} · 匿名访问</text>
              <text class="dp__cover-title">{{ props.title || '未命名问卷' }}</text>
              <text v-if="props.summary" class="dp__cover-desc">{{ props.summary }}</text>
              <view class="dp__meta">
                <text class="dp__meta-text">{{ visibleItems.length }} 题</text>
                <view v-if="deadline" class="dp__dot" aria-hidden="true" />
                <text v-if="deadline" class="dp__meta-text">截止 {{ deadline }}</text>
              </view>
              <text v-if="props.intro" class="dp__intro">{{ props.intro }}</text>
              <view class="dp__cta">
                开始作答
              </view>
            </view>

            <view class="dp__list">
              <view v-for="(item, index) in visibleItems" :key="item.clientKey" class="dp__q">
                <view class="dp__q-meta">
                  <text class="dp__q-no">{{ noText(index) }}</text>
                  <text v-if="item.required" class="dp__q-req">必答</text>
                </view>
                <text class="dp__q-title">{{ itemTitle(item) }}</text>
                <text class="dp__q-hint">{{ typeHint(item) }}</text>

                <view class="dp__body">
                  <!-- 文本 / 数字 -->
                  <view
                    v-if="item.type === '文本' || item.type === '数字'"
                    class="dp__input"
                    :class="{ 'dp__input--area': isTextarea(item) }"
                  >
                    <text class="dp__placeholder">
                      {{ isTextarea(item) ? '请输入' : item.type === '数字' ? '请输入数字' : '请输入' }}
                    </text>
                  </view>

                  <!-- 日期 / 地址 / 引用：同一套「可点但只读」的入口 -->
                  <view
                    v-else-if="item.type === '时间日期' || item.type === '地址' || item.type === '引用'"
                    class="dp__input dp__input--pick"
                  >
                    <text class="dp__placeholder">
                      {{ item.type === '时间日期' ? '请选择日期' : item.type === '地址' ? '请选择省 / 市 / 区' : '请选择' }}
                    </text>
                    <view class="dp__chev" aria-hidden="true" />
                  </view>

                  <!-- 图片 -->
                  <view v-else-if="item.type === '图片'" class="dp__upload">
                    <text class="dp__upload-text">上传照片</text>
                  </view>

                  <!-- 选项类 -->
                  <view v-else class="dp__opts">
                    <view
                      v-for="(option, optionIndex) in optionsOf(item)"
                      :key="optionIndex"
                      class="dp__opt"
                    >
                      <view
                        class="dp__mark"
                        :class="isMulti(item) ? 'dp__mark--square' : 'dp__mark--circle'"
                        aria-hidden="true"
                      />
                      <text class="dp__opt-text">{{ optionText(item, option, optionIndex) }}</text>
                    </view>
                  </view>
                </view>
              </view>

              <view v-if="visibleItems.length === 0" class="dp__empty">
                <text class="dp__empty-title">还没有题目</text>
                <text class="dp__empty-tip">在左侧点「添加题目」，这里会实时出现</text>
              </view>
            </view>

            <view class="dp__foot">
              <view class="dp__submit">
                {{ props.submitLabel || '提交问卷' }}
              </view>
              <text class="dp__foot-tip">预览只检查版式，不会提交数据</text>
            </view>
          </scroll-view>
        </view>
      </view>

      <view class="dp__actions">
        <view
          v-if="props.canOpenLive"
          class="dp__link"
          role="button"
          tabindex="0"
          @click="openLive"
          @keydown.enter.prevent="openLive"
          @keydown.space.prevent="openLive"
        >
          在新页面打开已保存版本
        </view>
        <view class="dp__actions-spacer" />
        <view
          class="dp__done"
          role="button"
          tabindex="0"
          @click="close"
          @keydown.enter.prevent="close"
          @keydown.space.prevent="close"
        >
          完成
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* ── 遮罩与面板 ───────────────────────────────────────────────────── */
.dp {
  position: fixed;
  inset: 0;
  z-index: var(--bx-z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--bx-space-md);
}

.dp__scrim {
  position: absolute;
  inset: 0;
  background-color: var(--bx-overlay);
}

.dp__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 420px;
  max-width: 100%;
  max-height: calc(100vh - 32px);
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-3);
  outline: none;
}

.dp__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bx-space-md);
  padding: 16px 16px 12px 20px;
  border-bottom: 1px solid var(--bx-line-2);
}

.dp__head-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dp__live {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dp__live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--bx-success);
}

.dp__head-title {
  font-size: var(--bx-font-body);
  font-weight: 600;
  line-height: 1.4;
  color: var(--bx-text);
}

.dp__head-hint {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.dp__close {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
}

.dp__close:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

@media (hover: hover) {
  .dp__close:hover {
    background-color: var(--bx-surface-2);
  }
}

.dp__close-line {
  position: absolute;
  width: 14px;
  height: 1.5px;
  background-color: var(--bx-text-2);
  border-radius: 1px;
}

.dp__close-line--a {
  transform: rotate(45deg);
}

.dp__close-line--b {
  transform: rotate(-45deg);
}

/* ── 手机画框 ─────────────────────────────────────────────────────── */
.dp__stage {
  display: flex;
  justify-content: center;
  padding: 16px;
  background-color: var(--bx-bg);
  overflow: hidden;
}

.dp__phone {
  display: flex;
  flex-direction: column;
  width: 320px;
  max-width: 100%;
  height: 600px;
  max-height: calc(100vh - 240px);
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: 22px;
  box-shadow: var(--bx-elev-2);
}

.dp__appbar {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid var(--bx-line-2);
}

.dp__appbar-back {
  width: 8px;
  height: 8px;
  margin-left: 2px;
  border-bottom: 1.5px solid var(--bx-text-2);
  border-left: 1.5px solid var(--bx-text-2);
  transform: rotate(45deg);
}

.dp__appbar-title {
  flex: 1;
  overflow: hidden;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  color: var(--bx-text);
  text-align: center;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dp__appbar-more {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 2px;
}

.dp__appbar-dot {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background-color: var(--bx-line-strong);
}

.dp__screen {
  flex: 1;
  height: 0;
  background-color: var(--bx-bg);
}

/* ── 封面 ─────────────────────────────────────────────────────────── */
.dp__cover {
  padding: 16px 14px 14px;
  background-color: var(--bx-surface);
  border-bottom: 1px solid var(--bx-line-2);
}

.dp__kicker {
  display: block;
  font-size: 10px;
  line-height: 1.5;
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
}

.dp__cover-title {
  display: block;
  margin-top: 6px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.32;
  letter-spacing: -0.02em;
  color: var(--bx-text);
}

.dp__cover-desc {
  display: block;
  margin-top: 6px;
  font-size: var(--bx-font-sub);
  line-height: 1.6;
  color: var(--bx-text-2);
}

.dp__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.dp__meta-text {
  font-size: 11px;
  line-height: 1.5;
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

.dp__dot {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background-color: var(--bx-line-strong);
}

.dp__intro {
  display: block;
  margin-top: 10px;
  padding: 10px 12px;
  font-size: var(--bx-font-caption);
  line-height: 1.6;
  color: var(--bx-text-2);
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line-2);
  border-radius: var(--bx-radius-sm);
}

.dp__cta {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  margin-top: 14px;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  color: #fff;
  background-color: var(--bx-primary);
  border-radius: var(--bx-radius-sm);
}

/* ── 题目 ─────────────────────────────────────────────────────────── */
.dp__list {
  background-color: var(--bx-surface);
}

.dp__q {
  padding: 14px;
}

.dp__q + .dp__q {
  border-top: 1px solid var(--bx-line-2);
}

.dp__q-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dp__q-no {
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

.dp__q-req {
  padding: 0 4px;
  font-size: 10px;
  line-height: 14px;
  color: var(--bx-danger);
  background-color: var(--bx-danger-soft);
  border-radius: 3px;
}

.dp__q-title {
  display: block;
  margin-top: 4px;
  font-size: var(--bx-font-body);
  font-weight: 600;
  line-height: 1.5;
  color: var(--bx-text);
}

.dp__q-hint {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--bx-text-3);
}

.dp__body {
  margin-top: 10px;
}

.dp__input {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 10px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.dp__input--area {
  align-items: flex-start;
  min-height: 64px;
  padding-top: 9px;
}

.dp__input--pick {
  justify-content: space-between;
}

.dp__placeholder {
  font-size: var(--bx-font-caption);
  line-height: 1.5;
  color: var(--bx-text-4);
}

.dp__chev {
  width: 7px;
  height: 7px;
  border-top: 1.5px solid var(--bx-line-strong);
  border-right: 1.5px solid var(--bx-line-strong);
  transform: rotate(45deg);
}

.dp__upload {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 64px;
  background-color: var(--bx-surface);
  border: 1px dashed var(--bx-line-strong);
  border-radius: var(--bx-radius-sm);
}

.dp__upload-text {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
}

.dp__opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dp__opt {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 10px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.dp__mark {
  flex: none;
  width: 15px;
  height: 15px;
  border: 1.5px solid var(--bx-line-strong);
}

.dp__mark--circle {
  border-radius: 50%;
}

.dp__mark--square {
  border-radius: 3px;
}

.dp__opt-text {
  font-size: var(--bx-font-caption);
  line-height: 1.5;
  color: var(--bx-text-2);
}

.dp__empty {
  padding: 36px 20px;
  text-align: center;
}

.dp__empty-title {
  display: block;
  font-size: var(--bx-font-sub);
  font-weight: 600;
  color: var(--bx-text);
}

.dp__empty-tip {
  display: block;
  margin-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: 1.6;
  color: var(--bx-text-3);
}

/* ── 底部 ─────────────────────────────────────────────────────────── */
.dp__foot {
  padding: 12px 14px 16px;
  background-color: var(--bx-surface);
  border-top: 1px solid var(--bx-line-2);
}

.dp__submit {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  color: #fff;
  background-color: var(--bx-primary);
  border-radius: var(--bx-radius-sm);
}

.dp__foot-tip {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--bx-text-3);
  text-align: center;
}

/* ── 操作条 ───────────────────────────────────────────────────────── */
.dp__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--bx-line-2);
}

.dp__actions-spacer {
  flex: 1;
}

.dp__link {
  font-size: var(--bx-font-caption);
  line-height: 1.5;
  color: var(--bx-primary);
  cursor: pointer;
  border-radius: var(--bx-radius-xs);
}

.dp__link:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.dp__done {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 16px;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  color: #fff;
  cursor: pointer;
  background-color: var(--bx-primary);
  border-radius: var(--bx-radius-sm);
}

.dp__done:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

@media (hover: hover) {
  .dp__done:hover {
    background-color: var(--bx-primary-hover);
  }
}

/* ── 窄屏：面板铺满，手机框收窄 ───────────────────────────────────── */
@media (max-width: 520px) {
  .dp {
    padding: 0;
  }

  .dp__panel {
    width: 100%;
    max-height: 100vh;
    border-radius: 0;
    border: 0;
  }

  .dp__phone {
    height: calc(100vh - 190px);
  }
}
</style>
