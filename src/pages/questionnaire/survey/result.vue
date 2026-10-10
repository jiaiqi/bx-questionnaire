<script setup lang="ts">
/**
 * 调研结果页（老工程 survey/result）
 *
 * 入参：activity_no、fill_batch_no
 * 与 assessmentResult 同源（都取 srvdaq_activity_sug_select）。
 */

import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxNavBar from '@/components/base/BxNavBar.vue'
import SuggestionPanel from '@/components/questionnaire/SuggestionPanel.vue'
import { coverUrl } from '@/domain/questionnaire/routes'
import { readQuery } from '@/utils/query'

const activityNo = ref('')
const fillBatchNo = ref('')

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')
  fillBatchNo.value = readQuery(query, 'fill_batch_no')
})
</script>

<template>
  <view class="sr-page">
    <BxNavBar title="调研结果" :fallback-url="coverUrl(activityNo)" />

    <view class="sr-page__body bx-container">
      <SuggestionPanel :activity-no="activityNo" :fill-batch-no="fillBatchNo" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.sr-page {
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.sr-page__body {
  padding-top: 12px;
  padding-bottom: 32px;
}
</style>
