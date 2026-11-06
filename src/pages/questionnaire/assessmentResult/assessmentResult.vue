<script setup lang="ts">
/**
 * 评估结果页
 *
 * 只负责读参数 —— 「导航栏 + 已提交状态条 + 建议面板」收在 `SuggestionResultShell` 里，
 * 与调研结果页共用（两页此前是逐字重复的文件）。
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
    title="评估结果"
    :activity-no="activityNo"
    :fill-batch-no="fillBatchNo"
  />
</template>
