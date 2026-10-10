<script setup lang="ts">
/**
 * 调研作答记录页（老工程 survey/history）
 *
 * 与 history/history 是不同入口，路由即文件路径，故各自保留页面文件；
 * 页面逻辑由 useRecordHistoryPage 共用，本文件只做路由与页面配置
 */

import RecordHistory from '@/components/questionnaire/RecordHistory.vue'
import { useRecordHistoryPage } from '@/composables/useRecordHistoryPage'

definePage({
  // 下拉刷新需要显式开启，否则 onPullDownRefresh 不会触发
  style: { enablePullDownRefresh: true },
})

const { activityNo, title, pageRef } = useRecordHistoryPage()
</script>

<template>
  <RecordHistory ref="pageRef" :activity-no="activityNo" :title="title" />
</template>
