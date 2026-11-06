<script setup lang="ts">
/**
 * 结果页（路由别名保持 /questionnaire/index/result 兼容）
 *
 * 业务逻辑全部在 `useResultPage`：取服务端分数、按批次号二次拉取图片/引用/地址的展示值、
 * 逐题对错与入口联动。页面只留模板、样式与绑定，页面与逻辑的改动互不牵连。
 *
 * 入参：activity_no（必填）、fill_batch_no
 *
 * 视觉（docs/UI-UX-V6-设计系统.md §5/§6）：
 * 状态条 → 分数环 → 答对/答错/未答三栏 → 逐题回顾（我的作答 / 正确答案两列）→
 * 说明卡 → 底部动作。分数环用 **CSS conic-gradient + 内圆挖孔** 绘制，
 * 不引入 `<svg>`（微信小程序不支持该标签），也不使用 `color-mix`。
 */

import { computed, ref, watch } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import { posterTimeLabel } from '@/components/share/poster'
import ShareSheet from '@/components/share/ShareSheet.vue'
import { useEmbedResize } from '@/composables/useEmbedResize'
import { useResultPage } from '@/composables/useResultPage'
import { useShare } from '@/composables/useShare'
import { answerUrl } from '@/domain/questionnaire/routes'
import { toast } from '@/utils/ui'

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
  showSuggestionEntry,
  openSuggestion,
  goHome,
  coverUrl,
} = useResultPage()

/**
 * 分数计数动画（规范 §6.1）：0 → 目标值，900ms ease-out
 *
 * 只在**数值**上插值，字重与字距全程不变 —— 数字一动就改字重会抖。
 * 分数环的角度由同一个数值算出来，两者天然同步。
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

/**
 * 分数环的填充角度
 *
 * 用 conic-gradient 画弧：不支持该函数的旧内核会退化成「只有轨道」，
 * 分数数字仍然可读 —— 不会出现空白。
 */
const ringDeg = computed(() => {
  const total = Math.round(Number(score.value.total) || 0)
  if (total <= 0) {
    return 0
  }
  const ratio = Math.max(0, Math.min(1, Number(displayScore.value) / total))
  return ratio * 360
})

