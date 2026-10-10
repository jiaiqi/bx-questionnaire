<script setup lang="ts">
/**
 * 答题页（老工程入口页）
 *
 * 入参：activity_no（必填）、formType、status、fill_batch_no（续答 / 查看）
 * 主体逻辑在 QuestionnaireRunner 中，与 survey/survey 共用。
 */

import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxEmpty from '@/components/base/BxEmpty.vue'
import QuestionnaireRunner from '@/components/questionnaire/QuestionnaireRunner.vue'

const activityNo = ref('')
const formType = ref('form')
const fillBatchNo = ref('')

onLoad((query) => {
  activityNo.value = String(query?.activity_no ?? '')
  formType.value = String(query?.formType ?? 'form')
  fillBatchNo.value = String(query?.fill_batch_no ?? '')
})
</script>

<template>
  <QuestionnaireRunner
    v-if="activityNo"
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
