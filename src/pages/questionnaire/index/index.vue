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
 * 显式声明首页
 *
 * `src/pages.json` 是**生成物且被 gitignore**，所以新克隆的仓库里没有它，
 * 页面顺序完全由 `src/pages/**` 的扫描顺序决定 —— 那会变成按路径字母序，
 * 首页就成了 `pages/questionnaire/assessmentResult/assessmentResult`。
 * 之前本地看着正常，只是因为 `pages.json` 已在磁盘上、插件的 `mergePages`
 * 把旧顺序合并保留了，属于「本机碰巧对」。
 *
 * 加 `editor/**` 之后这个隐患更明显（入口可能落到编辑器上），
 * 因此按插件支持的方式显式标记 `type: 'home'`：插件会把首页排到 pages 数组最前，
 * 与文件是否已存在、扫描顺序如何都无关。
 */
definePage({ type: 'home' })

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
