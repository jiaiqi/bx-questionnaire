<script setup lang="ts">
/**
 * 问卷基本信息表单
 *
 * ## 分类用 `<picker>` 而不是分段控件
 *
 * 分类是**树**（本环境 13 个节点，`parent_no` + `path_name`），数量会随业务增长，
 * 铺成按钮墙会失控。这里用平台原生的 `<picker mode="selector">`，
 * 列表项显示 `path_name`（如「自测/考试」）并附编号，便于区分同名节点。
 *
 * **不按 `is_leaf` 过滤**：演示问卷用的 `DAQ202409230006`（自测）`is_leaf=否`，
 * 只取叶子会把最常用的分类从选择器里删掉。
 *
 * ## 封面存的是 `file_no`，不是 URL
 *
 * `activity_image` 列长 255，存的是附件批次号。回显要另查附件表拿 `fileurl`
 * （`attachmentSelect`），所以这里自己按 `activityImage` 变化去解析一次预览地址。
 * 把 URL 存进 `activity_image` 会让「换域名」或「带签名的临时地址」失效。
 *
 * ## 时间用「日期 + 时间」两个原生 picker 拼
 *
 * 平台要 `YYYY-MM-DD HH:mm:ss`；uni 的 `mode="datetime"` 在 H5 与小程序上表现不同，
 * 且 `start`/`end` 在 H5 不生效（已实测），所以拆成两个明确的控件更可控。
 */

import type { DaqClassifyRow } from '@/api/daq/types'
import type { EditorActivity, EditorIssue } from '@/domain/editor'

import { computed, ref, watch } from 'vue'

import { classifySelect } from '@/api/daq/editor'
import { attachmentSelect, resolveFileUrl } from '@/api/file/attachment'
import { uploadAttachment } from '@/api/file/upload'
import {
  ACT_OPTION_OPTIONS,
  ACTIVITY_STATUS_OPTIONS,
  ANSWER_TIMES_OPTIONS,
  ITEM_DISP_WAY_OPTIONS,
  MODIFY_AFTER_SUBMIT_OPTIONS,
  MODIFY_PERIOND_OPTIONS,
  PERM_TYPE_OPTIONS,
  toChoices,
} from '@/domain/editor'
import { activityIssues } from '@/domain/editor/validation'
import { BxError } from '@/utils/request'
import { toast } from '@/utils/ui'
import EditorFormField from './EditorFormField.vue'
import EditorSegmented from './EditorSegmented.vue'

interface Props {
  activity: EditorActivity
  issues: EditorIssue[]
}

const props = defineProps<Props>()

const emit = defineEmits<{ patch: [patch: Partial<EditorActivity>] }>()

const statusChoices = toChoices(ACTIVITY_STATUS_OPTIONS)
const permChoices = toChoices(PERM_TYPE_OPTIONS)
const answerTimesChoices = toChoices(ANSWER_TIMES_OPTIONS)
const dispWayChoices = toChoices(ITEM_DISP_WAY_OPTIONS)
const actOptionChoices = toChoices(ACT_OPTION_OPTIONS)
const modifyChoices = toChoices(MODIFY_AFTER_SUBMIT_OPTIONS)
const periodChoices = toChoices(MODIFY_PERIOND_OPTIONS)

const moreOpen = ref(false)

// ── 分类 ──

const classifyRows = ref<DaqClassifyRow[]>([])
const classifyError = ref('')

const classifyLabels = computed(() =>
  classifyRows.value.map(row => `${row.path_name || row.classify_name || row.classify_no}（${row.classify_no}）`),
)

const classifyIndex = computed(() => {
  const index = classifyRows.value.findIndex(row => row.classify_no === props.activity.classify)
  return index < 0 ? 0 : index
})

const classifyLabel = computed(() => {
  if (!props.activity.classify) {
    return ''
  }
  return classifyLabels.value[classifyIndex.value] ?? props.activity.classify
})

