<script setup lang="ts">
/**
 * 问卷封面页
 *
 * 入参：activity_no（必填）
 * 老链接（#/questionnaire/index/index）由 main.ts 的 hash 重写兼容，本页用于新入口。
 *
 * 视觉（docs/UI-UX-V2-设计系统.md §7.1）：
 * 左对齐大标题 + 副说明 + 细线 + 元信息 + 主按钮 + 次级说明卡。
 * 不居中、不渐变、不大插画 —— 封面像一份问卷的扉页，不像落地页。
 */

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'

import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { answerUrl } from '@/domain/questionnaire/routes'
import { readQuery } from '@/utils/query'

const { loading, activity, fields, errorMessage, load } = useQuestionnaire()

const activityNo = ref('')

const title = computed(() => activity.value?.title || '问卷')
const intro = computed(() => activity.value?.start_remark || '')
const count = computed(() => fields.value.filter(field => field.widget !== 'section').length)
const ended = computed(() => activity.value?.status === '已结束')

/** 截止日期：只取到天，「截止 2026-12-31」比带时分更耐看 */
const deadline = computed(() => {
  const raw = String(activity.value?.end_time ?? '').trim()
  return raw.length >= 10 ? raw.slice(0, 10) : ''
})

/**
 * 说明卡的内容
 *
 * 只展示活动行里**真实存在**的字段：活动行没有「预计用时」字段，
 * 就不编一个「约 3 分钟」出来 —— 假信息比没有信息更糟。
 *
 * 「截止时间」不在这里：封面上方的元信息行已经写了「截止 2027-12-31」，
 * 同一件事在一屏里出现两次只是噪声（分钟级的完整时间戳对读者没有额外信息）。
 */
const notes = computed(() => {
  const rows: Array<{ label: string, value: string }> = []
  const answerTimes = String(activity.value?.answer_times ?? '').trim()
  if (answerTimes) {
    rows.push({ label: '作答次数', value: answerTimes })
  }
  const perm = String(activity.value?.perm_type ?? '').trim()
  if (perm) {
    rows.push({ label: '访问方式', value: perm })
  }
  return rows
})

/** 活动简介：作为说明卡的正文段落 */
const summary = computed(() => String(activity.value?.summary ?? '').trim())

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')
  void init()
})

async function init(): Promise<void> {
  if (!activityNo.value) {
    errorMessage.value = '缺少活动编号，无法加载问卷'
    return
  }
  await load(activityNo.value, { mode: 'plain' })
}

function start(): void {
  uni.navigateTo({ url: answerUrl(activityNo.value, { status: activity.value?.status ?? '进行中' }) })
}
</script>

<template>
  <view class="c-page">
    <view class="c-page__body bx-container">
      <!--
        内容块在视口内垂直居中。
        用 auto 外边距而不是 justify-content: center：内容比视口高时，
        auto 外边距会退化成 0（内容从顶部开始、可正常向下滚动），
        而 justify-content: center 会把顶部顶出视口且滚不回去。
      -->
      <view class="c-page__content">
        <!-- 骨架屏：保持布局稳定，比一行「正在加载…」更能说明内容马上来 -->
        <view v-if="loading" class="c-skeleton" aria-busy="true">
          <view class="c-skeleton__title" />
          <view class="c-skeleton__line" />
          <view class="c-skeleton__rule" />
          <view class="c-skeleton__meta" />
        </view>

        <BxEmpty
          v-else-if="errorMessage"
          :text="errorMessage"
          tip="请确认链接是否有效，或联系活动发起人"
        />

        <template v-else>
          <!-- 扉页：大标题左对齐，下面一条细线，再下面是元信息 -->
          <view class="c-head">
            <text class="c-head__title">{{ title }}</text>
            <text v-if="intro" class="c-head__desc">{{ intro }}</text>

            <view class="c-head__rule" />

            <!--
              元信息用竖细线分隔，不用「·」：
              规范 §3.2 禁止中点连接 meta（`A · B · C`）。
            -->
            <view class="c-head__meta">
              <text class="c-head__meta-item">{{ count }} 题</text>
              <view v-if="deadline" class="c-head__meta-divider" />
              <text v-if="deadline" class="c-head__meta-item">截止 {{ deadline }}</text>
              <view class="c-head__meta-divider" />
              <text class="c-head__meta-item">{{ activity?.status || '进行中' }}</text>
            </view>
          </view>

          <!-- 主操作：左对齐，按钮本身不撑满（规范 §7.1） -->
          <view class="c-actions">
            <view class="c-actions__primary">
              <BxButton v-if="!ended" size="large" @click="start">
                开始作答
              </BxButton>
              <BxButton v-else type="secondary" size="large" @click="start">
                查看问卷内容
              </BxButton>
            </view>
            <text class="c-actions__tip">作答过程中会自动保存草稿，可随时返回继续</text>
          </view>

          <!-- 次级说明卡：surface + 1px 描边，不是大色块 -->
          <view v-if="summary || notes.length > 0" class="c-note">
            <text class="c-note__title">问卷说明</text>
            <text v-if="summary" class="c-note__summary">{{ summary }}</text>
            <view
              v-for="note in notes"
              :key="note.label"
              class="c-note__row"
            >
              <text class="c-note__label">{{ note.label }}</text>
              <text class="c-note__value">{{ note.value }}</text>
            </view>
          </view>
        </template>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.c-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.c-page__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  /* 不写死高度：内容比视口高时让它自然溢出（可继续向下滚动） */
  padding-top: 24px;
  padding-bottom: 24px;
}

