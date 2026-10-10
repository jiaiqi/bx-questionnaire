<script setup lang="ts">
/**
 * 我的测评（老工程 couple/couple）
 *
 * 老实现把问卷清单硬编码在页面里（活动号写死），活动一换就失效；
 * 这里改为按当前用户已完成的作答记录动态聚合，同一问卷多次作答取最近一次。
 *
 * 入参：无（依赖登录态中的 user_no）
 */

import type { DaqRecordReplyRow } from '@/api/daq/types'

import { computed, ref } from 'vue'

import { recordReplySelect } from '@/api/daq/record'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import { formatDateTime } from '@/domain/questionnaire'
import { useSessionStore } from '@/stores/session'
import { BxError } from '@/utils/request'

interface AssessmentItem {
  activityNo: string
  title: string
  score: number | null
  batchNo: string
  finishedAt: string
}

const session = useSessionStore()

const loading = ref(true)
const items = ref<AssessmentItem[]>([])
/** 加载失败原因：失败必须与「暂无记录」区分开，不能用空态掩盖错误 */
const errorMessage = ref('')

const userNo = computed(() => session.userInfo?.user_no ?? '')

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    // reply_select 在不带条件时直接 FAILURE，所以未登录要先拦住，别白跑一次请求
    if (!userNo.value) {
      errorMessage.value = '未获取到登录信息'
      return
    }

    const envelope = await recordReplySelect({
      userNo: userNo.value,
      state: '完成',
      rownumber: 100,
    })

    // 同一问卷可能多次作答，保留最近一次
    const latest = new Map<string, DaqRecordReplyRow>()
    for (const row of envelope.data ?? []) {
      const key = String(row.activity_no ?? '')
      if (!key) {
        continue
      }
      const prev = latest.get(key)
      if (!prev || String(row.start_time ?? '') > String(prev.start_time ?? '')) {
        latest.set(key, row)
      }
    }

    items.value = [...latest.values()].map(row => ({
      activityNo: String(row.activity_no ?? ''),
      title: String(row.title ?? row.activity_no ?? '问卷'),
      score: row.score === null || row.score === undefined ? null : Number(row.score),
      batchNo: String(row.fill_batch_no ?? ''),
      finishedAt: formatDateTime(row.end_time ?? row.start_time),
    }))
  }
  catch (error) {
    // 不用 toast：失败由页面级错误态呈现，避免同一错误提示两遍
    errorMessage.value = error instanceof BxError ? error.message : '测评记录加载失败'
  }
  finally {
    loading.value = false
  }
}

function openResult(item: AssessmentItem): void {
  uni.navigateTo({
    url: `/pages/questionnaire/index/result?activity_no=${item.activityNo}&fill_batch_no=${item.batchNo}`,
  })
}

function openRecord(item: AssessmentItem): void {
  uni.navigateTo({
    url: `/pages/questionnaire/index/index?formType=detail&activity_no=${item.activityNo}&status=完成&fill_batch_no=${item.batchNo}`,
  })
}

void load()
</script>

<template>
  <view class="cp-page">
    <BxNavBar title="我的测评" />

    <view class="cp-page__body bx-container">
      <view v-if="loading" class="cp-page__state">
        <text class="cp-page__state-text">正在加载测评记录…</text>
      </view>

      <view v-else-if="errorMessage" class="cp-page__state">
        <BxEmpty :text="errorMessage" tip="请确认登录状态后重试" />
        <view class="cp-page__retry">
          <BxButton type="ghost" size="small" @click="load">
            重新加载
          </BxButton>
        </view>
      </view>

      <BxEmpty
        v-else-if="items.length === 0"
        text="暂无已完成的测评"
        tip="完成一次问卷后，这里会显示得分与查看入口"
      />

      <view v-else class="cp-list">
        <view v-for="item in items" :key="item.activityNo" class="cp-card">
          <view class="cp-card__head">
            <text class="cp-card__title">{{ item.title }}</text>
            <text v-if="item.score !== null" class="cp-card__score">{{ item.score }}</text>
          </view>

          <view class="cp-card__meta">
            <text v-if="item.finishedAt" class="cp-card__meta-text">完成于 {{ item.finishedAt }}</text>
            <text class="cp-card__meta-text">批次 {{ item.batchNo }}</text>
          </view>

          <view class="cp-card__actions">
            <text class="cp-card__action" @click="openResult(item)">查看结果</text>
            <text class="cp-card__action cp-card__action--ghost" @click="openRecord(item)">查看作答</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.cp-page {
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.cp-page__body {
  padding-top: 12px;
  padding-bottom: 32px;
}

.cp-page__state {
  padding: 64px 0;
  text-align: center;
}

.cp-page__retry {
  /* BxButton 基类是块级元素，不套 flex 会撑满整行 */
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.cp-page__state-text {
  font-size: 14px;
  color: var(--bx-text-3);
}

.cp-list {
  display: flex;
  flex-direction: column;
}

.cp-card {
  padding: 16px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
}

.cp-card:not(:first-child) {
  margin-top: 8px;
}

.cp-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.cp-card__title {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  color: var(--bx-text);
}

.cp-card__score {
  margin-left: 10px;
  font-size: 22px;
  font-weight: 600;
  line-height: 1;
  color: var(--bx-blue);
}

.cp-card__meta {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8px;
}

.cp-card__meta-text {
  margin-right: 12px;
  font-size: 12px;
  color: var(--bx-text-3);
}

.cp-card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.cp-card__action {
  padding: 4px 12px;
  font-size: 13px;
  color: var(--bx-blue);
  border: 1px solid var(--bx-blue);
  border-radius: 999px;
}

.cp-card__action--ghost {
  margin-left: 10px;
  color: var(--bx-text-2);
  border-color: var(--bx-line);
}
</style>
