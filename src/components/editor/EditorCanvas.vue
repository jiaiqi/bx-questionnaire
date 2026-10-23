<script setup lang="ts">
/**
 * 设计器的**画布**：一份问卷的样子
 *
 * ## 为什么是「一张纸」而不是一列卡片
 *
 * 「一份问卷 = 一张连续的纸」。题纲（`EditorItemRow`）回答「有哪些题」，
 * 画布回答「**这份问卷长什么样**」—— 两者的信息量不同，混在一栏里就都要不清。
 *
 * V6「清简」的纸面（见 `design/prototype-v6/assets/admin.css` 的 `.adm-paper`）：
 * 白面卡片、1px 描边、圆角 14、最大宽 640；顶部是**封面区**（活动编号 / 截止 /
 * 题数 + 标题 + 说明），下面是题目卡（纸上的分节，不是各自的盒子）：
 * - 未选中：白底 + 1px 描边；
 * - 选中：浅靛底 + 靛蓝描边 + 左侧 2px 靛蓝条，并**展开**成作答时的控件形态。
 * 其余题只给题干 —— 画布是「结构示意」，不承担像素级还原。
 *
 * 点击封面区会发出 `selectActivity`，页面据此把右栏切回「问卷信息」。
 */

import type { EditorActivity, EditorItem } from '@/domain/editor'

import { computed } from 'vue'

import { isSingleChoice, typeHasOptions } from '@/domain/editor'
import { stripQuestionTitleIndex } from '@/domain/questionnaire'
import { plainText } from './plainText'

interface Props {
  items: EditorItem[]
  /** 问卷基本信息：封面区展示编号 / 标题 / 说明 */
  activity: EditorActivity
  /** 当前选中的题目（`clientKey`）；空串表示选中了封面 */
  selectedKey: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [clientKey: string]
  selectActivity: []
}>()

/** 题干：与题纲用同一个函数剥掉后端自带的「1. 」前缀；先净化掉富文本标签 */
function titleOf(item: EditorItem): string {
  return stripQuestionTitleIndex(plainText(item.title)) || '（未填写题干）'
}

/** 是否多选：单选画圆环，多选画方框 */
function isMulti(item: EditorItem): boolean {
  return !isSingleChoice(item.type, item.attr)
}

/** 非选项类题型的占位文案：与作答侧同一套措辞 */
function placeholderOf(item: EditorItem): string {
  switch (item.type) {
    case '数字':
      return '请输入数字'
    case '时间日期':
      return '请选择日期'
    case '地址':
      return '请选择地区'
    case '引用':
      return '请选择'
    case '图片':
      return '上传图片'
    default:
      return '请输入'
  }
}

/** 选中的题是否展开成控件形态 */
function isOpen(item: EditorItem): boolean {
  return item.clientKey === props.selectedKey
}

/** 题号补零到两位（原型：01 / 02 …），数字用等宽字形 */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

const hasItems = computed(() => props.items.length > 0)

const coverTitle = computed(() => plainText(props.activity.title) || '未命名问卷')

/** 副标题：分享摘要优先，其次问卷描述 */
const coverSub = computed(() => plainText(props.activity.summary))

const coverIntro = computed(() => plainText(props.activity.remark))

const deadline = computed(() => String(props.activity.endTime ?? '').slice(0, 10) || '未设置')

const activityNo = computed(() => String(props.activity.activityNo ?? '') || '未编号')
</script>

