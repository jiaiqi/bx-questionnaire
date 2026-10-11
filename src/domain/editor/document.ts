/**
 * 平台行 ↔ 编辑器模型 的双向转换，以及「要发出去的 payload」
 *
 * ## 为什么 payload 只有一处定义
 *
 * 「哪些列可写」是编辑器最容易写错的地方：多发一个派生列会让服务端的派生结果
 * 被前端覆盖，漏发一个必填列则保存直接失败。这里把每种实体的可写列**只写一遍**，
 * 读取（`fromRow`）与写入（`payload`）共用同一份形状定义，
 * 于是「是否要更新」可以安全地用 `samePayload(payload(当前), payload(fromRow(raw)))`
 * 判断 —— 不需要 UI 维护 dirty 标记。
 *
 * ## 刻意**不发送**的列（全部有实测依据，见 `api/daq/editor.ts` 文件头）
 *
 * | 列 | 原因 |
 * | --- | --- |
 * | `classify_path` / `classify_name` | 服务端按 `classify` 派生；发了就是两处口径 |
 * | `info_collect_type` | 服务端按 `classify` 的 `info_type` 派生 |
 * | `activity_no` / `item_no` / `option_no` | `auto_generate=sysauto`，新增时由服务端生成 |
 * | `item.classify` / `item.classify_path` | 题目**继承**活动分类（实测：题目新增不传也回读为活动分类） |
 * | `del_flag` | 后端保留的软删标记 |
 * | `id` / `create_*` / `modify_*` / `*_disp` / 各类计数字段 | 平台自维护 |
 *
 * ## `item_type_attr` 的两种形态
 *
 * `init_view_select` 返回**已解析对象**，`item_cfg_select` 返回 **JSON 字符串**
 * （见 `api/daq/types.ts`）。读取统一走 `parseItemTypeAttr`，写入统一
 * `JSON.stringify` 成字符串（实测传对象会报 `Incorrect string value`）。
 */

import type { EditorActivity, EditorDocument, EditorItem, EditorOption } from './types'
import type { DaqActivityRow, DaqItemRow, DaqOptionCfgRow } from '@/api/daq/types'

import { parseItemTypeAttr } from '@/domain/questionnaire/refs'
import { optionViewNo } from './itemTypes'
import { emptyActivity, nextClientKey } from './types'

/** 任意值 → 字符串（`null` / `undefined` 变空串） */
function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

/** 任意值 → 数字（非法值变 0） */
function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 引用 / 地址题的数据源键：行级独立列与 `item_type_attr` 里都可能存在 */
const REF_ATTR_KEYS = ['servicename', 'serviceName', 'srv_app', 'refed_col', 'key_disp_col'] as const

/**
 * 合并引用类配置
 *
 * 真实数据里配置有两处来源（`item_type_attr` 与行上的独立列），
 * `parseRefConfig` 消费时也是 attr 优先、行列兜底。编辑器在**读取**时把两者
 * 合并进 attr，这样无论旧数据存在哪一处，编辑时都不会丢；
 * 保存时只写 attr（实测演示问卷只写 attr 就能正常工作）。
 */
function mergeRefColumns(
  attr: Record<string, unknown>,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...attr }
  for (const key of REF_ATTR_KEYS) {
    const current = merged[key]
    if (current === undefined || current === null || String(current) === '') {
      const fallback = row[key]
      if (fallback !== undefined && fallback !== null && String(fallback) !== '') {
        merged[key] = fallback
      }
    }
  }
  return merged
}

// ── 读取 ─────────────────────────────────────────────────────

export function activityFromRow(row: DaqActivityRow): EditorActivity {
  return {
    activityNo: text(row.activity_no),
    title: text(row.title),
    classify: text(row.classify),
    keyword: text(row.keyword),
    activityImage: text(row.activity_image),
    startTime: text(row.start_time),
    endTime: text(row.end_time),
    remark: text(row.remark),
    // 平台在这些列上都有默认值，缺失时用同一套默认，避免出现空下拉框
    status: text(row.status) || '进行中',
    permType: text(row.perm_type) || '匿名访问',
    answerTimes: text(row.answer_times) || '1次',
    itemDispWay: text(row.item_disp_way) || '全部',
    summary: text(row.summary),
    startRemark: text(row.start_remark),
    endRemark: text(row.end_remark),
    submittedTip: text(row.submitted_tip),
    submitLabel: text(row.submit_label),
    modifyAfterSubmit: text(row.modify_after_submit) || '否',
    modifyPeriond: text(row.modify_periond) || '一次',
    actOption: text(row.act_option) || '提交确认',
    passingMark: text(row.passing_mark),
    raw: row,
  }
}