/*
 * 内容块在视口内垂直居中
 *
 * 用 auto 外边距而不是 justify-content: center：内容比视口高时，
 * auto 外边距会退化成 0（内容从顶部开始、可正常向下滚动），
 * 而 justify-content: center 会把顶部顶出视口且滚不回去。
 */
.c-page__content {
  margin-top: auto;
  margin-bottom: auto;
}

/* ── 加载骨架（与真实版式同构，避免加载完跳动） ── */
.c-skeleton {
  padding-top: 4px;
}

.c-skeleton__title {
  width: 62%;
  height: 28px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-sm);
}

.c-skeleton__line {
  width: 88%;
  height: 14px;
  margin-top: 14px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-xs);
}

.c-skeleton__rule {
  width: 100%;
  height: 1px;
  margin-top: 22px;
  background-color: var(--bx-line);
}

.c-skeleton__meta {
  width: 46%;
  height: 12px;
  margin-top: 14px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-xs);
}

/* ── 扉页 ──────────────────────────────────────────────────────────
 * 左对齐：标题、说明、按钮全部贴左，像一份问卷的扉页而不是落地页。
 */
.c-head__title {
  display: block;
  font-size: var(--bx-font-display);
  font-weight: 600;
  line-height: var(--bx-leading-display);
  /* ≥28px 的标题加 -0.02em 字距 */
  letter-spacing: -0.02em;
  color: var(--bx-text);
  /*
   * 不要 break-all：中文标题按标点避头尾规则断行才好看，
   * break-all 会把「（演示问卷）」拆成「（演示问」+「卷）」。
   */
  word-break: normal;
  overflow-wrap: break-word;
}

.c-head__desc {
  display: block;
  margin-top: 12px;
  font-size: var(--bx-font-body);
  line-height: var(--bx-leading-body);
  color: var(--bx-text-2);
}

/* 细线：把说明与元信息分开，不是大色块 */
.c-head__rule {
  height: 1px;
  margin-top: 20px;
  background-color: var(--bx-line);
}

.c-head__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 14px;
}

.c-head__meta-item {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

/* 竖细线分隔：替代中点连接（规范 §3.2） */
.c-head__meta-divider {
  width: 1px;
  height: 12px;
  margin: 0 10px;
  background-color: var(--bx-line);
}

/* ── 主操作 ── */
.c-actions {
  margin-top: 28px;
}

/* BxButton 基类是块级元素，不套 flex 会撑满整行 */
.c-actions__primary {
  display: flex;
}

.c-actions__tip {
  display: block;
  margin-top: 12px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

/* ── 次级说明卡 ────────────────────────────────────────────────────
 * surface + 1px 描边：它是补充信息，不该比标题更重。
 */
.c-note {
  margin-top: 28px;
  padding: 16px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

.c-note__title {
  display: block;
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-text);
}

.c-note__summary {
  display: block;
  margin-top: 8px;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
  word-break: break-all;
}

/*
 * 说明行：标签在左、值紧跟其后
 *
 * 不做成「标签贴左、值贴右」：封面整体是左对齐的文档式版面，
 * 值右对齐会在 720px 宽栏里拉出一道很长的空档。
 */
.c-note__row {
  display: flex;
  align-items: baseline;
  padding: 10px 0;
}

.c-note__row + .c-note__row {
  border-top: 1px solid var(--bx-line-2);
}

.c-note__label {
  flex: none;
  width: 64px;
  margin-right: 12px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.c-note__value {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-2);
  word-break: break-all;
}
</style>