async function loadClassify(): Promise<void> {
  classifyError.value = ''
  try {
    const envelope = await classifySelect()
    const rows = envelope.data ?? []
    // 服务端接受 order，但顺序仍按 seq 客户端兜底：节点顺序直接决定选择器好不好用
    classifyRows.value = [...rows].sort((a, b) => {
      const left = a.seq ?? 9999
      const right = b.seq ?? 9999
      return left - right
    })
  }
  catch (error) {
    classifyError.value = error instanceof BxError ? error.message : '分类加载失败'
  }
}

void loadClassify()

function onClassifyChange(event: unknown): void {
  const index = Number((event as { detail?: { value?: string } })?.detail?.value)
  const row = classifyRows.value[index]
  if (row) {
    emit('patch', { classify: row.classify_no })
  }
}

// ── 封面 ──

const coverUrl = ref('')
const uploading = ref(false)

async function loadCoverUrl(fileNo: string): Promise<void> {
  if (!fileNo) {
    coverUrl.value = ''
    return
  }
  try {
    const envelope = await attachmentSelect({ fileNo })
    const row = envelope?.data?.[0]
    coverUrl.value = row?.fileurl ? resolveFileUrl(row.fileurl) : ''
  }
  catch {
    // 只是预览读不到，不影响封面编号本身；不提示、也不清空已存的编号
    coverUrl.value = ''
  }
}

watch(() => props.activity.activityImage, fileNo => void loadCoverUrl(fileNo), { immediate: true })

function chooseCover(): void {
  uni.chooseImage({
    count: 1,
    success: (res) => {
      const path = (res.tempFilePaths ?? [])[0]
      if (path) {
        void uploadCover(path)
      }
    },
    fail: (err) => {
      // 用户取消不是错误；其它失败必须说出来（吞掉会变成「点了没反应」）
      const message = String((err as { errMsg?: string })?.errMsg ?? '')
      if (!message.includes('cancel')) {
        toast('选择图片失败')
      }
    },
  })
}

async function uploadCover(filePath: string): Promise<void> {
  uploading.value = true
  try {
    const row = await uploadAttachment({ filePath })
    const fileNo = row.file_no === undefined || row.file_no === null ? '' : String(row.file_no)
    if (!fileNo) {
      throw new BxError('上传成功但没有返回文件编号，请重试', 'NO_FILE_NO')
    }
    coverUrl.value = row.fileurl ? resolveFileUrl(row.fileurl) : ''
    emit('patch', { activityImage: fileNo })
  }
  catch (error) {
    toast(error instanceof BxError ? error.message : '封面上传失败')
  }
  finally {
    uploading.value = false
  }
}

// ── 时间 ──

function splitDateTime(value: string): { date: string, time: string } {
  const digits = value.replace(/\D/g, '')
  const date = digits.length >= 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    : ''
  const time = digits.length >= 14
    ? `${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`
    : '00:00:00'
  return { date, time }
}

function joinDateTime(date: string, time: string): string {
  return date ? `${date} ${time || '00:00:00'}` : ''
}

const startParts = computed(() => splitDateTime(props.activity.startTime))
const endParts = computed(() => splitDateTime(props.activity.endTime))

function onDateChange(field: 'startTime' | 'endTime', event: unknown): void {
  const date = String((event as { detail?: { value?: string } })?.detail?.value ?? '')
  const parts = field === 'startTime' ? startParts.value : endParts.value
  emit('patch', { [field]: joinDateTime(date, parts.time) })
}

function onTimeChange(field: 'startTime' | 'endTime', event: unknown): void {
  const time = String((event as { detail?: { value?: string } })?.detail?.value ?? '')
  const parts = field === 'startTime' ? startParts.value : endParts.value
  emit('patch', { [field]: joinDateTime(parts.date, time) })
}

// ── 文本输入 ──

function readInput(event: unknown): string | null {
  const value = (event as { detail?: { value?: string } })?.detail?.value
  return typeof value === 'string' ? value : null
}

function onTextInput(field: keyof EditorActivity, event: unknown): void {
  const value = readInput(event)
  if (value !== null) {
    emit('patch', { [field]: value } as Partial<EditorActivity>)
  }
}

/** 只属于活动的校验问题（题目级问题由题目面板显示） */
const ownIssues = computed(() => activityIssues(props.issues))

function errorFor(field: string): string {
  return ownIssues.value.find(issue => issue.field === `activity.${field}`)?.message ?? ''
}
</script>

