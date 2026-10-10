<script setup lang="ts">
/**
 * 答题主体
 *
 * `index/index` 与 `survey/survey` 共用：两者是老工程同一功能的两个入口，
 * 差异仅在路由与结果页指向。
 */

import type { AnswerValue, LocalDraft, QuestionField } from '@/domain/questionnaire'

import { computed, ref, watch } from 'vue'

import { recordReplySelect } from '@/api/daq/record'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import BxProgressBar from '@/components/base/BxProgressBar.vue'
import BxFieldRenderer from '@/components/form/BxFieldRenderer.vue'
import { useAnswerModel } from '@/composables/useAnswerModel'
import { useDraft } from '@/composables/useDraft'
import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { useSubmit } from '@/composables/useSubmit'
import { fromLocalDraft, toArray, toLocalDraft, validateRequired } from '@/domain/questionnaire'
import { useSessionStore } from '@/stores/session'
import { BxError } from '@/utils/request'
import { draftAnswersKey, storage, STORAGE_KEYS } from '@/utils/storage'
import { confirmDialog, scrollToSelector, toast } from '@/utils/ui'

interface Props {
  activityNo: string
  formType?: string
  fillBatchNo?: string
  /** 提交成功后跳转的结果页 */
  resultPath?: string
}

const props = withDefaults(defineProps<Props>(), {
  formType: 'form',
  fillBatchNo: '',
  resultPath: '/pages/questionnaire/index/result',
})

const emit = defineEmits<{ submitted: [{ batchNo: string }] }>()

const session = useSessionStore()
const { loading, activity, fields, backfill, errorMessage, load } = useQuestionnaire()
const { answers, progress, replace } = useAnswerModel(() => fields.value)
const { savedTip, save: saveDraftItem, saveAll: saveAllDraft, waitIdle: waitDraftIdle } = useDraft()
const { submitting, submit } = useSubmit()

const errors = ref<Record<string, string>>({})

const title = computed(() => activity.value?.title || '问卷')
const intro = computed(() => activity.value?.start_remark || '')

/**
 * 供宿主页面取用（例如小程序的分享标题）
 *
 * useQuestionnaire 每次调用都会新建状态，页面拿不到 Runner 内的 activity，
 * 所以这里把标题暴露出去，页面通过模板 ref 读取。
 */
defineExpose({ activityTitle: title })
/** 已结束的活动按只读展示；formType 为 view / detail 亦为查看模式 */
const readOnly = computed(() =>
  activity.value?.status === '已结束' || props.formType === 'view' || props.formType === 'detail',
)

async function init(): Promise<void> {
  errors.value = {}

  if (!props.activityNo) {
    errorMessage.value = '缺少活动编号，无法加载问卷'
    return
  }

  const batchNo = props.fillBatchNo || session.fillBatchNo || undefined

  // 有批次号时先按 use 取：能从服务端拿到该批次的 user_data，恢复已答内容。
  // 这是「点击未完成记录续答」的关键路径 —— 本地草稿只存在于同一浏览器，
  // 换设备或换会话时只有服务端能提供答案。无权限/批次失效时 use 会失败，
  // load 内部已清空 errorMessage，再退回 plain 重取即可。
  // 无批次号时 use 没有意义（服务端只会返回空 user_data），直接 plain。
  let ok = false
  if (batchNo) {
    ok = await load(props.activityNo, { mode: 'use', fillBatchNo: batchNo })
  }
  if (!ok) {
    ok = await load(props.activityNo, { mode: 'plain', fillBatchNo: batchNo })
  }
  if (!ok) {
    return
  }

  if (Object.keys(backfill.value).length > 0) {
    replace(backfill.value)
  }
  else {
    // 服务端没有回填（匿名用户拿不到 user_data）时用本地草稿续答：
    // 否则用户填到一半刷新页面，答案会全部丢失、只恢复批次号。
    restoreLocalDraft()
  }

  applyEntryPrefill()
  await restoreDraftBatch()
}

/**
 * 从本地存储恢复草稿答案
 *
 * 两条过滤规则：
 * - 只恢复「题目仍然存在」的键：活动配置可能已改，残留的旧键写进 answers 会让
 *   进度统计把不存在的题算进去；
 * - 草稿带批次号时，若当前 URL 指定了别的批次则不恢复 —— 否则点击历史记录里
 *   另一条未完成记录，会把本机的草稿答案套到那条记录上，提交后数据错乱。
 */
function restoreLocalDraft(): void {
  const saved = storage.get<LocalDraft | null>(draftAnswersKey(props.activityNo), null)
  const valid = fromLocalDraft(saved, fields.value, props.fillBatchNo || session.fillBatchNo || '')
  if (Object.keys(valid).length > 0) {
    replace(valid)
  }
}

/**
 * 续答：取回未完成记录的批次号
 *
 * 实测草稿保存（srvdaq_activity_result_save）**不回传** fill_batch_no，
 * 只有提交才在 response[0].response.fill_batch_no 里回传。
 * 因此若不在作答前取回草稿批次号，提交会新建一条记录而不是续答。
 */
