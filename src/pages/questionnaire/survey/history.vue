<script setup lang="ts">
/**
 * 调研作答记录页（老工程 survey/history）
 *
 * 与 history/history 是不同入口，路由即文件路径，故各自保留页面文件；
 * 正文逻辑由 RecordHistory 共用，本文件只做路由适配（onLoad / onReachBottom 是页面级生命周期）
 */

import { onLoad, onReachBottom } from '@dcloudio/uni-app'
import { ref } from 'vue'

import RecordHistory from '@/components/questionnaire/RecordHistory.vue'
import { readQuery } from '@/utils/query'

const activityNo = ref('')
const title = ref('作答记录')
const pageRef = ref<InstanceType<typeof RecordHistory>>()

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')
  title.value = readQuery(query, 'title', '作答记录')
})

onReachBottom(() => {
  pageRef.value?.loadMore()
})
</script>

<template>
  <RecordHistory ref="pageRef" :activity-no="activityNo" :title="title" />
</template>
