<script setup lang="ts">
/**
 * 问卷列表里的一行
 *
 * 列表是**表格**而不是卡片墙（规范 §7.5）：一行一问卷，
 * 左列「标题 + 摘要 + 元信息」、中列状态 chip、右列操作。
 *
 * 状态用**颜色 + 文字**双重表达，不只靠颜色：色盲用户与黑白打印都要能分辨
 * （项目既有的可访问性基线也把「仅用颜色传达信息」列为问题）。
 *
 * 语义色的取法按规范：进行中=主色浅底、已结束=中性、未开始=成功色。
 * 危险色只落在「删除」这一处 —— 整行泛红会把「这一行是危险品」和
 * 「这一行正在被删」混成一件事。
 */

import type { DaqActivityRow } from '@/api/daq/types'

import { computed } from 'vue'

import { plainText } from './plainText'

interface Props {
  row: DaqActivityRow
  /** 是否是最后一行：最后一行不再画下边线（表格的底边由外层容器给出） */
  last?: boolean
}

const props = withDefaults(defineProps<Props>(), { last: false })

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

/** 状态 chip 的修饰类；取值来自平台 `status` 枚举（未开始/进行中/已结束） */
const statusClass = computed(() => {
  if (status.value === '进行中') {
    return 'bx-editor-row__status--running'
  }
  if (status.value === '已结束') {
    return 'bx-editor-row__status--ended'
  }
  return 'bx-editor-row__status--pending'
})

const classifyLabel = computed(() =>
  text(props.row.classify_path) || text(props.row.classify_name) || text(props.row.classify) || '未分类',
)

/**
 * 摘要：平台给的是「简介」或「问卷描述」，两者取其一，都没有就不占一行
 *
 * 这两个字段存的是**富文本**（后台编辑器写的 `<p>…</p>`），直接渲染会把
 * 标签源码显示给用户，所以先做一次轻量净化；净化后为空就不渲染这一行。
 */
const summary = computed(() => plainText(text(props.row.summary)) || plainText(text(props.row.remark)))

/**
 * 元信息
 *
 * 规范 §3.2 禁止用中点（`A · B · C`）连接 meta —— 那是「看起来像日志」的做法。
 * 这里改用一条 1px 竖线分隔，视觉上更轻，也不占横向空间。
 */
const metaParts = computed(() => {
  const parts = [classifyLabel.value]
  parts.push(`${text(props.row.item_count) || '0'} 题`)
  parts.push(`${text(props.row.submit_count) || '0'} 次提交`)
  return parts
})

/**
 * 有效期
 *
 * 只到「日」：带时分的起止时间在列表里既占宽度又没人看，
 * 真要精确到分钟，去设计器里看。
 */
const period = computed(() => {
  const start = text(props.row.start_time).slice(0, 10)
  const end = text(props.row.end_time).slice(0, 10)
  if (!start && !end) {
    return ''
  }
  return `${start || '—'} ~ ${end || '—'}`
})
</script>

<template>
  <view
    class="bx-editor-row"
    :class="{ 'bx-editor-row--last': props.last }"
    hover-class="bx-editor-row--hover"
  >
    <view class="bx-editor-row__main">
      <text class="bx-editor-row__title">{{ title }}</text>
      <text v-if="summary" class="bx-editor-row__summary">{{ summary }}</text>
      <view class="bx-editor-row__meta">
        <text
          v-for="part in metaParts"
          :key="part"
          class="bx-editor-row__meta-item"
        >
          {{ part }}
        </text>
        <text v-if="period" class="bx-editor-row__meta-item">{{ period }}</text>
      </view>
    </view>

    <text class="bx-editor-row__status" :class="statusClass">{{ status }}</text>

    <view class="bx-editor-row__actions">
      <view
        class="bx-editor-row__btn"
        role="button"
        tabindex="0"
        aria-label="编辑问卷"
        @click="emit('edit')"
        @keydown.enter.prevent="emit('edit')"
      >
        <text class="bx-editor-row__btn-text">编辑</text>
      </view>
      <view
        class="bx-editor-row__btn"
        role="button"
        tabindex="0"
        aria-label="去作答"
        @click="emit('answer')"
        @keydown.enter.prevent="emit('answer')"
      >
        <text class="bx-editor-row__btn-text">作答</text>
      </view>
      <view
        class="bx-editor-row__btn bx-editor-row__btn--danger"
        role="button"
        tabindex="0"
        aria-label="删除问卷"
        @click="emit('remove')"
        @keydown.enter.prevent="emit('remove')"
      >
        <text class="bx-editor-row__btn-text">删除</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/*
 * 表格行：三列（主信息 / 状态 / 操作）
 *
 * 整行是**一条横线**分隔的，不是卡片墙 —— 描边优先于阴影（规范 §2.4）。
 * 主信息列给足剩余宽度，状态与操作列定宽：定宽才能让表头与每一行对齐
 * （列宽在列表页的表头上有一份同样的定义，改一处要改两处）。
 */
