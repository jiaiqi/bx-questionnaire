<script setup lang="ts">
/**
 * 作答记录列表
 *
 * `history/history` 与 `survey/history` 共用。
 * 分页与触底加载由页面调用 `loadMore`，避免组件内依赖页面级生命周期。
 */

import type { DaqRecordReplyRow } from '@/api/daq/types'

import { computed, ref } from 'vue'

import { recordReplySelect } from '@/api/daq/record'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import { formatDateTime } from '@/domain/questionnaire'
import { filterMyRecords } from '@/domain/questionnaire/records'
import { answerUrl } from '@/domain/questionnaire/routes'
import { useSessionStore } from '@/stores/session'
import { BxError } from '@/utils/request'
import { getMyBatches } from '@/utils/storage'
import { toast } from '@/utils/ui'

interface Props {
  activityNo: string
}

const props = defineProps<Props>()

const session = useSessionStore()

/** 服务端返回的原始行（分页记账用原始条数，不能用过滤后的） */
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

/**
 * 记录归属过滤
 *
 * `record_reply_select` **未登录时不带 user_no 条件**，会返回该活动的全部记录
 * （含他人批次号，点进去还能看到他人作答）。已登录时服务端已按 user_no 过滤，
 * 这里仍然再判一次 —— 服务端行为变了也不会直接漏出他人数据。
 */
const ownership = computed(() => ({
  userNo: session.userInfo?.user_no || '',
  myBatches: getMyBatches(props.activityNo),
}))

/** 只属于当前用户的记录 */
const visibleRows = computed(() => filterMyRecords(rows.value, ownership.value).mine)

/**
 * 顶部提示文案
 *
 * 未登录时列表天然只能覆盖本机，必须解释一句，否则用户会以为记录丢了；
 * 被过滤掉的条数也如实写出来 —— 「不是没有记录，是不给你看别人的」和
 * 「一条都没有」是完全不同的两件事，让用户自己判断。
 */
const loginHint = computed(() => {
  if (session.isLogin || visibleRows.value.length === 0) {
    return ''
  }
  const hidden = filterMyRecords(rows.value, ownership.value).hidden
  return hidden > 0
    ? `未登录，仅显示本机作答记录（已隐藏 ${hidden} 条其他账号的记录）`
    : '未登录，仅显示本机作答记录'
})

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
      // 用 || 而非 ??：空字符串也要视为「无用户」，否则会传 user_no eq '' 导致查不到任何记录
      userNo: session.userInfo?.user_no || undefined,
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
    url: answerUrl(String(row.activity_no ?? ''), {
      formType,
      status: state,
      fillBatchNo: String(row.fill_batch_no ?? ''),
    }),
  })
}

/**
 * 键盘激活
 *
 * 记录卡片与「加载更多」都是可点击的 <view> / <text>，天然不可聚焦 ——
 * 键盘用户看不到也打不开这些记录。与 BxButton / BxOptionList 同一类问题。
 */
function isActivateKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar'
}

function onCardKeydown(event: KeyboardEvent, row: DaqRecordReplyRow): void {
  if (!isActivateKey(event)) {
    return
  }
  event.preventDefault()
  openDetail(row)
}

function onMoreKeydown(event: KeyboardEvent): void {
  if (!isActivateKey(event)) {
    return
  }
  event.preventDefault()
  void loadMore()
}

defineExpose({ refresh, loadMore })

void fetchPage(true)
</script>

<template>
  <view class="records">
    <view v-if="visibleRows.length === 0 && loading" class="records__state">
      <text class="records__state-text">正在加载记录…</text>
    </view>

    <view v-else-if="visibleRows.length === 0 && failed" class="records__state">
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
      v-else-if="visibleRows.length === 0 && loaded"
      text="暂无作答记录"
      :tip="session.isLogin
        ? '当前账号在本问卷下还没有作答记录'
        : '未登录时只显示本机作答记录；换设备或清过浏览器数据就看不到，登录后可查看账号下的全部记录'"
    />

    <view v-else class="records__list">
      <view v-if="loginHint" class="records__notice">
        <text class="records__notice-text">
          {{ loginHint }}
        </text>
      </view>

      <view
        v-for="row in visibleRows"
        :key="String(row.fill_batch_no)"
        class="record"
        role="button"
        :aria-label="`查看作答记录 ${row.title || row.activity_no} ${row.state || ''}`"
        tabindex="0"
        hover-class="record--hover"
        :hover-stay-time="60"
        @click="openDetail(row)"
        @keydown="onCardKeydown($event, row)"
      >
        <view class="record__head">
          <text class="record__title">{{ row.title || row.activity_no }}</text>
          <text
            class="record__state"
            :class="row.state === '未完成' ? 'record__state--pending' : 'record__state--done'"
          >
            {{ row.state || '已完成' }}
          </text>
        </view>

        <view class="record__meta">
          <text v-if="formatDateTime(row.start_time)" class="record__meta-text">
            开始 {{ formatDateTime(row.start_time) }}
          </text>
          <text v-if="formatDateTime(row.end_time)" class="record__meta-text">
            结束 {{ formatDateTime(row.end_time) }}
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
        <text
          v-else-if="failed"
          class="records__more-text"
          role="button"
          tabindex="0"
          @click="loadMore"
          @keydown="onMoreKeydown"
        >
          加载失败，点击重试
        </text>
        <text
          v-else
          class="records__more-text"
          role="button"
          tabindex="0"
          @click="loadMore"
          @keydown="onMoreKeydown"
        >
          点击加载更多
        </text>
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
  /* BxButton 基类是块级元素，不套 flex 会撑满整行 */
  display: flex;
  justify-content: center;
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

.records__notice {
  padding: 10px 16px;
  background-color: var(--bx-blue-soft);
}

.records__notice-text {
  font-size: 12px;
  color: var(--bx-text-2);
}

.record {
  padding: 14px 16px;
  background-color: var(--bx-surface);
  cursor: pointer;
}

/* 焦点可见性：uni-app 内置样式把 outline 设成 none */
.record:focus-visible {
  outline: 2px solid var(--bx-blue);
  outline-offset: -2px;
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
  cursor: pointer;
}

.records__more-text:focus-visible {
  outline: 2px solid var(--bx-blue);
  outline-offset: 2px;
  border-radius: 2px;
}
</style>