export function optionFromRow(row: DaqOptionCfgRow): EditorOption {
  return {
    clientKey: nextClientKey('option'),
    optionNo: text(row.option_no),
    value: text(row.option_value),
    isAnswer: text(row.answer) === '是',
    points: num(row.points),
    raw: row,
  }
}

export function itemFromRow(row: DaqItemRow, options: EditorOption[]): EditorItem {
  return {
    clientKey: nextClientKey('item'),
    itemNo: text(row.item_no),
    title: text(row.item_title),
    type: text(row.item_type),
    required: text(row.is_require) === '是',
    points: num(row.points),
    answer: text(row.answer),
    answerAnalysis: text(row.answer_analysis),
    scoreStrategy: text(row.score_strategy) || '完全正确',
    attr: mergeRefColumns(parseItemTypeAttr(row.item_type_attr), row as Record<string, unknown>),
    options,
    raw: row,
  }
}

/**
 * 按 `item_seq` 升序排题目
 *
 * **不依赖服务端排序**：`init_view_select` 恰好返回了有序结果，但三张配置表的
 * `order` 都不可用（传了报 `系统繁忙`），所以顺序这件事由客户端自己负责。
 * 与 `mapper.toQuestionFields` 同一规则：空 `item_seq` 排最后，`sort` 稳定，
 * 因此重复 `item_seq` 保持平台返回顺序。
 */
export function sortItemRows(rows: DaqItemRow[]): DaqItemRow[] {
  const FALLBACK = 999
  return [...rows].sort((a, b) => (a.item_seq ?? FALLBACK) - (b.item_seq ?? FALLBACK))
}

/** 选项按 `option_seq` 升序（同样不依赖服务端） */
export function sortOptionRows(rows: DaqOptionCfgRow[]): DaqOptionCfgRow[] {
  const FALLBACK = 999
  return [...rows].sort((a, b) => (a.option_seq ?? FALLBACK) - (b.option_seq ?? FALLBACK))
}

/**
 * 选项行按 `item_no` 分组
 *
 * 编辑器读选项是**一次按 `item_no in (...)` 取回全部**（实测 11 题一次取回 16 个选项），
 * 所以需要按题目归位。没有对应题目的选项行（脏数据）会被忽略 ——
 * 它们的 `item_no` 不在题目集合里，界面没有地方放它们，静默丢弃比塞进某一题更安全。
 */
export function groupOptionsByItemNo(rows: DaqOptionCfgRow[]): Map<string, DaqOptionCfgRow[]> {
  const grouped = new Map<string, DaqOptionCfgRow[]>()
  for (const row of rows) {
    const itemNo = text(row.item_no)
    if (!itemNo) {
      continue
    }
    const list = grouped.get(itemNo)
    if (list) {
      list.push(row)
    }
    else {
      grouped.set(itemNo, [row])
    }
  }
  return grouped
}

/**
 * 用活动行 + 题目行 + 选项行组装文档
 *
 * `optionRowsByItemNo` 按 `item_no` 分组；没有选项的题目传空数组即可。
 */
export function documentFromRows(
  activityRow: DaqActivityRow,
  itemRows: DaqItemRow[],
  optionRowsByItemNo: Map<string, DaqOptionCfgRow[]>,
): EditorDocument {
  const items = sortItemRows(itemRows).map((row) => {
    const options = sortOptionRows(optionRowsByItemNo.get(text(row.item_no)) ?? [])
      .map(optionFromRow)
    return itemFromRow(row, options)
  })
  return { activity: activityFromRow(activityRow), items }
}

// ── 写入 ─────────────────────────────────────────────────────

/**
 * 活动 payload
 *
 * 空串可以安全写入（实测文本列写空串回读为空串、`period_days` 写空串变 null），
 * 因此**无条件发送全部可编辑列** —— 不做「非空才发」的条件分支，
 * 否则用户永远清不掉一个已填的输入框。
 */
