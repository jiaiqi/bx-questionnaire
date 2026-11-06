<script setup lang="ts">
/**
 * 题目编辑面板（属性栏）
 *
 * 面板**不改 props**，所有修改通过 `patch` / `attrPatch` 事件交回页面
 * （`vue/no-mutating-props` 之外，更重要的是：改动入口只有一处，才好在保存前
 * 统一算出「哪些真的变了」）。
 *
 * 「题型属性」按题型分别渲染，取值全部来自 `domain/editor/enums`，
 * 而 enums 里的值又与 `mapper.resolveWidget` 逐个对齐过 ——
 * 写进 `item_type_attr` 的值必须能被作答侧认出来，否则表现为「属性选了没反应」。
 *
 * ## V6「清简」分组
 *
 * 按原型的右栏顺序：题型（下拉样式的按钮）→ 题目（多行）→ 说明 →
 * 必答开关 → 计分 → 题型属性 → 选项 → 删除题目。
 * 分组标题 12/500 元信息色，分组之间一条 1px 细线；字段间距 16。
 */

import type { EditorIssue, EditorItem } from '@/domain/editor'

import { computed, ref } from 'vue'

import {
  DATE_TYPE_CHOICES,
  itemTypeSpec,
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
  issues: EditorIssue[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  patch: [patch: Partial<EditorItem>]
  attrPatch: [patch: Record<string, unknown>]
  changeType: [type: string]
  remove: []
  /** 复制当前题目（副本插在原题之后） */
  duplicate: []
  optionAdd: []
  optionReplaceAll: [values: string[]]
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

/** 当前题型是否有「题型属性」可配（不只看 type，避免空分组占位） */
const hasTypeAttr = computed(() =>
  ['文本', '时间日期', '图片', '选项', '引用', '地址'].includes(props.item.type),
)

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

/** 必答开关：点整行开关都切换（键盘 Enter / Space 同效） */
function toggleRequired(): void {
  emit('patch', { required: !props.item.required })
}
</script>

<template>
  <view class="bx-eip">
    <!-- ── 题目 ── -->
    <view class="bx-eip__group">
      <EditorFormField label="题型" required :hint="spec ? spec.hint : ''" :error="errorFor('type')">
        <view
          class="bx-eip__select"
          role="button"
          tabindex="0"
          aria-label="选择题型"
          :aria-expanded="typePickerOpen ? 'true' : 'false'"
          @click="typePickerOpen = !typePickerOpen"
          @keydown.enter.prevent="typePickerOpen = !typePickerOpen"
        >
          <text class="bx-eip__select-text">{{ spec?.label ?? props.item.type }}</text>
          <view class="bx-eip__chevron" aria-hidden="true" />
        </view>
        <view v-if="typePickerOpen" class="bx-eip__picker">
          <EditorTypePicker @select="onTypeSelected" @close="typePickerOpen = false" />
        </view>
      </EditorFormField>

      <EditorFormField label="题目" required :error="errorFor('title')">
        <textarea
          class="bx-eip__textarea bx-eip__textarea--title"
          :value="props.item.title"
          aria-label="题目标题"
          placeholder="请输入题目标题"
          @input="onTitleInput"
        />
      </EditorFormField>

      <EditorFormField label="说明" hint="选填；提交后在结果页作为答案解析展示">
        <textarea
          class="bx-eip__textarea"
          :value="props.item.answerAnalysis"
          aria-label="题目说明"
          placeholder="补充说明（选填）"
          @input="onAnalysisInput"
        />
      </EditorFormField>
    </view>

    <!-- ── 必答：开关行 ── -->
    <view class="bx-eip__switchrow">
      <view class="bx-eip__switchrow-text">
        <text class="bx-eip__switchrow-label">必答</text>
        <text class="bx-eip__switchrow-hint">不答无法提交</text>
      </view>
      <view
        class="bx-eip__switch"
        :class="{ 'bx-eip__switch--on': props.item.required }"
        role="switch"
        tabindex="0"
        :aria-checked="props.item.required ? 'true' : 'false'"
        aria-label="是否必答"
        @click="toggleRequired"
        @keydown.enter.prevent="toggleRequired"
        @keydown.space.prevent="toggleRequired"
      >
        <view class="bx-eip__switch-knob" aria-hidden="true" />
      </view>
    </view>

    <!-- ── 计分 ── -->
    <view class="bx-eip__group">
      <text class="bx-eip__group-title">计分</text>

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
    </view>

    <!-- ── 题型属性 ── -->
    <view v-if="hasTypeAttr" class="bx-eip__group">
      <text class="bx-eip__group-title">题型属性</text>

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
    </view>

    <!-- ── 选项 ── -->
    <view v-if="hasOptions" class="bx-eip__group">
      <text class="bx-eip__group-title">选项</text>

      <EditorOptionEditor
        :options="props.item.options"
        :multi="multiChoice"
        @add="emit('optionAdd')"
        @replace-all="values => emit('optionReplaceAll', values)"
        @remove="index => emit('optionRemove', index)"
        @move-up="index => emit('optionMoveUp', index)"
        @move-down="index => emit('optionMoveDown', index)"
        @drag-drop="(from, to) => emit('optionDragDrop', from, to)"
        @update-value="(index, value) => emit('optionUpdateValue', index, value)"
        @update-answer="(index, isAnswer) => emit('optionUpdateAnswer', index, isAnswer)"
        @update-points="(index, points) => emit('optionUpdatePoints', index, points)"
      />
      <text v-if="optionIssue" class="bx-eip__option-error">{{ optionIssue.message }}</text>
    </view>

    <!-- ── 复制 / 删除题目 ── -->
    <view class="bx-eip__danger">
      <view
        class="bx-eip__danger-btn bx-eip__danger-btn--copy"
        role="button"
        tabindex="0"
        aria-label="复制此题"
        @click="emit('duplicate')"
        @keydown.enter.prevent="emit('duplicate')"
      >
        <text class="bx-eip__danger-text bx-eip__danger-text--copy">复制此题</text>
      </view>
      <view
        class="bx-eip__danger-btn"
        role="button"
        tabindex="0"
        aria-label="删除题目"
        @click="emit('remove')"
        @keydown.enter.prevent="emit('remove')"
      >
        <view class="bx-eip__trash" aria-hidden="true" />
        <text class="bx-eip__danger-text">删除题目</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-eip {
  display: flex;
  flex-direction: column;
  padding: 16px 20px 32px;
}

/* ── 分组 ── */

.bx-eip__group {
  display: flex;
  flex-direction: column;
}

.bx-eip__group + .bx-eip__group {
  margin-top: 4px;
  padding-top: 16px;
  border-top: 1px solid var(--bx-line-2);
}

/* 分组最后一个字段不再留 16px 下边距：分组之间的间距由上面那条规则统一给出 */
.bx-eip__group :deep(.bx-efield:last-child) {
  margin-bottom: 0;
}

/* 分组标题：12 / 500 元信息色，加一点字距把「分组」和「字段」区分开 */
.bx-eip__group-title {
  display: block;
  margin-bottom: 12px;
  color: var(--bx-text-3);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  letter-spacing: 0.06em;
}

/* ── 控件 ── */

/* 输入类：白底 + 细描边，聚焦时描边变主色并加一圈柔光环 */
.bx-eip__input {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  color: var(--bx-text);
  font-size: 13px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-eip__input::placeholder {
  color: var(--bx-text-4);
}

.bx-eip__input:focus-within {
  border-color: var(--bx-primary);
  box-shadow: var(--bx-focus-glow);
}

.bx-eip__textarea {
  box-sizing: border-box;
  width: 100%;
  height: 72px;
  padding: 8px 10px;
  color: var(--bx-text);
  font-size: 13px;
  line-height: 20px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
  resize: vertical;
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-eip__textarea::placeholder {
  color: var(--bx-text-4);
}

.bx-eip__textarea:focus-within {
  border-color: var(--bx-primary);
  box-shadow: var(--bx-focus-glow);
}

/* 题干是多行字段：给两行的高度，长题干不用挤在一个单行输入里 */
.bx-eip__textarea--title {
  height: 72px;
}

/* 题型：长得像原生 select 的按钮（点击展开题型网格） */
.bx-eip__select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 34px;
  padding: 0 10px;
  cursor: pointer;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .bx-eip__select:hover {
    border-color: var(--bx-line-strong);
    background-color: var(--bx-surface-2);
  }
}

.bx-eip__select:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.bx-eip__select-text {
  color: var(--bx-text);
  font-size: 13px;
}

/* 下拉箭头：两条边框旋转 45°（不用 ▲ ▼ 文字符号） */
.bx-eip__chevron {
  flex: none;
  width: 7px;
  height: 7px;
  margin-left: 8px;
  border-top: 1.5px solid var(--bx-text-3);
  border-right: 1.5px solid var(--bx-text-3);
  transform: rotate(135deg);
}

.bx-eip__picker {
  margin-top: 8px;
  padding: 12px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
  box-shadow: var(--bx-elev-1);
}

/* ── 必答开关行 ── */

.bx-eip__switchrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--bx-line-2);
}

.bx-eip__switchrow-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.bx-eip__switchrow-label {
  color: var(--bx-text-2);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.bx-eip__switchrow-hint {
  color: var(--bx-text-3);
  font-size: 11px;
  line-height: 16px;
}

/* 开关：轨道 36×21，滑块 17，开 = 主色（与设计系统 §5.5 同尺寸） */
.bx-eip__switch {
  position: relative;
  flex: none;
  box-sizing: border-box;
  width: 36px;
  height: 21px;
  border-radius: var(--bx-radius-pill);
  background-color: var(--bx-line-strong);
  cursor: pointer;
  transition: background-color var(--bx-duration-base) var(--bx-ease-out);
}

.bx-eip__switch--on {
  background-color: var(--bx-primary);
}

.bx-eip__switch:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.bx-eip__switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background-color: var(--bx-surface);
  box-shadow: var(--bx-elev-1);
  transition: transform var(--bx-duration-base) var(--bx-ease-out);
}

.bx-eip__switch--on .bx-eip__switch-knob {
  transform: translateX(15px);
}

/* ── 选项区报错 ── */

.bx-eip__option-error {
  display: block;
  margin-top: 6px;
  color: var(--bx-danger);
  font-size: 12px;
  line-height: 18px;
}

/* ── 删除题目 ── */

.bx-eip__danger {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--bx-line-2);
}

.bx-eip__danger-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 8px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .bx-eip__danger-btn:hover {
    background-color: var(--bx-danger-soft);
  }
}

.bx-eip__danger-btn:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

/* 垃圾桶：桶身（两条竖线 + 一条底线）+ 桶盖 */
.bx-eip__trash {
  position: relative;
  flex: none;
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--bx-danger);
  border-top: none;
  border-radius: 0 0 2px 2px;
}

.bx-eip__trash::before {
  content: '';
  position: absolute;
  top: -3px;
  left: -2px;
  width: 12px;
  height: 1.5px;
  background-color: var(--bx-danger);
  border-radius: 1px;
}

.bx-eip__danger-text {
  color: var(--bx-danger);
  font-size: 12px;
  line-height: 18px;
}

/* 复制是常规动作，用主色而不是危险色，避免和「删除题目」混成一片红 */
.bx-eip__danger-text--copy {
  color: var(--bx-primary);
}
</style>