const ringImage = computed(() => {
  const deg = ringDeg.value
  return `conic-gradient(var(--bx-primary) 0deg, var(--bx-primary) ${deg}deg, transparent ${deg}deg, transparent 360deg)`
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
 * 口径说明里的「计分题」数量
 *
 * 需求 11 之后页面不再有「逐题得分」一节，但顶部「计分题 N 道 · 满分 X 分」
 * 仍要给出数量，且必须与三栏统计同源，否则会出现
 * 「计分题 4 道，答对 + 答错 + 未答却只有 2」的自相矛盾。
 *
 * 口径 = 有分值且能判分的题（有正确答案）：
 * - 没分值的题不参与统计；
 * - 有分值但没有正确答案的题（脏数据）无法判分，也不算计分题。
 */
const countedCount = computed(() =>
  rows.value.filter(row => row.points > 0 && row.verdict !== 'unjudged').length,
)

/** 逐题结论的短标签：颜色之外还要有文字，状态不能只靠颜色 */
function verdictTag(verdict: string): string {
  if (verdict === 'correct') {
    return '答对'
  }
  if (verdict === 'wrong') {
    return '答错'
  }
  if (verdict === 'unanswered') {
    return '未答'
  }
  return '不计分'
}

// ── 分享（H5） ─────────────────────────────────────────────────────

const shareOpen = ref(false)
const { shareLink } = useShare()

/**
 * 分享链接是「邀请作答」链接
 *
 * 保留 activity_no / status（对方打开落在答题页），**不带**当前页的 fill_batch_no
 * 与票据：批次号能让人看到这次作答的逐题内容，票据更是直接泄露身份。
 */
const shareUrl = computed(() =>
  shareLink(answerUrl(activityNo.value, { status: String(activity.value?.status ?? '进行中') })),
)

/** 等级语气：海报与页面共用同一份判定 */
const levelTone = computed<'ok' | 'fail' | 'none'>(() => {
  if (!levelChip.value) {
    return 'none'
  }
  return levelChip.value.cls === 'r-chip--fail' ? 'fail' : 'ok'
})

/** 海报数据；绘制与导出由 ShareSheet 负责 */
const posterData = computed(() => ({
  title: activity.value?.title || '问卷',
  score: hasScore.value ? String(Math.round(Number(score.value.score) || 0)) : '',
  total: hasScore.value ? String(Math.round(Number(score.value.total) || 0)) : '',
  level: levelChip.value?.text || '',
  levelTone: levelTone.value,
  timeText: posterTimeLabel(batchNo.value),
}))

function openShare(): void {
  if (!shareUrl.value) {
    toast('当前环境无法生成分享链接')
    return
  }
  shareOpen.value = true
}
</script>

<template>
  <view class="r-page">
    <BxNavBar title="作答结果" :fallback-url="coverUrl(activityNo)" />

    <view class="r-page__body bx-container">
      <!-- 加载：骨架保持布局稳定，比一行「正在加载结果…」更符合预期 -->
      <view v-if="loading" class="r-skeleton" aria-busy="true">
        <view class="r-skeleton__status" />
        <view class="r-skeleton__ring" />
        <view class="r-skeleton__row" />
        <view class="r-skeleton__row" />
      </view>

      <BxEmpty
        v-else-if="errorMessage"
        :text="errorMessage"
        tip="请确认链接是否有效"
      />

      <template v-else>
        <!-- 状态条：成功点 + 文字（需求 5：不再展示批次号） -->
        <view class="r-status">
          <view class="r-status__dot" aria-hidden="true" />
          <text class="r-status__text">已提交</text>
        </view>

        <!--
          分数是这一页的主角：标题 → 分数环 → 等级 → 结论 → 口径
        -->
        <view class="r-hero">
          <text class="r-hero__title">{{ activity?.title || '问卷' }}</text>

          <template v-if="hasScore">
            <text class="r-hero__label">你的得分</text>

            <view class="r-ring">
              <view class="r-ring__track" aria-hidden="true" />
              <view class="r-ring__val" :style="{ backgroundImage: ringImage }" aria-hidden="true" />
              <view class="r-ring__hole" aria-hidden="true" />
              <view class="r-ring__center">
                <text class="r-ring__score">{{ displayScore }}</text>
                <text class="r-ring__total">/ {{ score.total }}</text>
              </view>
            </view>

            <view v-if="levelChip" class="r-chip" :class="levelChip.cls">
              <text class="r-chip__text">{{ levelChip.text }}</text>
            </view>
          </template>

          <text class="r-verdict">{{ verdictText }}</text>

          <text v-if="hasScore" class="r-hero__cap">
            计分题 {{ countedCount }} 道 · 满分 {{ score.total }} 分
          </text>
        </view>

        <!-- 答对 / 答错 / 未答：细线分隔的一行三栏，不做三个卡 -->
        <view v-if="hasScore" class="r-stats">
          <view class="r-stat">
            <text class="r-stat__num r-stat__num--ok">{{ score.correctCount }}</text>
            <text class="r-stat__label">答对</text>
          </view>
          <view class="r-stat">
            <text class="r-stat__num r-stat__num--bad">{{ score.wrongCount }}</text>
            <text class="r-stat__label">答错</text>
          </view>
          <view class="r-stat">
            <text class="r-stat__num">{{ score.unansweredCount }}</text>
            <text class="r-stat__label">未答</text>
          </view>
        </view>

        <!-- 逐题回顾：我的作答 / 正确答案两列（需求 11：不再显示逐题得分） -->
        <view v-if="rows.length > 0" class="r-review">
          <view class="r-section__head">
            <text class="r-section__title">逐题回顾</text>
            <text class="r-section__meta">{{ rows.length }} 道题</text>
          </view>

          <view class="r-review__card">
            <view v-for="row in rows" :key="row.key" class="r-rq">
              <view class="r-rq__head">
                <text class="r-rq__title">{{ row.title }}</text>
                <!--
                  需求 6：不计分问卷不挂「不计分」标签。
                  判据是活动行的 act_option（平台枚举「评分 / 不评分」），不是分值合计；
                  计分问卷里「无标准答案的题」仍显示「不计分」，这是既有行为。
                -->
                <text
                  v-if="hasScore"
                  class="r-rq__tag"
                  :class="{
                    'r-rq__tag--ok': row.verdict === 'correct',
                    'r-rq__tag--bad': row.verdict === 'wrong',
                  }"
                >
                  {{ verdictTag(row.verdict) }}
                </text>
              </view>

              <!-- 需求 7：没有「正确答案」时只有一列，必须铺满而不是占半宽 -->
              <view class="r-rq__cols" :class="{ 'r-rq__cols--single': !row.expected }">
                <view class="r-rq__col">
                  <text class="r-rq__label">我的作答</text>
                  <view v-if="row.isImage" class="r-rq__images">
                    <image
                      v-for="(img, index) in row.images"
                      :key="index"
                      class="r-rq__image"
                      :src="img"
                      mode="aspectFill"
                      :lazy-load="true"
                      :alt="`第 ${index + 1} 张作答图片`"
                    />
                    <text
                      v-if="row.images.length === 0"
                      class="r-rq__val"
                      :class="{
                        'r-rq__val--ok': row.verdict === 'correct',
                        'r-rq__val--bad': row.verdict === 'wrong',
                      }"
                    >
                      {{ row.mine }}{{ answerImagesFailed ? '（图片暂时读不到）' : '' }}
                    </text>
                  </view>
                  <text
                    v-else
                    class="r-rq__val"
                    :class="{
                      'r-rq__val--ok': row.verdict === 'correct',
                      'r-rq__val--bad': row.verdict === 'wrong',
                    }"
                  >
                    {{ row.mine }}
                  </text>
                </view>

                <view v-if="row.expected" class="r-rq__col">
                  <text class="r-rq__label">正确答案</text>
                  <text class="r-rq__val">{{ row.expected }}</text>
                </view>
              </view>

              <text v-if="row.analysis" class="r-rq__analysis">解析：{{ row.analysis }}</text>
            </view>
          </view>
        </view>

        <!-- 提交提示 / 结束语：浅底说明卡，不整块上色 -->
        <view v-if="activity?.submitted_tip" class="r-note">
          <text class="r-note__text">{{ activity.submitted_tip }}</text>
        </view>

        <view v-if="activity?.end_remark" class="r-note">
          <text class="r-note__text">{{ activity.end_remark }}</text>
        </view>

        <!-- 建议卡：按分数区间生成的评估建议入口（白底卡，不做整块色） -->
        <view v-if="showSuggestionEntry" class="r-suggest">
          <text class="r-suggest__title">评估建议</text>
          <text class="r-suggest__desc">
            系统已按本次得分匹配对应的建议区间，可继续查看完整评估结果。
          </text>
          <view class="r-suggest__action">
            <BxButton type="secondary" block @click="openSuggestion">
              查看评估结果
            </BxButton>
          </view>
        </view>

        <!-- 底部动作：主行动在前（需求 8：不再提供「重新测试」入口） -->
        <view class="r-page__actions">
          <!-- #ifdef H5 -->
          <BxButton type="secondary" block @click="openShare">
            分享结果
          </BxButton>
          <!-- #endif -->
          <BxButton type="ghost" block @click="goHome">
            返回问卷封面
          </BxButton>
        </view>
      </template>
    </view>

    <!-- 分享面板（H5；小程序端组件内保存按钮会降级为提示） -->
    <ShareSheet
      v-if="!loading && !errorMessage"
      :open="shareOpen"
      :url="shareUrl"
      :title="activity?.title || '问卷'"
      :poster="posterData"
      @close="shareOpen = false"
    />
  </view>
