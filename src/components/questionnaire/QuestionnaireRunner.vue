<script setup lang="ts">
/**
 * 答题主体
 *
 * `index/index` 与 `survey/survey` 共用：两者是老工程同一功能的两个入口，
 * 差异仅在路由与结果页指向。
 */

import type { AnswerValue, LocalDraft, QuestionField } from '@/domain/questionnaire'
import type { EntryParams } from '@/domain/questionnaire/prefill'

import { computed, nextTick, ref, watch } from 'vue'

import { recordReplySelect } from '@/api/daq/record'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import BxProgressBar from '@/components/base/BxProgressBar.vue'
import BxFieldRenderer from '@/components/form/BxFieldRenderer.vue'
import { useAnswerModel } from '@/composables/useAnswerModel'
import { useDraft } from '@/composables/useDraft'
import { useEmbedResize } from '@/composables/useEmbedResize'
import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { useSubmit } from '@/composables/useSubmit'
import { fromLocalDraft, stripQuestionTitleIndex, toArray, toLocalDraft, validateRequired } from '@/domain/questionnaire'
import { matchEntryPrefill } from '@/domain/questionnaire/prefill'
import { coverUrl, historyUrl, withQuery } from '@/domain/questionnaire/routes'
import { useSessionStore } from '@/stores/session'
import { buildSubmitPayload, notifyParent } from '@/utils/embed'
import { BxError } from '@/utils/request'
import { draftAnswersKey, rememberMyBatch, storage, STORAGE_KEYS } from '@/utils/storage'
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

// 嵌入场景：内容变高时告诉父页面调整 iframe 高度
useEmbedResize()

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
/** 活动本身已结束 */
const activityEnded = computed(() => activity.value?.status === '已结束')
/** 已结束的活动按只读展示；formType 为 view / detail 亦为查看模式 */
const readOnly = computed(() =>
  activityEnded.value || props.formType === 'view' || props.formType === 'detail',
)
/**
 * 只读提示要区分原因：活动已结束，和用户点开自己的历史作答，是两回事。
 * 从「作答记录」进来时活动往往仍在进行中，此时若说「该问卷已结束」是误导。
 */
const readOnlyTip = computed(() =>
  activityEnded.value ? '该问卷已结束，以下为查看模式' : '以下为查看模式，仅供查看',
)

/**
 * 题目是否已有作答
 *
 * 不能只看 `answers[key]` 是否存在：文本框聚焦过就会写入空串，多选取消后是空数组，
 * 两者都该算「未答」。进度统计（countAnswered）内部已有同样的判断，这里是给
 * 「必答剩余数」用的同口径实现。
 */
function hasAnswer(key: string): boolean {
  // AnswerMap 的索引签名声明为必有值，但实际可能是 undefined（递归组件树里常见）
  const value = answers[key] as AnswerValue | undefined
  if (Array.isArray(value)) {
    return value.some(item => String(item).trim().length > 0)
  }
  return String(value ?? '').trim().length > 0
}

/**
 * 还差几道必答题
 *
 * 进度条只说「答了几题」，不区分必答与选填 —— 用户答完所有选填题后进度接近满格，
 * 提交时却仍被拦下。这一行把「真正还差什么」说清楚。
 */
const requiredLeft = computed(() =>
  fields.value.filter(field => field.required && !hasAnswer(field.key)).length,
)

/**
 * 提交失败后的错误摘要
 *
 * 长问卷里「还有 3 道必填题未作答」的 toast 转瞬即逝，行内红字又散落在几十屏之外，
 * 用户无从下手。摘要给出可点击的清单，点一条跳到那道题。
 */
const issues = computed(() =>
  fields.value
    .filter(field => errors.value[field.key])
    .map(field => ({
      key: field.key,
      no: Number(field.index) > 0 ? String(field.index) : '',
      title: stripQuestionTitleIndex(field.label),
    })),
)

function jumpToIssue(key: string): void {
  scrollToSelector(`#q-${key}`)
}

