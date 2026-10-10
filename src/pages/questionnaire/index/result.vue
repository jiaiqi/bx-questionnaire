<script setup lang="ts">
/**
 * 结果页（路由别名保持 /questionnaire/index/result 兼容）
 *
 * 入参：activity_no（必填）、fill_batch_no
 */

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'

import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { calcScore, describeAnswer, describeSelected } from '@/domain/questionnaire'

const { loading, activity, fields, backfill, errorMessage, load } = useQuestionnaire()

const activityNo = ref('')
const batchNo = ref('')

onLoad((query) => {
  activityNo.value = String(query?.activity_no ?? '')
  batchNo.value = String(query?.fill_batch_no ?? '')
  void init()
})

async function init(): Promise<void> {
  if (!activityNo.value) {
    errorMessage.value = '缺少活动编号，无法查看结果'
    return
  }
  await load(activityNo.value, {
    mode: 'plain',
    fillBatchNo: batchNo.value || undefined,
  })
}

const score = computed(() => calcScore(fields.value, backfill.value))
const hasScore = computed(() => score.value.total > 0)
const passingMark = computed(() => Number(activity.value?.passing_mark ?? 0))
const passed = computed(() => {
  if (!hasScore.value || passingMark.value <= 0) {
    return null
  }
  return score.value.score >= passingMark.value
})

const rows = computed(() =>
  fields.value
    .filter(field => field.widget !== 'section')
    .map(field => ({
      key: field.key,
      index: field.index,
      label: field.label,
      mine: describeSelected(field, backfill.value) || '未作答',
      expected: describeAnswer(field),
    })),
)

function goHome(): void {
  uni.reLaunch({ url: '/pages/questionnaire/cover/index' })
}
</script>

<template>
  <view class="r-page">
    <BxNavBar title="作答结果" />

    <view class="r-page__body bx-container">
      <view v-if="loading" class="r-page__state">
        <text class="r-page__state-text">正在加载结果…</text>
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
              <text class="r-item__index">{{ row.index }}.</text>
              <text class="r-item__label">{{ row.label }}</text>
            </view>
            <view class="r-item__line">
              <text class="r-item__key">我的作答</text>
              <text class="r-item__value">{{ row.mine }}</text>
            </view>
            <view v-if="row.expected" class="r-item__line">
              <text class="r-item__key">正确答案</text>
              <text class="r-item__value r-item__value--right">{{ row.expected }}</text>
            </view>
          </view>
        </view>

        <view v-if="activity?.end_remark" class="r-tip">
          <text class="r-tip__text">{{ activity.end_remark }}</text>
        </view>

        <view class="r-page__actions">
          <BxButton type="ghost" block @click="goHome">
            返回问卷首页
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

.r-page__state {
  padding: 64px 0;
  text-align: center;
}

.r-page__state-text {
  font-size: 14px;
  color: var(--bx-text-3);
}

.r-card {
  padding: 20px 16px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
}

.r-card__title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--bx-text);
  text-align: center;
}

.r-card__batch {
  display: block;
  margin-top: 14px;
  font-size: 12px;
  color: var(--bx-text-3);
  text-align: center;
}

.r-score {
  display: flex;
  align-items: baseline;
  justify-content: center;
  margin-top: 16px;
}

.r-score__value {
  font-size: 40px;
  font-weight: 600;
  line-height: 1;
  color: var(--bx-blue);
}

.r-score__unit {
  margin-left: 6px;
  font-size: 14px;
  color: var(--bx-text-3);
}

.r-verdict {
  display: block;
  margin-top: 10px;
  font-size: 14px;
  text-align: center;
}

.r-verdict--pass {
  color: var(--bx-success);
}

.r-verdict--fail {
  color: var(--bx-danger);
}

.r-stats {
  display: flex;
  margin-top: 20px;
}

.r-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.r-stat__value {
  font-size: 18px;
  font-weight: 600;
  color: var(--bx-text);
}

.r-stat__label {
  margin-top: 2px;
  font-size: 12px;
  color: var(--bx-text-3);
}

.r-tip {
  padding: 12px 16px;
  margin-top: 8px;
  background-color: var(--bx-blue-soft);
  border-radius: var(--bx-radius-card);
}

.r-tip__text {
  font-size: 13px;
  line-height: 1.7;
  color: var(--bx-blue-active);
}

.r-list {
  margin-top: 8px;
}

.r-item {
  padding: 14px 16px;
  background-color: var(--bx-surface);
}

.r-item:not(:first-child) {
  margin-top: 1px;
}

.r-item__head {
  display: flex;
  align-items: flex-start;
}

.r-item__index {
  flex-shrink: 0;
  margin-right: 4px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--bx-text);
}

.r-item__label {
  flex: 1;
  font-size: 14px;
  line-height: 1.6;
  color: var(--bx-text);
}

.r-item__line {
  display: flex;
  margin-top: 6px;
}

.r-item__key {
  flex-shrink: 0;
  width: 62px;
  font-size: 13px;
  color: var(--bx-text-3);
}

.r-item__value {
  flex: 1;
  font-size: 13px;
  color: var(--bx-text-2);
  word-break: break-all;
}

.r-item__value--right {
  color: var(--bx-success);
}

.r-page__actions {
  margin-top: 20px;
}
</style>