</template>

<style lang="scss" scoped>
/* ── 页面骨架 ────────────────────────────────────────────────────── */
.r-page {
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.r-page__body {
  padding-top: 16px;
  padding-bottom: 32px;
}

/* ── 加载骨架 ────────────────────────────────────────────────────── */
.r-skeleton {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.r-skeleton__status {
  width: 100%;
  height: 44px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-sm);
}

.r-skeleton__ring {
  width: 132px;
  height: 132px;
  margin: 0 auto;
  background-color: var(--bx-line-2);
  border-radius: 50%;
}

.r-skeleton__row {
  height: 96px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-card);
}

/* ── 状态条 ──────────────────────────────────────────────────────── */
.r-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  border-bottom: 1px solid var(--bx-line-2);
}

.r-status__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--bx-success);
}

.r-status__text {
  font-size: var(--bx-font-sub);
  font-weight: 500;
  line-height: var(--bx-leading-sub);
  color: var(--bx-success);
}

/* ── 分数主角 ────────────────────────────────────────────────────── */
.r-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 0 20px;
}

.r-hero__title {
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1.5;
  color: var(--bx-text);
  text-align: center;
  overflow-wrap: anywhere;
}

.r-hero__label {
  margin-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
}

/*
 * 分数环：conic-gradient 画弧 + 内圆挖孔
 *
 * - 轨道是 4px 的 line 色圆环，弧在它上面覆盖；
 * - conic-gradient 不支持时弧不渲染，只剩轨道，数字仍然可读；
 * - 不用 `<svg>`：微信小程序不支持该标签。
 */
.r-ring {
  position: relative;
  width: 132px;
  height: 132px;
  margin-top: 12px;
}

.r-ring__track,
.r-ring__val,
.r-ring__hole {
  position: absolute;
  border-radius: 50%;
}

