<script setup lang="ts">
/**
 * 问卷封面页（新增入口，简洁风）
 *
 * 入参：activity_no（必填）
 * 老链接（#/questionnaire/index/index）由 main.ts 的 hash 重写兼容，本页用于新入口。
 */

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'

import { useQuestionnaire } from '@/composables/useQuestionnaire'

const { loading, activity, fields, errorMessage, load } = useQuestionnaire()

const activityNo = ref('')

const title = computed(() => activity.value?.title || '问卷')
const intro = computed(() => activity.value?.start_remark || '')
const count = computed(() => fields.value.filter(field => field.widget !== 'section').length)
const ended = computed(() => activity.value?.status === '已结束')

onLoad((query) => {
  activityNo.value = String(query?.activity_no ?? '')
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
  uni.navigateTo({
    url: `/pages/questionnaire/index/index?activity_no=${activityNo.value}&formType=form&status=${activity.value?.status ?? '进行中'}`,
  })
}
</script>

<template>
  <view class="c-page">
    <view class="c-page__body bx-container">
      <view v-if="loading" class="c-page__state">
        <text class="c-page__state-text">正在加载…</text>
      </view>

      <BxEmpty
        v-else-if="errorMessage"
        :text="errorMessage"
        tip="请确认链接是否有效，或联系活动发起人"
      />

      <template v-else>
        <view class="c-hero">
          <view class="c-hero__badge">
            <text class="c-hero__badge-text">问卷</text>
          </view>
          <text class="c-hero__title">{{ title }}</text>
          <text v-if="intro" class="c-hero__desc">{{ intro }}</text>
        </view>

        <view class="c-meta">
          <view class="c-meta__item">
            <text class="c-meta__value">{{ count }}</text>
            <text class="c-meta__label">题目数</text>
          </view>
          <view class="c-meta__item">
            <text class="c-meta__value">{{ activity?.status || '进行中' }}</text>
            <text class="c-meta__label">状态</text>
          </view>
          <view v-if="activity?.answer_times" class="c-meta__item">
            <text class="c-meta__value">{{ activity.answer_times }}</text>
            <text class="c-meta__label">作答次数</text>
          </view>
        </view>

        <view class="c-actions">
          <BxButton v-if="!ended" block @click="start">
            开始作答
          </BxButton>
          <BxButton v-else type="ghost" block @click="start">
            查看问卷内容
          </BxButton>
          <text class="c-actions__tip">作答过程中会自动保存草稿，可随时返回继续</text>
        </view>
      </template>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.c-page {
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.c-page__body {
  padding-top: 40px;
  padding-bottom: 40px;
}

.c-page__state {
  padding: 64px 0;
  text-align: center;
}

.c-page__state-text {
  font-size: 14px;
  color: var(--bx-text-3);
}

.c-hero {
  padding: 28px 20px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
}

.c-hero__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  margin-bottom: 12px;
  background-color: var(--bx-blue-soft);
  border-radius: 4px;
}

.c-hero__badge-text {
  font-size: 12px;
  color: var(--bx-blue);
}

.c-hero__title {
  display: block;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--bx-text);
}

.c-hero__desc {
  display: block;
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--bx-text-2);
}

.c-meta {
  display: flex;
  padding: 16px 0;
  margin-top: 8px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
}

.c-meta__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.c-meta__value {
  font-size: 16px;
  font-weight: 600;
  color: var(--bx-text);
}

.c-meta__label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--bx-text-3);
}

.c-actions {
  margin-top: 24px;
}

.c-actions__tip {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  color: var(--bx-text-3);
  text-align: center;
}
</style>
