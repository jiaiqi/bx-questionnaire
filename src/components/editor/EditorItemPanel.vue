<script setup lang="ts">
/**
 * 题目编辑面板
 *
 * 面板**不改 props**，所有修改通过 `patch` / `attrPatch` 事件交回页面
 * （`vue/no-mutating-props` 之外，更重要的是：改动入口只有一处，才好在保存前
 * 统一算出「哪些真的变了」）。
 *
 * 「题型属性」按题型分别渲染，取值全部来自 `domain/editor/enums`，
 * 而 enums 里的值又与 `mapper.resolveWidget` 逐个对齐过 ——
 * 写进 `item_type_attr` 的值必须能被作答侧认出来，否则表现为「属性选了没反应」。
 */

import type { EditorIssue, EditorItem } from '@/domain/editor'

import { computed, ref } from 'vue'

import {
  DATE_TYPE_CHOICES,
  itemTypeSpec,
  MODIFY_AFTER_SUBMIT_OPTIONS,
  RADIO_TYPE_CHOICES,
  SCORE_STRATEGY_OPTIONS,
  toChoices,
  typeHasOptions,
  VIEW_MODEL_CHOICES,
} from '@/domain/editor'
import EditorFormField from './EditorFormField.vue'
import EditorOptionEditor from './EditorOptionEditor.vue'
import EditorSegmented from './EditorSegmented.vue'
import EditorTypePicker from './EditorTypePicker.vue'

interface Props {
  item: EditorItem
  index: number
  issues: EditorIssue[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  patch: [patch: Partial<EditorItem>]
  attrPatch: [patch: Record<string, unknown>]
  changeType: [type: string]
  optionAdd: []
  optionRemove: [index: number]
  optionMoveUp: [index: number]
  optionMoveDown: [index: number]
  optionDragDrop: [from: number, to: number]
  optionUpdateValue: [index: number, value: string]
  optionUpdateAnswer: [index: number, isAnswer: boolean]
  optionUpdatePoints: [index: number, points: number]
}>()

const typePickerOpen = ref(false)

const spec = computed(() => itemTypeSpec(props.item.type))
const hasOptions = computed(() => typeHasOptions(props.item.type))
const scoreChoices = toChoices(SCORE_STRATEGY_OPTIONS)
const yesNoChoices = toChoices(MODIFY_AFTER_SUBMIT_OPTIONS)

/** 「选项」题型靠属性决定单选还是多选；「多选」题型恒为多选 */
const multiChoice = computed(() => {
  if (props.item.type === '多选') {
    return true
  }
  if (props.item.type === '选项') {
    return attrText('radioType') === 'multi'
  }
  return false
})

/** 选项区的报错（选项行高固定，放不下逐行红字，统一在列表下方说明） */
const optionIssue = computed(() => props.issues.find(issue => issue.field === 'options' || issue.optionKey))

function errorFor(field: string): string {
  return props.issues.find(issue => issue.field === field && !issue.optionKey)?.message ?? ''
}

function attrText(key: string): string {
  const value = props.item.attr[key]
  return value === undefined || value === null ? '' : String(value)
}

/** 从 uni-app 的 `event.detail.value` 读输入值；读不到就不改（不要写空串） */
function readInput(event: unknown): string | null {
  const value = (event as { detail?: { value?: string } })?.detail?.value
  return typeof value === 'string' ? value : null
}

function onTitleInput(event: unknown): void {
  const value = readInput(event)
  if (value !== null) {
    emit('patch', { title: value })
  }
}

function onAnswerInput(event: unknown): void {
  const value = readInput(event)
  if (value !== null) {
    emit('patch', { answer: value })
  }
}

function onAnalysisInput(event: unknown): void {
  const value = readInput(event)
  if (value !== null) {
    emit('patch', { answerAnalysis: value })
  }
}

function onPointsInput(event: unknown): void {
  const value = Number(readInput(event) ?? '')
  emit('patch', { points: Number.isFinite(value) ? value : 0 })
}

function onAttrNumberInput(key: string, event: unknown): void {
  const value = Number(readInput(event) ?? '')
  emit('attrPatch', { [key]: Number.isFinite(value) ? value : 0 })
}

function onAttrTextInput(key: string, event: unknown): void {
  const value = readInput(event)
  if (value !== null) {
    emit('attrPatch', { [key]: value })
  }
}

function onTypeSelected(type: string): void {
  typePickerOpen.value = false
  emit('changeType', type)
}
</script>

<template>
  <view class="bx-eip">
    <view class="bx-eip__head">
      <text class="bx-eip__no">第 {{ props.index + 1 }} 题</text>
      <text class="bx-eip__type">{{ props.item.type }}</text>
    </view>

