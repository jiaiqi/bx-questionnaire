<script setup lang="ts">
/**
 * 作答记录页（老工程 history/history）
 *
 * 入参：activity_no、title
 * 正文由 RecordHistory 共用，本文件只做路由适配（onLoad / onReachBottom 是页面级生命周期）
 */

import { onLoad, onReachBottom } from '@dcloudio/uni-app'
import { ref } from 'vue'

import RecordHistory from '@/components/questionnaire/RecordHistory.vue'

const activityNo = ref('')
const title = ref('作答记录')
const pageRef = ref<InstanceType<typeof RecordHistory>>()

onLoad((query) => {
  activityNo.value = String(query?.activity_no ?? '')
  if (query?.title) {
    title.value = decodeURIComponent(String(query.title))
  }
})

onReachBottom(() => {
  pageRef.value?.loadMore()
})
</script>

<template>
  <RecordHistory ref="pageRef" :activity-no="activityNo" :title="title" />
</template>
