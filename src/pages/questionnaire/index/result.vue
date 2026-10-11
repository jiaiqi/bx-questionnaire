<script setup lang="ts">
/**
 * 结果页（路由别名保持 /questionnaire/index/result 兼容）
 *
 * 入参：activity_no（必填）、fill_batch_no
 */

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { recordReplyMergeSelect, recordReplySelect } from '@/api/daq/record'
import { attachmentSelect, resolveFileUrl } from '@/api/file/attachment'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'

import BxNavBar from '@/components/base/BxNavBar.vue'
import { useEmbedResize } from '@/composables/useEmbedResize'
import { useQuestionnaire } from '@/composables/useQuestionnaire'
import {
  calcScore,
  describeAnswer,
  describeSelected,
  formatQuestionTitle,
  mergeAnswerSources,
  serverAnswersToAnswerMap,
  toMergeAnswerMap,
} from '@/domain/questionnaire'
import { shouldShowRetryEntry, shouldShowSuggestionEntry } from '@/domain/questionnaire/entry'
import { imageAnswerTargets } from '@/domain/questionnaire/images'
import { pickRefLabel, refAnswerTargets } from '@/domain/questionnaire/refs'
import { answerUrl, coverUrl, suggestionUrl } from '@/domain/questionnaire/routes'
import { readQuery } from '@/utils/query'
import { bxSelect } from '@/utils/request'

const { loading, activity, fields, backfill, errorMessage, load } = useQuestionnaire()

// 逐题回顾列表长度取决于题目数，嵌入场景下高度变化明显
useEmbedResize()

const activityNo = ref('')
const batchNo = ref('')

/** 服务端权威结果：得分 / 状态 / 每题作答值（拿不到时回退本地计算） */
const serverScore = ref<number | null>(null)
const serverState = ref('')
const serverAnswers = ref<Record<string, string>>({})
/**
 * 维度汇总是否成功返回
 *
 * `record_reply_merge_select` 需要登录态（**不带票据**时返回 0011「需要登录访问」，
 * 业务请求层会自动带票据，因此正常可用）；而 `record_reply_select` 本身无需登录，
 * 但**按用户维度查询**（condition 带 `user_no`）时平台还要求调用者的平台会话身份，
 * 无会话会静默返回空结果。两者都失败时页面必须能区分：
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
  // 这是「我的作答」唯一可用的服务端数据源（merge 服务只返回汇总行，
  // 没有 option_data / points 列，无法用于逐题判对错）。
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
  await loadAnswerImages()
  await loadAnswerRefs()
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

/** 服务端 merge 的作答（含选项序号还原），用于与服务端统计保持一致 */
const serverAnswerMap = computed(() => serverAnswersToAnswerMap(fields.value, serverAnswers.value))

/**
 * 逐题作答（展示与判分共用同一个来源）
 *
 * `user_data` 优先、merge 兜底 —— 实测 merge 对多选**只保留一个值**：
 * 批次 d9102bc9 第 2 题正确答案是 `1、2`，user_data 给 `["1","2"]`（判分 20，与服务端一致），
 * merge 只给 `"2"`（判分 10）。若优先用 merge，页面会「用户答对却显示回答错误」，
 * 且逐题得分加不出顶部总分。
 */
const answerMap = computed(() => mergeAnswerSources(serverAnswerMap.value, backfill.value))

/**
 * 图片题的作答值是**文件批次号**，回顾页必须先把它换成真实图片地址
 *
 * 不换的话，「我的作答」会直接显示 `20261011121039186100` 这种内部 ID ——
 * 用户上传的是照片，看到的却是编号（实测确认，见验收清单）。
 */
const answerImages = ref<Record<string, string[]>>({})
/** 至少有一条图片题的附件没查出来（网络/权限），用于给出解释而不是假装没有 */
const answerImagesFailed = ref(false)