function onIssueKeydown(event: KeyboardEvent, key: string): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  jumpToIssue(key)
}

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

  // 嵌入场景：问卷配置就绪，告诉父页面可以收起加载动画（契约 FORM_READY）
  notifyParent('FORM_READY', { serviceName: 'srvdaq_init_view_select' })

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
  const entry = storage.get<EntryParams>(STORAGE_KEYS.ENTRY_PARAMS, {})

  for (const field of fields.value) {
    if (field.widget !== 'text' && field.widget !== 'textarea') {
      continue
    }
    if (toArray(answers[field.key]).length > 0) {
      continue
    }
    const matched = matchEntryPrefill(field.label, entry)
    if (matched) {
      answers[field.key] = matched
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

/**
 * 采纳服务端回传的批次号
 *
 * 两件事必须一起做，所以合并到一处而不是在调用点各写一遍：
 * 1. 写回会话（续答依赖它）；
 * 2. 记进「本机产生过的批次号」—— 作答记录页未登录时**只能靠这份本地记录**
 *    判定哪条是自己的（`record_reply_select` 不带 user_no 会返回全部人的记录）。
 *    漏记的后果是用户自己的记录在列表里消失。
 */
function adoptBatchNo(batchNo: string): void {
  session.setFillBatchNo(batchNo)
  rememberMyBatch(props.activityNo, batchNo)
}

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
    onBatchNo: adoptBatchNo,
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
    onBatchNo: adoptBatchNo,
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
    /*
     * 滚动到**摘要**而不是第一道错题。
     *
     * 老做法直接滚到 `#q-<第一道错题>`，用户看到那道题却不知道一共有几处要改；
     * 摘要刚渲染在页面顶部、立刻被滚出视口，等于白做。现在滚到摘要，由用户
     * 逐条点进去 —— 这也是 WCAG 对「错误摘要」的标准用法。
     * 摘要随 errors 一起渲染，所以要等一次 tick 再找它。
     */
    await nextTick()
    scrollToSelector('.runner__summary')
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
    // 先记归属再清批次号：提交产生的这条记录也是「本机的」，
    // 否则刚提交完去记录页会看不到自己刚填的那条。
    rememberMyBatch(props.activityNo, result.batchNo)
    session.clearFillBatchNo()
    emit('submitted', { batchNo: result.batchNo })

    // 嵌入场景：提交成功必须让父页面知道，否则父页面既不关弹窗也不刷新列表，
    // 用户看到的是「提交完没反应」（契约 9.2 的典型症状）。
    // 问卷提交是**新增**一条作答记录，故用 ADD_SUCCESS 而非 UPDATE_SUCCESS。
    notifyParent('ADD_SUCCESS', buildSubmitPayload(
      'add',
      'srvdaq_activity_result_submit',
      result.payload,
      result.batchNo,
    ))

    uni.redirectTo({
      // 用 props.resultPath 而非写死 index/result：调研页（survey）靠这个 prop
      // 把结果页覆盖成 survey/result。查询串统一由 withQuery 拼，避免手写漏参数。
      url: withQuery(props.resultPath, {
        activity_no: props.activityNo,
        fill_batch_no: result.batchNo,
      }),
    })
  }
  catch (error) {
    toast(error instanceof BxError ? error.message : '提交失败，请稍后重试')
  }
}

/** 打开该活动的作答记录（老工程标题栏的「答题记录」） */
function openHistory(): void {
  uni.navigateTo({ url: historyUrl(props.activityNo, title.value) })
}

/** 键盘激活：「记录」是 <view>，天然不可聚焦，键盘用户打不开 */
function onHistoryKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  openHistory()
}
</script>

<template>
  <view class="runner">
    <BxNavBar :title="title" :fallback-url="coverUrl(props.activityNo)">
      <template #extra>
        <!--
          答题记录入口：老工程在标题栏常驻「答题记录」按钮（无 v-if），
          新工程此前只能在记录页里手动改 URL 进入，属入口缺失。
        -->
        <view
          class="runner__nav-link"
          role="button"
          aria-label="答题记录"
          tabindex="0"
          @click="openHistory"
          @keydown="onHistoryKeydown"
        >
          <text class="runner__nav-link-text">记录</text>
        </view>
      </template>
    </BxNavBar>
    <!--
      进度区吸顶在导航栏下方：长问卷里用户随时要知道「还剩多少」，
      进度条随页面滚走等于没有进度提示（骨架把 weak progress cues 列为反模式）。
    -->
    <view class="runner__progress">
      <BxProgressBar :percent="progress.percent" />
      <view v-if="!loading && !errorMessage" class="runner__progress-meta">
        <text class="runner__progress-count">共 {{ progress.total }} 题 · 已答 {{ progress.answered }}</text>
        <text
          v-if="!readOnly"
          class="runner__progress-left"
          :class="{ 'runner__progress-left--done': requiredLeft === 0 }"
        >
          {{ requiredLeft > 0 ? `还差 ${requiredLeft} 题必答` : '必答题已答完' }}
        </text>
      </view>
    </view>

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
          <view v-if="activity?.answer_times" class="runner__intro-meta">
            <text class="runner__intro-meta-label">作答次数</text>
            <text class="runner__intro-meta-text">{{ activity.answer_times }}</text>
          </view>
          <text v-if="readOnly" class="runner__intro-readonly">{{ readOnlyTip }}</text>
        </view>

        <!--
          提交失败后的错误摘要
          用 aria-live 而不是 role="alert"：role 会被 scripts/a11y.mjs 的 `[role]`
          选择器命中，进而要求它可聚焦（一个纯文本容器不该进 Tab 序列）。
          aria-live 同样能触发屏幕阅读器播报，且不改变可聚焦性。
        -->
        <view v-if="issues.length > 0" class="runner__summary" aria-live="assertive">
          <text class="runner__summary-title">还有 {{ issues.length }} 道必填题未作答</text>
          <view
            v-for="issue in issues"
            :key="issue.key"
            class="runner__summary-item"
            role="button"
            tabindex="0"
            :aria-label="issue.title"
            @click="jumpToIssue(issue.key)"
            @keydown="onIssueKeydown($event, issue.key)"
          >
            <text v-if="issue.no" class="runner__summary-no">{{ issue.no }}</text>
            <text class="runner__summary-text">{{ issue.title }}</text>
          </view>
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

