<script setup lang="ts">
/**
 * 调研答题页（老工程 survey/survey）
 *
 * 与 index/index 同源，仅结果页指向 survey/result。
 */

import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxEmpty from '@/components/base/BxEmpty.vue'
import QuestionnaireRunner from '@/components/questionnaire/QuestionnaireRunner.vue'
import { readQuery } from '@/utils/query'

const activityNo = ref('')
const formType = ref('form')
const fillBatchNo = ref('')

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')
  formType.value = readQuery(query, 'formType', 'form')
  fillBatchNo.value = readQuery(query, 'fill_batch_no')
})
</script>

<template>
  <QuestionnaireRunner
    v-if="activityNo"
    :activity-no="activityNo"
    :form-type="formType"
    :fill-batch-no="fillBatchNo"
    result-path="/pages/questionnaire/survey/result"
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