    <EditorFormField label="题目标题" required :error="errorFor('title')">
      <input
        class="bx-eip__input"
        type="text"
        :value="props.item.title"
        aria-label="题目标题"
        placeholder="请输入题目标题"
        @input="onTitleInput"
      >
    </EditorFormField>

    <EditorFormField
      label="题型"
      required
      :hint="spec ? spec.hint : ''"
      :error="errorFor('type')"
    >
      <view
        class="bx-eip__type-button"
        role="button"
        tabindex="0"
        aria-label="选择题型"
        @click="typePickerOpen = !typePickerOpen"
        @keydown.enter.prevent="typePickerOpen = !typePickerOpen"
      >
        <text class="bx-eip__type-button-text">{{ spec?.label ?? props.item.type }}</text>
        <text class="bx-eip__type-button-arrow">{{ typePickerOpen ? '▲' : '▼' }}</text>
      </view>
      <view v-if="typePickerOpen" class="bx-eip__picker">
        <EditorTypePicker @select="onTypeSelected" @close="typePickerOpen = false" />
      </view>
    </EditorFormField>

    <EditorFormField label="是否必填">
      <EditorSegmented
        :model-value="props.item.required ? '是' : '否'"
        :options="yesNoChoices"
        @update:model-value="value => emit('patch', { required: value === '是' })"
      />
    </EditorFormField>

    <EditorFormField label="分值" hint="用于评分型问卷；不评分时留 0">
      <input
        class="bx-eip__input"
        type="number"
        :value="String(props.item.points)"
        aria-label="题目分值"
        placeholder="0"
        @input="onPointsInput"
      >
    </EditorFormField>

    <!-- 正确答案只在非选项类题型上填；选项类的正确答案记在选项上 -->
    <EditorFormField
      v-if="!hasOptions"
      label="正确答案"
      :error="errorFor('answer')"
      hint="选填；选项类题目的正确答案请点选项右侧的对勾按钮"
    >
      <input
        class="bx-eip__input"
        type="text"
        :value="props.item.answer"
        aria-label="正确答案"
        placeholder="选填"
        @input="onAnswerInput"
      >
    </EditorFormField>

    <EditorFormField label="得分策略">
      <EditorSegmented
        :model-value="props.item.scoreStrategy"
        :options="scoreChoices"
        @update:model-value="value => emit('patch', { scoreStrategy: value })"
      />
    </EditorFormField>

    <!-- ── 题型属性 ── -->
    <EditorFormField v-if="props.item.type === '文本'" label="输入形态">
      <EditorSegmented
        :model-value="attrText('view_model')"
        :options="VIEW_MODEL_CHOICES"
        @update:model-value="value => emit('attrPatch', { view_model: value })"
      />
    </EditorFormField>

    <EditorFormField v-if="props.item.type === '时间日期'" label="时间形态">
      <EditorSegmented
        :model-value="attrText('dateType')"
        :options="DATE_TYPE_CHOICES"
        @update:model-value="value => emit('attrPatch', { dateType: value })"
      />
    </EditorFormField>

    <EditorFormField v-if="props.item.type === '图片'" label="最多上传张数">
      <input
        class="bx-eip__input"
        type="number"
        :value="attrText('fileNum')"
        aria-label="最多上传张数"
        placeholder="9"
        @input="onAttrNumberInput('fileNum', $event)"
      >
    </EditorFormField>

