<script setup lang="ts">
/**
 * 问卷列表里的一行（V6「清简」数据表）
 *
 * 一行一问卷：主列「标题 + 简介」、状态列「圆点 + 文字」、数字列「题量 / 回收份数」、
 * 时间列「截止」、操作列。
 *
 * ## 操作列的显隐
 *
 * 默认只留一枚「⋯」，文字操作（编辑 / 作答 / 删除）在**行悬停**、**键盘聚焦**
 * （`focus-within`）或点开「⋯」后显形 —— 桌面端靠悬停，触屏端靠「⋯」，
 * 不把三四个按钮常驻在每一行上（一屏十行就是三十个按钮，扫读会被打断）。
 * 隐藏用 `opacity` 而不是 `display: none`：键盘仍能 Tab 进去，`focus-within`
 * 一旦命中就把这一行显形，不会出现「焦点在看不见的按钮上」。
 *
 * ## 状态
 *
 * 圆点 + 文字双重表达（不只靠颜色）：进行中 = 主色、未开始 = 警告、已结束 = 元信息灰。
 * 危险色只落在「删除」这一处，不把整行染红。
 */

import type { DaqActivityRow } from '@/api/daq/types'

import { computed, ref } from 'vue'

import { plainText } from './plainText'

interface Props {
  row: DaqActivityRow
  /** 是否是最后一行：最后一行不再画下边线（表格的底边由外层卡片给出） */
  last?: boolean
}

const props = withDefaults(defineProps<Props>(), { last: false })

const emit = defineEmits<{
  stats: []
  edit: []
  answer: []
  remove: []
}>()

/** 「⋯」展开态：触屏没有悬停，点一下常驻显示文字操作 */
const revealed = ref(false)

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

const title = computed(() => text(props.row.title) || '未命名问卷')
const status = computed(() => text(props.row.status) || '未开始')

/** 状态修饰类：进行中 accent / 未开始 warn / 已结束 ink-3 */
const statusClass = computed(() => {
  if (status.value === '进行中') {
    return 'bx-editor-row__status--running'
  }
  if (status.value === '已结束') {
    return 'bx-editor-row__status--ended'
  }
  return 'bx-editor-row__status--pending'
})

/** 简介：平台存的是富文本，先净化；没有就不占一行 */
const summary = computed(() => plainText(text(props.row.summary)) || plainText(text(props.row.remark)))

/** 题量 / 回收份数：数字列，缺省显示 0（不让列出现空白） */
const itemCount = computed(() => text(props.row.item_count) || '0')
const submitCount = computed(() => text(props.row.submit_count) || '0')

/** 截止：只到「日」，没有就显示破折号占位 */
const deadline = computed(() => text(props.row.end_time).slice(0, 10) || '—')
</script>

<template>
  <view
    class="bx-editor-row"
    :class="{ 'bx-editor-row--last': props.last, 'bx-editor-row--revealed': revealed }"
    hover-class="bx-editor-row--hover"
  >
    <view class="bx-editor-row__main">
      <text class="bx-editor-row__title">{{ title }}</text>
      <text v-if="summary" class="bx-editor-row__summary">{{ summary }}</text>
    </view>

    <view class="bx-editor-row__status" :class="statusClass">
      <view class="bx-editor-row__dot" aria-hidden="true" />
      <text class="bx-editor-row__status-text">{{ status }}</text>
    </view>

    <text class="bx-editor-row__num bx-editor-row__num--items">{{ itemCount }}</text>
    <text class="bx-editor-row__num bx-editor-row__num--replies">{{ submitCount }}</text>
    <text class="bx-editor-row__time">{{ deadline }}</text>

    <view class="bx-editor-row__acts">
      <view
        class="bx-editor-row__act"
        role="button"
        tabindex="0"
        aria-label="查看统计"
        @click="emit('stats')"
        @keydown.enter.prevent="emit('stats')"
      >
        <text class="bx-editor-row__act-text">统计</text>
      </view>
      <view
        class="bx-editor-row__act"
        role="button"
        tabindex="0"
        aria-label="编辑问卷"
        @click="emit('edit')"
        @keydown.enter.prevent="emit('edit')"
      >
        <text class="bx-editor-row__act-text">编辑</text>
      </view>
      <view
        class="bx-editor-row__act"
        role="button"
        tabindex="0"
        aria-label="去作答"
        @click="emit('answer')"
        @keydown.enter.prevent="emit('answer')"
      >
        <text class="bx-editor-row__act-text">作答</text>
      </view>
      <view
        class="bx-editor-row__act bx-editor-row__act--danger"
        role="button"
        tabindex="0"
        aria-label="删除问卷"
        @click="emit('remove')"
        @keydown.enter.prevent="emit('remove')"
      >
        <text class="bx-editor-row__act-text">删除</text>
      </view>

      <!--
        「更多」：常驻可见，避免操作列看起来是空的。
        触屏端点开它 = 桌面端悬停；aria-expanded 让读屏知道文字操作是否已展开。
      -->
      <view
        class="bx-editor-row__more"
        role="button"
        tabindex="0"
        aria-label="更多操作"
        :aria-expanded="revealed ? 'true' : 'false'"
        @click="revealed = !revealed"
        @keydown.enter.prevent="revealed = !revealed"
      >
        <view class="bx-editor-row__more-dots" aria-hidden="true" />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/*
 * 表格行：六列（主信息 / 状态 / 题量 / 回收份数 / 截止 / 操作）
 *
 * 列宽是**定值**，与列表页表头的那份定义成对出现，改一处要改两处；
 * 桌面端行高 60，宽屏才铺开，窄屏降级为两行卡片式（见文末媒体查询）。
 */
