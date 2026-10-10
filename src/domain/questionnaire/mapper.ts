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
function normalizeNumberText(text: string): string {
  return text.replace(/\.0+$/, '')
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
  rows: Array<{ item_seq?: number | null, svalue?: string | null }> | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows ?? []) {
    const seq = row?.item_seq
    const value = row?.svalue
    if (seq === null || seq === undefined || value === null || value === undefined || String(value) === '') {
      continue
    }
    map[String(seq)] = String(value)
  }
  return map
}
