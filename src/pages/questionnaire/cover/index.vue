<script setup lang="ts">
/**
 * 问卷封面页
 *
 * 入参：activity_no（必填）
 * 老链接（#/questionnaire/index/index）由 main.ts 的 hash 重写兼容，本页用于新入口。
 *
 * 视觉（docs/UI-UX-V6-设计系统.md §5/§6）：
 * 冷白画布 + 左对齐的排版层级：小标签 → 32/600 大标题 → 副标题 → 引言 →
 * 2×2 细分隔信息网格 → 可展开的「作答说明」→ 50px 通栏主行动 + ghost 次行动。
 * 不用卡片墙分区：层级由字号、字重与 1px 细线承担。
 */

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import BxAppearanceSheet from '@/components/base/BxAppearanceSheet.vue'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import ShareSheet from '@/components/share/ShareSheet.vue'

import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { useShare } from '@/composables/useShare'
import { answerUrl, historyUrl } from '@/domain/questionnaire/routes'
import { readQuery } from '@/utils/query'

const { loading, activity, fields, errorMessage, load } = useQuestionnaire()

const activityNo = ref('')
/** 作答说明默认收起：首屏只留「这是什么、要答多久、怎么开始」 */
const expanded = ref(false)
/** 分享面板只在 H5 打开（小程序端入口用条件编译隐藏） */
const shareOpen = ref(false)
/** 外观（字号 / 主题）面板：作答者也能调，H5 入口 */
const appearanceOpen = ref(false)
const { shareLink } = useShare()

/** 分享「邀请作答」链接：保留 activity_no / status，不带票据 */
const shareUrl = computed(() =>
  shareLink(answerUrl(activityNo.value, { status: String(activity.value?.status ?? '进行中') })),
)

const title = computed(() => activity.value?.title || '问卷')
const intro = computed(() => String(activity.value?.start_remark ?? '').trim())
const summary = computed(() => String(activity.value?.summary ?? '').trim())
const count = computed(() => fields.value.filter(field => field.widget !== 'section').length)
const ended = computed(() => activity.value?.status === '已结束')

/**
 * 标题上方的小标签
 *
 * 已结束优先说状态 —— 此时「能不能答」比「匿名还是登录」更重要；
 * 其余情况用访问方式（匿名问卷 / 需登录），它决定了用户对隐私的预期。
 */
const kicker = computed(() => {
  if (ended.value) {
    return '已结束'
  }
  const perm = String(activity.value?.perm_type ?? '').trim()
  const status = String(activity.value?.status ?? '').trim()
  return perm || status || '问卷'
})

/** 截止日期：只取到天，「截止 2026-12-31」比带时分更耐看 */
const deadline = computed(() => {
  const raw = String(activity.value?.end_time ?? '').trim()
  return raw.length >= 10 ? raw.slice(0, 10) : ''
})

/**
 * 封面信息网格（2×2）
 *
 * 只展示活动行里**真实存在**的字段：活动没有「预计用时」就不编一个
 * 「约 3 分钟」—— 假信息比没有信息更糟。缺项时网格自动少一格，
 * 奇数个最后一项横跨两列（模板里用 --wide 类表达）。
 */
const infoItems = computed(() => {
  const rows: Array<{ label: string, value: string }> = [
    { label: '题目', value: `${count.value} 题` },
  ]

  if (deadline.value) {
    rows.push({ label: '截止', value: deadline.value })
  }

  const submitCount = Number(activity.value?.submit_count ?? 0)
  if (Number.isFinite(submitCount) && submitCount > 0) {
    rows.push({ label: '已答人数', value: `${submitCount} 人` })
  }

  const answerTimes = String(activity.value?.answer_times ?? '').trim()
  if (answerTimes) {
    rows.push({ label: '作答次数', value: answerTimes })
  }

  return rows
})

/** 展开区里的说明行：与上方信息网格重复的项不再重复列 */
const notes = computed(() => {
  const rows: Array<{ label: string, value: string }> = []
  const answerTimes = String(activity.value?.answer_times ?? '').trim()
  if (answerTimes) {
    rows.push({ label: '作答次数', value: answerTimes })
  }
  const perm = String(activity.value?.perm_type ?? '').trim()
  if (perm) {
    rows.push({ label: '访问方式', value: perm })
  }
  return rows
})

const hasMore = computed(() => !!summary.value || notes.value.length > 0)

/**
 * 页脚隐私说明
 *
 * 「匿名」不能写死：活动可能配置成需登录，把登录问卷说成匿名是错误信息，
 * 比少一句话更糟。只在访问方式确实含「匿名」时才提。
 */
