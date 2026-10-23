<script setup lang="ts">
/**
 * 答题主体
 *
 * `index/index` 与 `survey/survey` 共用：两者是老工程同一功能的两个入口，
 * 差异仅在路由与结果页指向。
 *
 * 视觉（docs/UI-UX-V2-设计系统.md §7.2）：
 * 一份问卷 = **一张连续的纸**。纸内题目之间只有细线，没有卡片；
 * 顶部吸顶进度区，底部吸底操作栏；错误摘要保持可点击清单。
 */

import type { AnswerValue, LocalDraft, QuestionField } from '@/domain/questionnaire'
import type { EntryParams } from '@/domain/questionnaire/prefill'

import { computed, nextTick, ref, watch } from 'vue'

import { recordReplySelect } from '@/api/daq/record'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import BxProgressBar from '@/components/base/BxProgressBar.vue'
import BxSkeleton from '@/components/base/BxSkeleton.vue'
import BxFieldRenderer from '@/components/form/BxFieldRenderer.vue'
import { useAnswerModel } from '@/composables/useAnswerModel'
import { useDraft } from '@/composables/useDraft'
import { useEmbedResize } from '@/composables/useEmbedResize'
import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { useSubmit } from '@/composables/useSubmit'
import {
  clampStepIndex,
  firstIssueStepIndex,
  fromLocalDraft,
  isLastStep,
  nextStepIndex,
  prevStepIndex,
  resolveDisplayMode,
  stepIndexForKey,
  stepIssue,
  stepProgress,
  stripQuestionTitleIndex,
  toArray,
  toLocalDraft,
  toSteps,
  validateRequired,
} from '@/domain/questionnaire'
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
const { savedTip, save: saveDraftItem, waitIdle: waitDraftIdle } = useDraft()
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
 * 展示方式：逐个（一次一题）/ 全部（整卷一屏）
 *
 * 只认活动配置 `item_disp_way === '逐个'`；缺失、空值、「全部」以及任何未知取值
 * 都保持既有整卷行为（归一化见 `domain/questionnaire/steps`）。
 */
const displayMode = computed(() => resolveDisplayMode(activity.value?.item_disp_way))
const stepMode = computed(() => displayMode.value === 'step')

/** 逐个模式的步骤：分节符不占步骤，只作为小节标题贴到其后的题目上 */
const steps = computed(() => toSteps(fields.value))
/** 当前步骤下标（0 起）；任何读取前都经 clamp 收进合法范围 */
const currentStep = ref(0)
const currentStepItem = computed(() => steps.value[currentStep.value] ?? null)
/** 当前步骤对应题目的 key：逐个模式下用它决定卷面里显示哪一道 */
const currentStepKey = computed(() => currentStepItem.value?.field.key ?? '')

const stepTotal = computed(() => steps.value.length)
const lastStep = computed(() => isLastStep(currentStep.value, stepTotal.value))
const stepProgressView = computed(() => stepProgress(currentStep.value, stepTotal.value))
/** 进度条：逐个模式表达「位置」，全部模式仍是「已答占比」 */
const barPercent = computed(() =>
  stepMode.value ? stepProgressView.value.percent : progress.value.percent,
)

const submitLabel = computed(() => activity.value?.submit_label || '提交问卷')

/**
 * 底部操作区是否出现
 *
 * 整卷模式保持原逻辑（只读时不显示提交栏）；逐个模式必须保留「上一题 / 下一题」，
 * 否则只读查看时除当前题之外的题目根本翻不到。
 */
const showFooter = computed(() => {
  if (loading.value || errorMessage.value) {
    return false
  }
  return stepMode.value ? steps.value.length > 0 : !readOnly.value
})

/**
 * 题目数量变化时修正当前步骤
 *
 * 不重置为 0：草稿续答时用户可能已经答到第 8 题，这里没有「答案位置」信息，
 * 重置会打断续答；只在越界（切换活动 / 重新加载后题数变少）时夹回范围内。
 */
