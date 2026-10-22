<script setup lang="ts">
/**
 * 调研结果页（老工程 survey/result）
 *
 * 入参：activity_no、fill_batch_no
 * 与 assessmentResult 同源（都取 srvdaq_activity_sug_select）。
 *
 * 视觉（规范 §7.3）：提交标记 + 建议引用块。
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
      <!-- 提交标记：一枚主色对勾（纯 CSS 绘制，不用 svg） -->
      <view class="sr-head">
        <view class="sr-head__check" aria-hidden="true" />
        <text class="sr-head__text">已提交</text>
      </view>

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
  padding-top: 20px;
  padding-bottom: 32px;
}

.sr-head {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.sr-head__check {
  position: relative;
  flex: none;
  width: 22px;
  height: 22px;
  background-color: var(--bx-primary);
  border-radius: 50%;
}

/* 对勾：两条边框转出来的，不用图标字体也不用 svg */
.sr-head__check::after {
  content: '';
  position: absolute;
  top: 5px;
  left: 8px;
  width: 5px;
  height: 9px;
  border-right: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: rotate(45deg);
}

.sr-head__text {
  margin-left: 8px;
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-primary);
}
</style>
