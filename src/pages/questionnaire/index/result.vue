<script setup lang="ts">
/**
 * 结果页（路由别名保持 /questionnaire/index/result 兼容）
 *
 * 业务逻辑全部在 `useResultPage`：取服务端分数、按批次号二次拉取图片/引用/地址的展示值、
 * 逐题对错与入口联动。页面只留模板、样式与绑定，页面与逻辑的改动互不牵连。
 *
 * 入参：activity_no（必填）、fill_batch_no
 *
 * 视觉（docs/UI-UX-V2-设计系统.md §7.3）：分数是主角，维度逐条细条，建议用引用块。
 */

import { computed, nextTick, ref, watch } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import { useEmbedResize } from '@/composables/useEmbedResize'
import { useResultPage } from '@/composables/useResultPage'

// 逐题回顾列表长度取决于题目数，嵌入场景下高度变化明显
useEmbedResize()

const {
  loading,
  activity,
  errorMessage,
  activityNo,
  batchNo,
  score,
  hasScore,
  passed,
  passingMark,
  rows,
  answerImagesFailed,
  canRetry,
  showSuggestionEntry,
  openSuggestion,
  restart,
  goHome,
  coverUrl,
} = useResultPage()

/**
 * 分数计数动画（规范 §5.2 第 10 条）：0 → 目标值，900ms ease-out
 *
 * 只在**数值**上插值，字重与字距全程不变 —— 数字一动就改字重会抖。
 * 容器宽度用 min-width 固定，单位（「/ 100 分」）不会跟着数字长度左右跳。
 */
const displayScore = ref(0)
const scoreAnimated = ref(false)

/** 系统「减少动态效果」时直接给终值，不做插值 */
function prefersReducedMotion(): boolean {
  // #ifdef H5
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  // #endif
  return false
}

let countTimer: ReturnType<typeof setTimeout> | null = null

function runCountUp(target: number): void {
  if (countTimer) {
    clearTimeout(countTimer)
    countTimer = null
  }

  const end = Math.max(0, Math.round(Number(target) || 0))
  if (prefersReducedMotion()) {
    displayScore.value = end
    return
  }

  const startedAt = Date.now()
  const duration = 900

  const step = (): void => {
    const elapsed = Date.now() - startedAt
    const ratio = Math.min(1, elapsed / duration)
    /* 强减速（与 --bx-ease-out 同族）：先快后慢，末尾几乎停住 */
    const eased = 1 - (1 - ratio) ** 3
    displayScore.value = Math.round(end * eased)
    if (ratio < 1) {
      countTimer = setTimeout(step, 16)
    }
    else {
      countTimer = null
      displayScore.value = end
    }
  }

  step()
}

/** 结果是否可用：配置已加载且逐题数据已回填 */
const resultReady = computed(() => !loading.value && rows.value.length > 0)

watch(
  resultReady,
  (ready) => {
    if (!ready || scoreAnimated.value) {
      return
    }
    scoreAnimated.value = true
    runCountUp(score.value.score)
  },
  { immediate: true },
)

/** 分数容器的固定宽度：数字位数取「得分 / 满分」的较大者 */
const scoreValueStyle = computed(() => {
  const digits = Math.max(
    String(Math.round(Number(score.value.score) || 0)).length,
    String(Math.round(Number(score.value.total) || 0)).length,
  )
  return { minWidth: `${digits}ch` }
})

/** 等级标签：只有设了合格线的活动才有等级 */
const levelChip = computed(() => {
  if (!hasScore.value || passed.value === null) {
    return null
  }
  return passed.value
    ? { text: '合格', cls: 'r-chip--pass' }
    : { text: '未合格', cls: 'r-chip--fail' }
})

/** 一句结论：说完结果，不复述分数 */
const verdictText = computed(() => {
  if (!hasScore.value || passed.value === null) {
    return '本次作答已提交，感谢参与'
  }
  if (passed.value) {
    return '恭喜，本次作答已通过'
  }
  return `本次作答未达到合格线（${passingMark.value} 分）`
})

/**
 * 逐题得分
 *
 * 没有真正的「维度」数据源（merge 服务返回的也是逐题汇总），
 * 所以这一段是**逐题得分率**，不是维度分；标题与口径保持一致。
 *
 * 只列**计分题**（points > 0）：演示问卷里 11 题有 9 题没有分值，
 * 全列出来就是一列「不计分」的灰字，把得分本身淹掉了。
 * 不计分的题在下面的「逐题回顾」里仍然看得到，信息没丢。
 */
const scoreRows = computed(() =>
  rows.value
    .filter(row => row.points > 0)
    .map(row => ({
      key: row.key,
      title: row.title,
      /** 无正确答案的题不计分，不画条 */
      judged: row.verdict !== 'unjudged',
      percent: row.points > 0 ? Math.round((row.earned / row.points) * 100) : 0,
      earned: row.earned,
      points: row.points,
    })),
)