watch(
  () => steps.value.length,
  (total) => {
    const next = clampStepIndex(currentStep.value, total)
    if (next !== currentStep.value) {
      currentStep.value = next
    }
  },
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

/**
 * 把键盘焦点移进某道题（H5）
 *
 * 「必答未填」时光滚动到题目还不够：键盘 / 读屏用户需要焦点落到能操作的位置，
 * 否则焦点仍停在「下一题」上，再按一次又一次被拦下。小程序没有 DOM 焦点概念，
 * 保持只滚动即可（条件编译在小程序构建时整段剥离）。
 */
function focusQuestion(key: string): void {
  // #ifdef H5
  try {
    const root = document.querySelector(`#q-${key}`)
    // 优先原生输入控件，其次选项行（tabindex=0）；都找不到时只保留滚动定位
    const target = root?.querySelector<HTMLElement>('input, textarea, [tabindex="0"]')
    target?.focus({ preventScroll: true })
  }
  catch {
    // 焦点失败不影响作答：用户已经看到滚动定位与错误文案
  }
  // #endif
}

/** 切到指定步骤并滚到那道题（逐个模式专用） */
async function goToStep(index: number): Promise<void> {
  const next = clampStepIndex(index, stepTotal.value)
  if (next === currentStep.value) {
    return
  }

  currentStep.value = next
  const key = steps.value[next]?.field.key
  if (!key) {
    return
  }

  // 换题是渲染后的事：等一次 tick 再滚动，否则目标还不在页面上
  await nextTick()
  scrollToSelector(`#q-${key}`)
}

/** 上一题：不做校验（回看是用户的自由，不该被未答的题拦住） */
async function onPrevStep(): Promise<void> {
  await goToStep(prevStepIndex(currentStep.value, stepTotal.value))
}

/** 下一题：当前题必答未填则停在原地、显示错误并聚焦；末题走提交 */
async function onNextStep(): Promise<void> {
  const item = currentStepItem.value
  if (!item) {
    return
  }

  const issue = stepIssue(item.field, answers)
  if (issue) {
    // 与提交校验共用同一份错误表：上方错误摘要会同步列出这一条
    errors.value[issue.key] = issue.message
    await nextTick()
    scrollToSelector(`#q-${issue.key}`)
    focusQuestion(issue.key)
    toast(issue.message)
    return
  }

  if (lastStep.value) {
    await onSubmit()
    return
  }

  await goToStep(nextStepIndex(currentStep.value, stepTotal.value))
}

/**
 * 跳到某道错题
 *
 * 逐个模式下目标题可能还没渲染（不在当前步骤），所以先切步骤、等渲染，再滚动；
 * 整卷模式保持原有行为（直接滚到锚点）。
 */
async function jumpToIssue(key: string): Promise<void> {
  if (stepMode.value) {
    const index = stepIndexForKey(steps.value, key)
    if (index >= 0) {
      currentStep.value = index
      await nextTick()
    }
  }
  scrollToSelector(`#q-${key}`)
}

function onIssueKeydown(event: KeyboardEvent, key: string): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  void jumpToIssue(key)
}

