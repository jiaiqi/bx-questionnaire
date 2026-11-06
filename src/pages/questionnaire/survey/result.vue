<script setup lang="ts">
/**
 * 调研结果页
 *
 * 只负责读参数 —— 「导航栏 + 已提交状态条 + 建议面板」收在 `SuggestionResultShell` 里，
 * 与评估结果页共用。这两页此前是两个逐字重复的文件，已经出现过一次漂移
 * （分享 / 重试 / 返回入口只补在其中一边）。
 */

import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'

import SuggestionResultShell from '@/components/questionnaire/SuggestionResultShell.vue'
import { readQuery } from '@/utils/query'

const activityNo = ref('')
const fillBatchNo = ref('')

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')
  fillBatchNo.value = readQuery(query, 'fill_batch_no')
})
</script>

<template>
  <SuggestionResultShell
    title="调研结果"
    :activity-no="activityNo"
    :fill-batch-no="fillBatchNo"
  />
</template>