/**
 * 逐题得分条是否做进场动画
 *
 * 逐项动画只在 H5 端做（规范 §5.3）：小程序端长列表逐项动画会掉帧。
 */
const barsAnimated = ref(false)
// #ifdef H5
barsAnimated.value = true
// #endif

/** 得分条是否已翻到目标宽度（翻之前宽度为 0，过渡才有起点） */
const barsReady = ref(false)

watch(
  () => rows.value.length,
  (length) => {
    if (length === 0 || barsReady.value) {
      return
    }
    if (!barsAnimated.value) {
      barsReady.value = true
      return
    }
    /* 先让浏览器把 0% 画出来，再翻到目标值 */
    void nextTick().then(() => {
      setTimeout(() => {
        barsReady.value = true
      }, 40)
    })
  },
  { immediate: true },
)

function barWidth(percent: number): string {
  return `${barsReady.value ? percent : 0}%`
}
</script>

<template>
  <view class="r-page">
    <BxNavBar title="作答结果" :fallback-url="coverUrl(activityNo)" />

    <view class="r-page__body bx-container">
      <!-- 加载：骨架保持布局稳定，比一行「正在加载结果…」更符合预期 -->
      <view v-if="loading" class="r-skeleton" aria-busy="true">
        <view class="r-skeleton__hero" />
        <view class="r-skeleton__row" />
        <view class="r-skeleton__row" />
      </view>

      <BxEmpty
        v-else-if="errorMessage"
        :text="errorMessage"
        tip="请确认链接是否有效"
      />

      <template v-else>
        <!--
          分数是这一页的主角：提交标记 → 标题 → 分数 → 等级 → 结论 → 统计
        -->
        <view class="r-hero">
          <view class="r-hero__mark">
            <view class="r-hero__check" aria-hidden="true" />
            <text class="r-hero__mark-text">已提交</text>
          </view>

          <text class="r-hero__title">{{ activity?.title || '问卷' }}</text>

          <view v-if="hasScore" class="r-score">
            <text class="r-score__value" :style="scoreValueStyle">{{ displayScore }}</text>
            <text class="r-score__unit">/ {{ score.total }} 分</text>
          </view>

          <view v-if="levelChip" class="r-chip" :class="levelChip.cls">
            <text class="r-chip__text">{{ levelChip.text }}</text>
          </view>

          <text class="r-verdict">{{ verdictText }}</text>

          <view v-if="hasScore" class="r-stats">
            <view class="r-stat">
              <text class="r-stat__value">{{ score.correctCount }}</text>
              <text class="r-stat__label">答对</text>
            </view>
            <view class="r-stat__divider" />
            <view class="r-stat">
              <text class="r-stat__value">{{ score.wrongCount }}</text>
              <text class="r-stat__label">答错</text>
            </view>
            <view class="r-stat__divider" />
            <view class="r-stat">
              <text class="r-stat__value">{{ score.unansweredCount }}</text>
              <text class="r-stat__label">未答</text>
            </view>
          </view>

          <text v-if="batchNo" class="r-hero__batch">批次号 {{ batchNo }}</text>
        </view>

        <!-- 逐题得分：一条细进度条 + 得分（规范 §7.3） -->
        <view v-if="scoreRows.length > 0" class="r-section">
          <view class="r-section__head">
            <view class="r-section__rule" />
            <text class="r-section__title">逐题得分</text>
          </view>

          <view class="r-scores">
            <view v-for="row in scoreRows" :key="row.key" class="r-bar-row">
              <text class="r-bar-row__title">{{ row.title }}</text>
              <view v-if="row.judged" class="r-bar-row__track">
                <view class="r-bar-row__fill" :style="{ width: barWidth(row.percent) }" />
              </view>
              <text class="r-bar-row__value" :class="{ 'r-bar-row__value--none': !row.judged }">
                {{ row.judged ? `${row.earned} / ${row.points}` : '不计分' }}
              </text>
            </view>
          </view>
        </view>

        <!-- 逐题回顾：同质条目用分割线，不用逐条阴影 -->
        <view v-if="rows.length > 0" class="r-list">
          <view v-for="row in rows" :key="row.key" class="r-item">
            <view class="r-item__head">
              <text class="r-item__label">{{ row.title }}</text>
              <text
                v-if="row.verdict !== 'unjudged'"
                class="r-badge"
                :class="`r-badge--${row.verdict}`"
              >
                {{ row.verdictText }}
              </text>
            </view>
            <view class="r-item__line">
              <text class="r-item__key">我的作答</text>
              <view v-if="row.isImage" class="r-item__images">
                <image
                  v-for="(img, index) in row.images"
                  :key="index"
                  class="r-item__image"
                  :src="img"
                  mode="aspectFill"
                  :alt="`第 ${index + 1} 张作答图片`"
                />
                <text v-if="row.images.length === 0" class="r-item__value">
                  {{ row.mine }}{{ answerImagesFailed ? '（图片暂时读不到）' : '' }}
                </text>
              </view>
              <text v-else class="r-item__value">{{ row.mine }}</text>
            </view>
            <view v-if="row.expected" class="r-item__line">
              <text class="r-item__key">正确答案</text>
              <text class="r-item__value r-item__value--right">{{ row.expected }}</text>
            </view>
            <view v-if="row.verdict !== 'unjudged'" class="r-item__line">
              <text class="r-item__key">本题得分</text>
              <text class="r-item__value" :class="{ 'r-item__value--right': row.earned > 0 }">
                {{ row.earned }} / {{ row.points }} 分
              </text>
            </view>
            <view v-if="row.analysis" class="r-item__line">
              <text class="r-item__key">解析</text>
              <text class="r-item__value">{{ row.analysis }}</text>
            </view>
          </view>
        </view>

        <!-- 提交提示 / 结束语：引用块，不整块上色 -->
        <view v-if="activity?.submitted_tip" class="r-quote">
          <text class="r-quote__text">{{ activity.submitted_tip }}</text>
        </view>

        <view v-if="activity?.end_remark" class="r-quote">
          <text class="r-quote__text">{{ activity.end_remark }}</text>
        </view>

        <view class="r-page__actions">
          <BxButton v-if="canRetry" block @click="restart">
            重新测试
          </BxButton>
          <BxButton v-if="showSuggestionEntry" type="secondary" block @click="openSuggestion">
            查看评估结果
          </BxButton>
          <BxButton type="ghost" block @click="goHome">
            返回问卷封面
          </BxButton>
        </view>
      </template>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.r-page {
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.r-page__body {
  padding-top: 16px;
  padding-bottom: 32px;
}

/* 加载骨架 */
.r-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.r-skeleton__hero {
  height: 208px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-lg);
}

