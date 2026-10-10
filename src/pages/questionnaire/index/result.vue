<script setup lang="ts">
/**
 * 结果页（路由别名保持 /questionnaire/index/result 兼容）
 *
 * 入参：activity_no（必填）、fill_batch_no
 */

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { recordReplyMergeSelect, recordReplySelect } from '@/api/daq/record'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'

import BxNavBar from '@/components/base/BxNavBar.vue'
import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { calcScore, describeAnswer, describeSelected, formatQuestionTitle, toMergeAnswerMap } from '@/domain/questionnaire'
import { readQuery } from '@/utils/query'

const { loading, activity, fields, backfill, errorMessage, load } = useQuestionnaire()

const activityNo = ref('')
const batchNo = ref('')

/** 服务端权威结果：得分 / 状态 / 每题作答值（拿不到时回退本地计算） */
const serverScore = ref<number | null>(null)
const serverState = ref('')
const serverAnswers = ref<Record<string, string>>({})
/**
 * 维度汇总是否成功返回
 *
 * `record_reply_merge_select` 需要会话（浏览器端返回 0011「需要登录访问」），
 * 而同一页面的 `record_reply_select` 只需票据。两者都失败时页面必须能区分：
 * 「服务端明确说这道题没作答」与「服务端根本没给作答数据」不是一回事，
 * 前者显示「未作答」，后者不能谎报成未作答。
 */
const serverAnswersLoaded = ref(false)

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')
  batchNo.value = readQuery(query, 'fill_batch_no')
  void init()
})

async function init(): Promise<void> {
  if (!activityNo.value) {
    errorMessage.value = '缺少活动编号，无法查看结果'
    return
  }

  // 必须用 type=use 且带上 fill_batch_no，服务端才会返回 user_data 作答回填 ——
  // 这是「我的作答」唯一可用的服务端数据源（merge 服务需要会话，匿名访问拿不到）。
  // 已结束活动上 type=use 会 FAILURE，此时退回 plain；结果页是只读页面，
  // 必须关掉 autoUpdateState，不能因为「活动已结束」就去改活动状态。
  const ok = await load(activityNo.value, {
    mode: 'use',
    fillBatchNo: batchNo.value || undefined,
    autoUpdateState: false,
  })
  if (!ok) {
    await load(activityNo.value, {
      mode: 'plain',
      fillBatchNo: batchNo.value || undefined,
      autoUpdateState: false,
    })
  }

  await loadServerResult()
}

/**
 * 拉取服务端结果
 *
 * 结果页以服务端为准：`record_reply_select` 给出 score 与 state，
 * `record_reply_merge_select` 按 fill_batch_no 给出每题作答值（svalue）。
 * 任一环节失败都不影响页面 —— 回退到本地 calcScore 与回填值。
 */
async function loadServerResult(): Promise<void> {
  if (!batchNo.value) {
    return
  }

  // 两个查询分开容错：维度汇总（merge）在部分活动上没有数据，
  // 不能因为它失败而丢掉更重要的得分与状态。
  try {
    const reply = await recordReplySelect({
      activityNo: activityNo.value,
      fillBatchNo: batchNo.value,
      rownumber: 1,
    })
    const record = reply.data?.[0]
    if (record) {
      const rawScore = record.score
      serverScore.value = rawScore === null || rawScore === undefined || rawScore === ''
        ? null
        : Number(rawScore)
      serverState.value = String(record.state ?? '')
    }
  }
  catch {
    // 结果页容错：拿不到服务端记录时保持本地计算结果
  }

  try {
    const merge = await recordReplyMergeSelect({ fillBatchNo: batchNo.value })
    serverAnswers.value = toMergeAnswerMap(merge.data)
    serverAnswersLoaded.value = true
  }
  catch {
    // 维度汇总在部分活动上没有数据，失败不影响得分展示
  }
}

const localScore = computed(() => calcScore(fields.value, backfill.value))
/** 服务端有 score 时以它为准，总分仍用本地题目分值合计 */
const score = computed(() => {
  if (serverScore.value !== null) {
    return { ...localScore.value, score: serverScore.value }
  }
  return localScore.value
})
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
      title: formatQuestionTitle(field.index, field.label),
      // 老工程按 item_no 取值，parkDev 实测返回 item_seq（映射里两个键都写了），逐个兜底
      mine: serverAnswers.value[String(field.raw.item_no ?? '')]
        ?? serverAnswers.value[String(field.index)]
        // 服务端作答值拿不到时，才回退本地回填；本地也没有则区分「确实未作答」与「数据不可用」
        ?? (describeSelected(field, backfill.value)
          || (serverAnswersLoaded.value ? '未作答' : '暂无法获取')),
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
              <text class="r-item__label">{{ row.title }}</text>
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
