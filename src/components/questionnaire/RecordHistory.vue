<script setup lang="ts">
/**
 * 作答记录页正文
 *
 * `history/history` 与 `survey/history` 是两个入口，路由即文件路径，
 * 所以必须是两个页面文件；但正文逻辑只有一份，放在这里共用，
 * 避免「改一处漏一处」—— 重复代码此前已经让题号与日期格式各出过一次问题。
 *
 * `onLoad` / `onReachBottom` 是页面级生命周期，只能在页面文件里调用，
 * 因此由页面把 activityNo / title 作为 props 传进来，并转发 loadMore。
 *
 * 视觉（docs/UI-UX-V6-设计系统.md §4/§5）：页面底 `--bx-bg`、内容走 `.bx-container`，
 * 区块之间 16，列表本身是一张带 1px 描边与圆角 14 的卡。
 */

import { ref } from 'vue'

import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import RecordList from '@/components/questionnaire/RecordList.vue'
import { coverUrl } from '@/domain/questionnaire/routes'

const props = defineProps<{
  activityNo: string
  title: string
  /** 记录称呼：调研页传「调研记录」，其余用默认的「作答记录」 */
  label?: string
}>()

const listRef = ref<InstanceType<typeof RecordList>>()

function loadMore(): void {
  void listRef.value?.loadMore()
}

/**
 * 下拉刷新
 *
 * 老工程 history.vue 有 `onPullDownRefresh`：重置分页后重新拉第一页。
 * 新工程此前只有触底加载 —— 列表出错或想看到最新记录时，用户没有手动刷新的入口。
 *
 * `onPullDownRefresh` 是页面级生命周期，只能在页面文件里调用，所以由页面转发到这里。
 * 返回 Promise，让页面能等刷新真正结束再收起原生下拉指示器。
 */
function refresh(): Promise<void> {
  return listRef.value?.refresh() ?? Promise.resolve()
}

defineExpose({ loadMore, refresh })
</script>

<template>
  <view class="history-page">
    <BxNavBar :title="title" :fallback-url="coverUrl(activityNo)" />

    <view class="history-page__body bx-container">
      <RecordList v-if="activityNo" ref="listRef" :activity-no="activityNo" :label="props.label" />
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
  padding-top: 16px;
  padding-bottom: 32px;
}
</style>
