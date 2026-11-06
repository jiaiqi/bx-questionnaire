<script setup lang="ts">
/**
 * 问卷统计（管理端）
 *
 * 数据链路（全部走现有平台服务，没有新增后端）：
 * - 配置：`srvdaq_init_view_select`（plain）
 * - 记录：`srvdaq_record_reply_select`（分页拉取）
 * - 逐题：`srvdaq_init_view_select`（use + fill_batch_no，`user_data` 完整）→ merge 兜底
 *
 * 三个刻意的取舍：
 * 1. 逐题明细每份一次请求，默认只取一批样本并显式标注覆盖范围，不假装是「全量」；
 * 2. KPI / 趋势 / 成绩分布只看记录表，不依赖明细，打开页面即可用；
 * 3. 图表全部用 CSS 实现（无图表库、无 `<svg>`），保证小程序端也能渲染。
 */

import type { ReplyStateFilter } from '@/composables/useSurveyStats'

import type { QuestionStat } from '@/domain/stats/types'

import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import { computed, ref, watch } from 'vue'

import BxAppearanceSheet from '@/components/base/BxAppearanceSheet.vue'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxSkeleton from '@/components/base/BxSkeleton.vue'
import { useSurveyStats } from '@/composables/useSurveyStats'
import { editorDesignUrl, editorListUrl } from '@/domain/editor/routes'
import { coverUrl } from '@/domain/questionnaire/routes'
import { widgetLabel } from '@/domain/stats'
import { readQuery } from '@/utils/query'

definePage({ style: { enablePullDownRefresh: true } })

const activityNo = ref('')

/** 外观设置面板（仅 H5；小程序端跟随系统） */
const appearanceOpen = ref(false)

const {
  activityTitle,
  activityStatus,
  replyTotal,
  replyCapped,
  loading,
  loadingDetails,
  error,
  detailError,
  detailProgress,
  range,
  stateFilter,
  filteredReplies,
  overview,
  trend,
  maxScore,
  scoreBuckets,
  questionStats,
  coverage,
  load,
  loadMoreDetails,
  exportReplies,
  exportDetails,
} = useSurveyStats(activityNo)