    <EditorFormField v-if="props.item.type === '选项'" label="单选还是多选">
      <EditorSegmented
        :model-value="attrText('radioType')"
        :options="RADIO_TYPE_CHOICES"
        @update:model-value="value => emit('attrPatch', { radioType: value })"
      />
    </EditorFormField>

    <template v-if="props.item.type === '引用' || props.item.type === '地址'">
      <EditorFormField label="数据来源服务" hint="平台服务名，如 srvdaq_activity_cfg_select">
        <input
          class="bx-eip__input"
          type="text"
          :value="attrText('servicename')"
          aria-label="数据来源服务"
          placeholder="srv..."
          @input="onAttrTextInput('servicename', $event)"
        >
      </EditorFormField>
      <EditorFormField label="所属应用" hint="服务所在应用，如 daq / config / file">
        <input
          class="bx-eip__input"
          type="text"
          :value="attrText('srv_app')"
          aria-label="所属应用"
          placeholder="daq"
          @input="onAttrTextInput('srv_app', $event)"
        >
      </EditorFormField>
      <EditorFormField label="取值列" hint="存进答案的列名">
        <input
          class="bx-eip__input"
          type="text"
          :value="attrText('refed_col')"
          aria-label="取值列"
          placeholder="no"
          @input="onAttrTextInput('refed_col', $event)"
        >
      </EditorFormField>
      <EditorFormField label="展示列" hint="列表里显示给用户的列名">
        <input
          class="bx-eip__input"
          type="text"
          :value="attrText('key_disp_col')"
          aria-label="展示列"
          placeholder="name"
          @input="onAttrTextInput('key_disp_col', $event)"
        >
      </EditorFormField>
    </template>

    <!-- ── 选项 ── -->
    <EditorFormField v-if="hasOptions" label="选项列表" :error="optionIssue?.message ?? ''">
      <EditorOptionEditor
        :options="props.item.options"
        :multi="multiChoice"
        @add="emit('optionAdd')"
        @remove="index => emit('optionRemove', index)"
        @move-up="index => emit('optionMoveUp', index)"
        @move-down="index => emit('optionMoveDown', index)"
        @drag-drop="(from, to) => emit('optionDragDrop', from, to)"
        @update-value="(index, value) => emit('optionUpdateValue', index, value)"
        @update-answer="(index, isAnswer) => emit('optionUpdateAnswer', index, isAnswer)"
        @update-points="(index, points) => emit('optionUpdatePoints', index, points)"
      />
    </EditorFormField>

    <EditorFormField label="答案分析" hint="选填；提交后在结果页展示">
      <textarea
        class="bx-eip__textarea"
        :value="props.item.answerAnalysis"
        aria-label="答案分析"
        placeholder="选填"
        @input="onAnalysisInput"
      />
    </EditorFormField>
  </view>
</template>

<style lang="scss" scoped>
.bx-eip {
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.bx-eip__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.bx-eip__no {
  font-size: 15px;
  font-weight: 600;
  color: var(--bx-text);
}

.bx-eip__type {
  padding: 2px 8px;
  font-size: 12px;
  color: var(--bx-primary);
  background-color: var(--bx-primary-soft);
  border-radius: 10px;
}

.bx-eip__input {
  box-sizing: border-box;
  width: 100%;
  height: 38px;
  padding: 0 10px;
  font-size: 14px;
  color: var(--bx-text);
  background-color: var(--bx-bg);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-eip__textarea {
  box-sizing: border-box;
  width: 100%;
  height: 72px;
  padding: 8px 10px;
  font-size: 14px;
  color: var(--bx-text);
  background-color: var(--bx-bg);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-eip__type-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 10px;
  background-color: var(--bx-bg);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-eip__type-button-text {
  font-size: 14px;
  color: var(--bx-text);
}

.bx-eip__type-button-arrow {
  font-size: 10px;
  color: var(--bx-text-3);
}

.bx-eip__picker {
  margin-top: 8px;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
  overflow: hidden;
}
</style>