async function restoreDraftBatch(): Promise<void> {
  const userNo = session.userInfo?.user_no
  if (!userNo) {
    return
  }

  try {
    const envelope = await recordReplySelect({
      activityNo: props.activityNo,
      userNo,
      state: '未完成',
      rownumber: 1,
    })
    const batchNo = envelope.data?.[0]?.fill_batch_no
    if (batchNo) {
      session.setFillBatchNo(String(batchNo))
    }
  }
  catch {
    // 无未完成记录或接口异常都不影响作答
  }
}

/**
 * 用登记信息预填同名文本题
 *
 * 老工程把登记表单通过 URL 传给 indexyax 并展开进提交请求（...self.submitInfo），
 * 用于填充结果表的 company / user_name / user_phone；这里额外做一层按题目标题关键词的预填，
 * 仅在题目尚未作答时生效。
 */
function applyEntryPrefill(): void {
  const entry = storage.get<Record<string, string>>(STORAGE_KEYS.ENTRY_PARAMS, {})
  const rules: Array<[string, string | undefined]> = [
    ['单位', entry.company],
    ['姓名', entry.user_name],
    ['电话', entry.user_phone],
    ['手机', entry.user_phone],
  ]

  for (const field of fields.value) {
    if (field.widget !== 'text' && field.widget !== 'textarea') {
      continue
    }
    if (toArray(answers[field.key]).length > 0) {
      continue
    }
    const matched = rules.find(([keyword, value]) => !!value && field.label.includes(keyword))
    if (matched?.[1]) {
      answers[field.key] = matched[1]
    }
  }
}

watch(
  () => [props.activityNo, props.fillBatchNo],
  () => {
    void init()
  },
  { immediate: true },
)

/** 本地草稿写入的防抖句柄：逐字符输入不该每次都落盘 */
let draftPersistTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 答案变化时同步一份到本地
 *
 * 服务端草稿虽然也存了，但它是「逐题一条记录」且需要网络；本地这份保证
 * 刷新/闪退后至少能恢复已答内容。空答案不写入，避免把已有草稿清空。
 */
watch(
  answers,
  () => {
    if (draftPersistTimer) {
      clearTimeout(draftPersistTimer)
    }
    draftPersistTimer = setTimeout(() => {
      draftPersistTimer = null
      const draft = toLocalDraft(fields.value, answers, session.fillBatchNo || props.fillBatchNo || '')
      if (draft) {
        storage.set(draftAnswersKey(props.activityNo), draft)
      }
    }, 300)
  },
  { deep: true },
)

function onAnswerChange(field: QuestionField, value: AnswerValue): void {
  answers[field.key] = value
  if (errors.value[field.key]) {
    delete errors.value[field.key]
  }

  // 逐题即时保存草稿（老工程方案），批次号回传后写回会话
  void saveDraftItem({
    activityNo: props.activityNo,
    fillBatchNo: session.fillBatchNo || undefined,
    field,
    answers,
    onBatchNo: batchNo => session.setFillBatchNo(batchNo),
  })
}

async function onSaveDraft(): Promise<void> {
  // 先等自动保存排空，避免「暂存草稿」与逐题自动保存并发写同一批次
  await waitDraftIdle()
  await saveAllDraft({
    activityNo: props.activityNo,
    fillBatchNo: session.fillBatchNo || undefined,
    fields: fields.value,
    answers,
    onBatchNo: batchNo => session.setFillBatchNo(batchNo),
  })
  toast(savedTip.value)
}

async function onSubmit(): Promise<void> {
  const issues = validateRequired(fields.value, answers)
  if (issues.length > 0) {
    const next: Record<string, string> = {}
    for (const issue of issues) {
      next[issue.key] = issue.message
    }
    errors.value = next
    // 此处需要整份 issues 来构造逐题提示与计数，所以直接用 issues[0]；
    // 只有「只要第一处问题」的场景（如 useSubmit）才用 findFirstIssue。
    scrollToSelector(`#q-${issues[0]!.key}`)
    toast(`还有 ${issues.length} 道必填题未作答`)
    return
  }

  const confirmed = await confirmDialog('提交后无法修改，确认提交吗？', '提交确认')
  if (!confirmed) {
    return
  }

  // 先等草稿队列排空：否则草稿与提交并发，提交那一刻批次号可能还是空的，
  // 于是提交也触发一次「首次保存」，两者分属不同批次且批次号互相覆盖
  await waitDraftIdle()

  // 登记表单字段随提交写入结果表：老工程用 ...self.submitInfo 做同样的事，
  // 只带非空值，避免把空串写进 company / user_name / user_phone
  const entry = storage.get<Record<string, string>>(STORAGE_KEYS.ENTRY_PARAMS, {})
  const extra: Record<string, string> = {}
  for (const key of ['company', 'user_name', 'user_phone'] as const) {
    const value = entry[key]
    if (value) {
      extra[key] = value
    }
  }

  try {
    const result = await submit({
      activityNo: props.activityNo,
      fillBatchNo: session.fillBatchNo || undefined,
      fields: fields.value,
      answers,
      extra,
    })
    if (!result.ok) {
      return
    }

    // 提交已落库：批次号与本地草稿一并作废，下次进入是新作答，
    // 不会续写到这条已完成的记录上。老工程 H5 端的 beforeDestroy 不触发、
    // 批次号会残留到 storage，再次进入就会写进已完成记录 —— 这里修掉了该缺陷。
    if (draftPersistTimer) {
      clearTimeout(draftPersistTimer)
      draftPersistTimer = null
    }
    storage.remove(draftAnswersKey(props.activityNo))
    session.clearFillBatchNo()
    emit('submitted', { batchNo: result.batchNo })

    uni.redirectTo({
      url: `${props.resultPath}?activity_no=${props.activityNo}&fill_batch_no=${result.batchNo}`,
    })
  }
  catch (error) {
    toast(error instanceof BxError ? error.message : '提交失败，请稍后重试')
  }
}
</script>

