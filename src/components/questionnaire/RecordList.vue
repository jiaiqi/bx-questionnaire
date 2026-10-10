<script setup lang="ts">
/**
 * 作答记录列表
 *
 * `history/history` 与 `survey/history` 共用。
 * 分页与触底加载由页面调用 `loadMore`，避免组件内依赖页面级生命周期。
 */

import type { DaqRecordReplyRow } from '@/api/daq/types'

import { ref } from 'vue'

import { recordReplySelect } from '@/api/daq/record'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import { useSessionStore } from '@/stores/session'
import { BxError } from '@/utils/request'
import { toast } from '@/utils/ui'

interface Props {
  activityNo: string
}

const props = defineProps<Props>()

const session = useSessionStore()

const rows = ref<DaqRecordReplyRow[]>([])
const loading = ref(false)
const finished = ref(false)
const loaded = ref(false)
/** 加载失败：与 finished 区分开，失败后必须允许重试 */
const failed = ref(false)
/** 首次加载失败的原因，用于页面级错误态 */
const errorMessage = ref('')
const pageNo = ref(1)
// 与老工程 history.vue 的 rownumber 一致，减少翻页请求次数
const rownumber = 20

async function fetchPage(reset = false): Promise<void> {
  if (loading.value) {
    return
  }
  if (reset) {
    pageNo.value = 1
    rows.value = []
    finished.value = false
  }
  if (finished.value) {
    return
  }

  loading.value = true
  try {
    const envelope = await recordReplySelect({
      activityNo: props.activityNo,
      userNo: session.userInfo?.user_no ?? undefined,
      pageNo: pageNo.value,
      rownumber,
    })

    const page = envelope.data ?? []
    rows.value = [...rows.value, ...page]

    const total = envelope.page?.total ?? rows.value.length
    finished.value = rows.value.length >= total || page.length === 0
    pageNo.value += 1
    loaded.value = true
    failed.value = false
  }
  catch (error) {
    // 不置 finished：一次网络抖动不该让列表永久停在「没有更多了」；
    // pageNo 也不递增，重试请求的仍是同一页。
    const message = error instanceof BxError ? error.message : '记录加载失败'
    errorMessage.value = message
    failed.value = true
    // 首次失败由页面级错误态呈现；只有触底加载失败才补一次轻提示，
    // 否则同一个错误会被提示两遍。
    if (rows.value.length > 0) {
      toast(message)
    }
  }
  finally {
    loading.value = false
  }
}

async function refresh(): Promise<void> {
  await fetchPage(true)
}

async function loadMore(): Promise<void> {
  await fetchPage(false)
}

function openDetail(row: DaqRecordReplyRow): void {
  const state = String(row.state ?? '')
  const formType = state === '未完成' ? 'form' : 'detail'
  uni.navigateTo({
    url: `/pages/questionnaire/index/index?formType=${formType}&activity_no=${row.activity_no}&status=${state}&fill_batch_no=${row.fill_batch_no}`,
  })
}

function formatTime(value?: string | null): string {
  if (!value) {
    return ''
  }
  return value.length >= 16 ? value.slice(0, 16) : value
}

defineExpose({ refresh, loadMore })

void fetchPage(true)
</script>

<template>
  <view class="records">
    <view v-if="rows.length === 0 && loading" class="records__state">
      <text class="records__state-text">正在加载记录…</text>
    </view>

    <view v-else-if="rows.length === 0 && failed" class="records__state">
      <BxEmpty
        :text="errorMessage || '记录加载失败'"
        tip="网络恢复后可以重新加载"
      />
      <view class="records__retry">
        <BxButton type="ghost" size="small" @click="refresh">
          重新加载
        </BxButton>
      </view>
    </view>

    <BxEmpty
      v-else-if="rows.length === 0 && loaded"
      text="暂无作答记录"
      tip="完成一次问卷后即可在这里查看"
    />

    <view v-else class="records__list">
      <view
        v-for="row in rows"
        :key="String(row.fill_batch_no) + String(row.item_no ?? '')"
        class="record"
        hover-class="record--hover"
        :hover-stay-time="60"
        @click="openDetail(row)"
      >
        <view class="record__head">
          <text class="record__title">{{ row.activity_no }}</text>
          <text
            class="record__state"
            :class="row.state === '未完成' ? 'record__state--pending' : 'record__state--done'"
          >
            {{ row.state || '已完成' }}
          </text>
        </view>

        <view class="record__meta">
          <text v-if="formatTime(row.start_time)" class="record__meta-text">
            开始 {{ formatTime(row.start_time) }}
          </text>
          <text v-if="formatTime(row.end_time)" class="record__meta-text">
            结束 {{ formatTime(row.end_time) }}
          </text>
        </view>

        <view class="record__foot">
          <text v-if="row.score !== null && row.score !== undefined" class="record__score">
            得分 {{ row.score }}
          </text>
          <text class="record__batch">批次 {{ row.fill_batch_no }}</text>
        </view>
      </view>

      <view class="records__more">
        <text v-if="loading" class="records__more-text">正在加载…</text>
        <text v-else-if="finished" class="records__more-text">没有更多了</text>
        <text v-else-if="failed" class="records__more-text" @click="loadMore">加载失败，点击重试</text>
        <text v-else class="records__more-text" @click="loadMore">点击加载更多</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.records__state {
  padding: 64px 0;
  text-align: center;
}

.records__retry {
  margin-top: 16px;
}

.records__state-text {
  font-size: 14px;
  color: var(--bx-text-3);
}

.records__list {
  display: flex;
  flex-direction: column;
}

.record {
  padding: 14px 16px;
  background-color: var(--bx-surface);
}

.record:not(:first-child) {
  margin-top: 1px;
}

.record--hover {
  background-color: var(--bx-line-2);
}

.record__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record__title {
  flex: 1;
  overflow: hidden;
  font-size: 15px;
  font-weight: 500;
  color: var(--bx-text);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.record__state {
  flex-shrink: 0;
  margin-left: 10px;
  font-size: 12px;
}

.record__state--done {
  color: var(--bx-success);
}

.record__state--pending {
  color: var(--bx-warn);
}

.record__meta {
  display: flex;
  flex-wrap: wrap;
  margin-top: 6px;
}

.record__meta-text {
  margin-right: 12px;
  font-size: 12px;
  color: var(--bx-text-3);
}

.record__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.record__score {
  font-size: 13px;
  color: var(--bx-blue);
}

.record__batch {
  font-size: 12px;
  color: var(--bx-text-3);
}

.records__more {
  padding: 16px 0;
  text-align: center;
}

.records__more-text {
  font-size: 13px;
  color: var(--bx-text-3);
}
</style>
