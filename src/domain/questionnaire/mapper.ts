/**
 * 平台元数据 → 领域模型映射（纯函数）
 *
 * 复刻老工程 `index.vue getConfig()` 的映射语义，并修正三处缺陷：
 * 1. 分节符不再被判为必填（老代码 `e.type !== '分节符'` 是笔误，`e.type` 恒为 undefined）；
 * 2. 排序对 `item_seq` 重复值保持原顺序（真实数据中存在重复 seq）；
 * 3. 回填同时接受 `option_value` 与 `option_no` 两种值形态。
 */

import type { AnswerMap, FieldOption, QuestionField, QuestionWidget } from './types'
import type { DaqItemRow, DaqOptionRow } from '@/api/daq/types'

const SECTION_TYPE = '分节符'

/** 未提供 item_seq 时的排序兜底值 */
const SEQ_FALLBACK = 999

function readAttr(raw: DaqItemRow, key: string): string {
  const value = raw.item_type_attr?.[key]
  return value === undefined || value === null ? '' : String(value)
}

/** 解析平台题型 → 渲染控件 */
export function resolveWidget(raw: DaqItemRow): { widget: QuestionWidget, multi: boolean } {
  const itemType = raw.item_type ?? ''

  switch (itemType) {
    case '文本':
      return {
        widget: readAttr(raw, 'view_model') === 'textarea' ? 'textarea' : 'text',
        multi: false,
      }
    case '数字':
      return { widget: 'number', multi: false }
    case '单选':
      return { widget: 'radio', multi: false }
    case '多选':
      return { widget: 'checkbox', multi: true }
    case '选项': {
      const multi = readAttr(raw, 'radioType') === 'multi'
      return { widget: multi ? 'checkbox' : 'radio', multi }
    }
    case '时间日期': {
      const dateType = readAttr(raw, 'dateType') || 'date'
      if (dateType === 'time') {
        return { widget: 'time', multi: false }
      }
      if (dateType === 'datetime' || dateType === 'dateTime') {
        return { widget: 'datetime', multi: false }
      }
      return { widget: 'date', multi: false }
    }
    case '图片':
      return { widget: 'image', multi: true }
    case '地址':
      return { widget: 'address', multi: false }
    case '引用':
      return { widget: 'ref', multi: false }
    case SECTION_TYPE:
      return { widget: 'section', multi: false }
    default:
      return { widget: 'unknown', multi: false }
  }
}

/** 解析选项列表 */
export function toFieldOptions(raw: DaqItemRow): FieldOption[] {
  const options = raw.option_data
  if (!Array.isArray(options)) {
    return []
  }

  return options.map((option: DaqOptionRow, index: number) => {
    const serialChar = option.option_view_no
      || (option.option_seq !== null && option.option_seq !== undefined ? String(option.option_seq) : '')
      || String(index + 1)

    return {
      no: option.option_no,
      value: option.option_value ?? '',
      viewNo: option.option_view_no ?? '',
      label: option.option_value ?? '',
      serialChar,
      isAnswer: option.answer === '是',
    }
  })
}

/** 读取题目分值 */
function readPoints(raw: DaqItemRow): number {
  const points = Number(raw.points)
  return Number.isFinite(points) ? points : 0
}

/**
 * 平台题目行 → 领域字段
 *
 * 排序规则：`item_seq` 升序，空值排最后；`Array.prototype.sort` 稳定，
 * 因此真实数据里重复的 `item_seq` 会保持平台返回顺序。
 */
export function toQuestionFields(items: DaqItemRow[] | null | undefined): QuestionField[] {
  if (!Array.isArray(items)) {
    return []
  }

  const sorted = [...items].sort((a, b) => {
    const seqA = a.item_seq ?? SEQ_FALLBACK
    const seqB = b.item_seq ?? SEQ_FALLBACK
    return seqA - seqB
  })

  let index = 0
  return sorted.map((raw) => {
    const { widget, multi } = resolveWidget(raw)
    const isSection = widget === 'section'
    if (!isSection) {
      index += 1
    }

    return {
      key: raw.item_no,
      seq: raw.item_seq ?? SEQ_FALLBACK,
      index: isSection ? 0 : index,
      label: raw.item_title ?? '',
      widget,
      // 分节符永远不必填
      required: !isSection && raw.is_require === '是',
      multi,
      points: readPoints(raw),
      options: isSection ? [] : toFieldOptions(raw),
      raw,
    }
  })
}