<template>
  <view class="bx-eaf">
    <!-- ── 基本信息 ── -->
    <view class="bx-eaf__group">
      <text class="bx-eaf__group-title">基本信息</text>

      <EditorFormField label="问卷标题" required :error="errorFor('title')">
        <input
          class="bx-eaf__input"
          type="text"
          :value="props.activity.title"
          aria-label="问卷标题"
          placeholder="例如：员工满意度调查"
          @input="onTextInput('title', $event)"
        >
      </EditorFormField>

      <EditorFormField
        label="分类"
        required
        :error="errorFor('classify')"
        :hint="classifyError ? `分类加载失败：${classifyError}` : '分类同时决定信息采集类型（服务端派生）'"
      >
        <picker
          mode="selector"
          :range="classifyLabels"
          :value="classifyIndex"
          @change="onClassifyChange"
        >
          <view class="bx-eaf__picker" :class="{ 'bx-eaf__picker--empty': !props.activity.classify }">
            <text class="bx-eaf__picker-text">
              {{ classifyLabel || (classifyLabels.length ? '请选择分类' : '暂无可用分类') }}
            </text>
            <view class="bx-eaf__picker-arrow" aria-hidden="true" />
          </view>
        </picker>
      </EditorFormField>

      <EditorFormField label="关键字" required :error="errorFor('keyword')" hint="用于列表搜索与归档">
        <input
          class="bx-eaf__input"
          type="text"
          :value="props.activity.keyword"
          aria-label="关键字"
          placeholder="例如：满意度"
          @input="onTextInput('keyword', $event)"
        >
      </EditorFormField>

      <EditorFormField label="问卷描述" required :error="errorFor('remark')">
        <textarea
          class="bx-eaf__textarea"
          :value="props.activity.remark"
          aria-label="问卷描述"
          placeholder="填写问卷说明"
          @input="onTextInput('remark', $event)"
        />
      </EditorFormField>
    </view>

    <!-- ── 封面与时间 ── -->
    <view class="bx-eaf__group">
      <text class="bx-eaf__group-title">封面与时间</text>

      <EditorFormField label="封面图" required :error="errorFor('activityImage')">
        <view
          class="bx-eaf__cover"
          role="button"
          tabindex="0"
          aria-label="上传封面图"
          @click="chooseCover"
          @keydown.enter.prevent="chooseCover"
        >
          <image v-if="coverUrl" class="bx-eaf__cover-img" :src="coverUrl" mode="aspectFill" alt="问卷封面预览" />
          <view v-else class="bx-eaf__cover-empty">
            <view class="bx-eaf__cover-plus" aria-hidden="true" />
            <text class="bx-eaf__cover-tip">{{ uploading ? '上传中…' : '点击上传' }}</text>
          </view>
        </view>
      </EditorFormField>

      <EditorFormField label="启用时间" required :error="errorFor('startTime')">
        <view class="bx-eaf__times">
          <picker mode="date" :value="startParts.date" @change="onDateChange('startTime', $event)">
            <view class="bx-eaf__picker bx-eaf__picker--flex">
              <text class="bx-eaf__picker-text">{{ startParts.date || '选择日期' }}</text>
            </view>
          </picker>
          <picker mode="time" :value="startParts.time" @change="onTimeChange('startTime', $event)">
            <view class="bx-eaf__picker bx-eaf__picker--flex">
              <text class="bx-eaf__picker-text">{{ startParts.time }}</text>
            </view>
          </picker>
        </view>
      </EditorFormField>

      <EditorFormField label="结束时间" required :error="errorFor('endTime')">
        <view class="bx-eaf__times">
          <picker mode="date" :value="endParts.date" @change="onDateChange('endTime', $event)">
            <view class="bx-eaf__picker bx-eaf__picker--flex">
              <text class="bx-eaf__picker-text">{{ endParts.date || '选择日期' }}</text>
            </view>
          </picker>
          <picker mode="time" :value="endParts.time" @change="onTimeChange('endTime', $event)">
            <view class="bx-eaf__picker bx-eaf__picker--flex">
              <text class="bx-eaf__picker-text">{{ endParts.time }}</text>
            </view>
          </picker>
        </view>
      </EditorFormField>
    </view>

    <!-- ── 规则 ── -->
    <view class="bx-eaf__group">
      <text class="bx-eaf__group-title">规则</text>

      <EditorFormField label="状态" hint="服务端不会自动改成「进行中」，必须显式选择">
        <EditorSegmented
          :model-value="props.activity.status"
          :options="statusChoices"
          @update:model-value="value => emit('patch', { status: value })"
        />
      </EditorFormField>

      <EditorFormField label="权限类型">
        <EditorSegmented
          :model-value="props.activity.permType"
          :options="permChoices"
          @update:model-value="value => emit('patch', { permType: value })"
        />
      </EditorFormField>

      <EditorFormField label="用户填写次数">
        <EditorSegmented
          :model-value="props.activity.answerTimes"
          :options="answerTimesChoices"
          @update:model-value="value => emit('patch', { answerTimes: value })"
        />
      </EditorFormField>

      <EditorFormField label="问题显示方式" hint="「逐个」= 一题一屏">
        <EditorSegmented
          :model-value="props.activity.itemDispWay"
          :options="dispWayChoices"
          @update:model-value="value => emit('patch', { itemDispWay: value })"
        />
      </EditorFormField>

      <EditorFormField label="选项" hint="「评分」会启用分数与通过分数">
        <EditorSegmented
          :model-value="props.activity.actOption"
          :options="actOptionChoices"
          @update:model-value="value => emit('patch', { actOption: value })"
        />
      </EditorFormField>

      <EditorFormField
        v-if="props.activity.actOption === '评分'"
        label="通过分数"
        :error="errorFor('passingMark')"
      >
        <input
          class="bx-eaf__input"
          type="text"
          :value="props.activity.passingMark"
          aria-label="通过分数"
          placeholder="例如：60"
          @input="onTextInput('passingMark', $event)"
        >
      </EditorFormField>
    </view>

    <!-- ── 更多设置：默认收起，避免主流程被十几项配置淹没 ── -->
    <view
      class="bx-eaf__more"
      role="button"
      tabindex="0"
      aria-label="更多设置"
      @click="moreOpen = !moreOpen"
      @keydown.enter.prevent="moreOpen = !moreOpen"
    >
      <text class="bx-eaf__more-text">更多设置</text>
      <view class="bx-eaf__more-arrow" :class="{ 'bx-eaf__more-arrow--open': moreOpen }" aria-hidden="true" />
    </view>

    <view v-if="moreOpen" class="bx-eaf__group">
      <EditorFormField label="提交后是否可修改">
        <EditorSegmented
          :model-value="props.activity.modifyAfterSubmit"
          :options="modifyChoices"
          @update:model-value="value => emit('patch', { modifyAfterSubmit: value })"
        />
      </EditorFormField>

      <EditorFormField v-if="props.activity.modifyAfterSubmit === '是'" label="修改周期">
        <EditorSegmented
          :model-value="props.activity.modifyPeriond"
          :options="periodChoices"
          @update:model-value="value => emit('patch', { modifyPeriond: value })"
        />
      </EditorFormField>

      <EditorFormField label="分享摘要" :error="errorFor('summary')">
        <input
          class="bx-eaf__input"
          type="text"
          :value="props.activity.summary"
          aria-label="分享摘要"
          placeholder="选填"
          @input="onTextInput('summary', $event)"
        >
      </EditorFormField>

      <EditorFormField label="提交按钮文字" :error="errorFor('submitLabel')">
        <input
          class="bx-eaf__input"
          type="text"
          :value="props.activity.submitLabel"
          aria-label="提交按钮文字"
          placeholder="例如：提交"
          @input="onTextInput('submitLabel', $event)"
        >
      </EditorFormField>

      <EditorFormField label="提交后提示语" :error="errorFor('submittedTip')">
        <input
          class="bx-eaf__input"
          type="text"
          :value="props.activity.submittedTip"
          aria-label="提交后提示语"
          placeholder="例如：感谢你的参与！"
          @input="onTextInput('submittedTip', $event)"
        >
      </EditorFormField>

      <EditorFormField label="开始语" :error="errorFor('startRemark')">
        <textarea
          class="bx-eaf__textarea"
          :value="props.activity.startRemark"
          aria-label="开始语"
          placeholder="选填"
          @input="onTextInput('startRemark', $event)"
        />
      </EditorFormField>

      <EditorFormField label="结束语" :error="errorFor('endRemark')">
        <textarea
          class="bx-eaf__textarea"
          :value="props.activity.endRemark"
          aria-label="结束语"
          placeholder="选填"
          @input="onTextInput('endRemark', $event)"
        />
      </EditorFormField>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-eaf {
  display: flex;
  flex-direction: column;
  padding: 16px;
}