async function loadAnswerImages(): Promise<void> {
  const targets = imageAnswerTargets(
    fields.value.map(field => ({ key: field.key, widget: field.widget, value: answerMap.value[field.key] })),
  )
  if (!targets.length) {
    return
  }

  const grouped: Record<string, string[]> = {}
  let failed = false

  await Promise.all(targets.map(async ({ key, fileNo }) => {
    try {
      const envelope = await attachmentSelect({ fileNo })
      const urls = (envelope.data ?? [])
        .map(row => resolveFileUrl(row.fileurl))
        .filter(Boolean)
      if (urls.length) {
        grouped[key] = [...(grouped[key] ?? []), ...urls]
      }
    }
    catch {
      failed = true
    }
  }))

  answerImages.value = grouped
  answerImagesFailed.value = failed
}

/**
 * 引用题的作答值是**被引用记录的编号**，同样必须先换成展示列
 *
 * 与图片题是同一类问题：不换的话「我的作答」显示的是 `20261011113133000003`
 * 这种内部 ID。数据源配置由 `parseRefConfig` 解析（与 `BxRefSelector` 共用一份）。
 */
const answerRefLabels = ref<Record<string, string>>({})

async function loadAnswerRefs(): Promise<void> {
  const targets = refAnswerTargets(
    fields.value.map(field => ({
      key: field.key,
      widget: field.widget,
      value: answerMap.value[field.key],
      raw: field.raw as Record<string, unknown>,
    })),
  )
  if (!targets.length) {
    return
  }

  const labels: Record<string, string> = {}
  await Promise.all(targets.map(async (target) => {
    try {
      const envelope = await bxSelect<Record<string, unknown>>({
        serviceName: target.config.serviceName,
        ...(target.config.app ? { app: target.config.app } : {}),
        colNames: ['*'],
        condition: [{ colName: target.config.valueCol, ruleType: 'eq', value: target.value }],
        page: { pageNo: 1, rownumber: 20 },
      })
      labels[target.key] = [labels[target.key], pickRefLabel(envelope.data ?? [], target)]
        .filter(Boolean)
        .join('、')
    }
    catch {
      // 解析失败不影响整页：回退到原值，并在下面标明「暂时读不到」
      labels[target.key] = labels[target.key] ?? target.value
    }
  }))

  answerRefLabels.value = labels
}
/**
 * 是否拿到了「用户作答」数据（任一来源）
 *
 * 决定未作答文案是「未作答」还是「暂无法获取」：两者不能混为一谈 ——
 * 前者是服务端明确说这道题没作答，后者是我们根本没拿到数据，谎报成未作答会误导用户。
 */
const answersLoaded = computed(() =>
  serverAnswersLoaded.value || Object.keys(backfill.value).length > 0,
)
/** 统计口径与逐题展示一致，避免出现「逐题显示有作答、统计却全是 0」这种自相矛盾的页面 */
const localScore = computed(() => calcScore(fields.value, answerMap.value))
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

/**
 * 逐题判分结果，按题目 key 索引
 *
 * `calcScore` 只把「有正确答案」的题放进 detail —— 文本/数字这类没有选项答案的题
 * 不在其中，所以 **detail 缺失 ≠ 答错**，两者必须分开呈现。
 */
const detailMap = computed(() => new Map(score.value.detail.map(item => [item.key, item])))

