<script setup lang="ts">
/**
 * 建议类结果页的共用壳
 *
 * `survey/result`（调研结果）与 `assessmentResult`（评估结果）此前是两个逐字重复的文件，
 * 只有类名前缀与标题不同 —— 已经出现过一次漂移（分享 / 重试 / 返回入口只补在一边）。
 * 这里把「导航栏 + 已提交状态条 + 建议面板」收成一处，两个页面只剩读参数的薄壳。
 *
 * 入参由页面 `onLoad` 读出后传入：`activity_no` 与 `fill_batch_no` 都是硬前提，
 * 缺少批次号时 `srvdaq_activity_sug_select` 会直接返回「系统繁忙」。
 */

import BxNavBar from '@/components/base/BxNavBar.vue'
import SuggestionPanel from '@/components/questionnaire/SuggestionPanel.vue'
import { coverUrl } from '@/domain/questionnaire/routes'

interface Props {
  /** 页面标题：调研结果 / 评估结果 */
  title: string
  activityNo: string
  fillBatchNo: string
}

const props = defineProps<Props>()
</script>

<template>
  <view class="srp-page">
    <BxNavBar :title="props.title" :fallback-url="coverUrl(props.activityNo)" />

    <view class="srp-page__body bx-container">
      <!-- 状态条：成功点 + 文字，状态不只靠颜色 -->
      <view class="srp-status">
        <view class="srp-status__dot" aria-hidden="true" />
        <text class="srp-status__text">已提交</text>
      </view>

      <SuggestionPanel :activity-no="props.activityNo" :fill-batch-no="props.fillBatchNo" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.srp-page {
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.srp-page__body {
  padding-top: 16px;
  padding-bottom: 32px;
}

.srp-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  border-bottom: 1px solid var(--bx-line-2);
}

.srp-status__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--bx-success);
}

.srp-status__text {
  font-size: var(--bx-font-sub);
  font-weight: 500;
  line-height: var(--bx-leading-sub);
  color: var(--bx-success);
}
</style>
