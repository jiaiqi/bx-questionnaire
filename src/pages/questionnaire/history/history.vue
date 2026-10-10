<script setup lang="ts">
/**
 * 作答记录页（老工程 history/history）
 *
 * 入参：activity_no、title
 */

import { onLoad, onReachBottom } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import RecordList from '@/components/questionnaire/RecordList.vue'

const activityNo = ref('')
const title = ref('作答记录')
const listRef = ref<InstanceType<typeof RecordList>>()

onLoad((query) => {
  activityNo.value = String(query?.activity_no ?? '')
  if (query?.title) {
    title.value = decodeURIComponent(String(query.title))
  }
})

onReachBottom(() => {
  void listRef.value?.loadMore()
})
</script>

<template>
  <view class="history-page">
    <BxNavBar :title="title" />

    <view class="history-page__body">
      <RecordList v-if="activityNo" ref="listRef" :activity-no="activityNo" />
      <BxEmpty v-else text="缺少活动编号" tip="请从问卷页进入记录列表" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.history-page {
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.history-page__body {
  padding-top: 12px;
  padding-bottom: 24px;
}
</style>