.bx-editor-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px 64px 88px 108px 190px;
  grid-template-areas: 'main status items replies deadline acts';
  align-items: center;
  box-sizing: border-box;
  height: 60px;
  background-color: var(--bx-surface);
  border-bottom: 1px solid var(--bx-line-2);
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 行 hover 只改底色，不改描边 —— 描边变化会让整行看起来在「选中」 */
.bx-editor-row--hover,
.bx-editor-row--revealed {
  background-color: var(--bx-bg);
}

@media (hover: hover) {
  .bx-editor-row:hover {
    background-color: var(--bx-bg);
  }
}

/* 末行不再画线：表格的底边由容器统一给出，两条线叠在一起会显得更重 */
.bx-editor-row--last {
  border-bottom: none;
}

.bx-editor-row__main {
  grid-area: main;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0 16px 0 20px;
}

.bx-editor-row__title {
  overflow: hidden;
  color: var(--bx-text);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bx-editor-row__summary {
  overflow: hidden;
  color: var(--bx-text-3);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 状态：圆点 + 文字（点 6px，文字 13px） */
.bx-editor-row__status {
  grid-area: status;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  font-size: 13px;
  line-height: 20px;
}

.bx-editor-row__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--bx-radius-pill);
  background-color: currentcolor;
}

.bx-editor-row__status--running {
  color: var(--bx-primary);
}

.bx-editor-row__status--pending {
  color: var(--bx-warn);
}

.bx-editor-row__status--ended {
  color: var(--bx-text-3);
}

/* 数字列：右对齐 + 等宽数字，扫读时位数对齐 */
.bx-editor-row__num {
  padding: 0 16px;
  color: var(--bx-text-2);
  font-size: 13px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* 第 3 列 = 题量、第 4 列 = 回收份数 */
.bx-editor-row__num--items {
  grid-area: items;
}

.bx-editor-row__num--replies {
  grid-area: replies;
}

.bx-editor-row__time {
  grid-area: deadline;
  padding: 0 16px;
  color: var(--bx-text-3);
  font-size: 13px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 操作列：文字操作默认隐形，悬停 / 聚焦 / 点开「⋯」后显形 */
.bx-editor-row__acts {
  grid-area: acts;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1px;
  padding: 0 20px 0 16px;
}

.bx-editor-row__act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    opacity var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-editor-row:hover .bx-editor-row__act,
.bx-editor-row:focus-within .bx-editor-row__act,
.bx-editor-row--revealed .bx-editor-row__act {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: hover) {
  .bx-editor-row__act:hover {
    background-color: var(--bx-line-2);
  }

  .bx-editor-row__act--danger:hover {
    background-color: var(--bx-danger-soft);
  }
}

.bx-editor-row__act:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.bx-editor-row__act-text {
  color: var(--bx-text-2);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.bx-editor-row__act--danger .bx-editor-row__act-text {
  color: var(--bx-danger);
}

/* 「⋯」：常驻。三个 3px 圆点用 box-shadow 画，不用文字符号（字形随字体变化） */
.bx-editor-row__more {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .bx-editor-row__more:hover {
    background-color: var(--bx-line-2);
  }
}

.bx-editor-row__more:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.bx-editor-row__more-dots {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background-color: var(--bx-text-3);
  box-shadow:
    -6px 0 0 var(--bx-text-3),
    6px 0 0 var(--bx-text-3);
}

/* ── 窄屏：降级成两行（主信息 + 状态 / 操作） ── */
@media (max-width: 859px) {
  .bx-editor-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'main status'
      'acts acts';
    gap: 6px 8px;
    height: auto;
    padding: 12px 16px;
  }

  .bx-editor-row__main {
    padding: 0;
  }

  .bx-editor-row__status {
    padding: 0;
    align-self: start;
  }

  /* 窄屏放不下数字与截止：藏起来，主信息列拿回整行宽度 */
  .bx-editor-row__num,
  .bx-editor-row__time {
    display: none;
  }

  .bx-editor-row__acts {
    padding: 0;
  }

  /*
   * 触屏没有悬停，操作必须默认可见，否则整行只剩一个「⋯」；
   * 文字操作已经常驻，「⋯」在触屏上没有额外作用，藏起来避免出现无效控件。
   */
  .bx-editor-row__act {
    height: 32px;
    padding: 0 10px;
    opacity: 1;
    pointer-events: auto;
  }

  .bx-editor-row__more {
    display: none;
  }
}
</style>