export function activityPayload(activity: EditorActivity): Record<string, unknown> {
  return {
    title: activity.title,
    classify: activity.classify,
    keyword: activity.keyword,
    activity_image: activity.activityImage,
    start_time: activity.startTime,
    end_time: activity.endTime,
    remark: activity.remark,
    status: activity.status,
    perm_type: activity.permType,
    answer_times: activity.answerTimes,
    item_disp_way: activity.itemDispWay,
    summary: activity.summary,
    start_remark: activity.startRemark,
    end_remark: activity.endRemark,
    submitted_tip: activity.submittedTip,
    submit_label: activity.submitLabel,
    modify_after_submit: activity.modifyAfterSubmit,
    modify_periond: activity.modifyPeriond,
    act_option: activity.actOption,
    passing_mark: activity.passingMark,
  }
}

/**
 * 题目 payload
 *
 * `index` 是题目在数组里的位置，用来生成 `item_seq = index + 1`。
 * `activityNo` 显式传入而不是从活动对象读 —— 新建活动时活动编号要等
 * `_add` 的 `effect_data` 回来才知道。
 */
export function itemPayload(
  item: EditorItem,
  index: number,
  activityNo: string,
): Record<string, unknown> {
  return {
    activity_no: activityNo,
    item_title: item.title,
    item_type: item.type,
    item_seq: index + 1,
    is_require: item.required ? '是' : '否',
    points: item.points,
    answer: item.answer,
    answer_analysis: item.answerAnalysis,
    score_strategy: item.scoreStrategy,
    // 题目来源与「是否模板」不是编辑器让用户填的东西，取平台默认值
    item_ori: '自定义',
    is_public: '否',
    item_type_attr: JSON.stringify(item.attr),
  }
}

/**
 * 选项 payload
 *
 * `index` 决定 `option_seq` 与 `option_view_no`：两者都是「第几个」的表达，
 * 由位置派生，重排后自动跟着变。若把字母留在选项上，重排后界面会出现
 * 「C、A、B」这种错乱的序号。
 */
export function optionPayload(
  option: EditorOption,
  index: number,
  itemNo: string,
): Record<string, unknown> {
  return {
    item_no: itemNo,
    option_value: option.value,
    option_seq: index + 1,
    option_view_no: optionViewNo(index),
    answer: option.isAnswer ? '是' : '否',
    points: option.points,
  }
}

// ── 比较 ─────────────────────────────────────────────────────

/**
 * 归一化：对象按键排序递归、数组逐项递归、其余一律转字符串
 *
 * 标量转字符串是必须的：平台 `points` 回读是 `"0"`（字符串）而 payload 里是
 * `0`（数字），不归一化会把「没改过」判成「改过了」，于是每次保存都全量重写。
 */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize)
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      out[key] = normalize(source[key])
    }
    return out
  }
  return value === null || value === undefined ? '' : String(value)
}

/** 稳定的字符串化（键序无关） */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value)) ?? 'null'
}

/** 两份 payload 是否等价 */
export function samePayload(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}

/** 活动是否被改过（新增项恒为 false，因为它没有原始行可比） */
export function activityChanged(activity: EditorActivity): boolean {
  if (!activity.raw) {
    return false
  }
  return !samePayload(activityPayload(activity), activityPayload(activityFromRow(activity.raw)))
}

/** 题目是否被改过 */
export function itemChanged(item: EditorItem, index: number, activityNo: string): boolean {
  if (!item.raw) {
    return false
  }
  const original = itemFromRow(item.raw, [])
  return !samePayload(
    itemPayload(item, index, activityNo),
    itemPayload(original, index, activityNo),
  )
}

/** 选项是否被改过 */
export function optionChanged(option: EditorOption, index: number, itemNo: string): boolean {
  if (!option.raw) {
    return false
  }
  const original = optionFromRow(option.raw)
  return !samePayload(
    optionPayload(option, index, itemNo),
    optionPayload(original, index, itemNo),
  )
}

/** 新建一份空文档（新建问卷用） */
export function emptyDocument(): EditorDocument {
  return { activity: emptyActivity(), items: [] }
}
