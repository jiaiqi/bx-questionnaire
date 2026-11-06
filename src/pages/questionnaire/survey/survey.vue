<script setup lang="ts">
/**
 * 调研答题页（老工程 survey/survey）
 *
 * 与 index/index 同源，仅结果页指向 survey/result。
 */

import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
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

/**
 * 参数缺失时的出口
 *
 * 空态此前只有一句「请从活动入口或二维码重新进入」，但没有可点的动作 ——
 * 用户看完提示仍然卡在这一屏。
 */
function goBack(): void {
  uni.reLaunch({ url: '/pages/editor/list/index' })
}
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
    <view class="empty-page__inner">
      <BxEmpty text="缺少活动编号" tip="请从活动入口或二维码重新进入" />
      <view class="empty-page__action">
        <BxButton type="secondary" size="small" @click="goBack">
          返回问卷列表
        </BxButton>
      </view>
    </view>
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

.empty-page__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bx-space-md);
  width: 100%;
}

.empty-page__action {
  display: flex;
  justify-content: center;
}
</style>