<template>
  <view class="runner">
    <BxNavBar :title="title" />
    <BxProgressBar :percent="progress.percent" />

    <view class="runner__body bx-container">
      <view v-if="loading" class="runner__state">
        <text class="runner__state-text">正在加载问卷…</text>
      </view>

      <BxEmpty
        v-else-if="errorMessage"
        :text="errorMessage"
        tip="请确认链接是否有效，或联系活动发起人"
      />

      <template v-else>
        <view class="runner__intro">
          <text class="runner__intro-title">{{ title }}</text>
          <text v-if="intro" class="runner__intro-desc">{{ intro }}</text>
          <view class="runner__intro-meta">
            <text class="runner__intro-meta-text">共 {{ progress.total }} 题</text>
            <text class="runner__intro-meta-dot">·</text>
            <text class="runner__intro-meta-text">已答 {{ progress.answered }}</text>
            <template v-if="activity?.answer_times">
              <text class="runner__intro-meta-dot">·</text>
              <text class="runner__intro-meta-text">{{ activity.answer_times }}</text>
            </template>
          </view>
          <text v-if="readOnly" class="runner__intro-readonly">该问卷已结束，以下为查看模式</text>
        </view>

        <view class="runner__list">
          <BxFieldRenderer
            v-for="field in fields"
            :key="field.key"
            :field="field"
            :model-value="answers[field.key]"
            :error="errors[field.key]"
            :disabled="readOnly"
            @update:model-value="value => onAnswerChange(field, value)"
          />
        </view>
      </template>
    </view>

    <view v-if="!loading && !errorMessage && !readOnly" class="runner__footer">
      <text v-if="savedTip" class="runner__footer-tip">{{ savedTip }}</text>
      <view class="runner__footer-actions">
        <BxButton type="ghost" @click="onSaveDraft">
          暂存草稿
        </BxButton>
        <view class="runner__footer-primary">
          <BxButton :loading="submitting" block @click="onSubmit">
            {{ activity?.submit_label || '提交问卷' }}
          </BxButton>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.runner {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.runner__body {
  flex: 1;
  padding-top: 12px;
  padding-bottom: 16px;
}

.runner__state {
  padding: 64px 0;
  text-align: center;
}

.runner__state-text {
  font-size: 14px;
  color: var(--bx-text-3);
}

.runner__intro {
  padding: 18px 16px;
  margin-bottom: 8px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
}

.runner__intro-title {
  display: block;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--bx-text);
}

.runner__intro-desc {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--bx-text-2);
}

.runner__intro-meta {
  display: flex;
  align-items: center;
  margin-top: 12px;
}

.runner__intro-meta-text,
.runner__intro-meta-dot {
  font-size: 12px;
  color: var(--bx-text-3);
}

.runner__intro-meta-dot {
  margin: 0 6px;
}

.runner__intro-readonly {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: var(--bx-warn);
}

.runner__list {
  display: flex;
  flex-direction: column;
}

/* flex 子项默认 min-width: auto，内部控件一旦溢出就会把卡片撑宽 */
.runner__list > * {
  min-width: 0;
}

.runner__list > :not(:first-child) {
  margin-top: 12px;
}

.runner__footer {
  position: sticky;
  bottom: 0;
  z-index: 10;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background-color: var(--bx-surface);
  border-top: 1px solid var(--bx-line-2);
}

.runner__footer-tip {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--bx-text-3);
  text-align: center;
}

.runner__footer-actions {
  display: flex;
  align-items: center;
  max-width: var(--bx-content-width);
  margin: 0 auto;
}

@media (min-width: 760px) {
  .runner__footer-actions {
    max-width: 480px;
  }
}

.runner__footer-primary {
  flex: 1;
  margin-left: 10px;
}
</style>