.r-ring__track {
  inset: 0;
  border: 4px solid var(--bx-line);
}

.r-ring__val {
  inset: 0;
}

.r-ring__hole {
  inset: 4px;
  background-color: var(--bx-surface);
}

.r-ring__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.r-ring__score {
  font-size: var(--bx-font-display);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
}

.r-ring__total {
  margin-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: 1;
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

/* 等级标签：语义色三件套（文字 / 浅底 / 描边） */
.r-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  margin-top: 16px;
  border: 1px solid transparent;
  border-radius: var(--bx-radius-chip);
}

.r-chip__text {
  font-size: var(--bx-font-caption);
  font-weight: 500;
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
  margin-top: 12px;
  font-size: var(--bx-font-body);
  line-height: var(--bx-leading-body);
  color: var(--bx-text-2);
  text-align: center;
}

.r-hero__cap {
  margin-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

/* ── 答对 / 答错 / 未答 ──────────────────────────────────────────── */
.r-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--bx-line);
  border-bottom: 1px solid var(--bx-line);
}

.r-stat {
  padding: 12px 0;
  text-align: center;
}

.r-stat + .r-stat {
  border-left: 1px solid var(--bx-line-2);
}

.r-stat__num {
  display: block;
  font-size: var(--bx-font-h2);
  font-weight: 500;
  line-height: 1.3;
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
}

.r-stat__num--ok {
  color: var(--bx-success);
}

.r-stat__num--bad {
  color: var(--bx-danger);
}

.r-stat__label {
  display: block;
  margin-top: 2px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
}

/* ── 小节标题（逐题回顾） ────────────────────────────────────────── */
.r-review {
  margin-top: 16px;
}

.r-section__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
}

.r-section__title {
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1.5;
  color: var(--bx-text);
}

.r-section__meta {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

/* ── 逐题回顾卡片 ────────────────────────────────────────────────── */
.r-review__card {
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
}

/* ── 逐题回顾 ────────────────────────────────────────────────────── */
.r-rq {
  padding: 16px;
}

.r-rq + .r-rq {
  border-top: 1px solid var(--bx-line-2);
}

.r-rq__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.r-rq__title {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-body);
  font-weight: 500;
  line-height: 1.55;
  color: var(--bx-text);
  overflow-wrap: anywhere;
}

.r-rq__tag {
  flex: none;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.r-rq__tag--ok {
  color: var(--bx-success);
}

.r-rq__tag--bad {
  color: var(--bx-danger);
}

/* 我的作答 / 正确答案：两列，标签在上、值在下 */
.r-rq__cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 12px;
}

/*
 * 没有「正确答案」的题只剩一列（需求 7）
 *
 * 不能只靠 `:only-child` 跨端兜底（小程序 Skyline 支持保守），
 * 由模板按行给出修饰类，把单列铺满整宽，避免右半边空白。
 */
.r-rq__cols--single {
  grid-template-columns: minmax(0, 1fr);
}

.r-rq__col {
  min-width: 0;
}

.r-rq__label {
  display: block;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
}

.r-rq__val {
  display: block;
  margin-top: 4px;
  font-size: var(--bx-font-sub);
  line-height: 1.6;
  color: var(--bx-text);
  overflow-wrap: anywhere;
}

.r-rq__val--ok {
  color: var(--bx-success);
}

.r-rq__val--bad {
  color: var(--bx-danger);
}

/* 图片题：作答值是文件批次号，必须先换成真实图片再展示 */
.r-rq__images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}

.r-rq__image {
  width: 64px;
  height: 64px;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.r-rq__analysis {
  display: block;
  margin-top: 8px;
  font-size: var(--bx-font-caption);
  line-height: 1.7;
  color: var(--bx-text-3);
  overflow-wrap: anywhere;
}

/* ── 说明卡（提交提示 / 结束语） ─────────────────────────────────── */
.r-note {
  margin-top: 16px;
  padding: 16px;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-md);
}

.r-note__text {
  display: block;
  font-size: var(--bx-font-sub);
  line-height: 1.75;
  color: var(--bx-text-2);
  overflow-wrap: anywhere;
}

/* ── 建议卡 ──────────────────────────────────────────────────────── */
.r-suggest {
  margin-top: 16px;
  padding: 16px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
}

.r-suggest__title {
  display: block;
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-text);
}

.r-suggest__desc {
  display: block;
  margin-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: 1.75;
  color: var(--bx-text-2);
}

.r-suggest__action {
  margin-top: 12px;
}

/* ── 底部动作 ────────────────────────────────────────────────────── */
.r-page__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
</style>