const privacyFoot = computed(() => {
  const perm = String(activity.value?.perm_type ?? '')
  return perm.includes('匿名')
    ? '匿名作答 · 数据仅用于整体分析'
    : '数据仅用于整体分析'
})

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')
  void init()
})

async function init(): Promise<void> {
  if (!activityNo.value) {
    errorMessage.value = '缺少活动编号，无法加载问卷'
    return
  }
  await load(activityNo.value, { mode: 'plain' })
}

function start(): void {
  uni.navigateTo({ url: answerUrl(activityNo.value, { status: activity.value?.status ?? '进行中' }) })
}

function openRecords(): void {
  uni.navigateTo({ url: historyUrl(activityNo.value, title.value) })
}

function openShare(): void {
  if (!shareUrl.value) {
    return
  }
  shareOpen.value = true
}

function toggleMore(): void {
  expanded.value = !expanded.value
}

/** 与 BxButton / BxNavBar 同一套键盘约定：可点的 view 要能回车触发 */
function onToggleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  toggleMore()
}

function onRecordsKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  openRecords()
}

function onShareKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  openShare()
}
</script>

<template>
  <view class="c-page">
    <view class="c-page__body bx-container">
      <view class="c-page__content">
        <!-- 骨架屏：与真实版式同构，加载完不跳动 -->
        <view v-if="loading" class="c-skeleton" aria-busy="true">
          <view class="c-skeleton__kicker" />
          <view class="c-skeleton__title" />
          <view class="c-skeleton__line" />
          <view class="c-skeleton__grid" />
        </view>

        <BxEmpty
          v-else-if="errorMessage"
          :text="errorMessage"
          tip="请确认链接是否有效，或联系活动发起人"
        />

        <template v-else>
          <!-- 顶部：品牌小字 + 分享 / 记录入口（44px 触摸目标） -->
          <view class="c-top">
            <text class="c-top__brand">园区问卷</text>
            <view class="c-top__actions">
              <!-- #ifdef H5 -->
              <view
                class="c-top__appearance"
                role="button"
                tabindex="0"
                aria-label="字号与主题"
                @click="appearanceOpen = true"
                @keydown.enter.prevent="appearanceOpen = true"
              >
                <text class="c-top__appearance-text">Aa</text>
              </view>
              <view
                class="c-top__share"
                role="button"
                tabindex="0"
                aria-label="分享问卷"
                @click="openShare"
                @keydown="onShareKeydown"
              >
                <view class="c-share-icon" aria-hidden="true">
                  <view class="c-share-icon__dot c-share-icon__dot--top" />
                  <view class="c-share-icon__dot c-share-icon__dot--bottom" />
                  <view class="c-share-icon__dot c-share-icon__dot--right" />
                  <view class="c-share-icon__line c-share-icon__line--top" />
                  <view class="c-share-icon__line c-share-icon__line--bottom" />
                </view>
              </view>
              <!-- #endif -->
              <view
                class="c-top__records"
                role="button"
                tabindex="0"
                aria-label="查看作答记录"
                @click="openRecords"
                @keydown="onRecordsKeydown"
              >
                <text class="c-top__records-text">作答记录</text>
                <view class="c-top__chev" aria-hidden="true" />
              </view>
            </view>
          </view>

          <!-- 标题区：小标签 → 32/600 大标题 → 引言（活动简介在「作答说明」里展开） -->
          <view class="c-head">
            <text class="c-head__kicker">{{ kicker }}</text>
            <text class="c-head__title">{{ title }}</text>
            <text v-if="intro" class="c-head__intro">{{ intro }}</text>
          </view>

          <!-- 信息网格：2×2，细线分隔，不是四个卡 -->
          <view class="c-info">
            <view
              v-for="(item, index) in infoItems"
              :key="item.label"
              class="c-info__cell"
              :class="{ 'c-info__cell--wide': infoItems.length % 2 === 1 && index === infoItems.length - 1 }"
            >
              <text class="c-info__label">{{ item.label }}</text>
              <text class="c-info__value">{{ item.value }}</text>
            </view>
          </view>

          <!-- 作答说明：可展开，收起时不占首屏注意力 -->
          <view class="c-more">
            <view
              class="c-more__toggle"
              role="button"
              tabindex="0"
              :aria-expanded="expanded ? 'true' : 'false'"
              @click="toggleMore"
              @keydown="onToggleKeydown"
            >
              <text class="c-more__toggle-text">作答说明</text>
              <view class="c-more__chev" :class="{ 'c-more__chev--open': expanded }" aria-hidden="true" />
            </view>

            <view v-if="expanded" class="c-more__body">
              <text v-if="summary" class="c-more__para">{{ summary }}</text>
              <view v-for="note in notes" :key="note.label" class="c-more__row">
                <text class="c-more__row-label">{{ note.label }}</text>
                <text class="c-more__row-value">{{ note.value }}</text>
              </view>
              <text v-if="!hasMore" class="c-more__empty">
                本问卷未提供额外说明，如有疑问请联系活动发起人。
              </text>
            </view>
          </view>

          <!-- 主行动：通栏 50px，次行动 ghost -->
          <view class="c-actions">
            <BxButton v-if="!ended" size="large" block @click="start">
              开始作答
            </BxButton>
            <BxButton v-else type="secondary" size="large" block @click="start">
              查看问卷内容
            </BxButton>
            <BxButton type="ghost" size="large" block @click="openRecords">
              查看我的记录
            </BxButton>
            <text class="c-actions__tip">作答过程中会自动保存草稿，可随时返回继续</text>
            <text class="c-actions__foot">{{ privacyFoot }}</text>
          </view>
        </template>
      </view>
    </view>

    <!-- 分享面板（H5 入口；小程序端不渲染入口，组件也只在 H5 使用） -->
    <ShareSheet
      v-if="!loading && !errorMessage"
      :open="shareOpen"
      :url="shareUrl"
      :title="title"
      @close="shareOpen = false"
    />

    <!-- #ifdef H5 -->
    <BxAppearanceSheet v-if="appearanceOpen" @close="appearanceOpen = false" />
    <!-- #endif -->
  </view>
