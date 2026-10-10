<script setup lang="ts">
/**
 * 答题页（老工程入口页，路由别名保持 /questionnaire/index/index 兼容）
 *
 * 入参：activity_no（必填）、formType、status、fill_batch_no（续答 / 查看）
 */

import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import BxProgressBar from '@/components/base/BxProgressBar.vue'
import BxFieldRenderer from '@/components/form/BxFieldRenderer.vue'

import { useAnswerModel } from '@/composables/useAnswerModel'
import { useDraft } from '@/composables/useDraft'
import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { useSubmit } from '@/composables/useSubmit'
import { validateRequired } from '@/domain/questionnaire'
import { useSessionStore } from '@/stores/session'
import { BxError } from '@/utils/request'
import { confirmDialog, scrollToSelector, toast } from '@/utils/ui'

const session = useSessionStore()
const { loading, activity, fields, backfill, errorMessage, load } = useQuestionnaire()
const { answers, progress, replace } = useAnswerModel(() => fields.value)
const { savedTip, save: saveDraftItem, saveAll: saveAllDraft } = useDraft()
const { submitting, submit } = useSubmit()

const activityNo = ref('')
const formType = ref('form')
const errors = ref<Record<string, string>>({})

const title = computed(() => activity.value?.title || '问卷')
const intro = computed(() => activity.value?.start_remark || '')
/** 已结束的活动按只读展示；formType=view 亦为查看模式 */
const readOnly = computed(() => activity.value?.status === '已结束' || formType.value === 'view')

onLoad((query) => {
  activityNo.value = String(query?.activity_no ?? '')
  formType.value = String(query?.formType ?? 'form')
  const batchNo = String(query?.fill_batch_no ?? '') || session.fillBatchNo
  void init(batchNo)
})

async function init(batchNo: string): Promise<void> {
  if (!activityNo.value) {
    errorMessage.value = '缺少活动编号，无法加载问卷'
    return
  }

  const ok = await load(activityNo.value, {
    mode: 'plain',
    fillBatchNo: batchNo || undefined,
  })
  if (!ok) {
    return
  }

  if (Object.keys(backfill.value).length > 0) {
    replace(backfill.value)
  }
}

function onAnswerChange(field: QuestionField, value: AnswerValue): void {
  answers[field.key] = value
  if (errors.value[field.key]) {
    delete errors.value[field.key]
  }

  // 逐题即时保存草稿（老工程方案），批次号回传后写回会话
  void saveDraftItem({
    activityNo: activityNo.value,
    fillBatchNo: session.fillBatchNo || undefined,
    field,
    answers,
    onBatchNo: batchNo => session.setFillBatchNo(batchNo),
  })
}

async function onSaveDraft(): Promise<void> {
  await saveAllDraft({
    activityNo: activityNo.value,
    fillBatchNo: session.fillBatchNo || undefined,
    fields: fields.value,
    answers,
    onBatchNo: batchNo => session.setFillBatchNo(batchNo),
  })
  toast(savedTip.value)
}

async function onSubmit(): Promise<void> {
  const issues = validateRequired(fields.value, answers)
  if (issues.length > 0) {
    const next: Record<string, string> = {}
    for (const issue of issues) {
      next[issue.key] = issue.message
    }
    errors.value = next
    scrollToSelector(`#q-${issues[0]!.key}`)
    toast(`还有 ${issues.length} 道必填题未作答`)
    return
  }

  const confirmed = await confirmDialog('提交后无法修改，确认提交吗？', '提交确认')
  if (!confirmed) {
    return
  }

  try {
    const result = await submit({
      activityNo: activityNo.value,
      fillBatchNo: session.fillBatchNo || undefined,
      fields: fields.value,
      answers,
    })
    if (!result.ok) {
      return
    }
    if (result.batchNo) {
      session.setFillBatchNo(result.batchNo)
    }
    uni.redirectTo({
      url: `/pages/questionnaire/index/result?activity_no=${activityNo.value}&fill_batch_no=${result.batchNo}`,
    })
  }
  catch (error) {
    toast(error instanceof BxError ? error.message : '提交失败，请稍后重试')
  }
}
</script>

<template>
  <view class="q-page">
    <BxNavBar :title="title" />
    <BxProgressBar :percent="progress.percent" />

    <view class="q-page__body bx-container">
      <view v-if="loading" class="q-page__state">
        <text class="q-page__state-text">正在加载问卷…</text>
      </view>

      <BxEmpty
        v-else-if="errorMessage"
        :text="errorMessage"
        tip="请确认链接是否有效，或联系活动发起人"
      />

      <template v-else>
        <view class="q-intro">
          <text class="q-intro__title">{{ title }}</text>
          <text v-if="intro" class="q-intro__desc">{{ intro }}</text>
          <view class="q-intro__meta">
            <text class="q-intro__meta-text">共 {{ progress.total }} 题</text>
            <text class="q-intro__meta-dot">·</text>
            <text class="q-intro__meta-text">已答 {{ progress.answered }}</text>
            <template v-if="activity?.answer_times">
              <text class="q-intro__meta-dot">·</text>
              <text class="q-intro__meta-text">{{ activity.answer_times }}</text>
            </template>
          </view>
          <text v-if="readOnly" class="q-intro__readonly">该问卷已结束，以下为查看模式</text>
        </view>

        <view class="q-list">
          <BxFieldRenderer
            v-for="field in fields"
            :key="field.key"
            :field="field"
            :model-value="answers[field.key]"
            :error="errors[field.key]"
            :disabled="readOnly"
            @update:model-value="value => onAnswerChange(field, value)"
          />
        </view>
      </template>
    </view>

    <view v-if="!loading && !errorMessage && !readOnly" class="q-footer">
      <text v-if="savedTip" class="q-footer__tip">{{ savedTip }}</text>
      <view class="q-footer__actions">
        <BxButton type="ghost" @click="onSaveDraft">
          暂存草稿
        </BxButton>
        <view class="q-footer__primary">
          <BxButton :loading="submitting" block @click="onSubmit">
            {{ activity?.submit_label || '提交问卷' }}
          </BxButton>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.q-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.q-page__body {
  flex: 1;
  padding-top: 12px;
  padding-bottom: 16px;
}

.q-page__state {
  padding: 64px 0;
  text-align: center;
}

.q-page__state-text {
  font-size: 14px;
  color: var(--bx-text-3);
}

.q-intro {
  padding: 18px 16px;
  margin-bottom: 8px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
}

.q-intro__title {
  display: block;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--bx-text);
}

.q-intro__desc {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--bx-text-2);
}

.q-intro__meta {
  display: flex;
  align-items: center;
  margin-top: 12px;
}

.q-intro__meta-text {
  font-size: 12px;
  color: var(--bx-text-3);
}

.q-intro__meta-dot {
  margin: 0 6px;
  font-size: 12px;
  color: var(--bx-text-3);
}

.q-intro__readonly {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: var(--bx-warn);
}

.q-list {
  display: flex;
  flex-direction: column;
}

.q-list > :not(:first-child) {
  margin-top: 8px;
}

.q-footer {
  position: sticky;
  bottom: 0;
  z-index: 10;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background-color: var(--bx-surface);
  border-top: 1px solid var(--bx-line-2);
}

.q-footer__tip {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--bx-text-3);
  text-align: center;
}

.q-footer__actions {
  display: flex;
  align-items: center;
}

.q-footer__primary {
  flex: 1;
  margin-left: 10px;
}
</style>