.r-skeleton__row {
  height: 96px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-card);
}

/* ── 分数主角 ─────────────────────────────────────────────────────── */
.r-hero {
  padding: 24px 20px 20px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-lg);
  box-shadow: var(--bx-elev-1);
}

/* 提交成功标记：一枚主色对勾（纯 CSS 绘制，不用 svg） */
.r-hero__mark {
  display: flex;
  align-items: center;
}

.r-hero__check {
  position: relative;
  flex: none;
  width: 22px;
  height: 22px;
  background-color: var(--bx-primary);
  border-radius: 50%;
}

/* 对勾：两条边框转出来的，不用图标字体也不用 svg */
.r-hero__check::after {
  content: '';
  position: absolute;
  top: 5px;
  left: 8px;
  width: 5px;
  height: 9px;
  border-right: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: rotate(45deg);
}

.r-hero__mark-text {
  margin-left: 8px;
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-primary);
}

.r-hero__title {
  display: block;
  margin-top: 12px;
  font-size: var(--bx-font-title);
  font-weight: 600;
  line-height: var(--bx-leading-title);
  letter-spacing: -0.01em;
  color: var(--bx-text);
  text-align: left;
}

/* 分数：hero 档（40/48）+ 等宽数字位 */
.r-score {
  display: flex;
  align-items: baseline;
  margin-top: 10px;
}

.r-score__value {
  font-size: var(--bx-font-hero);
  font-weight: 600;
  line-height: var(--bx-leading-hero);
  color: var(--bx-primary);
  font-variant-numeric: tabular-nums;
  /* 容器宽度固定：数字从 0 数到目标值时，单位不会左右跳 */
  text-align: right;
}

.r-score__unit {
  margin-left: 8px;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

/* 等级标签：语义色三件套（文字 / 浅底 / 描边） */
.r-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  margin-top: 12px;
  border: 1px solid transparent;
  border-radius: var(--bx-radius-chip);
}

.r-chip__text {
  font-size: var(--bx-font-caption);
  font-weight: 600;
  line-height: var(--bx-leading-caption);
}

.r-chip--pass {
  color: var(--bx-success);
  background-color: var(--bx-success-soft);
  border-color: var(--bx-success-line);
}

.r-chip--fail {
  color: var(--bx-danger);
  background-color: var(--bx-danger-soft);
  border-color: var(--bx-danger-line);
}

.r-verdict {
  display: block;
  margin-top: 10px;
  font-size: var(--bx-font-body);
  line-height: var(--bx-leading-body);
  color: var(--bx-text-2);
}

/* 答对 / 答错 / 未答：细线分隔的一行，不做分格盒子 */
.r-stats {
  display: flex;
  align-items: center;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--bx-line-2);
}

.r-stat {
  display: flex;
  align-items: baseline;
}