</template>

<style lang="scss" scoped>
/* ── 页面骨架 ────────────────────────────────────────────────────── */
.c-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.c-page__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  /* 不写死高度：内容比视口高时让它自然溢出（可继续向下滚动） */
  padding-top: 16px;
  padding-bottom: 24px;
}

.c-page__content {
  display: flex;
  flex: 1;
  flex-direction: column;
}

/* ── 加载骨架（与真实版式同构） ────────────────────────────────── */
.c-skeleton {
  display: flex;
  flex-direction: column;
}

.c-skeleton__kicker {
  width: 88px;
  height: 11px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-xs);
}

.c-skeleton__title {
  width: 62%;
  height: 32px;
  margin-top: 12px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-sm);
}

.c-skeleton__line {
  width: 88%;
  height: 15px;
  margin-top: 12px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-xs);
}

.c-skeleton__grid {
  width: 100%;
  height: 108px;
  margin-top: 24px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-card);
}

/* ── 顶部行 ──────────────────────────────────────────────────────── */
.c-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
}

.c-top__brand {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
}

/* 44px 触摸目标：负外距把视觉位置收回去，布局不因此外扩 */
.c-top__records {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  margin-right: -8px;
  padding: 0 8px;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .c-top__records:hover {
    background-color: var(--bx-surface-2);
  }
}

.c-top__records:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.c-top__records-text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-3);
}

/* 箭头用两条边框旋转绘制：不用图标字体，也不用 svg（小程序不支持） */
.c-top__chev {
  width: 6px;
  height: 6px;
  border-top: 1.5px solid currentColor;
  border-right: 1.5px solid currentColor;
  color: var(--bx-text-3);
  transform: rotate(45deg);
}

