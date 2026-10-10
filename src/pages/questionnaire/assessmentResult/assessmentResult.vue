<script setup lang="ts">
/**
 * 评估结果页（老工程 assessmentResult/assessmentResult）
 *
 * 入参：activity_no、fill_batch_no
 */

import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxNavBar from '@/components/base/BxNavBar.vue'
import SuggestionPanel from '@/components/questionnaire/SuggestionPanel.vue'

const activityNo = ref('')
const fillBatchNo = ref('')

onLoad((query) => {
  activityNo.value = decodeURIComponent(String(query?.activity_no ?? ''))
  fillBatchNo.value = decodeURIComponent(String(query?.fill_batch_no ?? ''))
})
</script>

<template>
  <view class="ar-page">
    <BxNavBar title="评估结果" />

    <view class="ar-page__body bx-container">
      <SuggestionPanel :activity-no="activityNo" :fill-batch-no="fillBatchNo" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ar-page {
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.ar-page__body {
  padding-top: 12px;
  padding-bottom: 32px;
}
</style>