const rangeOptions: Array<{ value: typeof range.value, label: string }> = [
  { value: 'all', label: '全部' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
]

const stateOptions: Array<{ value: ReplyStateFilter, label: string }> = [
  { value: 'all', label: '全部' },
  { value: '完成', label: '完成' },
  { value: '未完成', label: '未完成' },
]

const ROW_PAGE_SIZE = 10
const rowPage = ref(1)

watch([filteredReplies, stateFilter, range], () => {
  rowPage.value = 1
})

const pagedReplies = computed(() => {
  const start = (rowPage.value - 1) * ROW_PAGE_SIZE
  return filteredReplies.value.slice(start, start + ROW_PAGE_SIZE)
})

const rowPageCount = computed(() => Math.max(1, Math.ceil(filteredReplies.value.length / ROW_PAGE_SIZE)))

const hasRows = computed(() => filteredReplies.value.length > 0)
const showEmpty = computed(() => !loading.value && !error.value && !hasRows.value)
const trendMax = computed(() => Math.max(1, ...trend.value.map(point => point.count)))

/** batchNo → 昵称：文本样本展示人名比批次号更有用 */
const nameByBatch = computed(() => new Map(filteredReplies.value.map(reply => [reply.batchNo, reply.userName])))

/** 文本样本默认只展示 3 条，避免一屏被同一道题占满 */
const expandedSamples = ref(new Set<string>())

function isSamplesExpanded(key: string): boolean {
  return expandedSamples.value.has(key)
}

function toggleSamples(key: string): void {
  const next = new Set(expandedSamples.value)
  if (next.has(key)) {
    next.delete(key)
  }
  else {
    next.add(key)
  }
  expandedSamples.value = next
}

function visibleSamples(stat: Extract<QuestionStat, { kind: 'text' | 'other' }>): typeof stat.samples {
  return isSamplesExpanded(stat.key) ? stat.samples : stat.samples.slice(0, 3)
}

function sampleName(batchNo: string): string {
  return nameByBatch.value.get(batchNo) ?? batchNo.slice(0, 8)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function scoreText(value: number | null): string {
  return value === null ? '—' : String(round1(value))
}

function percentText(value: number): string {
  return `${Math.round(value * 100)}%`
}

function durationText(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return '—'
  }
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) {
    return `${total} 秒`
  }
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes < 60) {
    return rest === 0 ? `${minutes} 分` : `${minutes} 分 ${rest} 秒`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分`
}

function dateTimeText(value: string): string {
  const text = String(value ?? '')
  return text.length >= 16 ? text.slice(0, 16) : text || '—'
}

function optionWidth(percent: number): string {
  return `${Math.max(0, Math.min(1, percent)) * 100}%`
}

function bucketWidth(count: number, max: number): string {
  return `${max <= 0 ? 0 : Math.round((count / max) * 100)}%`
}

function maxBucketCount(buckets: Array<{ count: number }>): number {
  return Math.max(1, ...buckets.map(bucket => bucket.count))
}

function stateClass(state: string): string {
  return state === '完成' ? 'is-done' : 'is-pending'
}

function choiceStat(stat: QuestionStat): stat is Extract<QuestionStat, { kind: 'choice' }> {
  return stat.kind === 'choice'
}

function numberStat(stat: QuestionStat): stat is Extract<QuestionStat, { kind: 'number' }> {
  return stat.kind === 'number'
}

function textLikeStat(stat: QuestionStat): stat is Extract<QuestionStat, { kind: 'text' | 'other' }> {
  return stat.kind === 'text' || stat.kind === 'other'
}

function goBack(): void {
  uni.navigateBack({
    fail: () => {
      uni.reLaunch({ url: editorListUrl() })
    },
  })
}

function goDesign(): void {
  uni.navigateTo({ url: editorDesignUrl(activityNo.value) })
}

function goAnswer(): void {
  uni.navigateTo({ url: coverUrl(activityNo.value) })
}

function onRefresh(): void {
  void load().finally(() => {
    uni.stopPullDownRefresh()
  })
}

onPullDownRefresh(() => {
  onRefresh()
})

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')
})
</script>

<template>
  <view class="stats">
    <!-- 顶栏：返回 / 品牌 / 面包屑 / 刷新 -->
    <view class="stats__appbar">
      <view
        class="stats__back"
        role="button"
        tabindex="0"
        aria-label="返回问卷列表"
        @click="goBack"
        @keydown.enter.prevent="goBack"
      >
        <view class="stats__back-arrow" aria-hidden="true" />
      </view>
      <view class="stats__appbar-div" aria-hidden="true" />
      <view class="stats__brand">
        <view class="stats__mark" aria-hidden="true">
          问
        </view>
        <text class="stats__wordmark">园区问卷</text>
      </view>
      <view class="stats__appbar-div" aria-hidden="true" />
      <text class="stats__crumb">统计</text>
      <view class="stats__appbar-spacer" />
      <!-- #ifdef H5 -->
      <BxButton
        type="secondary"
        size="small"
        aria-label="外观设置"
        @click="appearanceOpen = true"
      >
        外观
      </BxButton>
      <!-- #endif -->
      <BxButton type="secondary" size="small" aria-label="刷新统计" @click="load">
        刷新
      </BxButton>
    </view>

    <view class="stats__main bx-container bx-container--wide">
      <!-- 页头 -->
      <view class="stats__head">
        <view class="stats__headtext">
          <view class="stats__title-row">
            <text class="stats__title">{{ activityTitle || '问卷统计' }}</text>
            <text v-if="activityStatus" class="stats__status">{{ activityStatus }}</text>
          </view>
          <view class="stats__sub">
            <text class="stats__sub-item">活动号 {{ activityNo || '—' }}</text>
            <text class="stats__sub-item">
              已回收 <text class="stats__num">{{ replyTotal }}</text> 份
            </text>
            <text v-if="maxScore > 0" class="stats__sub-item">满分 {{ maxScore }} 分</text>
          </view>
        </view>
        <view class="stats__head-actions">
          <BxButton type="secondary" size="small" aria-label="查看问卷" @click="goAnswer">
            查看问卷
          </BxButton>
          <BxButton type="secondary" size="small" aria-label="编辑问卷" @click="goDesign">
            编辑
          </BxButton>
          <BxButton type="primary" size="small" aria-label="导出答卷" :disabled="!hasRows" @click="exportReplies">
            导出答卷
          </BxButton>
        </view>
      </view>

      <!-- 筛选 -->
      <view class="stats__filters">
        <view class="stats__seg" role="group" aria-label="时间范围">
          <view
            v-for="option in rangeOptions"
            :key="option.value"
            class="stats__seg-item"
            :class="{ 'is-active': range === option.value }"
            role="button"
            tabindex="0"
            :aria-pressed="range === option.value ? 'true' : 'false'"
            @click="range = option.value"
            @keydown.enter.prevent="range = option.value"
          >
            {{ option.label }}
          </view>
        </view>
        <view class="stats__filters-div" aria-hidden="true" />
        <view class="stats__seg" role="group" aria-label="作答状态">
          <view
            v-for="option in stateOptions"
            :key="option.value"
            class="stats__seg-item"
            :class="{ 'is-active': stateFilter === option.value }"
            role="button"
            tabindex="0"
            :aria-pressed="stateFilter === option.value ? 'true' : 'false'"
            @click="stateFilter = option.value"
            @keydown.enter.prevent="stateFilter = option.value"
          >
            {{ option.label }}
          </view>
        </view>
        <view class="stats__filters-spacer" />
        <text v-if="replyCapped" class="stats__cap-note">
          记录较多，仅统计最近 {{ filteredReplies.length }} 份
        </text>
      </view>

      <!-- 加载 / 错误 / 空 -->
      <view v-if="loading" class="stats__loading">
        <text class="stats__loading-text">正在加载统计…</text>
        <BxSkeleton :lines="5" :height="18" />
      </view>

      <view v-else-if="error" class="stats__state">
        <BxEmpty text="统计加载失败" :tip="error" />
        <BxButton type="secondary" size="small" aria-label="重试加载统计" @click="load">
          重试
        </BxButton>
      </view>

      <view v-else-if="showEmpty" class="stats__state">
        <BxEmpty text="还没有回收记录" tip="问卷发出后，这里会显示回收份数、完成率与逐题分布" />
        <!-- 空态给出口：看完提示总得知道下一步去哪 -->
        <view class="stats__state-actions">
          <BxButton type="secondary" size="small" aria-label="去填写问卷" @click="goAnswer">
            去填一份
          </BxButton>
          <BxButton type="ghost" size="small" aria-label="去编辑问卷" @click="goDesign">
            去编辑问卷
          </BxButton>
        </view>
      </view>

      <template v-else>
        <!-- KPI -->
        <view class="stats__kpis">
          <view class="stats__kpi">
            <text class="stats__kpi-label">回收份数</text>
            <view class="stats__kpi-value-row">
              <text class="stats__kpi-value">{{ overview.total }}</text>
              <text class="stats__kpi-unit">份</text>
            </view>
            <text class="stats__kpi-foot">当前筛选范围</text>
          </view>
          <view class="stats__kpi">
            <text class="stats__kpi-label">完成率</text>
            <view class="stats__kpi-value-row">
              <text class="stats__kpi-value">{{ percentText(overview.completionRate) }}</text>
            </view>
            <text class="stats__kpi-foot">{{ overview.completed }} / {{ overview.total }} 份完成</text>
          </view>
          <view class="stats__kpi">
            <text class="stats__kpi-label">平均分</text>
            <view class="stats__kpi-value-row">
              <text class="stats__kpi-value">{{ scoreText(overview.avgScore) }}</text>
              <text v-if="overview.avgScore !== null" class="stats__kpi-unit">分</text>
            </view>
            <text class="stats__kpi-foot">
              最高 {{ scoreText(overview.maxScore) }} · 最低 {{ scoreText(overview.minScore) }}
            </text>
          </view>
          <view class="stats__kpi">
            <text class="stats__kpi-label">平均用时</text>
            <view class="stats__kpi-value-row">
              <text class="stats__kpi-value">{{ durationText(overview.avgDurationSec) }}</text>
            </view>
            <text class="stats__kpi-foot">仅统计已完成答卷</text>
          </view>
        </view>

        <!-- 趋势 + 成绩分布 -->
        <view class="stats__charts">
          <view class="stats__card stats__trend">
            <view class="stats__card-head">
              <text class="stats__card-title">提交趋势</text>
              <text class="stats__card-meta">近 14 天</text>
            </view>
            <view class="stats__trend-bars">
              <view
                v-for="point in trend"
                :key="point.date"
                class="stats__trend-col"
                :aria-label="`${point.date} 提交 ${point.count} 份`"
              >
                <view class="stats__trend-bar-wrap">
                  <view
                    class="stats__trend-bar"
                    :class="{ 'is-zero': point.count === 0 }"
                    :style="{ height: `${Math.max(point.count === 0 ? 2 : 8, (point.count / trendMax) * 100)}%` }"
                  />
                </view>
                <text class="stats__trend-count">{{ point.count || '' }}</text>
                <text class="stats__trend-label">{{ point.label.slice(3) }}</text>
              </view>
            </view>
          </view>

          <view class="stats__card stats__score">
            <view class="stats__card-head">
              <text class="stats__card-title">成绩分布</text>
              <text class="stats__card-meta">满分 {{ maxScore }} 分</text>
            </view>
            <view v-if="scoreBuckets.length > 0" class="stats__bars">
              <view v-for="bucket in scoreBuckets" :key="bucket.label" class="stats__bar-row">
                <text class="stats__bar-label">{{ bucket.label }}</text>
                <view class="stats__bar-track">
                  <view
                    class="stats__bar-fill"
                    :style="{ width: bucketWidth(bucket.count, maxBucketCount(scoreBuckets)) }"
                  />
                </view>
                <text class="stats__bar-value">{{ bucket.count }}</text>
              </view>
            </view>
            <text v-else class="stats__card-empty">这份问卷没有可统计的分值</text>
          </view>
        </view>

        <!-- 逐题分析 -->
        <view class="stats__section">
          <view class="stats__section-head">
            <view>
              <text class="stats__section-title">逐题分析</text>
              <text class="stats__section-sub">
                基于 {{ coverage.detailCount }} 份作答的服务端聚合
                <text v-if="coverage.capped">
                  （共 {{ coverage.completedInFilter }} 份完成，逐题取前 {{ coverage.detailCount }} 份）
                </text>
              </text>
            </view>
            <view class="stats__section-actions">
              <text v-if="loadingDetails" class="stats__progress">
                正在加载 {{ detailProgress.done }} / {{ detailProgress.total }}
              </text>
              <BxButton
                v-else-if="coverage.hasMore"
                type="secondary"
                size="small"
                aria-label="加载更多逐题明细"
                @click="loadMoreDetails"
              >
                加载更多
              </BxButton>
              <BxButton
                type="secondary"
                size="small"
                aria-label="导出逐题分布"
                :disabled="coverage.detailCount === 0"
                @click="exportDetails"
              >
                导出分布
              </BxButton>
            </view>
          </view>
          <text v-if="detailError" class="stats__error-text">{{ detailError }}</text>

          <view v-if="questionStats.length === 0" class="stats__card">
            <BxEmpty text="还没有逐题数据" tip="完成作答后，这里会按题型显示选项分布、数值区间与文本样本" />
          </view>

          <view v-for="stat in questionStats" :key="stat.key" class="stats__card stats__q">
            <view class="stats__q-head">
              <text class="stats__q-no">{{ String(stat.index).padStart(2, '0') }}</text>
              <text class="stats__q-title">{{ stat.label }}</text>
              <text class="stats__q-meta">
                {{ widgetLabel(stat.widget) }} · 作答 {{ stat.answered }} · 未答 {{ stat.unanswered }}
              </text>
            </view>

            <!-- 选项类：横向分布条 -->
            <view v-if="choiceStat(stat)" class="stats__bars">
              <view v-for="bar in stat.options" :key="bar.value" class="stats__bar-row">
                <text class="stats__bar-label">{{ bar.label }}</text>
                <view class="stats__bar-track">
                  <view class="stats__bar-fill" :style="{ width: optionWidth(bar.percent) }" />
                </view>
                <text class="stats__bar-value">{{ bar.count }} · {{ percentText(bar.percent) }}</text>
              </view>
            </view>

            <!-- 数字类：均值 + 区间 -->
            <template v-else-if="numberStat(stat)">
              <view class="stats__numeric">
                <view class="stats__numeric-item">
                  <text class="stats__numeric-label">平均</text>
                  <text class="stats__numeric-value">{{ round1(stat.numeric.avg) }}</text>
                </view>
                <view class="stats__numeric-item">
                  <text class="stats__numeric-label">中位数</text>
                  <text class="stats__numeric-value">{{ round1(stat.numeric.median) }}</text>
                </view>
                <view class="stats__numeric-item">
                  <text class="stats__numeric-label">最小</text>
                  <text class="stats__numeric-value">{{ round1(stat.numeric.min) }}</text>
                </view>
                <view class="stats__numeric-item">
                  <text class="stats__numeric-label">最大</text>
                  <text class="stats__numeric-value">{{ round1(stat.numeric.max) }}</text>
                </view>
              </view>
              <view v-if="stat.buckets.length > 0" class="stats__bars">
                <view v-for="bucket in stat.buckets" :key="bucket.label" class="stats__bar-row">
                  <text class="stats__bar-label">{{ bucket.label }}</text>
                  <view class="stats__bar-track">
                    <view
                      class="stats__bar-fill"
                      :style="{ width: bucketWidth(bucket.count, maxBucketCount(stat.buckets)) }"
                    />
                  </view>
                  <text class="stats__bar-value">{{ bucket.count }}</text>
                </view>
              </view>
            </template>

            <!-- 文本 / 其他：样本（默认 3 条，可展开） -->
            <view v-else-if="textLikeStat(stat)" class="stats__samples">
              <view
                v-for="(sample, sampleIndex) in visibleSamples(stat)"
                :key="`${sample.value}-${sampleIndex}`"
                class="stats__sample"
              >
                <text class="stats__sample-batch">{{ sample.count ? `${sample.count} 人` : sampleName(sample.batchNo ?? '') }}</text>
                <text class="stats__sample-text">{{ sample.value }}</text>
              </view>
              <text v-if="stat.samples.length === 0" class="stats__card-empty">暂无作答样本</text>
              <view
                v-else-if="stat.samples.length > 3"
                class="stats__samples-toggle"
                role="button"
                tabindex="0"
                :aria-expanded="isSamplesExpanded(stat.key) ? 'true' : 'false'"
                @click="toggleSamples(stat.key)"
                @keydown.enter.prevent="toggleSamples(stat.key)"
              >
                {{ isSamplesExpanded(stat.key) ? '收起样本' : `展开全部 ${stat.samples.length} 条` }}
              </view>
            </view>

            <!-- 兜底：未知题型 -->
            <text v-else class="stats__card-empty">该题型暂不支持统计展示</text>
          </view>
        </view>

        <!-- 答卷明细 -->
        <view class="stats__section">
          <view class="stats__section-head">
            <view>
              <text class="stats__section-title">答卷明细</text>
              <text class="stats__section-sub">{{ filteredReplies.length }} 份记录</text>
            </view>
            <BxButton type="secondary" size="small" aria-label="导出答卷" :disabled="!hasRows" @click="exportReplies">
              导出答卷
            </BxButton>
          </view>

          <view class="stats__table">
            <view class="stats__table-head">
              <text class="stats__th stats__th--name">昵称</text>
              <text class="stats__th stats__th--state">状态</text>
              <text class="stats__th stats__th--score">得分</text>
              <text class="stats__th stats__th--time">提交时间</text>
              <text class="stats__th stats__th--dur">用时</text>
            </view>
            <view v-for="reply in pagedReplies" :key="reply.batchNo" class="stats__row">
              <view class="stats__row-main">
                <text class="stats__row-name">{{ reply.userName }}</text>
                <text class="stats__row-meta">{{ reply.userType || '匿名' }}</text>
              </view>
              <view class="stats__row-cell stats__row-state">
                <text class="stats__state-dot" :class="stateClass(reply.state)" aria-hidden="true" />
                <text class="stats__row-text">{{ reply.state || '未知' }}</text>
              </view>
              <text class="stats__row-cell stats__row-score">{{ scoreText(reply.score) }}</text>
              <text class="stats__row-cell stats__row-time">{{ dateTimeText(reply.createTime) }}</text>
              <text class="stats__row-cell stats__row-dur">{{ durationText(reply.durationSec) }}</text>
            </view>
            <view v-if="pagedReplies.length === 0" class="stats__table-empty">
              <text class="stats__card-empty">当前筛选没有记录</text>
            </view>
          </view>

          <view v-if="rowPageCount > 1" class="stats__pager">
            <BxButton
              type="secondary"
              size="small"
              aria-label="上一页"
              :disabled="rowPage <= 1"
              @click="rowPage = Math.max(1, rowPage - 1)"
            >
              上一页
            </BxButton>
            <text class="stats__pager-text">{{ rowPage }} / {{ rowPageCount }}</text>
            <BxButton
              type="secondary"
              size="small"
              aria-label="下一页"
              :disabled="rowPage >= rowPageCount"
              @click="rowPage = Math.min(rowPageCount, rowPage + 1)"
            >
              下一页
            </BxButton>
          </view>
        </view>

        <text class="stats__footnote">
          统计基于服务端聚合（group）：KPI、趋势、成绩分布与逐题分布均为全量口径；
          逐题分布最多覆盖 {{ coverage.detailCount }} 份完成答卷，文本题按去重答案展示人数。
        </text>
      </template>
    </view>

    <!-- #ifdef H5 -->
    <BxAppearanceSheet v-if="appearanceOpen" @close="appearanceOpen = false" />
    <!-- #endif -->
  </view>
</template>

<style lang="scss" scoped>
/* ── 外壳 ─────────────────────────────────────────────────────────── */
.stats {
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.stats__appbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 var(--bx-space-lg);
  background-color: var(--bx-surface);
  border-bottom: 1px solid var(--bx-line);
}

.stats__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
}

.stats__back:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.stats__back-arrow {
  width: 8px;
  height: 8px;
  border-bottom: 1.5px solid var(--bx-text-2);
  border-left: 1.5px solid var(--bx-text-2);
  transform: rotate(45deg);
}

.stats__appbar-div {
  width: 1px;
  height: 18px;
  margin: 0 var(--bx-space-md);
  background-color: var(--bx-line);
}

.stats__brand {
  display: flex;
  align-items: center;
  gap: var(--bx-space-sm);
}

.stats__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background-color: var(--bx-primary);
  border-radius: 7px;
}

.stats__wordmark {
  font-size: var(--bx-font-sub);
  font-weight: 600;
  color: var(--bx-text);
}

.stats__crumb {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
}

.stats__appbar-spacer {
  flex: 1;
}

.stats__main {
  padding-top: var(--bx-space-xl);
  padding-bottom: var(--bx-space-2xl);
}

/* ── 页头 ─────────────────────────────────────────────────────────── */
.stats__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--bx-space-lg);
  margin-bottom: var(--bx-space-lg);
}

.stats__headtext {
  min-width: 0;
}

.stats__title-row {
  display: flex;
  align-items: center;
  gap: var(--bx-space-sm);
}

.stats__title {
  font-size: var(--bx-font-title);
  font-weight: 600;
  line-height: var(--bx-leading-title);
  color: var(--bx-text);
}

.stats__status {
  padding: 1px 8px;
  font-size: var(--bx-font-caption);
  line-height: 20px;
  color: var(--bx-success);
  background-color: var(--bx-success-soft);
  border-radius: var(--bx-radius-pill);
}

.stats__sub {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 6px;
}

.stats__sub-item {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
}

.stats__num {
  font-weight: 600;
  color: var(--bx-text-2);
  font-variant-numeric: tabular-nums;
}

.stats__head-actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: var(--bx-space-sm);
}

/* ── 筛选 ─────────────────────────────────────────────────────────── */
.stats__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bx-space-sm);
  margin-bottom: var(--bx-space-lg);
}

.stats__seg {
  display: flex;
  padding: 2px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.stats__seg-item {
  padding: 4px 10px;
  font-size: var(--bx-font-caption);
  line-height: 20px;
  color: var(--bx-text-2);
  cursor: pointer;
  border-radius: 6px;
}

.stats__seg-item.is-active {
  color: var(--bx-text);
  background-color: var(--bx-surface-2);
  box-shadow: 0 1px 2px rgb(16 24 40 / 0.06);
}

.stats__seg-item:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.stats__filters-div {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background-color: var(--bx-line);
}

.stats__filters-spacer {
  flex: 1;
}

.stats__cap-note {
  font-size: var(--bx-font-caption);
  color: var(--bx-danger);
}

/* ── 加载 / 错误 / 空 ─────────────────────────────────────────────── */
.stats__loading {
  display: flex;
  flex-direction: column;
  gap: var(--bx-space-md);
  padding: var(--bx-space-xl);
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

.stats__loading-text {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
}

.stats__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--bx-space-xl) 0;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

/* 空态动作：两个按钮并排，与提示文案留出间距 */
.stats__state-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: var(--bx-space-md);
}

/* ── KPI ──────────────────────────────────────────────────────────── */
.stats__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: var(--bx-space-lg);
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

.stats__kpi {
  padding: 18px 20px;
}

.stats__kpi + .stats__kpi {
  border-left: 1px solid var(--bx-line-2);
}

.stats__kpi-label {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
}

.stats__kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 4px;
}

.stats__kpi-value {
  font-size: 28px;
  font-weight: 600;
  line-height: 36px;
  letter-spacing: -0.02em;
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
}

.stats__kpi-unit {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
}

.stats__kpi-foot {
  display: block;
  margin-top: 2px;
  font-size: var(--bx-font-caption);
  line-height: 18px;
  color: var(--bx-text-3);
}

/* ── 卡片与图表 ───────────────────────────────────────────────────── */
.stats__charts {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: var(--bx-space-md);
  margin-bottom: var(--bx-space-lg);
}

.stats__card {
  padding: 16px 18px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

.stats__card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--bx-space-sm);
  margin-bottom: var(--bx-space-md);
}

.stats__card-title {
  font-size: var(--bx-font-sub);
  font-weight: 600;
  color: var(--bx-text);
}

.stats__card-meta {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
}

.stats__trend-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 150px;
}

.stats__trend-col {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  height: 100%;
}

.stats__trend-bar-wrap {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 110px;
}

.stats__trend-bar {
  width: 14px;
  max-width: 100%;
  background-color: var(--bx-primary);
  border-radius: 3px 3px 0 0;
  opacity: 0.9;
}

.stats__trend-bar.is-zero {
  background-color: var(--bx-line-strong);
  opacity: 1;
}

.stats__trend-count {
  height: 16px;
  margin-top: 2px;
  font-size: 10px;
  line-height: 16px;
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

.stats__trend-label {
  font-size: 10px;
  line-height: 14px;
  color: var(--bx-text-4);
}

.stats__bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats__bar-row {
  display: grid;
  grid-template-columns: minmax(80px, 180px) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bx-space-sm);
}

.stats__bar-label {
  overflow: hidden;
  font-size: var(--bx-font-caption);
  line-height: 18px;
  color: var(--bx-text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats__bar-track {
  height: 6px;
  overflow: hidden;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-pill);
}

.stats__bar-fill {
  height: 100%;
  background-color: var(--bx-primary);
  border-radius: var(--bx-radius-pill);
}

.stats__bar-value {
  min-width: 64px;
  font-size: var(--bx-font-caption);
  line-height: 18px;
  color: var(--bx-text-3);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.stats__card-empty {
  display: block;
  padding: 8px 0;
  font-size: var(--bx-font-caption);
  line-height: 20px;
  color: var(--bx-text-3);
}

/* ── 逐题 ─────────────────────────────────────────────────────────── */
.stats__section {
  margin-top: var(--bx-space-lg);
}

.stats__section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--bx-space-md);
  margin-bottom: var(--bx-space-md);
}

.stats__section-title {
  font-size: var(--bx-font-h2);
  font-weight: 600;
  color: var(--bx-text);
}

.stats__section-sub {
  display: block;
  margin-top: 2px;
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
}

.stats__section-actions {
  display: flex;
  align-items: center;
  gap: var(--bx-space-sm);
}

.stats__progress {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

.stats__error-text {
  display: block;
  margin-bottom: var(--bx-space-sm);
  font-size: var(--bx-font-caption);
  color: var(--bx-danger);
}

.stats__q + .stats__q {
  margin-top: var(--bx-space-sm);
}

.stats__q-head {
  display: flex;
  align-items: baseline;
  gap: var(--bx-space-sm);
  margin-bottom: var(--bx-space-md);
}

.stats__q-no {
  flex: none;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--bx-text-4);
  font-variant-numeric: tabular-nums;
}

.stats__q-title {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-body);
  font-weight: 600;
  line-height: 1.5;
  color: var(--bx-text);
}

.stats__q-meta {
  flex: none;
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
}

.stats__numeric {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--bx-space-sm);
  margin-bottom: var(--bx-space-md);
}

.stats__numeric-item {
  padding: 8px 10px;
  background-color: var(--bx-surface-2);
  border-radius: var(--bx-radius-sm);
}

.stats__numeric-label {
  display: block;
  font-size: 11px;
  color: var(--bx-text-3);
}

.stats__numeric-value {
  display: block;
  margin-top: 2px;
  font-size: var(--bx-font-h2);
  font-weight: 600;
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
}

.stats__samples {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stats__sample {
  display: flex;
  gap: var(--bx-space-sm);
  padding: 8px 10px;
  background-color: var(--bx-surface-2);
  border-radius: var(--bx-radius-sm);
}

.stats__sample-batch {
  flex: none;
  min-width: 48px;
  font-size: 11px;
  line-height: 20px;
  color: var(--bx-text-3);
}

.stats__sample-text {
  font-size: var(--bx-font-caption);
  line-height: 20px;
  color: var(--bx-text-2);
  word-break: break-all;
}

.stats__samples-toggle {
  align-self: flex-start;
  padding: 2px 0;
  font-size: var(--bx-font-caption);
  color: var(--bx-primary);
  cursor: pointer;
  border-radius: var(--bx-radius-xs);
}

.stats__samples-toggle:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

/* ── 明细表 ───────────────────────────────────────────────────────── */
.stats__table {
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

.stats__table-head {
  display: grid;
  grid-template-columns: minmax(140px, 1.4fr) 100px 90px minmax(140px, 1fr) 100px;
  gap: var(--bx-space-sm);
  padding: 10px 16px;
  background-color: var(--bx-surface-2);
  border-bottom: 1px solid var(--bx-line-2);
}

.stats__th {
  font-size: var(--bx-font-caption);
  font-weight: 500;
  color: var(--bx-text-3);
}

.stats__row {
  display: grid;
  grid-template-columns: minmax(140px, 1.4fr) 100px 90px minmax(140px, 1fr) 100px;
  align-items: center;
  gap: var(--bx-space-sm);
  min-height: 52px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--bx-line-2);
}

.stats__row:last-child {
  border-bottom: 0;
}

.stats__row-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.stats__row-name {
  overflow: hidden;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  color: var(--bx-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats__row-meta {
  font-size: 11px;
  color: var(--bx-text-4);
}

.stats__row-cell {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-2);
}

.stats__row-state {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stats__state-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.stats__state-dot.is-done {
  background-color: var(--bx-success);
}

.stats__state-dot.is-pending {
  background-color: var(--bx-text-4);
}

.stats__row-score,
.stats__row-time,
.stats__row-dur {
  font-variant-numeric: tabular-nums;
}

.stats__table-empty {
  padding: 24px 16px;
  text-align: center;
}

.stats__pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--bx-space-sm);
  margin-top: var(--bx-space-md);
}

.stats__pager-text {
  font-size: var(--bx-font-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

.stats__footnote {
  display: block;
  margin-top: var(--bx-space-lg);
  font-size: var(--bx-font-caption);
  line-height: 20px;
  color: var(--bx-text-4);
}

/* ── 响应式 ───────────────────────────────────────────────────────── */
@media (max-width: 899px) {
  .stats__appbar {
    padding: 0 var(--bx-space-md);
  }

  .stats__main {
    padding-top: var(--bx-space-lg);
  }

  .stats__head {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--bx-space-md);
  }

  .stats__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stats__kpi:nth-child(3) {
    border-left: 0;
  }

  .stats__kpi:nth-child(n + 3) {
    border-top: 1px solid var(--bx-line-2);
  }

  .stats__charts {
    grid-template-columns: minmax(0, 1fr);
  }

  .stats__section-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .stats__q-head {
    flex-wrap: wrap;
  }

  .stats__q-meta {
    width: 100%;
    margin-top: -4px;
  }

  .stats__numeric {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stats__table-head {
    display: none;
  }

  .stats__row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'main state'
      'time dur';
    row-gap: 4px;
    padding: 10px 14px;
  }

  .stats__row-main {
    grid-area: main;
  }

  .stats__row-state {
    grid-area: state;
    justify-self: end;
  }

  .stats__row-score {
    display: none;
  }

  .stats__row-time {
    grid-area: time;
  }

  .stats__row-dur {
    grid-area: dur;
    justify-self: end;
  }

  .stats__bar-row {
    grid-template-columns: minmax(64px, 120px) minmax(0, 1fr) auto;
  }

  .stats__bar-value {
    min-width: 52px;
  }
}

@media (max-width: 520px) {
  .stats__title {
    font-size: var(--bx-font-h2);
  }

  /* 375 宽仍用两列：一列会把 4 个 KPI 拉成 4 屏高 */
  .stats__kpi-value {
    font-size: 24px;
    line-height: 32px;
  }

  .stats__head-actions {
    width: 100%;
  }
}
</style>