.bx-editor-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px 180px;
  grid-template-areas: 'main status actions';
  align-items: center;
  gap: 12px 16px;
  padding: 14px 16px;
  background-color: var(--bx-surface);
  border-bottom: 1px solid var(--bx-line-2);
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

/*
 * 行 hover 只改底色，不改描边 —— 描边变化会让整行看起来在「选中」
 *
 * `hover-class` 是触屏端的「按住」态；桌面端的悬停要自己写
 * （uni-app 的 hover-class 在 H5 上是按下态，不是悬停态），
 * 而且只给指针设备 —— 手指离开后还停在悬停色上是很难受的。
 */
.bx-editor-row--hover {
  background-color: var(--bx-surface-2);
}

@media (hover: hover) {
  .bx-editor-row:hover {
    background-color: var(--bx-surface-2);
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
  min-width: 0;
}

.bx-editor-row__title {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
  color: var(--bx-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 摘要：次要文字，一行省略 */
.bx-editor-row__summary {
  margin-top: 2px;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bx-editor-row__meta {
  display: flex;
  align-items: center;
  margin-top: 4px;
  overflow: hidden;
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-3);
}

.bx-editor-row__meta-item {
  flex: none;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 分隔用一条竖线，不用中点（规范 §3.2） */
.bx-editor-row__meta-item + .bx-editor-row__meta-item {
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid var(--bx-line);
}

/* 状态 chip：语义色浅底 + 同色系描边 */
.bx-editor-row__status {
  grid-area: status;
  flex: none;
  justify-self: center;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 18px;
  border: 1px solid transparent;
  border-radius: var(--bx-radius-chip);
}

/* 进行中 = 主色浅底：这一列是全页唯一的主色，与「主操作」不冲突 */
.bx-editor-row__status--running {
  color: var(--bx-primary);
  background-color: var(--bx-primary-soft);
  border-color: var(--bx-primary-line);
}

/* 已结束 = 中性：不再进行中的事，不该抢注意力 */
.bx-editor-row__status--ended {
  color: var(--bx-text-2);
  background-color: var(--bx-surface-2);
  border-color: var(--bx-line);
}

/* 未开始 = 成功色：还没开跑，是「就绪」而不是「有问题」 */
.bx-editor-row__status--pending {
  color: var(--bx-success);
  background-color: var(--bx-success-soft);
  border-color: var(--bx-success-line);
}

.bx-editor-row__actions {
  grid-area: actions;
  display: flex;
  flex: none;
  align-items: center;
}

/* 文字按钮：白底 + 描边，悬停才显主色 */
.bx-editor-row__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: var(--bx-control-height-sm);
  margin-left: 8px;
  padding: 0 12px;
  cursor: pointer;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
  transition:
    color var(--bx-duration-fast) var(--bx-ease-out),
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    border-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 悬停反馈只给指针设备（触屏端走 hover-class 的按下态） */
@media (hover: hover) {
  .bx-editor-row__btn:hover {
    color: var(--bx-primary);
    background-color: var(--bx-primary-soft);
    border-color: var(--bx-primary-line);
  }

  /* 危险按钮的悬停保持红色，不被上面的通用悬停规则改成主色 */
  .bx-editor-row__btn--danger:hover {
    color: var(--bx-danger);
    background-color: var(--bx-danger-soft);
    border-color: var(--bx-danger);
  }
}

.bx-editor-row__btn:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.bx-editor-row__btn-text {
  font-size: 13px;
  line-height: 18px;
  color: var(--bx-text-2);
}

/* 危险操作只染文字与描边，不把整行染红 */
.bx-editor-row__btn--danger {
  color: var(--bx-danger);
  border-color: var(--bx-danger-line);
}

.bx-editor-row__btn--danger .bx-editor-row__btn-text {
  color: var(--bx-danger);
}

/*
 * 窄屏：一列，状态 chip 浮在右上角，操作另起一行
 *
 * 状态不再占一列 —— 三列挤在一行会把主信息列压到 200 出头，
 * 有效期那截会被截断（「2026-10-11 ~ 2」这种半截时间比没有更糟）。
 * chip 绝对定位后，主信息列拿回整行宽度。
 */
@media (max-width: 639px) {
  .bx-editor-row {
    position: relative;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'main'
      'actions';
  }

  .bx-editor-row__status {
    position: absolute;
    top: 12px;
    right: 16px;
  }

  /* 标题与摘要给 chip 让出位置；元信息在下一行，不用让 */
  .bx-editor-row__title,
  .bx-editor-row__summary {
    padding-right: 76px;
  }

  .bx-editor-row__actions {
    margin-left: -4px;
  }

  .bx-editor-row__btn {
    flex: 1;
    margin-left: 4px;
  }
}
</style>