/* ── 分组 ── */

.bx-eaf__group {
  padding-bottom: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--bx-line-2);
}

/* 分组标题：12/600（规范 §7.6） */
.bx-eaf__group-title {
  display: block;
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  color: var(--bx-text-2);
  letter-spacing: 0.02em;
}

/* ── 控件 ── */

/* 输入类：浅底 + 强描边，聚焦时描边变主色并加一圈光晕（规范 §6.2） */
.bx-eaf__input {
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  padding: 0 12px;
  font-size: 15px;
  color: var(--bx-text);
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-radius);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-eaf__input:focus-within {
  border-color: var(--bx-primary);
  box-shadow: var(--bx-focus-glow);
}

.bx-eaf__textarea {
  box-sizing: border-box;
  width: 100%;
  height: 88px;
  padding: 10px 12px;
  font-size: 15px;
  line-height: 24px;
  color: var(--bx-text);
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-radius);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-eaf__textarea:focus-within {
  border-color: var(--bx-primary);
  box-shadow: var(--bx-focus-glow);
}

.bx-eaf__picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 44px;
  padding: 0 12px;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-radius);
}

.bx-eaf__picker--flex {
  flex: 1;
  justify-content: center;
}

.bx-eaf__picker--empty .bx-eaf__picker-text {
  color: var(--bx-text-3);
}

