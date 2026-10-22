<script setup lang="ts">
/**
 * 我的测评（老工程 couple/couple）
 *
 * 老实现把问卷清单硬编码在页面里（活动号写死），活动一换就失效；
 * 这里改为按当前用户已完成的作答记录动态聚合，同一问卷多次作答取最近一次。
 *
 * 入参：无（依赖登录态中的 user_no）
 *
 * 视觉（docs/UI-UX-V2-设计系统.md §7.4）：
 * 行式列表 —— 左侧时间 + 标题，右侧状态 chip + 分数；空态用 BxEmpty + 主操作。
 */

import type { DaqRecordReplyRow } from '@/api/daq/types'

import { computed, ref } from 'vue'

import { recordReplySelect } from '@/api/daq/record'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import { formatDateTime } from '@/domain/questionnaire'
import { answerUrl, resultUrl } from '@/domain/questionnaire/routes'
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
/** 未登录与「加载失败」必须分开：前者点「重新加载」永远不会成功 */
const notLoggedIn = computed(() => !userNo.value)

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
  uni.navigateTo({ url: resultUrl(item.activityNo, item.batchNo) })
}

/**
 * 未登录时给一个明确出口
 *
 * 原来这里只有「重新加载」—— 未登录的用户点多少次都不会有变化，
 * 必须能直接去登录。登录成功后回到本页（`redirect` 由登录页安全解码）。
 */
function goLogin(): void {
  const redirect = encodeURIComponent('/pages/questionnaire/couple/couple')
  uni.navigateTo({ url: `/pages/login/index?redirect=${redirect}` })
}

function openRecord(item: AssessmentItem): void {
  uni.navigateTo({ url: answerUrl(item.activityNo, { formType: 'detail', status: '完成', fillBatchNo: item.batchNo }) })
}

/**
 * 空态的主操作：回到问卷列表去挑一份（规范 §7.4）
 *
 * 列表页是应用首页（vite.config.ts 的 UniPages.homePage），用 reLaunch 而不是
 * navigateTo：用户从空态跳走后再回来，看到的仍该是这一页。
 */
function goAnswer(): void {
  uni.reLaunch({ url: '/pages/editor/list/index' })
}

/**
 * 键盘激活
 *
 * 「查看结果」「查看作答」是可点击的 <text>，天然不可聚焦 —— 键盘用户打不开。
 * 与 BxButton / BxOptionList / 记录卡片同一类问题，扫描时一并修掉。
 */
function onActionKeydown(event: KeyboardEvent, kind: 'result' | 'record', item: AssessmentItem): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  if (kind === 'result') {
    openResult(item)
  }
  else {
    openRecord(item)
  }
}

void load()
</script>

<template>
  <view class="cp-page">
    <BxNavBar title="我的测评" />

    <view class="cp-page__body bx-container">
      <!-- 加载：三条骨架保持布局稳定，比一行「正在加载测评记录…」更符合预期 -->
      <view v-if="loading" class="cp-skeleton" aria-busy="true">
        <view v-for="n in 3" :key="n" class="cp-skeleton__row" />
      </view>

      <view v-else-if="errorMessage" class="cp-page__state">
        <BxEmpty
          :text="errorMessage"
          :tip="notLoggedIn ? '登录后可查看账号下的全部测评记录' : '请稍后重试'"
        />
        <view class="cp-page__retry">
          <BxButton v-if="notLoggedIn" type="primary" size="small" @click="goLogin">
            去登录
          </BxButton>
          <BxButton v-else type="secondary" size="small" @click="load">
            重新加载
          </BxButton>
        </view>
      </view>

      <view v-else-if="items.length === 0" class="cp-page__state">
        <BxEmpty
          text="暂无已完成的测评"
          tip="完成一次问卷后，这里会显示得分与查看入口；列表仅显示当前登录账号的记录"
        />
        <view class="cp-page__retry">
          <BxButton type="primary" size="small" @click="goAnswer">
            去答一份问卷
          </BxButton>
        </view>
      </view>

      <!-- 行式列表：一条细线分隔，不做卡片墙 -->
      <view v-else class="cp-list">
        <view v-for="item in items" :key="item.activityNo" class="cp-row">
          <view class="cp-row__main">
            <text class="cp-row__title">{{ item.title }}</text>
            <text v-if="item.finishedAt" class="cp-row__meta">完成于 {{ item.finishedAt }}</text>
          </view>

          <view class="cp-row__side">
            <text class="cp-row__state">已完成</text>
            <text v-if="item.score !== null" class="cp-row__score">{{ item.score }} 分</text>
          </view>

          <view class="cp-row__actions">
            <text
              class="cp-row__action"
              role="button"
              tabindex="0"
              @click="openResult(item)"
              @keydown="onActionKeydown($event, 'result', item)"
            >
              查看结果
            </text>
            <text
              class="cp-row__action cp-row__action--ghost"
              role="button"
              tabindex="0"
              @click="openRecord(item)"
              @keydown="onActionKeydown($event, 'record', item)"
            >
              查看作答
            </text>
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
  padding-top: 16px;
  padding-bottom: 32px;
}

/* 失败 / 未登录态：BxEmpty 自带内边距，这里只留按钮上方的空间 */
.cp-page__state {
  padding: 0 0 24px;
}

.cp-page__retry {
  /* BxButton 基类是块级元素，不套 flex 会撑满整行 */
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

/* 加载骨架 */
.cp-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cp-skeleton__row {
  height: 84px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-card);
}

/* 列表容器化：同质条目用分割线，不用逐卡阴影 */
.cp-list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

.cp-row {
  padding: 14px 16px;
}

.cp-row + .cp-row {
  border-top: 1px solid var(--bx-line-2);
}

.cp-row__main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.cp-row__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--bx-font-body);
  font-weight: 500;
  line-height: var(--bx-leading-body);
  color: var(--bx-text);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cp-row__meta {
  flex-shrink: 0;
  margin-left: 12px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

.cp-row__side {
  display: flex;
  align-items: center;
  margin-top: 6px;
}

/* 状态做成胶囊徽章 */
.cp-row__state {
  padding: 2px 9px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-success);
  background-color: var(--bx-success-soft);
  border-radius: var(--bx-radius-chip);
}

/* 分数用等宽数字位：多条记录并排时数字宽度不会跳。
 * 用墨色而不是主色 —— 一屏十几行全是蓝字会吵（规范 §2.4）。 */
.cp-row__score {
  margin-left: 10px;
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: var(--bx-leading-h2);
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
}

.cp-row__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

/* 两个动作是文字链接：主行动用主色，次行动用中性色 */
.cp-row__action {
  padding: 2px 0;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-primary);
  cursor: pointer;
}

/* 焦点可见性：uni-app 内置样式把 outline 设成 none */
.cp-row__action:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
  border-radius: var(--bx-radius-xs);
}

.cp-row__action--ghost {
  margin-left: 16px;
  color: var(--bx-text-2);
}
</style>