.c-top__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 分享入口：44×44 触摸目标，图标是 CSS 绘制的三个点 + 两条连线 */
.c-top__share {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 字号 / 主题入口：Aa 文本标签，与分享入口同尺寸 */
.c-top__appearance {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

.c-top__appearance-text {
  font-size: var(--bx-font-sub);
  font-weight: 600;
  color: var(--bx-text-3);
}

.c-top__appearance:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

@media (hover: hover) {
  .c-top__appearance:hover {
    background-color: var(--bx-surface-2);
  }
}

@media (hover: hover) {
  .c-top__share:hover {
    background-color: var(--bx-surface-2);
  }
}

.c-top__share:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.c-share-icon {
  position: relative;
  width: 18px;
  height: 18px;
  color: var(--bx-text-3);
}

.c-share-icon__dot {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: currentColor;
}

.c-share-icon__dot--top {
  top: 1px;
  left: 1px;
}

.c-share-icon__dot--bottom {
  bottom: 1px;
  left: 1px;
}

.c-share-icon__dot--right {
  top: 6.5px;
  right: 1px;
}

.c-share-icon__line {
  position: absolute;
  width: 8px;
  height: 1.5px;
  background-color: currentColor;
  border-radius: 1px;
  transform-origin: left center;
}

.c-share-icon__line--top {
  top: 5px;
  left: 5px;
  transform: rotate(-30deg);
}

.c-share-icon__line--bottom {
  top: 12px;
  left: 5px;
  transform: rotate(30deg);
}

/* ── 标题区 ──────────────────────────────────────────────────────── */
.c-head {
  padding-top: 32px;
}

.c-head__kicker {
  display: block;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
}

.c-head__title {
  display: block;
  margin-top: 12px;
  font-size: var(--bx-font-display);
  font-weight: 600;
  line-height: var(--bx-leading-display);
  /* ≥28px 的标题加 -0.02em 字距 */
  letter-spacing: -0.02em;
  color: var(--bx-text);
  /*
   * 不要 break-all：中文标题按标点避头尾规则断行才好看，
   * break-all 会把「（演示问卷）」拆成「（演示问」+「卷」。
   */
  word-break: normal;
  overflow-wrap: break-word;
}

.c-head__intro {
  display: block;
  max-width: 34em;
  margin-top: 12px;
  font-size: var(--bx-font-body);
  line-height: 1.75;
  color: var(--bx-text-2);
}

/* ── 信息网格（2×2） ─────────────────────────────────────────────── */
.c-info {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 16px;
  border-top: 1px solid var(--bx-line);
  border-bottom: 1px solid var(--bx-line);
}

.c-info__cell {
  padding: 12px 0;
  min-width: 0;
}

/* 第一行之外加细横线；奇数个时最后一项横跨两列 */
.c-info__cell:nth-child(n + 3) {
  border-top: 1px solid var(--bx-line-2);
}

.c-info__cell:nth-child(odd) {
  padding-right: 12px;
  border-right: 1px solid var(--bx-line-2);
}

.c-info__cell:nth-child(even) {
  padding-left: 12px;
}

.c-info__cell--wide {
  grid-column: span 2;
  padding-right: 0;
  border-right: 0;
}

.c-info__label {
  display: block;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.c-info__value {
  display: block;
  margin-top: 2px;
  font-size: var(--bx-font-body);
  font-weight: 500;
  line-height: 1.4;
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* ── 作答说明（可展开） ──────────────────────────────────────────── */
.c-more {
  margin-top: 8px;
}

.c-more__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 0;
  cursor: pointer;
  transition: color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .c-more__toggle:hover .c-more__toggle-text {
    color: var(--bx-text);
  }
}

.c-more__toggle:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
  border-radius: var(--bx-radius-xs);
}

.c-more__toggle-text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
}

.c-more__chev {
  width: 6px;
  height: 6px;
  margin-left: auto;
  margin-right: 4px;
  border-right: 1.5px solid var(--bx-text-3);
  border-bottom: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg);
  transition: transform var(--bx-duration-base) var(--bx-ease-out);
}

.c-more__chev--open {
  transform: rotate(-135deg);
}

.c-more__body {
  padding: 0 0 12px;
}

.c-more__para {
  display: block;
  font-size: var(--bx-font-sub);
  line-height: 1.75;
  color: var(--bx-text-2);
}

.c-more__row {
  display: flex;
  align-items: baseline;
  padding: 8px 0;
  border-top: 1px solid var(--bx-line-2);
}

.c-more__row-label {
  flex: none;
  width: 64px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.c-more__row-value {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-2);
  font-variant-numeric: tabular-nums;
}

/* 活动没有简介也没有额外说明时的兜底：说明区不空着 */
.c-more__empty {
  display: block;
  padding-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: 1.7;
  color: var(--bx-text-3);
}

/* ── 主行动 ──────────────────────────────────────────────────────── */
.c-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 内容短时把主行动推到底部：拇指区的按钮比页面中部好按 */
  margin-top: auto;
  padding-top: 32px;
}

/*
 * 宽屏（H5 桌面 / 小程序 PC 横屏）不追「拇指区」：视口高、内容短，
 * margin-top:auto 会留下几百像素的空档。让主行动紧跟内容即可。
 */
@media (min-width: 760px) {
  .c-actions {
    margin-top: 0;
    padding-top: 40px;
  }
}

/* 草稿自动保存提示：既有能力，保持常驻可见 */
.c-actions__tip {
  display: block;
  margin-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: 1.7;
  color: var(--bx-text-3);
  text-align: center;
}

.c-actions__foot {
  display: block;
  margin-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.04em;
  color: var(--bx-text-3);
  text-align: center;
}
</style>
