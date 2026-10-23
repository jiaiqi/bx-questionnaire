<script setup lang="ts">
/**
 * 评估结果页（老工程 assessmentResult/assessmentResult）
 *
 * 入参：activity_no、fill_batch_no
 *
 * 视觉（docs/UI-UX-V6-设计系统.md §5/§6）：
 * 状态条（成功点 + 已提交）→ 评估建议卡。页面底 `--bx-bg`，内容走 `.bx-container`。
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
  <view class="ar-page">
    <BxNavBar title="评估结果" :fallback-url="coverUrl(activityNo)" />

    <view class="ar-page__body bx-container">
      <!-- 状态条：成功点 + 文字，状态不只靠颜色 -->
      <view class="ar-status">
        <view class="ar-status__dot" aria-hidden="true" />
        <text class="ar-status__text">已提交</text>
      </view>

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
  padding-top: 16px;
  padding-bottom: 32px;
}

.ar-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  border-bottom: 1px solid var(--bx-line-2);
}

.ar-status__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--bx-success);
}

.ar-status__text {
  font-size: var(--bx-font-sub);
  font-weight: 500;
  line-height: var(--bx-leading-sub);
  color: var(--bx-success);
}
</style>
