<script setup lang="ts">
/**
 * 我的测评（老工程 couple/couple）
 *
 * 老实现把问卷清单硬编码在页面里（活动号写死），活动一换就失效；
 * 这里改为按当前用户已完成的作答记录动态聚合，同一问卷多次作答取最近一次。
 *
 * 入参：无（依赖登录态中的 user_no）
 *
 * 视觉（docs/UI-UX-V6-设计系统.md §5/§6）：
 * 个人信息一行 → 小节标题（已完成 / 份数）→ 列表行（状态点 + 标题 + 分数 + 时间）
 * → 空态用 BxEmpty，未登录给登录入口。
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

/** 个人信息：有昵称用昵称，至少不显示一串内部编号当标题 */
const profileName = computed(() =>
  session.userInfo?.nick_name || session.userInfo?.user_name || '当前账号',
)

/** 头像只放一个字：中文取首字，英文取首字母 */
const avatarText = computed(() => profileName.value.slice(0, 1).toUpperCase())

const profileMeta = computed(() => (userNo.value ? `账号 ${userNo.value}` : '未登录'))

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
 * 空态的主操作：回到问卷列表去挑一份
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
 * 记录行与「查看结果 / 查看作答」是可点击的 <view>，天然不可聚焦 —— 键盘用户打不开。
 * 与 BxButton / BxOptionList / RecordList 同一类问题。
 */
function isActivateKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar'
}

function onActionKeydown(event: KeyboardEvent, kind: 'result' | 'record', item: AssessmentItem): void {
  if (!isActivateKey(event)) {
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
    <!--
      兜底回问卷列表：从外部链接直接打开时页面栈只有 1 层，
      没有兜底地址的返回键会静默失效（本页空态已经在用同一路径）
    -->
    <BxNavBar title="我的测评" fallback-url="/pages/editor/list/index" />

    <view class="cp-page__body bx-container">
      <!-- 个人信息：一行，头像 + 名字 + 账号 -->
      <view class="cp-me">
        <view class="cp-me__avatar" aria-hidden="true">
          {{ avatarText }}
        </view>
        <view class="cp-me__main">
          <text class="cp-me__name">{{ profileName }}</text>
          <text class="cp-me__meta">{{ profileMeta }}</text>
        </view>
      </view>

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

      <template v-else>
        <!-- 小节标题：已完成 + 份数 -->
        <view class="cp-sec">
          <text class="cp-sec__label">已完成</text>
          <text class="cp-sec__count">{{ items.length }} 份</text>
        </view>

        <view class="cp-list">
          <!--
            整行可点（指针设备快速打开结果），但可聚焦入口是两个文字动作：
            键盘用户通过它们分别打开结果或查看作答，避免按钮里再套按钮。
          -->
          <view
            v-for="item in items"
            :key="item.activityNo"
            class="cp-row"
            @click="openResult(item)"
          >
            <!--
              小节标题已经写明「已完成」，每行再常驻一次「已提交」只是噪音
              （一屏十几行都是同一句话）。保留圆点让状态不只靠颜色，时间才是这一行的信息。
            -->
            <view class="cp-row__meta">
              <view class="cp-row__dot" aria-hidden="true" />
              <text v-if="item.finishedAt" class="cp-row__time">{{ item.finishedAt }}</text>
            </view>

            <view class="cp-row__main">
              <text class="cp-row__title">{{ item.title }}</text>
              <view v-if="item.score !== null" class="cp-row__score">
                <text class="cp-row__score-num">{{ item.score }}</text>
                <text class="cp-row__score-unit">分</text>
              </view>
            </view>

            <view class="cp-row__foot">
              <text v-if="item.batchNo" class="cp-row__batch">批次 {{ item.batchNo }}</text>
              <view class="cp-row__actions">
                <view
                  class="cp-row__action"
                  role="button"
                  tabindex="0"
                  :aria-label="`查看 ${item.title} 的结果`"
                  @click.stop="openResult(item)"
                  @keydown.stop="onActionKeydown($event, 'result', item)"
                >
                  查看结果
                </view>
                <view
                  class="cp-row__action cp-row__action--ghost"
                  role="button"
                  tabindex="0"
                  :aria-label="`查看 ${item.title} 的作答`"
                  @click.stop="openRecord(item)"
                  @keydown.stop="onActionKeydown($event, 'record', item)"
                >
                  查看作答
                </view>
              </view>
            </view>
          </view>
        </view>

        <text class="cp-page__foot">测评结果仅本人可见</text>
      </template>
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

/* ── 个人信息 ────────────────────────────────────────────────────── */
.cp-me {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 16px;
}

.cp-me__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--bx-primary-soft);
  color: var(--bx-primary);
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1;
}

.cp-me__main {
  min-width: 0;
}

.cp-me__name {
  display: block;
  overflow: hidden;
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1.4;
  color: var(--bx-text);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cp-me__meta {
  display: block;
  margin-top: 1px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

/* ── 小节标题 ────────────────────────────────────────────────────── */
.cp-sec {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0 8px;
  border-top: 1px solid var(--bx-line);
}

.cp-sec__label {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
}

.cp-sec__count {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

/* ── 失败 / 空态 ─────────────────────────────────────────────────── */
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
  height: 92px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-card);
}

/* ── 列表 ────────────────────────────────────────────────────────── */
.cp-list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
}

.cp-row {
  padding: 14px 16px;
  cursor: pointer;
}

.cp-row + .cp-row {
  border-top: 1px solid var(--bx-line-2);
}

@media (hover: hover) {
  .cp-row:hover {
    background-color: var(--bx-surface-2);
  }
}

.cp-row__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.cp-row__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--bx-success);
}

.cp-row__state {
  flex: none;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-success);
}

.cp-row__time {
  min-width: 0;
  margin-left: 4px;
  overflow: hidden;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cp-row__main {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 4px;
}

.cp-row__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--bx-font-body);
  font-weight: 500;
  line-height: 1.5;
  color: var(--bx-text);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 分数：等宽数字位 + 墨色（一屏十几行全是彩色数字会吵） */
.cp-row__score {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
}

.cp-row__score-num {
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
}

.cp-row__score-unit {
  font-size: var(--bx-font-caption);
  line-height: 1;
  color: var(--bx-text-3);
}

.cp-row__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
}

.cp-row__batch {
  min-width: 0;
  overflow: hidden;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cp-row__actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 两个动作是文字链接：主行动用主色，次行动用中性色；触摸目标 44 */
.cp-row__action {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  line-height: var(--bx-leading-sub);
  color: var(--bx-primary);
  cursor: pointer;
}

.cp-row__action:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
  border-radius: var(--bx-radius-xs);
}

.cp-row__action--ghost {
  color: var(--bx-text-2);
}

.cp-page__foot {
  display: block;
  margin-top: 24px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.04em;
  color: var(--bx-text-3);
  text-align: center;
}
</style>
