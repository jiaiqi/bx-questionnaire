/**
 * 问卷测试夹具
 *
 * - `activity8` / `activity5`：真实网关响应（parkDev，2026-10-10 抓取）中的活动行，
 *   用于验证 mapper 对真实数据形态的适配；
 * - `buildRealistic19`：按线上 19 题问卷（17 选项类 + 2 文本类）的形状构造，
 *   用于回归「text 字段提交丢值」这一历史缺陷。
 */

import type { DaqActivityRow, DaqItemRow, DaqOptionRow } from '@/api/daq/types'

import activity5Json from './raw/activity-20251108162243000001.json'
import activity8Json from './raw/activity-20260513185113000009.json'

function firstRow(json: unknown): DaqActivityRow {
  const data = (json as { data?: DaqActivityRow[] }).data ?? []
  return data[0]!
}

/** 真实数据：8 题（单选 + 数字），item_seq 全部为 1..8 */
export const activity8: DaqActivityRow = firstRow(activity8Json)

/** 真实数据：5 题（文本 + 单选 + 数字），item_seq 存在重复值 */
export const activity5: DaqActivityRow = firstRow(activity5Json)

function option(index: number, value: string): DaqOptionRow {
  return {
    id: index,
    option_no: `OPT${index}`,
    option_seq: index,
    option_value: value,
    option_view_no: String.fromCharCode(64 + index),
    answer: index === 1 ? '是' : '否',
  }
}

function optionItem(no: string, seq: number, optionCount: number, title: string): DaqItemRow {
  const values = ['非常满意', '满意', '一般', '不满意', '非常不满意']
  return {
    item_no: no,
    item_seq: seq,
    item_title: title,
    item_type: '单选',
    is_require: '是',
    points: 5,
    item_type_attr: { radioType: 'single' },
    option_data: Array.from({ length: optionCount }, (_, i) => option(i + 1, values[i] ?? `选项${i + 1}`)),
  }
}

function textItem(no: string, seq: number, title: string): DaqItemRow {
  return {
    item_no: no,
    item_seq: seq,
    item_title: title,
    item_type: '文本',
    is_require: '是',
    points: 0,
    item_type_attr: { view_model: 'textarea' },
    option_data: [],
  }
}

/**
 * 线上 19 题问卷形状：17 道选项题 + 2 道文本题
 *
 * 两道文本题的 `item_no` 与历史缺陷复现用例保持一致。
 */
export function buildRealistic19(): DaqItemRow[] {
  const items: DaqItemRow[] = []
  for (let i = 1; i <= 17; i += 1) {
    items.push(optionItem(`202610091058${String(i).padStart(2, '0')}0000${String(i).padStart(2, '0')}`, i, 4, `选项题 ${i}`))
  }
  items.push(textItem('20261009105712000012', 18, '您对平台还有哪些建议？'))
  items.push(textItem('20261009105732000013', 19, '您希望新增哪些功能？'))
  return items
}

/** 19 题问卷对应的作答（两道文本题分别填 1717 / 1818） */
export const realistic19Answers = {
  ...Object.fromEntries(
    buildRealistic19()
      .filter(item => item.item_type === '单选')
      .map(item => [item.item_no, item.option_data?.[0]?.option_no ?? '']),
  ),
  '20261009105712000012': '1717',
  '20261009105732000013': '1818',
}