<template>
  <view class="editor-canvas">
    <view class="editor-canvas__sheet">
      <!-- 封面区：点它 = 选中「问卷信息」，右栏切到基本信息表单 -->
      <view
        class="editor-canvas__cover"
        :class="{ 'editor-canvas__cover--on': !props.selectedKey }"
        role="button"
        tabindex="0"
        aria-label="编辑问卷信息"
        @click="emit('selectActivity')"
        @keydown.enter.prevent="emit('selectActivity')"
      >
        <view class="editor-canvas__eyebrow">
          <text>{{ activityNo }}</text>
          <text class="editor-canvas__sep" aria-hidden="true">·</text>
          <text>截止 {{ deadline }}</text>
          <text class="editor-canvas__sep" aria-hidden="true">·</text>
          <text>共 {{ props.items.length }} 题</text>
        </view>
        <text class="editor-canvas__cover-title">{{ coverTitle }}</text>
        <text v-if="coverSub" class="editor-canvas__cover-sub">{{ coverSub }}</text>
        <text v-if="coverIntro" class="editor-canvas__cover-intro">{{ coverIntro }}</text>
      </view>

      <view class="editor-canvas__rule" />

      <view v-if="!hasItems" class="editor-canvas__empty">
        <text class="editor-canvas__empty-text">添加题目后，这里会显示问卷的样子</text>
      </view>

      <view v-else class="editor-canvas__list">
        <view
          v-for="(item, index) in props.items"
          :key="item.clientKey"
          class="editor-canvas__q"
          :class="{ 'editor-canvas__q--on': isOpen(item) }"
          role="button"
          tabindex="0"
          :aria-label="`第 ${index + 1} 题 ${titleOf(item)}`"
          @click="emit('select', item.clientKey)"
          @keydown.enter.prevent="emit('select', item.clientKey)"
        >
          <view class="editor-canvas__q-head">
            <text class="editor-canvas__q-no">{{ pad2(index + 1) }}</text>
            <text class="editor-canvas__q-title">
              {{ titleOf(item) }}
              <text v-if="item.required" class="editor-canvas__q-req">*</text>
            </text>
            <text class="editor-canvas__q-type">{{ item.type }}</text>
          </view>

          <!-- 选中的题展开成作答时的控件形态 -->
          <view v-if="isOpen(item)" class="editor-canvas__q-body">
            <view
              v-if="typeHasOptions(item.type) && item.options.length > 0"
              class="editor-canvas__opts"
            >
              <view
                v-for="option in item.options"
                :key="option.clientKey"
                class="editor-canvas__opt"
              >
                <view
                  class="editor-canvas__mark"
                  :class="{ 'editor-canvas__mark--box': isMulti(item) }"
                  aria-hidden="true"
                />
                <text class="editor-canvas__opt-text">{{ plainText(option.value) || '（未填写选项）' }}</text>
              </view>
            </view>

            <view v-else class="editor-canvas__control">
              <text class="editor-canvas__placeholder">{{ placeholderOf(item) }}</text>
              <view
                v-if="item.type !== '文本' && item.type !== '数字'"
                class="editor-canvas__arrow"
                aria-hidden="true"
              />
            </view>
          </view>
        </view>
      </view>

      <text class="editor-canvas__foot">问卷纸面 · 点选题目编辑右侧属性</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.editor-canvas {
  width: 100%;
}

/* 一张纸：白面 + 1px 描边 + 圆角 14 + 极轻阴影（描边优先于阴影） */
.editor-canvas__sheet {
  box-sizing: border-box;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 32px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
}

/* ── 封面区 ── */

.editor-canvas__cover {
  padding: 12px 16px;
  margin: -12px -16px 24px;
  border-radius: var(--bx-radius);
  cursor: pointer;
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .editor-canvas__cover:hover {
    background-color: var(--bx-surface-2);
  }
}

/* 选中封面：浅靛底 + 左侧 2px 靛蓝条（与题纲 / 画布同一套选中语言） */
.editor-canvas__cover--on {
  background-color: var(--bx-primary-soft);
  box-shadow: inset 2px 0 0 var(--bx-primary);
}

.editor-canvas__cover:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

/* 眉标：11 / 500，字距 .08em，元信息灰 */
.editor-canvas__eyebrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--bx-text-3);
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.editor-canvas__sep {
  color: var(--bx-text-4);
}

.editor-canvas__cover-title {
  display: block;
  margin-top: 8px;
  color: var(--bx-text);
  font-size: 19px;
  font-weight: 600;
  line-height: 26px;
  word-break: break-word;
}

