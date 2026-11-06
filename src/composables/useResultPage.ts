/**
 * 结果页的业务逻辑
 *
 * 结果页展示 = 服务端分数 + 按批次号二次拉取的展示值（图片 / 引用 / 地址）
 * + 逐题对错 + 入口联动。这些都是纯逻辑，与模板无关，抽出来才能被复用与单测覆盖；
 * 页面文件只留模板、样式与绑定。
 *
 * 入参：activity_no（必填）、fill_batch_no
 */

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { areaAdjSelectByNo } from '@/api/config/area'
import { recordReplyMergeSelect, recordReplySelect } from '@/api/daq/record'
import { attachmentSelect, resolveFileUrl } from '@/api/file/attachment'
import { useQuestionnaire } from '@/composables/useQuestionnaire'
import {
  calcScore,
  describeAnswer,
  describeSelected,
  formatQuestionTitle,
  mergeAnswerSources,
  serverAnswersToAnswerMap,
  toMergeAnswerMap,
} from '@/domain/questionnaire'
import { addressAnswerTargets, pickAreaLabel } from '@/domain/questionnaire/addresses'
import { shouldShowSuggestionEntry } from '@/domain/questionnaire/entry'
import { imageAnswerTargets } from '@/domain/questionnaire/images'
import { pickRefLabel, refAnswerTargets } from '@/domain/questionnaire/refs'
import { coverUrl, suggestionUrl } from '@/domain/questionnaire/routes'
import { readQuery } from '@/utils/query'
import { bxSelect } from '@/utils/request'