/** 后端回传的单题作答行（`user_data[]`） */
export interface BackfillRow {
  item_no: string
  option_data?: unknown[] | null
}

/** 数字回填去掉 `.0` 尾巴（平台数字列会带小数位） */
/**
 * 数字题回填归一化
 *
 * 服务端数字题固定按 5 位小数回传（实测 `"2026.00000"`），直接展示会很难看。
 * 早期实现是 `replace(/\.0+$/, '')`，只能去掉「小数部分全是 0」的情况：
 * `"2026.00000"` → `"2026"` 没问题，但 `"2026.50000"` 会原样留下 5 位小数。
 * 这里统一去掉尾随零，再收掉可能剩下的小数点。
 *
 *   "2026.00000" → "2026"
 *   "2026.50000" → "2026.5"
 *   "0.00000"    → "0"
 *   "2026"       → "2026"（无小数点，不变）
 *   "-1.20000"   → "-1.2"
 *
 * 实现刻意分两步，而不是用一条 /(\.\d*?)0+$/ 正则：那两个量词可以互相交换字符，
 * eslint 的 regexp/no-super-linear-backtracking 会判定为多项式级回溯风险。
 * 先去掉尾随零（/0+$/ 无回溯），再收掉可能只剩一个小数点的情况。
 */
function normalizeNumberText(text: string): string {
  if (!text.includes('.')) {
    return text
  }
  const trimmed = text.replace(/0+$/, '')
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed
}

/**
 * 把后端回传的作答数据回填为作答模型
 *
 * 选项匹配优先按 `option_value`（提交语义），再按 `option_no`（草稿语义）兜底，
 * 因此草稿与提交两种来源都能正确回填。
 */
export function applyBackfill(
  fields: QuestionField[],
  userData: BackfillRow[] | null | undefined,
): AnswerMap {
  const answers: AnswerMap = {}
  if (!Array.isArray(userData) || userData.length === 0) {
    return answers
  }

  const rowMap = new Map<string, unknown[]>()
  for (const row of userData) {
    if (row?.item_no) {
      rowMap.set(row.item_no, Array.isArray(row.option_data) ? row.option_data : [])
    }
  }

  for (const field of fields) {
    const values = rowMap.get(field.key)
    if (!values || values.length === 0) {
      continue
    }
    const texts = values.map(value => (value === null || value === undefined ? '' : String(value)))

    if (field.widget === 'radio' || field.widget === 'checkbox') {
      const matched = field.options.filter(option =>
        texts.includes(option.value) || texts.includes(option.no),
      )
      if (matched.length === 0) {
        continue
      }
      if (field.multi) {
        answers[field.key] = matched.map(option => option.no)
      }
      else {
        answers[field.key] = matched[0]!.no
      }
      continue
    }

    if (field.widget === 'section' || field.widget === 'image' || field.widget === 'ref' || field.widget === 'address') {
      // 图片/引用/地址按原始值回填，交由对应控件解析
      answers[field.key] = field.multi ? texts : texts[0] ?? ''
      continue
    }

    const first = texts[0] ?? ''
    answers[field.key] = field.widget === 'number' ? normalizeNumberText(first) : first
  }

  return answers
}

/**
 * 维度汇总行 → 「题目序号 → 作答值」映射
 *
 * 契约来自真实响应（srvdaq_record_reply_merge_select）：
 * - 该服务**没有 item_no**，题目维度只能用 item_seq 标识（与题目行 item_seq 对应）；
 * - 作答值在 svalue，单选/多选存 option_value。
 *
 * 用结构化参数而不是 api 层类型，避免 domain 反向依赖 api。
 */
