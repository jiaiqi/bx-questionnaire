<script setup lang="ts">
/**
 * 结果页（路由别名保持 /questionnaire/index/result 兼容）
 *
 * 业务逻辑全部在 `useResultPage`：取服务端分数、按批次号二次拉取图片/引用/地址的展示值、
 * 逐题对错与入口联动。页面只留模板、样式与绑定，页面与逻辑的改动互不牵连。
 *
 * 入参：activity_no（必填）、fill_batch_no
 */

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
        <view class="r-card">
          <text class="r-card__title">{{ activity?.title || '问卷' }}</text>

          <view v-if="hasScore" class="r-score">
            <text class="r-score__value">{{ score.score }}</text>
            <text class="r-score__unit">/ {{ score.total }} 分</text>
          </view>

          <text v-if="passed !== null" class="r-verdict" :class="passed ? 'r-verdict--pass' : 'r-verdict--fail'">
            {{ passed ? '恭喜，已通过' : `未通过（合格线 ${passingMark} 分）` }}
          </text>

          <view v-if="hasScore" class="r-stats">
            <view class="r-stat">
              <text class="r-stat__value">{{ score.correctCount }}</text>
              <text class="r-stat__label">答对</text>
            </view>
            <view class="r-stat">
              <text class="r-stat__value">{{ score.wrongCount }}</text>
              <text class="r-stat__label">答错</text>
            </view>
            <view class="r-stat">
              <text class="r-stat__value">{{ score.unansweredCount }}</text>
              <text class="r-stat__label">未答</text>
            </view>
          </view>

          <text v-if="batchNo" class="r-card__batch">批次号：{{ batchNo }}</text>
        </view>

        <view v-if="activity?.submitted_tip" class="r-tip">
          <text class="r-tip__text">{{ activity.submitted_tip }}</text>
        </view>

        <view class="r-list">
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

        <view v-if="activity?.end_remark" class="r-tip">
          <text class="r-tip__text">{{ activity.end_remark }}</text>
        </view>

        <view class="r-page__actions">
          <BxButton v-if="showSuggestionEntry" type="ghost" block @click="openSuggestion">
            查看评估结果
          </BxButton>
          <BxButton v-if="canRetry" block @click="restart">
            重新测试
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
  padding-top: 12px;
  padding-bottom: 32px;
}

/* 加载骨架 */
.r-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.r-skeleton__hero {
  height: 168px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-card);
}

.r-skeleton__row {
  height: 96px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-card);
}

.r-card {
  padding: 24px 16px 20px;
  background-color: var(--bx-surface);
  box-shadow: var(--bx-elev-1);
  border-radius: var(--bx-radius-card);
}

.r-card__title {
  display: block;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--bx-text);
  text-align: center;
}

.r-card__batch {
  display: block;
  margin-top: 14px;
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-3);
  text-align: center;
}

/* 分数是这一页的主角：用 hero 档（40/48）+ 等宽数字位 */
.r-score {
  display: flex;
  align-items: baseline;
  justify-content: center;
  margin-top: 12px;
}

.r-score__value {
  font-size: var(--bx-font-hero);
  font-weight: 600;
  line-height: var(--bx-leading-hero);
  color: var(--bx-primary);
  font-variant-numeric: tabular-nums;
}

.r-score__unit {
  margin-left: 6px;
  font-size: 14px;
  color: var(--bx-text-3);
}

.r-verdict {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  text-align: center;
}

.r-verdict--pass {
  color: var(--bx-success);
}

.r-verdict--fail {
  color: var(--bx-danger);
}

/* 答对 / 答错 / 未答：分格 + 竖线，与封面页的信息网格同一套语言 */
.r-stats {
  display: flex;
  margin-top: 20px;
  overflow: hidden;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.r-stat {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  padding: 12px 8px;
  border-left: 1px solid var(--bx-line-2);
}

.r-stat:first-child {
  border-left: 0;
}

.r-stat__value {
  font-size: 18px;
  font-weight: 600;
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
}

.r-stat__label {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-3);
}

.r-tip {
  padding: 12px 16px;
  margin-top: 12px;
  background-color: var(--bx-primary-soft);
  border-radius: var(--bx-radius);
}

.r-tip__text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--bx-primary-active);
}

/* 逐题回顾容器化：同质条目用分割线，不用逐条阴影 */
.r-list {
  margin-top: 12px;
  overflow: hidden;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
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
  font-size: 15px;
  line-height: 1.6;
  color: var(--bx-text);
}

.r-badge {
  flex-shrink: 0;
  padding: 2px 9px;
  margin-left: 10px;
  font-size: 12px;
  line-height: 18px;
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
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-text-3);
}

.r-item__value {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
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

.r-page__actions {
  margin-top: 20px;
}

/* 两个按钮之间留间距；不依赖子组件根元素能否被作用域样式命中 */
.r-page__actions > :not(:first-child) {
  margin-top: 10px;
}
</style>
