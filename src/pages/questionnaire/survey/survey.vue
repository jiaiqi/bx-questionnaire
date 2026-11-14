<script setup lang="ts">
/**
 * 调研答题页（老工程 survey/survey）
 *
 * 与 index/index 同源，差异只有两处：结果页指向 survey/result、分享路径指向本页。
 *
 * 分享回调此前只补在 index/index 上 —— 从调研页转发出去的好友会落到另一个页面壳。
 * 两页注释一直写着「差异仅在路由与结果页指向」，实际已经漂移，这里补齐。
 */

import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import QuestionnaireRunner from '@/components/questionnaire/QuestionnaireRunner.vue'
import { useUrlTicket } from '@/composables/useUrlTicket'
import { queryString, QUESTIONNAIRE_ROUTES, shareAnswerPath } from '@/domain/questionnaire/routes'
import { readQuery } from '@/utils/query'

// 先采纳 URL 票据：必须在页面自己的 onLoad 之前注册（uni-app 按注册顺序调用）
useUrlTicket()

/** 小程序页面配置：只写 onShareTimeline 回调不够，还要开 enableShareTimeline 才有入口 */
definePage({ style: { enableShareTimeline: true } })

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

/** 分享给好友：`path` 必须带前导 `/`，且指向**本页**而不是 index/index */
onShareAppMessage(() => ({
  title: shareTitle(),
  path: `/${shareAnswerPath(activityNo.value, QUESTIONNAIRE_ROUTES.surveyAnswer)}`,
}))

/** 分享到朋友圈：`query` 只接受查询串，不能带页面路径 */
onShareTimeline(() => ({
  title: shareTitle(),
  query: queryString({ formType: 'form', activity_no: activityNo.value, status: '进行中' }),
}))

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
    ref="runner"
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