export function toMergeAnswerMap(
  rows: Array<{ item_no?: string | null, item_seq?: number | null, svalue?: string | null }> | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {}

  for (const row of rows ?? []) {
    const value = row?.svalue
    if (value === null || value === undefined || String(value) === '') {
      continue
    }
    // 老工程用 item_no 做键；parkDev 实测该服务返回 item_seq（无 item_no）。
    // 两个都写进映射，调用方无论用哪个都能命中，避免再次出现"静默匹配不上"。
    for (const key of [row?.item_no, row?.item_seq]) {
      if (key !== null && key !== undefined && String(key) !== '') {
        map[String(key)] = String(value)
      }
    }
  }

  return map
}

/** 选项题的服务端值可能是序号、option_no 或文案，逐个兜底匹配 */
function matchServerOptions(field: QuestionField, raw: string): FieldOption[] {
  const parts = String(raw ?? '')
    .split(/[,;、|]/)
    .map(part => part.trim())
    .filter(Boolean)

  return parts
    .map(part => field.options.find(option =>
      option.viewNo === part || option.no === part || option.label === part))
    .filter((option): option is FieldOption => !!option)
}

/**
 * 服务端作答值 → 展示文案
 *
 * `record_reply_merge_select` 的 `svalue` 对选项题返回的是**选项序号**
 * （实测单选返回 "1"、"2"），直接渲染会让用户看到「我的作答：1」。
 * 这里还原为选项文案；文本题原样返回；数字题去掉平台带的小数尾巴。
 * 匹配不上时保留原值，便于排查而不是显示成空白。
 */
export function describeServerValue(field: QuestionField, raw: string): string {
  const text = String(raw ?? '').trim()
  if (!text) {
    return ''
  }
  if (field.widget === 'radio' || field.widget === 'checkbox') {
    const matched = matchServerOptions(field, text)
    return matched.length > 0 ? matched.map(option => option.label).join('、') : text
  }
  if (field.widget === 'number') {
    return normalizeNumberText(text)
  }
  return text
}

/**
 * 服务端作答 → AnswerMap（供 `calcScore` 使用）
 *
 * 结果页的统计此前基于本地回填（`init_view_select` 的 user_data），
 * 而逐题「我的作答」基于服务端 merge。当 `type=use` 失败但 merge 成功时
 * （例如已登录但不是活动创建人），两处数据源不同会导致
 * 「逐题显示有作答、统计却全是 0」。统一以服务端为准。
 */
export function serverAnswersToAnswerMap(
  fields: QuestionField[],
  serverAnswers: Record<string, string>,
): AnswerMap {
  const map: AnswerMap = {}

  for (const field of fields) {
    // 兜底顺序：item_no → index。
    //
    // 这里**刻意不查 item_seq**：merge 服务没有 item_no，题目维度只能用 item_seq
    // 标识（toMergeAnswerMap 会把 item_no 与 item_seq 都写进映射），但 item_seq
    // 在真实数据里会重复（activity5 前三题都是 1）。若按 item_seq 查，
    // 三道题会同时命中同一个值 —— 从「可能错位」变成「必然一对多」，更糟。
    // 用 index（1 起连续递增）至少保持一对一；item_seq 重复时服务端自身也无法
    // 区分题目，属数据层缺陷，前端无法补偿（见验收清单的限制条目）。
    const raw = serverAnswers[String(field.raw.item_no ?? '')] ?? serverAnswers[String(field.index)]
    // 纯空白与空串一样视为「无作答」：否则会把没答的题算成答错
    const text = String(raw ?? '').trim()
    if (!text) {
      continue
    }

    if (field.widget === 'radio' || field.widget === 'checkbox') {
      const matched = matchServerOptions(field, text)
      if (matched.length > 0) {
        map[field.key] = matched.map(option => option.no)
      }
      continue
    }

    map[field.key] = field.widget === 'number' ? normalizeNumberText(text) : text
  }

  return map
}