async function init(): Promise<void> {
  errors.value = {}
  // 切换活动 / 重新加载时回到第一题；续答内容由 backfill / 草稿恢复，
  // 逐个模式的当前步骤不影响作答数据本身
  currentStep.value = 0

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

async function onSubmit(): Promise<void> {
  const issues = validateRequired(fields.value, answers)
  if (issues.length > 0) {
    const next: Record<string, string> = {}
    for (const issue of issues) {
      next[issue.key] = issue.message
    }
    errors.value = next
    toast(`还有 ${issues.length} 道必填题未作答`)

    /*
     * 逐个模式：用户眼前只有一道题，错误可能在别的题上 —— 先切到第一道错题
     * 并聚焦，否则「还有 3 道必填」与眼前的题对不上，用户不知道该改哪里。
     * 摘要仍留在上方，供用户逐条点回去（点击时同样会切步骤）。
     */
    if (stepMode.value) {
      const target = firstIssueStepIndex(steps.value, issues)
      const key = target >= 0 ? (steps.value[target]?.field.key ?? '') : ''
      if (key) {
        currentStep.value = target
        await nextTick()
        scrollToSelector(`#q-${key}`)
        focusQuestion(key)
        return
      }
    }

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
          hover-class="runner__nav-link--hover"
          :hover-stay-time="60"
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

      结构：白底**通栏**（与导航栏连成一条白色带），内部内容（进度条 + 计数）
      再用 bx-container 限宽居中 —— 否则进度条会横贯整个视口，
      与下面那张 720px 的纸对不上。
    -->
    <view class="runner__progress">
      <view class="runner__progress-inner bx-container">
        <BxProgressBar :percent="barPercent" />
        <view v-if="!loading && !errorMessage" class="runner__progress-meta">
          <!--
            「共 N 题」与「已答 M」是两个独立条目，用竖细线分隔：
            规范 §3.2 禁止中点连接 meta（`A · B · C`）。

            逐个模式把第一条换成「3 / 11」（当前第几题 / 共几题）：一次一题时
            用户关心的是位置，不是总数；已答多少仍单独列出，两者口径不混。
          -->
          <view class="runner__progress-count">
            <template v-if="stepMode">
              <text class="runner__progress-count-item runner__progress-count-item--step">
                {{ stepProgressView.current }} / {{ stepProgressView.total }}
              </text>
            </template>
            <template v-else>
              <text class="runner__progress-count-item">共 {{ progress.total }} 题</text>
            </template>
            <view class="runner__progress-divider" />
            <text class="runner__progress-count-item">已答 {{ progress.answered }}</text>
          </view>
          <text
            v-if="!readOnly"
            class="runner__progress-left"
            :class="{ 'runner__progress-left--done': requiredLeft === 0 }"
          >
            {{ requiredLeft > 0 ? `还差 ${requiredLeft} 题必答` : '必答题已答完' }}
          </text>
        </view>
      </view>
    </view>

    <view class="runner__body bx-container">
      <view v-if="loading" class="runner__state" aria-busy="true">
        <text class="runner__state-text">正在加载问卷…</text>
        <view class="runner__state-skeleton">
          <BxSkeleton :lines="5" :height="18" />
        </view>
      </view>

      <BxEmpty
        v-else-if="errorMessage"
        :text="errorMessage"
        tip="请确认链接是否有效，或联系活动发起人"
      />

      <template v-else>
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

        <!--
          逐个模式的只读提示
          卷首（含只读说明）只在第一步显示，后面的步骤用这一行单独说明「正在查看」，
          避免每翻一题都重复整块卷首。
        -->
        <view v-if="stepMode && readOnly && currentStep !== 0" class="runner__step-tip">
          <text class="runner__step-tip-text">{{ readOnlyTip }}</text>
        </view>

        <!--
          一张纸
          整卷是一个容器：白底 + 1px 描边 + 圆角 20 + 极轻阴影，
          题与题之间只有一条细线 —— 层级从「11 个盒子」变成「一份卷」。
        -->
        <view class="runner__paper">
          <!--
            卷首：标题 + 说明 + 细线 + 元信息

            逐个模式只在第一题显示卷首：后续步骤每次重放标题块会把题目挤到屏幕下方，
            而导航栏已经常驻问卷标题。
          -->
          <view v-if="!stepMode || currentStep === 0" class="runner__intro">
            <text class="runner__intro-title">{{ title }}</text>
            <text v-if="intro" class="runner__intro-desc">{{ intro }}</text>
            <view class="runner__intro-rule" />
            <view v-if="activity?.answer_times" class="runner__intro-meta">
              <text class="runner__intro-meta-label">作答次数</text>
              <text class="runner__intro-meta-text">{{ activity.answer_times }}</text>
            </view>
            <text v-if="readOnly" class="runner__intro-readonly">{{ readOnlyTip }}</text>
          </view>

          <!--
            逐个模式的小节上下文
            分节符不作为步骤，但它给出的「这是问卷的哪一部分」不能丢，贴在当前题上方。
          -->
          <view v-if="stepMode && currentStepItem?.sectionLabel" class="runner__step-section">
            <text class="runner__step-section-text">{{ currentStepItem.sectionLabel }}</text>
          </view>

          <!--
            逐个模式仍渲染全部题目，但只显示当前那一题（v-show 而不是 v-if）：
            图片题的上传、地址 / 引用选择器的弹层状态都在组件内部，卸载会把这些
            「正在进行中」的操作连带丢掉（上传回来时组件已不在，emit 无人接收）。
            隐藏的题目 display:none，不占位、不进 Tab 序列、不进无障碍树。
          -->
          <view class="runner__list">
            <BxFieldRenderer
              v-for="field in fields"
              v-show="!stepMode || field.key === currentStepKey"
              :key="field.key"
              :field="field"
              :model-value="answers[field.key]"
              :error="errors[field.key]"
              :disabled="readOnly"
              @update:model-value="value => onAnswerChange(field, value)"
            />
          </view>
        </view>
      </template>
    </view>

    <view v-if="showFooter" class="runner__footer">
      <text v-if="savedTip" class="runner__footer-tip">{{ savedTip }}</text>
      <view class="runner__footer-actions" :class="{ 'runner__footer-actions--steps': stepMode }">
        <template v-if="stepMode">
          <view class="runner__footer-prev">
            <BxButton
              type="secondary"
              :disabled="currentStep === 0 || submitting"
              block
              @click="onPrevStep"
            >
              上一题
            </BxButton>
          </view>
          <view class="runner__footer-next">
            <!-- 最后一题主按钮变「提交」；只读查看时没有提交，末题禁用「下一题」 -->
            <BxButton v-if="!readOnly && lastStep" :loading="submitting" block @click="onSubmit">
              {{ submitLabel }}
            </BxButton>
            <BxButton v-else block :disabled="lastStep" @click="onNextStep">
              下一题
            </BxButton>
          </view>
        </template>
        <BxButton v-else :loading="submitting" block @click="onSubmit">
          {{ submitLabel }}
        </BxButton>
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

/* ── 导航栏右侧的「记录」入口 ──────────────────────────────────────
 * 文字按钮而不是蓝色链接：一屏里主色只留给主操作与进度（规范 §2.4）。
 */
.runner__nav-link {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 8px;
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 焦点可见性：uni-app 内置样式把 outline 设成 none */
.runner__nav-link:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.runner__nav-link--hover {
  background-color: var(--bx-surface-2);
}

/*
 * 桌面端悬停反馈
 *
 * uni-app 的 hover-class 在 H5 上是「按下」态而不是「悬停」态，
 * 所以桌面端的悬停样式要自己写，并包在 @media (hover: hover) 里 ——
 * 触屏设备走不到这个分支（小程序端用 hover-class）。
 */
@media (hover: hover) {
  .runner__nav-link:hover {
    background-color: var(--bx-surface-2);
  }
}

.runner__nav-link-text {
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-text-2);
}

/* ── 吸顶进度区 ────────────────────────────────────────────────────
 * 白底通栏：与导航栏连成一条白色带，滚动时层次才干净。
 * 吸在导航栏下沿：导航栏自身高度之外还有状态栏占位。
 */
.runner__progress {
  position: sticky;
  top: calc(var(--bx-navbar-height) + var(--status-bar-height, 0px));
  z-index: var(--bx-z-sticky);
  padding-bottom: 10px;
  background-color: var(--bx-surface);
  /* 下边线：滚动时内容从下方穿过，层次更清楚 */
  border-bottom: 1px solid var(--bx-line-2);
}

/* 内部内容限宽居中：进度条与计数跟下面那张纸左对齐 */
.runner__progress-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-top: 8px;
}

.runner__progress-count {
  display: flex;
  align-items: center;
}

.runner__progress-count-item {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

/* 竖细线分隔，替代中点连接（规范 §3.2） */
.runner__progress-divider {
  width: 1px;
  height: 10px;
  margin: 0 8px;
  background-color: var(--bx-line);
}

/*
 * 逐个模式的「3 / 11」
 *
 * 比两侧的计数深一档、字重 500：它是当前唯一的位置信息，但不上主色
 * （主色一屏只留给主行动与进度条，规范 §2.4）。
 */
.runner__progress-count-item--step {
  font-weight: 500;
  color: var(--bx-text-2);
}

.runner__progress-left {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-warn);
  font-variant-numeric: tabular-nums;
}

.runner__progress-left--done {
  color: var(--bx-success);
}

.runner__body {
  flex: 1;
  padding-top: 16px;
  /*
   * 给吸底操作栏留位。
   *
   * footer 是 sticky：它的**占位**在文档流末尾，但视觉上被「吸」在视口底部，
   * 于是滚动到后半段时它会盖住当前题 —— 现网正是这个问题（第 4 题被操作栏压住）。
   *
   * 留位必须 ≥ 操作栏的实际高度：操作栏恒定 64px（10 + 44 + 10），
   * 提示行绝对定位在它上方，不占操作栏的高度，所以这里也恒定。
   */
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
}

.runner__state {
  position: relative;
  padding: 64px 0;
  text-align: center;
}

/*
 * 加载文案只给屏幕阅读器
 *
 * 视觉上的加载信号是**骨架屏**（页面在组装），一行「正在加载问卷…」更像出错了；
 * 但骨架屏是 aria-hidden 的装饰，所以文案仍要留在无障碍树里。
 */
.runner__state-text {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
}

/* 骨架：加载态保持版式稳定，比一行「正在加载问卷…」更说明内容马上来 */
.runner__state-skeleton {
  margin-top: 24px;
  padding: 0 16px;
  text-align: left;
}

/* ── 一张纸 ─────────────────────────────────────────────────────────
 * 描边优先于阴影：纸感来自 1px 描边 + 极轻阴影，不是大软阴影。
 */
.runner__paper {
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
}

/* ── 逐个模式：只读说明（卷首只在第一题出现，后面用这一行） ───────── */
.runner__step-tip {
  margin-bottom: 12px;
}

.runner__step-tip-text {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-warn);
}

/* ── 逐个模式：分节上下文 ──────────────────────────────────────────
 * 分节符不占步骤，但它给出的「这是问卷的哪一部分」不能丢，贴在当前题上方。
 * 短横线 + 13/600 字重与整卷模式下 BxQuestionItem 的分节样式同源。
 */
.runner__step-section {
  padding: 20px 16px 0;
}

.runner__step-section::before {
  content: '';
  display: block;
  width: 24px;
  height: 2px;
  margin-bottom: 8px;
  background-color: var(--bx-line-strong);
  border-radius: 1px;
}

.runner__step-section-text {
  display: block;
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
}

/* ── 卷首 ───────────────────────────────────────────────────────── */
.runner__intro {
  padding: 20px 16px 16px;
  border-bottom: 1px solid var(--bx-line-2);
}

.runner__intro-title {
  display: block;
  font-size: var(--bx-font-title);
  font-weight: 600;
  line-height: var(--bx-leading-title);
  /* ≥20px 的标题加 -0.01em 字距 */
  letter-spacing: -0.01em;
  color: var(--bx-text);
}

.runner__intro-desc {
  display: block;
  margin-top: 8px;
  font-size: var(--bx-font-body);
  line-height: var(--bx-leading-body);
  color: var(--bx-text-2);
}

/* 细线：不是大色块，只把说明与元信息分开 */
.runner__intro-rule {
  height: 1px;
  margin-top: 16px;
  background-color: var(--bx-line-2);
}

.runner__intro-meta {
  display: flex;
  align-items: center;
  margin-top: 12px;
}

.runner__intro-meta-label {
  margin-right: 6px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.runner__intro-meta-text {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

.runner__intro-readonly {
  display: block;
  margin-top: 10px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-warn);
}

/* ── 错误摘要：可点击的清单，点一条跳到那道题 ───────────────────── */
.runner__summary {
  padding: 14px 16px;
  margin-bottom: 12px;
  background-color: var(--bx-danger-soft);
  border: 1px solid var(--bx-danger-line);
  border-radius: var(--bx-radius-md);
  animation: bx-survey-summary-in var(--bx-duration-base) var(--bx-ease-out) both;
}

.runner__summary-title {
  display: block;
  margin-bottom: 6px;
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-danger);
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
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  /* 题号保持中性：这一行已经是强调（链接），两处同时上色会显得吵 */
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

.runner__summary-text {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
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
 *
 * 「题目自身不画卡片 / 题间细线分隔 / 错误红条」由 BxQuestionItem 自己实现
 * （规范 §6.2），本页**不再用 :deep() 覆盖**它们 —— 同一件事只留一处真源。
 */
.runner__list {
  display: flex;
  flex-direction: column;
}

/* flex 子项默认 min-width: auto，内部控件一旦溢出就会把容器撑宽 */
.runner__list > * {
  min-width: 0;
}

/*
 * 题组小节：一条 24px 短横线 + 13/600 文字（规范 §7.2）
 *
 * 短横线用中性强描边而不是主色 —— 主色一屏只留给主操作与进度（规范 §2.4）。
 * 小节标题本身的字号/字重/颜色由 BxQuestionItem 负责，这里只补那条短横线。
 */
.runner__list :deep(.bx-question--section)::before {
  content: '';
  display: block;
  width: 24px;
  height: 2px;
  margin-bottom: 8px;
  background-color: var(--bx-line-strong);
  border-radius: 1px;
}

/* ── 吸底操作栏 ─────────────────────────────────────────────────────
 * 只剩一个主操作：提交问卷，撑满内容列宽。
 *
 * 此前这里还有「暂存草稿」按钮，已按需求去掉 —— 草稿本来就是**逐题自动保存**
 * 的（每答一题就落一次库，见 useDraft.save），「暂存草稿」只是把同一件事
 * 再手动做一遍；去掉入口不丢功能。
 */
.runner__footer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--bx-z-fixed);
  /*
   * 高度恒定 64px（10 + 44 + 10）。
   *
   * 「草稿已自动保存」提示按需出现，若让它参与文档流，它一出现吸底栏就变高
   * 24px，把当前视野里的选项往下推、甚至盖住 —— 连续多选时用户可能点到提示条
   * 而不是选项。所以提示行绝对定位在操作栏**上方**（见 .runner__footer-tip），
   * 操作栏自身高度永远不变，内容区也就能按固定值留位。
   */
  min-height: calc(64px + env(safe-area-inset-bottom));
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background-color: var(--bx-surface);
  /* 向上的一条线表达「浮起」，不用阴影：阴影压在题目上会发脏 */
  box-shadow: var(--bx-elev-sticky);
  /* 首次出现：上移 10px + 淡入（规范 §5.2 第 8 条） */
  animation: bx-survey-footer-in 240ms var(--bx-ease-out) both;
}

/*
 * 保存提示：绝对定位在操作栏上方，不占操作栏的高度
 *
 * pointer-events: none —— 它浮在内容之上，不能挡住下面那一行的点击
 * （提示条挡住选项正是此前修过的那个缺陷）。
 */
.runner__footer-tip {
  position: absolute;
  right: 0;
  bottom: 100%;
  left: 0;
  display: block;
  padding: 6px 16px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  text-align: center;
  background-color: var(--bx-surface);
  pointer-events: none;
}

.runner__footer-actions {
  display: flex;
  align-items: center;
  /* 固定高度：操作栏的总高因此是常量，与按钮自身高度无关 */
  height: var(--bx-control-height-md);
  max-width: var(--bx-content-width);
  margin: 0 auto;
}

/*
 * 逐个模式：上一题 + 下一题 / 提交
 *
 * 「上一题」用 secondary（次级行动）并固定 96px，「下一题 / 提交」占满剩余宽度。
 * 两个按钮都在 44px 高的一行里，操作栏总高不变，内容区留位也就不用改。
 * 8px 间距是 V6 的最小相邻目标间距（规范 §8.2）。
 */
.runner__footer-actions--steps {
  gap: 8px;
}

.runner__footer-prev {
  flex: 0 0 96px;
  min-width: 0;
}

.runner__footer-next {
  flex: 1;
  min-width: 0;
}

/* ── 动效 ─────────────────────────────────────────────────────────
 * V6：取消逐题入场编排（规范 §6.1 禁止入场表演）。只保留两处
 * 「状态出现」的轻反馈：错误摘要淡入、吸底栏首次出现。
 */

/* 错误摘要淡入 */
@keyframes bx-survey-summary-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* 吸底栏首次出现（规范 §5.2 第 8 条） */
@keyframes bx-survey-footer-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
