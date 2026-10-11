<script setup lang="ts">
/**
 * 问卷列表里的一张卡片
 *
 * 状态用**颜色 + 文字**双重表达，不只靠颜色：色盲用户与黑白打印都要能分辨
 * （项目既有的可访问性基线也把「仅用颜色传达信息」列为问题）。
 */

import type { DaqActivityRow } from '@/api/daq/types'

import { computed } from 'vue'

interface Props {
  row: DaqActivityRow
}

const props = defineProps<Props>()

const emit = defineEmits<{
  edit: []
  answer: []
  remove: []
}>()

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

const title = computed(() => text(props.row.title) || '未命名问卷')
const status = computed(() => text(props.row.status) || '未开始')

/** 状态徽标的修饰类；取值来自平台 `status` 枚举（未开始/进行中/已结束） */
const statusClass = computed(() => {
  if (status.value === '进行中') {
    return 'bx-editor-card__status--running'
  }
  if (status.value === '已结束') {
    return 'bx-editor-card__status--ended'
  }
  return 'bx-editor-card__status--pending'
})

const classifyLabel = computed(() =>
  text(props.row.classify_path) || text(props.row.classify_name) || text(props.row.classify) || '未分类',
)

const counts = computed(() => `${text(props.row.item_count) || '0'} 题 · ${text(props.row.submit_count) || '0'} 次提交`)

/** 只显示到分钟：秒对浏览列表没有意义，反而占宽度 */
const period = computed(() => {
  const start = text(props.row.start_time).slice(0, 16)
  const end = text(props.row.end_time).slice(0, 16)
  if (!start && !end) {
    return ''
  }
  return `${start || '—'} ~ ${end || '—'}`
})
</script>

<template>
  <view class="bx-editor-card">
    <view class="bx-editor-card__main">
      <view class="bx-editor-card__head">
        <text class="bx-editor-card__title">{{ title }}</text>
        <text class="bx-editor-card__status" :class="statusClass">{{ status }}</text>
      </view>
      <text class="bx-editor-card__meta">{{ classifyLabel }} · {{ counts }}</text>
      <text v-if="period" class="bx-editor-card__meta">{{ period }}</text>
    </view>

    <view class="bx-editor-card__actions">
      <view
        class="bx-editor-card__btn"
        role="button"
        tabindex="0"
        aria-label="编辑问卷"
        @click="emit('edit')"
        @keydown.enter.prevent="emit('edit')"
      >
        <text class="bx-editor-card__btn-text">编辑</text>
      </view>
      <view
        class="bx-editor-card__btn"
        role="button"
        tabindex="0"
        aria-label="去作答"
        @click="emit('answer')"
        @keydown.enter.prevent="emit('answer')"
      >
        <text class="bx-editor-card__btn-text">作答</text>
      </view>
      <view
        class="bx-editor-card__btn bx-editor-card__btn--danger"
        role="button"
        tabindex="0"
        aria-label="删除问卷"
        @click="emit('remove')"
        @keydown.enter.prevent="emit('remove')"
      >
        <text class="bx-editor-card__btn-text">删除</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-editor-card {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 10px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

.bx-editor-card__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.bx-editor-card__head {
  display: flex;
  align-items: center;
  min-width: 0;
}

.bx-editor-card__title {
  flex: 1;
  overflow: hidden;
  font-size: 15px;
  font-weight: 500;
  color: var(--bx-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bx-editor-card__status {
  flex-shrink: 0;
  margin-left: 8px;
  padding: 1px 8px;
  font-size: 12px;
  border-radius: 10px;
}

.bx-editor-card__status--running {
  color: var(--bx-success);
  background-color: rgba(0, 180, 42, 0.1);
}

.bx-editor-card__status--pending {
  color: var(--bx-warn);
  background-color: rgba(255, 125, 0, 0.1);
}

.bx-editor-card__status--ended {
  color: var(--bx-text-3);
  background-color: var(--bx-line-2);
}

.bx-editor-card__meta {
  margin-top: 4px;
  overflow: hidden;
  font-size: 12px;
  color: var(--bx-text-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bx-editor-card__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  margin-left: 10px;
}

.bx-editor-card__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 30px;
  margin-left: 6px;
  padding: 0 8px;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-editor-card__btn:active {
  border-color: var(--bx-blue);
  background-color: var(--bx-blue-soft);
}

.bx-editor-card__btn--danger .bx-editor-card__btn-text {
  color: var(--bx-danger);
}

.bx-editor-card__btn-text {
  font-size: 13px;
  color: var(--bx-text-2);
}
</style>