.editor-canvas__cover-sub {
  display: block;
  margin-top: 4px;
  color: var(--bx-text-2);
  font-size: 13px;
  line-height: 20px;
  word-break: break-word;
}

.editor-canvas__cover-intro {
  display: block;
  margin-top: 10px;
  color: var(--bx-text-2);
  font-size: 13px;
  line-height: 1.75;
  word-break: break-word;
}

.editor-canvas__rule {
  height: 1px;
  margin: 0 0 20px;
  background-color: var(--bx-line-2);
}

/* ── 题目卡 ── */

.editor-canvas__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-canvas__q {
  position: relative;
  box-sizing: border-box;
  padding: 16px 16px 16px 20px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
  cursor: pointer;
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    border-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .editor-canvas__q:hover {
    border-color: var(--bx-line-strong);
  }
}

/* 选中：浅靛底 + 靛蓝描边 + 左侧 2px 靛蓝条 */
.editor-canvas__q--on {
  background-color: var(--bx-primary-soft);
  border-color: var(--bx-primary-line);
  box-shadow: inset 2px 0 0 var(--bx-primary);
}

.editor-canvas__q:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.editor-canvas__q-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

/* 题号：中性色 + 等宽数字 */
.editor-canvas__q-no {
  flex: none;
  width: 22px;
  padding-top: 2px;
  color: var(--bx-text-3);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}

.editor-canvas__q--on .editor-canvas__q-no {
  color: var(--bx-primary);
}

/* 题干：14 / 500 */
.editor-canvas__q-title {
  flex: 1;
  min-width: 0;
  color: var(--bx-text);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  word-break: break-word;
}

.editor-canvas__q--on .editor-canvas__q-title {
  color: var(--bx-primary);
}

.editor-canvas__q-req {
  margin-left: 2px;
  color: var(--bx-danger);
  font-weight: 600;
}

/* 题型标签：11 元信息，右对齐 */
.editor-canvas__q-type {
  flex: none;
  padding-top: 2px;
  color: var(--bx-text-3);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

/* ── 展开的控件形态 ── */

.editor-canvas__q-body {
  margin-top: 12px;
  padding-left: 30px;
}

.editor-canvas__opts {
  display: flex;
  flex-direction: column;
}

/* 选项行：只有标记 + 文字，不做成一个个小盒子（纸面上的一行而已） */
.editor-canvas__opt {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

/* 标记：单选圆环 / 多选方框（与作答侧同一套形状） */
.editor-canvas__mark {
  box-sizing: border-box;
  flex: none;
  width: 14px;
  height: 14px;
  border: 1px solid var(--bx-line-strong);
  border-radius: 50%;
  background-color: var(--bx-surface);
}

.editor-canvas__mark--box {
  border-radius: var(--bx-radius-xs);
}

.editor-canvas__opt-text {
  min-width: 0;
  color: var(--bx-text-2);
  font-size: 13px;
  line-height: 20px;
  word-break: break-word;
}

/* 非选项类：一个 32 高的假输入框（只示意形态，不接受输入） */
.editor-canvas__control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  width: 100%;
  max-width: 300px;
  height: 32px;
  padding: 0 12px;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.editor-canvas__placeholder {
  color: var(--bx-text-4);
  font-size: 13px;
}

/* 下拉箭头：两条边框旋转 45° */
.editor-canvas__arrow {
  flex: none;
  width: 7px;
  height: 7px;
  margin-left: 10px;
  border-top: 1.5px solid var(--bx-text-3);
  border-right: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg);
}

/* ── 页脚 / 空态 ── */

.editor-canvas__foot {
  display: block;
  margin-top: 24px;
  color: var(--bx-text-3);
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.06em;
  text-align: center;
}

.editor-canvas__empty {
  padding: 40px 16px;
  text-align: center;
}

.editor-canvas__empty-text {
  color: var(--bx-text-3);
  font-size: 13px;
  line-height: 20px;
}

/* 窄屏：纸面内边距收一档，题目卡之间的间隙保持 */
@media (max-width: 759px) {
  .editor-canvas__sheet {
    padding: 20px;
  }
}
</style>