const rows = computed(() =>
  fields.value
    .filter(field => field.widget !== 'section')
    .map((field) => {
      const detail = detailMap.value.get(field.key)
      // 有 detail 才判对错；correct 为 null 表示该题无正确答案（不计分）
      const judged = detail !== undefined && detail.correct !== null
      const correct = judged && detail.correct === true
      const unanswered = judged && detail.selected.length === 0

      /**
       * 展示与判分同源：选项题还原成选项文案，文本/数字题直接用原值。
       *
       * 图片题与引用题例外：它们的作答值都是**内部编号**（文件批次号 /
       * 被引用记录编号），展示原值就是给用户看 ID。图片题渲染缩略图，
       * 引用题用解析出的展示列。
       */
      const raw = answerMap.value[field.key]
      const hasValue = Array.isArray(raw) ? raw.length > 0 : String(raw ?? '').trim().length > 0
      const mineText = field.widget === 'image'
        ? (hasValue ? '已上传图片' : '')
        : field.widget === 'ref'
          ? (answerRefLabels.value[field.key] || (hasValue ? '已选择' : ''))
          : describeSelected(field, answerMap.value)

      return {
        key: field.key,
        title: formatQuestionTitle(field.index, field.label),
        mine: mineText || (answersLoaded.value ? '未作答' : '暂无法获取'),
        isImage: field.widget === 'image',
        images: answerImages.value[field.key] ?? [],
        expected: describeAnswer(field),
        // 逐题结论：correct / wrong / unanswered / unjudged（无正确答案，不计分）
        verdict: !judged ? 'unjudged' : unanswered ? 'unanswered' : correct ? 'correct' : 'wrong',
        verdictText: !judged
          ? '不计分'
          : unanswered ? '未作答' : correct ? '回答正确' : '回答错误',
        // 本题得分只在答对时给。实测 parkDev：逐题分值加总 == 服务端总分（20 == 20），
        // 所以逐题分数与顶部总分不会互相矛盾。
        earned: correct ? field.points : 0,
        points: field.points,
        // 解析的列名是 `answer_analysis`，不是 explanation；未配置时取到空串则不渲染
        analysis: String(field.raw.answer_analysis ?? '').trim(),
      }
    }),
)

/** 活动已结束就不该给「重新测试」入口 —— 点进去也答不了 */
const canRetry = computed(() => shouldShowRetryEntry(activity.value?.status))

/** 是否显示「查看评估结果」入口（判定规则见 shouldShowSuggestionEntry） */
const showSuggestionEntry = computed(() =>
  shouldShowSuggestionEntry(activity.value?.info_collect_type, batchNo.value),
)

/** 查看评估结果（建议区间来自 srvdaq_activity_sug_select） */
function openSuggestion(): void {
  uni.navigateTo({ url: suggestionUrl(activityNo.value, batchNo.value) })
}

/**
 * 返回问卷封面
 *
 * 原实现跳 `/pages/questionnaire/cover/index` 却**不带 activity_no**，而封面页要求该参数
 * 必填 —— 用户看到的是「缺少活动编号，无法加载问卷」死胡同（已实测确认）。
 * 带上活动号才是真实可用的页面。
 */
function goHome(): void {
  uni.reLaunch({ url: coverUrl(activityNo.value) })
}

/**
 * 重新测试
 *
 * 与老工程 `restart()` 同一跳转目标；答题页把 formType 默认成 form，所以可以省略。
 * 这里显式写上，避免依赖默认值。
 */
function restart(): void {
  uni.redirectTo({ url: answerUrl(activityNo.value, { status: '进行中' }) })
}
</script>

<template>
  <view class="r-page">
    <BxNavBar title="作答结果" :fallback-url="coverUrl(activityNo)" />

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

.r-badge {
  flex-shrink: 0;
  padding: 1px 8px;
  margin-left: 10px;
  font-size: 12px;
  line-height: 1.6;
  border-radius: 999px;
}

.r-badge--correct {
  color: var(--bx-success);
  background-color: rgba(0, 180, 42, 0.1);
}

.r-badge--wrong {
  color: var(--bx-danger);
  background-color: rgba(245, 63, 63, 0.1);
}

.r-badge--unanswered {
  color: var(--bx-text-3);
  background-color: var(--bx-line-2);
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
  border-radius: var(--bx-radius);
}

.r-page__actions {
  margin-top: 20px;
}

/* 两个按钮之间留间距；不依赖子组件根元素能否被作用域样式命中 */
.r-page__actions > :not(:first-child) {
  margin-top: 10px;
}
</style>