.runner__nav-link {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 10px;
  cursor: pointer;
  border-radius: var(--bx-radius);
}

/* 焦点可见性：uni-app 内置样式把 outline 设成 none */
.runner__nav-link:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.runner__nav-link-text {
  font-size: 15px;
  color: var(--bx-primary);
}

.runner__progress {
  position: sticky;
  /* 吸在导航栏下沿：导航栏自身高度之外还有状态栏占位 */
  top: calc(var(--bx-navbar-height) + var(--status-bar-height, 0px));
  z-index: 9;
  padding-bottom: 10px;
  background-color: var(--bx-surface);
}

.runner__progress-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  max-width: var(--bx-content-width);
  margin: 0 auto;
  padding: 8px 16px 0;
}

.runner__progress-count {
  font-size: 12px;
  color: var(--bx-text-3);
}

.runner__progress-left {
  font-size: 12px;
  color: var(--bx-warn);
}

.runner__progress-left--done {
  color: var(--bx-success);
}

.runner__body {
  flex: 1;
  padding-top: 12px;
  /*
   * 给吸底操作栏留位。
   *
   * footer 是 sticky：它的**占位**在文档流末尾，但视觉上被「吸」在视口底部，
   * 于是滚动到后半段时它会盖住当前题 —— 现网正是这个问题（第 4 题被操作栏压住）。
   * 留出一个 footer 的高度即可。
   */
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
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
  box-shadow: var(--bx-elev-1);
  border-radius: var(--bx-radius-card);
}

.runner__intro-title {
  display: block;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--bx-text);
}

.runner__intro-desc {
  display: block;
  margin-top: 8px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--bx-text-2);
}

.runner__intro-meta {
  display: flex;
  align-items: center;
  margin-top: 12px;
}

.runner__intro-meta-label {
  margin-right: 6px;
  font-size: 12px;
  color: var(--bx-text-3);
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

/* 错误摘要：可点击的清单，点一条跳到那道题 */
.runner__summary {
  padding: 14px 16px;
  margin-bottom: 12px;
  background-color: var(--bx-danger-soft);
  border: 1px solid var(--bx-danger-line);
  border-radius: var(--bx-radius);
}

.runner__summary-title {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--bx-text);
}

.runner__summary-item {
  display: flex;
  align-items: baseline;
  min-height: 32px;
  padding: 4px 0;
  cursor: pointer;
}

.runner__summary-item:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.runner__summary-no {
  flex: none;
  min-width: 20px;
  font-size: 12px;
  /* 题号保持中性：蓝色链接已经是这一行的强调，两处同时上色会显得吵 */
  color: var(--bx-text-3);
}

.runner__summary-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-primary);
  text-decoration: underline;
  word-break: break-all;
}

/*
 * 题目容器化
 *
 * 旧版每题一张独立白卡 + 12px 间距，11 道题就是 11 个同权重的盒子，长问卷看起来
 * 像「盒子山」，题与题之间也看不出从属关系。现在整卷是一个容器，题间用细分隔线
 * 切开 —— 层级从「多张卡」变成「一份卷」。
 */
.runner__list {
  display: flex;
  flex-direction: column;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
  overflow: hidden;
}

/* flex 子项默认 min-width: auto，内部控件一旦溢出就会把容器撑宽 */
.runner__list > * {
  min-width: 0;
}

/* 卡片自身的底色 / 圆角 / 阴影交给容器统一表达 */
.runner__list :deep(.bx-question) {
  background-color: transparent;
  border-radius: 0;
  box-shadow: none;
}

.runner__list :deep(.bx-question:not(:first-child)) {
  border-top: 1px solid var(--bx-line-2);
}

/*
 * 错误态要盖回容器规则
 *
 * 上面 `:deep(.bx-question)` 的特异性是 (0,3,0)（两个 class 加作用域属性），
 * 高于 BxQuestionItem 自己的 `.bx-question--error[data-v-x]`（0,2,0），
 * 会把浅红底与左侧色条一起清掉。这里显式恢复。
 */
.runner__list :deep(.bx-question--error) {
  background-color: var(--bx-danger-soft);
  box-shadow: inset 3px 0 0 var(--bx-danger);
}

.runner__footer {
  position: sticky;
  bottom: 0;
  z-index: var(--bx-z-fixed);
  /*
   * 固定高度（含一行「草稿已自动保存」提示）。
   *
   * 提示按需出现：不预留高度时它一出现吸底栏就变高 24px，把当前视野里的选项
   * 往下推、甚至盖住 —— 连续多选时用户可能点到提示条而不是选项。
   * （端到端脚本的坐标点击正是被这一点打偏的：多选第 2 项距吸底栏只剩 3px。）
   * 恒定高度比省下这 24px 重要。
   */
  min-height: calc(92px + env(safe-area-inset-bottom));
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background-color: var(--bx-surface);
  /* 向上的一条线表达「浮起」，不用阴影：阴影压在题目上会发脏 */
  box-shadow: var(--bx-elev-sticky);
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

.runner__footer-primary {
  flex: 1;
  margin-left: 10px;
}
</style>
