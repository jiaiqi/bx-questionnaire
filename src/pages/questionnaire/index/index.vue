<script setup lang="ts">
/**
 * 答题页（老工程入口页）
 *
 * 入参：activity_no（必填）、formType、status、fill_batch_no（续答 / 查看）
 * 主体逻辑在 QuestionnaireRunner 中，与 survey/survey 共用。
 */

import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxEmpty from '@/components/base/BxEmpty.vue'
import QuestionnaireRunner from '@/components/questionnaire/QuestionnaireRunner.vue'
import { queryString, shareAnswerPath } from '@/domain/questionnaire/routes'
import { readQuery } from '@/utils/query'

/**
 * 本页**不再是首页**：首页已改为问卷列表 `pages/editor/list/index`
 *
 * 原因：启动页需要一个不依赖入参的入口，而本页必须带 `activity_no`，
 * 从根路径直接打开只会看到「缺少活动编号」。
 *
 * 保留一段背景说明，因为「哪个页面是首页」这个坑与页面本身无关：
 * `src/pages.json` 是**生成物且被 gitignore**，新克隆的仓库里没有它，
 * 页面顺序默认由 `src/pages/**` 的扫描顺序决定（按路径字母序），
 * 首页会落到 `pages/questionnaire/assessmentResult/assessmentResult` 这种地方。
 * 因此首页必须显式指定，且两处保持一致：`vite.config.ts` 的 `UniPages.homePage`
 * 与页面里的 `definePage({ type: 'home' })`。
 */

/**
 * 小程序页面配置
 *
 * `onShareTimeline` 只负责**返回值**；微信端还需要页面配置里开了
 * `enableShareTimeline`，右上角菜单才会出现「分享到朋友圈」入口 ——
 * 只写回调不写配置是静默失效（与 `enablePullDownRefresh` 属同一类坑，
 * `style` 嵌套是 uni-app 的硬要求）。封面页已按同样方式补过。
 */
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
/**
 * 分享给好友：`path` 不带前导 `/` 是 `onShareAppMessage` 的要求
 * 与老工程一致，好友点开可直接作答。
 */
onShareAppMessage(() => ({
  title: shareTitle(),
  path: `/${shareAnswerPath(activityNo.value)}`,
}))

/** 分享到朋友圈：`query` 只接受查询串，不能带页面路径 */
onShareTimeline(() => ({
  title: shareTitle(),
  query: queryString({ formType: 'form', activity_no: activityNo.value, status: '进行中' }),
}))
</script>

<template>
  <QuestionnaireRunner
    v-if="activityNo"
    ref="runner"
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
