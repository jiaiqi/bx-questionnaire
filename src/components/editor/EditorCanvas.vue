<script setup lang="ts">
/**
 * 设计器的**画布**：一份问卷的样子
 *
 * ## 为什么是「一张纸」而不是一列卡片
 *
 * 规范 §0 的核心比喻是「一份问卷 = 一张连续的卷（不是 11 个盒子）」。
 * 题纲（EditorItemRow）回答「有哪些题」，画布回答「**这份问卷长什么样**」——
 * 两者的信息量不同，混在一栏里就都要不清。
 *
 * 画布上：
 * - 整份问卷是**一张连续的纸**（白底 + 1px 描边 + 圆角 20 + 极轻阴影）；
 * - 题目之间只有一条细线（纸上的分节），不画各自的卡片；
 * - 每道题左侧有 2px 的**类型色条**，区分题型（色条按作答形态分三族，
 *   细节见 `typeTone.ts`）；
 * - 选中的那道题**展开**成作答时的控件形态（选项 / 输入框），
 *   其余题只给题干 —— 画布是「结构示意」，不承担像素级还原。
 *
 * 复用旧「实时预览」的能力，但不再只显示一道题。
 */

import type { EditorItem } from '@/domain/editor'

import { computed } from 'vue'

import { isSingleChoice, typeHasOptions } from '@/domain/editor'
import { stripQuestionTitleIndex } from '@/domain/questionnaire'
import { plainText } from './plainText'
import { typeTone } from './typeTone'

interface Props {
  items: EditorItem[]
  /** 当前选中的题目（`clientKey`） */
  selectedKey: string
}

const props = defineProps<Props>()

const emit = defineEmits<{ select: [clientKey: string] }>()

/** 题干：与题纲用同一个函数剥掉后端自带的「1. 」前缀；先净化掉富文本标签 */
function titleOf(item: EditorItem): string {
  return stripQuestionTitleIndex(plainText(item.title)) || '（未填写题干）'
}

/** 语气（色条） */
function toneOf(item: EditorItem): string {
  return `editor-canvas__q--tone-${typeTone(item.type)}`
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

const hasItems = computed(() => props.items.length > 0)
</script>

<template>
  <view class="editor-canvas">
    <view v-if="!hasItems" class="editor-canvas__empty">
      <text class="editor-canvas__empty-text">添加题目后，这里会显示问卷的样子</text>
    </view>

    <view v-else class="editor-canvas__sheet">
      <view
        v-for="(item, index) in props.items"
        :key="item.clientKey"
        class="editor-canvas__q"
        :class="[toneOf(item), { 'editor-canvas__q--on': isOpen(item) }]"
        role="button"
        tabindex="0"
        :aria-label="`第 ${index + 1} 题 ${titleOf(item)}`"
        @click="emit('select', item.clientKey)"
        @keydown.enter.prevent="emit('select', item.clientKey)"
      >
        <view class="editor-canvas__q-head">
          <text class="editor-canvas__q-no">{{ index + 1 }}</text>
          <text class="editor-canvas__q-title">
            {{ titleOf(item) }}
            <text v-if="item.required" class="editor-canvas__q-req">*</text>
          </text>
          <text class="editor-canvas__q-type">{{ item.type }}</text>
        </view>

        <!-- 选中的题展开成作答时的控件形态 -->
        <view v-if="isOpen(item)" class="editor-canvas__q-body">
          <view v-if="typeHasOptions(item.type) && item.options.length > 0" class="editor-canvas__opts">
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
            <view v-if="item.type !== '文本' && item.type !== '数字'" class="editor-canvas__arrow" aria-hidden="true" />
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.editor-canvas {
  padding: 16px;
}

/* 一张纸：白底 + 1px 描边 + 圆角 20 + 极轻阴影（描边优先于阴影） */
.editor-canvas__sheet {
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-lg);
  box-shadow: var(--bx-elev-1);
}

/*
 * 一道题
 *
 * 左侧 2px 类型色条是**唯一**的类型标识（其余靠题型标签上的文字），
 * 题目之间只留一条细线 —— 纸上的分节，不是各自的盒子。
 */
.editor-canvas__q {
  padding: 16px 16px 16px 18px;
  border-left: 2px solid var(--bx-line);
  border-bottom: 1px solid var(--bx-line-2);
  cursor: pointer;
  transition: background-color var(--bx-duration-base) var(--bx-ease-out);
}

.editor-canvas__q:last-child {
  border-bottom: none;
}

/* 类型色条：三族语气，全用既有令牌 */
.editor-canvas__q--tone-choice {
  border-left-color: var(--bx-primary);
}

.editor-canvas__q--tone-fill {
  border-left-color: var(--bx-text-3);
}

.editor-canvas__q--tone-ref {
  border-left-color: var(--bx-text-4);
}

/* 选中的题：极浅主色底 + 题号变主色（「落笔」的那一刻） */
.editor-canvas__q--on {
  background-color: var(--bx-primary-soft);
}

.editor-canvas__q:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.editor-canvas__q-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

/* 题号：中性色 + 等宽数字 */
.editor-canvas__q-no {
  flex: none;
  min-width: 20px;
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-text-3);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.editor-canvas__q--on .editor-canvas__q-no {
  color: var(--bx-primary);
  font-weight: 600;
}

/* 题干：h2 档（17/600） */
.editor-canvas__q-title {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 26px;
  color: var(--bx-text);
  word-break: break-word;
}

.editor-canvas__q-req {
  margin-left: 2px;
  color: var(--bx-danger);
}

/* 题型标签：中性小签，不与色条抢 */
.editor-canvas__q-type {
  flex: none;
  padding: 1px 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-2);
  background-color: var(--bx-surface-2);
  border-radius: var(--bx-radius-xs);
}

.editor-canvas__q--on .editor-canvas__q-type {
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-primary-line);
}

/* ── 展开的控件形态 ── */

.editor-canvas__q-body {
  margin-top: 12px;
  padding-left: 30px;
}

.editor-canvas__opts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.editor-canvas__opt {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 8px 12px;
  background-color: var(--bx-surface-2);
  border-radius: var(--bx-radius-sm);
}

/* 标记：单选圆环 / 多选方框（与作答侧同一套形状） */
.editor-canvas__mark {
  flex: none;
  width: 16px;
  height: 16px;
  margin-right: 10px;
  border: 1.5px solid var(--bx-text-4);
  border-radius: 50%;
}

.editor-canvas__mark--box {
  border-radius: var(--bx-radius-xs);
}

.editor-canvas__opt-text {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  line-height: 22px;
  color: var(--bx-text-2);
  word-break: break-word;
}

.editor-canvas__control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 10px 12px;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-radius);
}

.editor-canvas__placeholder {
  font-size: 15px;
  color: var(--bx-text-4);
}

/* 下拉箭头：两条边框旋转 45° */
.editor-canvas__arrow {
  flex: none;
  width: 8px;
  height: 8px;
  margin-left: 10px;
  border-top: 1.5px solid var(--bx-text-3);
  border-right: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg);
}

/* ── 空态 ── */

.editor-canvas__empty {
  padding: 48px 16px;
  text-align: center;
}

.editor-canvas__empty-text {
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-text-3);
}
</style>
