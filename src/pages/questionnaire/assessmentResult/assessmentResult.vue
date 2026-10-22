<script setup lang="ts">
/**
 * 评估结果页（老工程 assessmentResult/assessmentResult）
 *
 * 入参：activity_no、fill_batch_no
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
  <view class="ar-page">
    <BxNavBar title="评估结果" :fallback-url="coverUrl(activityNo)" />

    <view class="ar-page__body bx-container">
      <!-- 提交标记：一枚主色对勾（纯 CSS 绘制，不用 svg） -->
      <view class="ar-head">
        <view class="ar-head__check" aria-hidden="true" />
        <text class="ar-head__text">已提交</text>
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
  padding-top: 20px;
  padding-bottom: 32px;
}

.ar-head {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.ar-head__check {
  position: relative;
  flex: none;
  width: 22px;
  height: 22px;
  background-color: var(--bx-primary);
  border-radius: 50%;
}

/* 对勾：两条边框转出来的，不用图标字体也不用 svg */
.ar-head__check::after {
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

.ar-head__text {
  margin-left: 8px;
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-primary);
}
</style>
