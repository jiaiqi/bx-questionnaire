<script setup lang="ts">
/**
 * 答题页（老工程入口页）
 *
 * 入参：activity_no（必填）、formType、status、fill_batch_no（续答 / 查看）
 * 主体逻辑在 QuestionnaireRunner 中，与 survey/survey 共用。
 */

import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxEmpty from '@/components/base/BxEmpty.vue'
import QuestionnaireRunner from '@/components/questionnaire/QuestionnaireRunner.vue'
import { queryString, shareAnswerPath } from '@/domain/questionnaire/routes'
import { readQuery } from '@/utils/query'

const activityNo = ref('')
const formType = ref('form')
const fillBatchNo = ref('')

/** 读取 Runner 暴露出来的活动标题，用于小程序分享 */
const runner = ref<{ activityTitle?: string } | null>(null)

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')
  formType.value = readQuery(query, 'formType', 'form')
  fillBatchNo.value = readQuery(query, 'fill_batch_no')
})

function shareTitle(): string {
  return String(runner.value?.activityTitle || '邀请你填写问卷')
}
/**
 * 分享给好友：`path` 不带前导 `/` 是 `onShareAppMessage` 的要求
 * 与老工程一致，好友点开可直接作答。
 */
onShareAppMessage(() => ({
  title: shareTitle(),
  path: `/${shareAnswerPath(activityNo.value)}`,
}))

/** 分享到朋友圈：`query` 只接受查询串，不能带页面路径 */
onShareTimeline(() => ({
  title: shareTitle(),
  query: queryString({ formType: 'form', activity_no: activityNo.value, status: '进行中' }),
}))
</script>

<template>
  <QuestionnaireRunner
    v-if="activityNo"
    ref="runner"
    :activity-no="activityNo"
    :form-type="formType"
    :fill-batch-no="fillBatchNo"
  />
  <view v-else class="empty-page">
    <BxEmpty text="缺少活动编号" tip="请从活动入口或二维码重新进入" />
  </view>
</template>

<style lang="scss" scoped>
.empty-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: var(--bx-bg);
}
</style>