.r-stat__value {
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: var(--bx-leading-h2);
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
}

.r-stat__label {
  margin-left: 4px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.r-stat__divider {
  width: 1px;
  height: 12px;
  margin: 0 12px;
  background-color: var(--bx-line);
}

.r-hero__batch {
  display: block;
  margin-top: 14px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

/* ── 小节标题：一条短横线 + 文字 ────────────────────────────────── */
.r-section {
  margin-top: 20px;
}

.r-section__head {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  padding-left: 2px;
}

.r-section__rule {
  width: 24px;
  height: 2px;
  margin-right: 10px;
  background-color: var(--bx-line-strong);
  border-radius: 1px;
}

.r-section__title {
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
}

/* ── 逐题得分 ─────────────────────────────────────────────────────── */
.r-scores {
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

.r-bar-row {
  display: flex;
  align-items: center;
  padding: 12px 16px;
}

.r-bar-row + .r-bar-row {
  border-top: 1px solid var(--bx-line-2);
}

.r-bar-row__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.r-bar-row__track {
  flex: none;
  width: 84px;
  height: 4px;
  margin-left: 12px;
  overflow: hidden;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-pill);
}

.r-bar-row__fill {
  height: 100%;
  background-color: var(--bx-primary);
  border-radius: var(--bx-radius-pill);
}

.r-bar-row__value {
  flex: none;
  width: 56px;
  margin-left: 10px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-2);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.r-bar-row__value--none {
  color: var(--bx-text-3);
}

/*
 * 窄屏：细条与数值列各收一档，把宽度让给题干
 *
 * 375px 屏上题干只剩 130px 会被截成「您对当前工作的整体…」，
 * 而完整题干在下方「逐题回顾」里还有，这里只要能认出是哪一题就够。
 */
@media (max-width: 420px) {
  .r-bar-row__track {
    width: 56px;
    margin-left: 8px;
  }

  .r-bar-row__value {
    width: 48px;
    margin-left: 8px;
  }
}

/* ── 逐题回顾 ─────────────────────────────────────────────────────── */
.r-list {
  margin-top: 20px;
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

.r-item {
  padding: 16px;
}

.r-item + .r-item {
  border-top: 1px solid var(--bx-line-2);
}

.r-item__head {
  display: flex;
  align-items: flex-start;
}

.r-item__label {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-body);
  line-height: var(--bx-leading-body);
  color: var(--bx-text);
}

.r-badge {
  flex-shrink: 0;
  padding: 2px 9px;
  margin-left: 10px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  border-radius: var(--bx-radius-chip);
}

/* 判定徽章改用语义令牌（此前是硬编码的 rgba(0,180,42,.1) 之类） */
.r-badge--correct {
  color: var(--bx-success);
  background-color: var(--bx-success-soft);
}

.r-badge--wrong {
  color: var(--bx-danger);
  background-color: var(--bx-danger-soft);
}

.r-badge--unanswered {
  color: var(--bx-text-3);
  background-color: var(--bx-line-2);
}

.r-item__line {
  display: flex;
  margin-top: 8px;
}

.r-item__key {
  flex-shrink: 0;
  width: 62px;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-3);
}

.r-item__value {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
  word-break: break-all;
}

.r-item__value--right {
  color: var(--bx-success);
}

/* 图片题：作答值是文件批次号，必须先换成真实图片再展示 */
.r-item__images {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.r-item__image {
  width: 64px;
  height: 64px;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

/* ── 引用块：左侧 2px 主色条，不整块上色 ────────────────────────── */
.r-quote {
  padding: 4px 0 4px 14px;
  margin-top: 16px;
  border-left: 2px solid var(--bx-primary);
}

.r-quote__text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
}

/* 动作区：主操作在前，次级与返回在后 */
.r-page__actions {
  margin-top: 24px;
}

/* 两个按钮之间留间距；不依赖子组件根元素能否被作用域样式命中 */
.r-page__actions > :not(:first-child) {
  margin-top: 10px;
}

/* ── 动效 ─────────────────────────────────────────────────────────
 * 逐题得分条：宽度 0 → 目标，逐条 delay 60ms（规范 §5.2 第 11 条）。
 *
 * 逐项动画只在 H5 端做（规范 §5.3）：小程序端长列表逐项动画会掉帧。
 */
/* #ifdef H5 */
.r-bar-row__fill {
  transition: width 700ms var(--bx-ease-out);
}
/* #endif */

/*
 * 逐条 delay（60ms 递增）
 *
 * 规则放在条件编译之外：没有 transition 时 transition-delay 不生效，
 * 小程序端自然退化为「无动画」。
 */
@for $i from 1 through 20 {
  .r-bar-row:nth-child(#{$i}) .r-bar-row__fill {
    transition-delay: #{($i - 1) * 60}ms;
  }
}
</style>
