/**
 * 问卷领域模型
 *
 * 这一层是纯数据与纯函数，不依赖 Vue / uni-app，可直接单测。
 */

import type { DaqItemRow } from '@/api/daq/types'

/** 渲染控件类型：由平台 `item_type` + `item_type_attr` 映射而来 */
export type QuestionWidget
  /** 单行文本 */
  = | 'text'
  /** 多行文本 */
    | 'textarea'
    | 'number'
    | 'radio'
    | 'checkbox'
    | 'date'
    | 'time'
    | 'datetime'
    | 'image'
  /** 行政区划级联 */
    | 'address'
  /** 引用型选择器 */
    | 'ref'
  /** 分节符，不参与作答与提交 */
    | 'section'
    | 'unknown'

export interface FieldOption {
  /** 选项主键 `option_no`：草稿保存与选中判定用 */
  no: string
  /** 选项值 `option_value`：提交时写入 `option_data` */
  value: string
  /** 选项展示序号 `option_view_no`：提交时写入 `option_flag` */
  viewNo: string
  /** 展示文案 */
  label: string
  /** 展示序号，缺失时回退为下标 */
  serialChar: string
  /** 是否为正确答案 */
  isAnswer: boolean
}

export interface QuestionField {
  /** 题目主键 `item_no` */
  key: string
  /** 平台排序字段 `item_seq` */
  seq: number
  /** 题号（从 1 开始，分节符不占号） */
  index: number
  label: string
  widget: QuestionWidget
  required: boolean
  /** 是否多选 */
  multi: boolean
  points: number
  options: FieldOption[]
  /** 平台原始行，渲染图片/引用等附加信息时使用 */
  raw: DaqItemRow
}

/** 作答值：选项类为 `option_no` 数组，文本类为字符串 */
export type AnswerValue = string | string[]
export type AnswerMap = Record<string, AnswerValue>

/** 提交单项 */
export interface SubmitItem {
  item_no: string
  option_data: string[]
  option_flag?: string[]
}

/** 草稿单项 */
export interface DraftItem {
  item_no: string
  option_data: string[]
}

/** 归一化为字符串数组 */
export function toArray(value: AnswerValue | undefined | null): string[] {
  if (value === undefined || value === null) {
    return []
  }
  if (Array.isArray(value)) {
    return value.filter(item => item !== null && item !== undefined && item !== '')
  }
  return value === '' ? [] : [value]
}