export function useResultPage() {
  const { loading, activity, fields, backfill, errorMessage, load } = useQuestionnaire()

  const activityNo = ref('')
  const batchNo = ref('')

  /** 服务端权威结果：得分 / 每题作答值（拿不到时回退本地计算） */
  const serverScore = ref<number | null>(null)
  const serverAnswers = ref<Record<string, string>>({})
  /**
   * 维度汇总是否成功返回
   *
   * `record_reply_merge_select` 需要登录态（**不带票据**时返回 0011「需要登录访问」，
   * 业务请求层会自动带票据，因此正常可用）；而 `record_reply_select` 本身无需登录，
   * 但**按用户维度查询**（condition 带 `user_no`）时平台还要求调用者的平台会话身份，
   * 无会话会静默返回空结果。两者都失败时页面必须能区分：
   * 「服务端明确说这道题没作答」与「服务端根本没给作答数据」不是一回事，
   * 前者显示「未作答」，后者不能谎报成未作答。
   */
  const serverAnswersLoaded = ref(false)

  onLoad((query) => {
    activityNo.value = readQuery(query, 'activity_no')
    batchNo.value = readQuery(query, 'fill_batch_no')
    void init()
  })

  async function init(): Promise<void> {
    if (!activityNo.value) {
      errorMessage.value = '缺少活动编号，无法查看结果'
      return
    }

    // 必须用 type=use 且带上 fill_batch_no，服务端才会返回 user_data 作答回填 ——
    // 这是「我的作答」唯一可用的服务端数据源（merge 服务只返回汇总行，
    // 没有 option_data / points 列，无法用于逐题判对错）。
    // 已结束活动上 type=use 会 FAILURE，此时退回 plain；结果页是只读页面，
    // 必须关掉 autoUpdateState，不能因为「活动已结束」就去改活动状态。
    let ok = await load(activityNo.value, {
      mode: 'use',
      fillBatchNo: batchNo.value || undefined,
      autoUpdateState: false,
    })
    if (!ok) {
      ok = await load(activityNo.value, {
        mode: 'plain',
        fillBatchNo: batchNo.value || undefined,
        autoUpdateState: false,
      })
    }

    // 两次都失败说明问卷本身没加载出来，页面已经是错误态：
    // 此时再查记录类服务只会产生两次注定无用的请求（且错误态下无人消费结果）。
    if (!ok) {
      return
    }

    await loadServerResult()
    await loadAnswerImages()
    await loadAnswerRefs()
    await loadAnswerAddresses()
  }

  /**
   * 拉取服务端结果
   *
   * 结果页以服务端为准：`record_reply_select` 给出 score，
   * `record_reply_merge_select` 按 fill_batch_no 给出每题作答值（svalue）。
   * 任一环节失败都不影响页面 —— 回退到本地 calcScore 与回填值。
   */
  async function loadServerResult(): Promise<void> {
    if (!batchNo.value) {
      return
    }

    // 两个查询分开容错：维度汇总（merge）在部分活动上没有数据，
    // 不能因为它失败而丢掉更重要的得分与状态。
    try {
      const reply = await recordReplySelect({
        activityNo: activityNo.value,
        fillBatchNo: batchNo.value,
        rownumber: 1,
      })
      const record = reply.data?.[0]
      if (record) {
        const rawScore = record.score
        serverScore.value = rawScore === null || rawScore === undefined || rawScore === ''
          ? null
          : Number(rawScore)
        // 平台还会回 `state`（完成 / 未完成），但结果页目前没有任何消费点 ——
        // 存一个只写不读的状态只会让人误以为「已经处理了未完成记录」。
        // 真正需要区分时再引入，并同步补上界面表达。
      }
    }
    catch {
      // 结果页容错：拿不到服务端记录时保持本地计算结果
    }

    try {
      const merge = await recordReplyMergeSelect({ fillBatchNo: batchNo.value })
      serverAnswers.value = toMergeAnswerMap(merge.data)
      serverAnswersLoaded.value = true
    }
    catch {
      // 维度汇总在部分活动上没有数据，失败不影响得分展示
    }
  }

  /** 服务端 merge 的作答（含选项序号还原），用于与服务端统计保持一致 */
  const serverAnswerMap = computed(() => serverAnswersToAnswerMap(fields.value, serverAnswers.value))

  /**
   * 逐题作答（展示与判分共用同一个来源）
   *
   * `user_data` 优先、merge 兜底 —— 实测 merge 对多选**只保留一个值**：
   * 批次 d9102bc9 第 2 题正确答案是 `1、2`，user_data 给 `["1","2"]`（判分 20，与服务端一致），
   * merge 只给 `"2"`（判分 10）。若优先用 merge，页面会「用户答对却显示回答错误」，
   * 且逐题得分加不出顶部总分。
   */
  const answerMap = computed(() => mergeAnswerSources(serverAnswerMap.value, backfill.value))

  /**
   * 图片题的作答值是**批次号列表**（一个元素一张图），回顾页必须换成真实图片地址
   *
   * 不换的话，「我的作答」会直接显示 `20261011121039186100` 这种内部 ID ——
   * 用户上传的是照片，看到的却是编号（实测确认，见验收清单）。
   *
   * > 作答值里**不能存文件路径**：实测图片题的 `option_value` 上限约 50 字符，
   * > 路径放不下（`FAILURE Data truncation`）。详见 `@/domain/questionnaire/images`。
   */
  const answerImages = ref<Record<string, string[]>>({})
  /** 至少有一条图片题的附件没查出来（网络/权限），用于给出解释而不是假装没有 */
  const answerImagesFailed = ref(false)

  async function loadAnswerImages(): Promise<void> {
    const targets = imageAnswerTargets(
      fields.value.map(field => ({ key: field.key, widget: field.widget, value: answerMap.value[field.key] })),
    )
    if (!targets.length) {
      return
    }

    const grouped: Record<string, string[]> = {}
    let failed = false

    await Promise.all(targets.map(async ({ key, fileNo }) => {
      try {
        const envelope = await attachmentSelect({ fileNo })
        const urls = (envelope.data ?? [])
          .map(row => resolveFileUrl(row.fileurl))
          .filter(Boolean)
        if (urls.length) {
          grouped[key] = [...(grouped[key] ?? []), ...urls]
        }
      }
      catch {
        failed = true
      }
    }))

    answerImages.value = grouped
    answerImagesFailed.value = failed
  }

  /**
   * 引用题的作答值是**被引用记录的编号**，同样必须先换成展示列
   *
   * 与图片题是同一类问题：不换的话「我的作答」显示的是 `20261011113133000003`
   * 这种内部 ID。数据源配置由 `parseRefConfig` 解析（与 `BxRefSelector` 共用一份）。
   */
  const answerRefLabels = ref<Record<string, string>>({})

  async function loadAnswerRefs(): Promise<void> {
    const targets = refAnswerTargets(
      fields.value.map(field => ({
        key: field.key,
        widget: field.widget,
        value: answerMap.value[field.key],
        raw: field.raw as Record<string, unknown>,
      })),
    )
    if (!targets.length) {
      return
    }

    const labels: Record<string, string> = {}
    await Promise.all(targets.map(async (target) => {
      try {
        const envelope = await bxSelect<Record<string, unknown>>({
          serviceName: target.config.serviceName,
          ...(target.config.app ? { app: target.config.app } : {}),
          colNames: ['*'],
          condition: [{ colName: target.config.valueCol, ruleType: 'eq', value: target.value }],
          page: { pageNo: 1, rownumber: 20 },
        })
        labels[target.key] = [labels[target.key], pickRefLabel(envelope.data ?? [], target)]
          .filter(Boolean)
          .join('、')
      }
      catch {
        // 解析失败不影响整页：回退到原值，并在下面标明「暂时读不到」
        labels[target.key] = labels[target.key] ?? target.value
      }
    }))

    answerRefLabels.value = labels
  }

  /**
   * 地址题的作答值是地区的**编号**，同样必须先换成名称
   *
   * 第三个同类实例（前两个是图片题的文件批次号、引用题的被引用记录编号）。
   */
  const answerAddressLabels = ref<Record<string, string>>({})

  async function loadAnswerAddresses(): Promise<void> {
    const targets = addressAnswerTargets(
      fields.value.map(field => ({ key: field.key, widget: field.widget, value: answerMap.value[field.key] })),
    )
    if (!targets.length) {
      return
    }

    const labels: Record<string, string> = {}
    await Promise.all(targets.map(async (target) => {
      try {
        // 按编号精确查询：顶层/下级都能命中，不依赖层级
        const envelope = await areaAdjSelectByNo(target.no)
        labels[target.key] = [labels[target.key], pickAreaLabel(envelope.data ?? [], target.no)]
          .filter(Boolean)
          .join('、')
      }
      catch {
        // 解析失败不影响整页：回退到原值，绝不显示空白（空白会被当成「未作答」）
        labels[target.key] = labels[target.key] ?? target.no
      }
    }))

    answerAddressLabels.value = labels
  }
  /**
   * 是否拿到了「用户作答」数据（任一来源）
   *
   * 决定未作答文案是「未作答」还是「暂无法获取」：两者不能混为一谈 ——
   * 前者是服务端明确说这道题没作答，后者是我们根本没拿到数据，谎报成未作答会误导用户。
   */
  const answersLoaded = computed(() =>
    serverAnswersLoaded.value || Object.keys(backfill.value).length > 0,
  )
  /** 统计口径与逐题展示一致，避免出现「逐题显示有作答、统计却全是 0」这种自相矛盾的页面 */
  const localScore = computed(() => calcScore(fields.value, answerMap.value))
  /** 服务端有 score 时以它为准，总分仍用本地题目分值合计 */
  const score = computed(() => {
    if (serverScore.value !== null) {
      return { ...localScore.value, score: serverScore.value }
    }
    return localScore.value
  })
  /**
   * 本问卷是否计分
   *
   * 优先看活动行 `act_option`（平台枚举「评分 / 不评分」），**不是**分值合计：
   * 分值合计只能说明题目配了分，说明不了这问卷是不是按分数出的结果。
   * 它同时门控分数环、三栏统计、顶部口径说明与逐题结论标签。
   *
   * 三处现实约束必须兼容（均有真实数据佐证，见 `test/fixtures/raw/activity-*.json`）：
   *
   * 1. **历史脏值是逗号组合**：`"评分,提交确认"` 真实存在（该活动总分 90、及格线 100，
   *    确实是计分问卷）。所以不能用 `=== '评分'` 严格比较，否则会把它误判成不计分、
   *    整块分数区静默消失；
   * 2. **必须先判「不评分」**：`'不评分'.includes('评分')` 为真，两者顺序写反会把
   *    不计分问卷判成计分；
   * 3. **字段可能缺失**：旧环境或其它服务不返回该列时值为 `null`，此时回退到分值合计
   *    推断，保持改造前的行为 —— 「平台少返回一列就让计分问卷不显示分数」是更大的回归。
   */
  const hasScore = computed(() => {
    const actOption = String(activity.value?.act_option ?? '').trim()
    if (actOption.includes('不评分')) {
      return false
    }
    if (actOption.includes('评分')) {
      return true
    }
    return score.value.total > 0
  })

  const passingMark = computed(() => Number(activity.value?.passing_mark ?? 0))
  const passed = computed(() => {
    if (!hasScore.value || passingMark.value <= 0) {
      return null
    }
    return score.value.score >= passingMark.value
  })

  /**
   * 逐题判分结果，按题目 key 索引
   *
   * `calcScore` 只把「有正确答案」的题放进 detail —— 文本/数字这类没有选项答案的题
   * 不在其中，所以 **detail 缺失 ≠ 答错**，两者必须分开呈现。
   */
  const detailMap = computed(() => new Map(score.value.detail.map(item => [item.key, item])))

  const rows = computed(() =>
    fields.value
      .filter(field => field.widget !== 'section')
      .map((field) => {
        const detail = detailMap.value.get(field.key)
        // 有 detail 才判对错；correct 为 null 表示该题无正确答案（不计分）
        const judged = detail !== undefined && detail.correct !== null
        const correct = judged && detail.correct === true
        const unanswered = judged && detail.selected.length === 0

        /**
         * 展示与判分同源：选项题还原成选项文案，文本/数字题直接用原值。
         *
         * 图片题与引用题例外：它们的作答值都是**内部编号**（文件批次号 /
         * 被引用记录编号），展示原值就是给用户看 ID。图片题渲染缩略图，
         * 引用题用解析出的展示列。
         */
        const raw = answerMap.value[field.key]
        const hasValue = Array.isArray(raw) ? raw.length > 0 : String(raw ?? '').trim().length > 0
        const mineText = field.widget === 'image'
          ? (hasValue ? '已上传图片' : '')
          : field.widget === 'ref'
            ? (answerRefLabels.value[field.key] || (hasValue ? '已选择' : ''))
            : field.widget === 'address'
              ? (answerAddressLabels.value[field.key] || (hasValue ? '已选择' : ''))
              : describeSelected(field, answerMap.value)

        return {
          key: field.key,
          title: formatQuestionTitle(field.index, field.label),
          mine: mineText || (answersLoaded.value ? '未作答' : '暂无法获取'),
          isImage: field.widget === 'image',
          images: answerImages.value[field.key] ?? [],
          expected: describeAnswer(field),
          // 逐题结论：correct / wrong / unanswered / unjudged（无正确答案，不计分）
          verdict: !judged ? 'unjudged' : unanswered ? 'unanswered' : correct ? 'correct' : 'wrong',
          verdictText: !judged
            ? '不计分'
            : unanswered ? '未作答' : correct ? '回答正确' : '回答错误',
          // 本题得分只在答对时给。实测 parkDev：逐题分值加总 == 服务端总分（20 == 20），
          // 所以逐题分数与顶部总分不会互相矛盾。
          earned: correct ? field.points : 0,
          points: field.points,
          // 解析的列名是 `answer_analysis`，不是 explanation；未配置时取到空串则不渲染
          analysis: String(field.raw.answer_analysis ?? '').trim(),
        }
      }),
  )

  /** 是否显示「查看评估结果」入口（判定规则见 shouldShowSuggestionEntry） */
  const showSuggestionEntry = computed(() =>
    shouldShowSuggestionEntry(activity.value?.info_collect_type, batchNo.value),
  )

  /** 查看评估结果（建议区间来自 srvdaq_activity_sug_select） */
  function openSuggestion(): void {
    uni.navigateTo({ url: suggestionUrl(activityNo.value, batchNo.value) })
  }

  /**
   * 返回问卷封面
   *
   * 原实现跳 `/pages/questionnaire/cover/index` 却**不带 activity_no**，而封面页要求该参数
   * 必填 —— 用户看到的是「缺少活动编号，无法加载问卷」死胡同（已实测确认）。
   * 带上活动号才是真实可用的页面。
   */
  function goHome(): void {
    uni.reLaunch({ url: coverUrl(activityNo.value) })
  }

  // 只暴露模板用得到的引用与函数；内部状态（serverAnswers / answerImages / detailMap 等）
  // 刻意不导出，避免页面绕过这里的口径自己算一遍。
  return {
    loading,
    activity,
    errorMessage,
    activityNo,
    batchNo,
    score,
    hasScore,
    passed,
    passingMark,
    rows,
    answerImagesFailed,
    showSuggestionEntry,
    openSuggestion,
    goHome,
    // 模板里给导航栏兜底链接用，属页面级路由拼装，跟着页面逻辑一起走
    coverUrl,
  }
}