.bx-eaf__picker-text {
  overflow: hidden;
  font-size: 15px;
  color: var(--bx-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 下拉箭头：两条边框旋转 45°（不用 ▼ 文字符号，字形随字体变化） */
.bx-eaf__picker-arrow {
  flex: none;
  width: 8px;
  height: 8px;
  margin-left: 8px;
  border-top: 1.5px solid var(--bx-text-3);
  border-right: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg);
}

.bx-eaf__times {
  display: flex;
  gap: 8px;
}

.bx-eaf__cover {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 80px;
  overflow: hidden;
  background-color: var(--bx-surface-2);
  border: 1px dashed var(--bx-line-strong);
  border-radius: var(--bx-radius);
  cursor: pointer;
}

.bx-eaf__cover-img {
  width: 120px;
  height: 80px;
}

.bx-eaf__cover-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 加号用两条线绘制（原为「＋」文字符号，字形随字体变化） */
.bx-eaf__cover-plus {
  position: relative;
  width: 16px;
  height: 16px;
}

.bx-eaf__cover-plus::before,
.bx-eaf__cover-plus::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 16px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: var(--bx-text-3);
  border-radius: 1px;
}

.bx-eaf__cover-plus::after {
  transform: rotate(90deg);
}

.bx-eaf__cover-tip {
  margin-top: 2px;
  font-size: 12px;
  color: var(--bx-text-3);
}

/* ── 更多设置 ── */

.bx-eaf__more {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  margin-bottom: 16px;
  cursor: pointer;
  border-top: 1px solid var(--bx-line-2);
  border-bottom: 1px solid var(--bx-line-2);
}

.bx-eaf__more-text {
  font-size: 13px;
  color: var(--bx-text-2);
}

/* 箭头：两条边框旋转 45°，展开时翻转 */
.bx-eaf__more-arrow {
  width: 8px;
  height: 8px;
  margin-left: 6px;
  border-right: 1.5px solid var(--bx-text-3);
  border-bottom: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg) translate(-2px, -2px);
  transition: transform var(--bx-duration-base) var(--bx-ease-out);
}

.bx-eaf__more-arrow--open {
  transform: rotate(-135deg) translate(-2px, -2px);
}
</style>
