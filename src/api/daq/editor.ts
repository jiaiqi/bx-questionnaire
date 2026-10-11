/**
 * 问卷编辑器（作者侧）接口
 *
 * 与 `activity.ts`（作答侧）分开：作答侧只读配置 + 置状态，作者侧要做三张表的完整增删改。
 * 两者共用同一批服务，但语义与调用姿势不同，混在一个文件里会让「谁在读、谁在写」变模糊。
 *
 * ## 服务清单（接口契约迁移期间不变）
 *
 * | 表 | 服务 |
 * | --- | --- |
 * | 活动 `bxdaq_activity_cfg` | `srvdaq_activity_cfg_select` / `_add` / `_update` / `_delete` |
 * | 题目 `bxdaq_item_cfg` | `srvdaq_item_cfg_select` / `_add` / `_update` / `_delete` |
 * | 选项 `bxdaq_option_cfg` | `srvdaq_option_cfg_select` / `_add` / `_update` / `_delete` |
 * | 分类 `bxdaq_classify` | `srvdaq_classify_select` |
 *
 * ## 实测契约（parkDev，2026-10-11，脚本 `scripts/_probe-editor4/5/7/8/9.mjs`）
 *
 * | 事实 | 依据 |
 * | --- | --- |
 * | `order` 在三张表上**全部不可用** | 传任何排序字段都返回 `FAILURE 系统繁忙，请稍后再试`；故排序一律在客户端做 |
 * | `init_view_select` 一次返回活动 + 嵌套 `item_data[].option_data[]` | 演示问卷一次拿到 11 题、16 选项 |
 * | `update` 的 `condition` 放**请求项顶层**，`data` 只放要改的列 | 只传 `summary` 时 title/classify_path/keyword 原样保留 |
 * | `delete` 用 `condition`，**不接受 `data:[{id}]`** | 传 data 报「必须携带条件」 |
 * | `add` 在 `effect_data` 回传生成的主键 | `activity_no` / `item_no` / `option_no` 都能直接拿到 |
 * | 选项按 `item_no` 关联，`item_no in (...)` 批量取可用 | 11 题一次取回 16 个选项 |
 * | `operate` 与 `add` **两个动作段都能用** | `POST /daq/{operate,add}/srvdaq_activity_cfg_add` 各建一条，都 SUCCESS |
 * | 题目**继承**活动的 `classify` / `classify_path` | 题目新增不传 classify，回读仍是活动的分类 |
 * | 活动新增时 `classify_name` / `classify_path` / `info_collect_type` 由服务端派生 | 只传 `classify=..0002`（名为竞答、info_type=自测），回读 `info_collect_type=自测` |
 * | 活动 `status` **不会**被派生为「进行中」 | 不传 status 时只有「未开始」或「已结束」；update 传 status 则原样生效、不被时间重算 |
 *
 * 因此编辑器的发送策略是：**派生列一律不发，status 一律显式发**。
 * 派生列前端再算一遍只会制造「两处口径漂移」的机会。
 */

import type {
  DaqActivityRow,
  DaqClassifyRow,
  DaqItemRow,
  DaqOptionCfgRow,
} from './types'
import type { BxCondition } from '@/utils/request/types'

import { bxSelect, bxWrite, extractEffectData } from '@/utils/request'

/** 写操作返回的 `effect_data` 行（新增时含生成的主键） */
export interface EditorEffectRow extends Record<string, unknown> {
  activity_no?: string
  item_no?: string
  option_no?: string
}

/** 单次查询返回的最大行数（平台接受该值，实测 rownumber=2000 正常返回） */
export const EDITOR_PAGE_SIZE = 500

// ── 分类 ─────────────────────────────────────────────────────

/**
 * 分类树（全量）
 *
 * 本环境 13 行，带 `parent_no` / `path_name` / `is_leaf`。
 * **刻意不按 `is_leaf` 过滤**：演示问卷用的 `DAQ202409230006`（自测）`is_leaf=否`，
 * 只取叶子会把最常用的那个分类从选择器里删掉。
 *
 * 该服务**接受 `order`**（与三张配置表不同），但仍按 `seq` 客户端排序兜底。
 */
export function classifySelect() {
  return bxSelect<DaqClassifyRow>({
    serviceName: 'srvdaq_classify_select',
    colNames: ['*'],
    page: { pageNo: 1, rownumber: EDITOR_PAGE_SIZE },
  })
}

// ── 活动 ─────────────────────────────────────────────────────

export interface ActivityListQuery {
  /** 标题模糊搜索 */
  title?: string
  /** 关键字模糊搜索 */
  keyword?: string
  status?: string
  classify?: string
  pageNo?: number
  rownumber?: number
}

/**
 * 活动列表
 *
 * **不传 `order`** —— 该服务传任何排序都会 `FAILURE 系统繁忙，请稍后再试`（实测）。
 * 需要「最新在前」时由调用方在客户端排（见 `useEditorList`）。
 *
 * 搜索走 `like`（实测 `title like bxq` → 2 行、`keyword like 演示` → 1 行），
 * 与 `status eq 进行中` 可叠加。
 */
export function activityListSelect(query: ActivityListQuery = {}) {
  const condition: BxCondition[] = []
  if (query.title) {
    condition.push({ colName: 'title', ruleType: 'like', value: query.title })
  }
  if (query.keyword) {
    condition.push({ colName: 'keyword', ruleType: 'like', value: query.keyword })
  }
  if (query.status) {
    condition.push({ colName: 'status', ruleType: 'eq', value: query.status })
  }
  if (query.classify) {
    condition.push({ colName: 'classify', ruleType: 'eq', value: query.classify })
  }

  return bxSelect<DaqActivityRow>({
    serviceName: 'srvdaq_activity_cfg_select',
    colNames: ['*'],
    condition,
    page: { pageNo: query.pageNo ?? 1, rownumber: query.rownumber ?? EDITOR_PAGE_SIZE },
  })
}

/** 按活动编号取一行（编辑器打开时读基础信息） */
export function activitySelectOne(activityNo: string) {
  return bxSelect<DaqActivityRow>({
    serviceName: 'srvdaq_activity_cfg_select',
    colNames: ['*'],
    condition: [{ colName: 'activity_no', ruleType: 'eq', value: activityNo }],
  })
}

/**
 * 新增活动
 *
 * 调用方**不要**传 `classify_path` / `classify_name` / `info_collect_type`：
 * 服务端按 `classify` 自动派生（实测证据见文件头）。
 * 也不要在新增时传 `activity_no`（`auto_generate=sysauto`）。
 */
export async function activityAdd(row: Record<string, unknown>): Promise<string> {
  const envelope = await bxWrite('operate', [
    { serviceName: 'srvdaq_activity_cfg_add', data: [row] },
  ])
  return String(extractEffectData<EditorEffectRow>(envelope)[0]?.activity_no ?? '')
}

/** 更新活动：只发要改的列，主键由 condition 指定 */export function activityUpdate(activityNo: string, row: Record<string, unknown>) {
  return bxWrite('operate', [
    {
      serviceName: 'srvdaq_activity_cfg_update',
      condition: [{ colName: 'activity_no', ruleType: 'eq', value: activityNo }],
      data: [row],
    },
  ])
}

/** 删除活动（批量） */
export function activityDelete(activityNos: string[]) {
  const list = activityNos.filter(Boolean)
  if (list.length === 0) {
    return Promise.resolve(null)
  }
  return bxWrite('operate', [
    {
      serviceName: 'srvdaq_activity_cfg_delete',
      condition: [{ colName: 'activity_no', ruleType: 'in', value: list.join(',') }],
    },
  ])
}

// ── 题目 ─────────────────────────────────────────────────────

/** 按活动取题目（编辑器打开时读全量题目） */
export function itemSelectByActivity(activityNo: string) {
  return bxSelect<DaqItemRow>({
    serviceName: 'srvdaq_item_cfg_select',
    colNames: ['*'],
    condition: [{ colName: 'activity_no', ruleType: 'eq', value: activityNo }],
    page: { pageNo: 1, rownumber: EDITOR_PAGE_SIZE },
  })
}

/**
 * 批量新增题目
 *
 * 一次请求插多行（与选项一样，平台接受 `data` 数组）。
 * 返回 `effect_data` 里与入参**同序**的行，用于取回生成的 `item_no`。
 */
export async function itemAdd(rows: Array<Record<string, unknown>>): Promise<EditorEffectRow[]> {
  if (rows.length === 0) {
    return []
  }
  const envelope = await bxWrite('operate', [
    { serviceName: 'srvdaq_item_cfg_add', data: rows },
  ])
  return extractEffectData<EditorEffectRow>(envelope)
}

/** 更新单个题目 */
export function itemUpdate(itemNo: string, row: Record<string, unknown>) {
  return bxWrite('operate', [
    {
      serviceName: 'srvdaq_item_cfg_update',
      condition: [{ colName: 'item_no', ruleType: 'eq', value: itemNo }],
      data: [row],
    },
  ])
}

/** 删除题目（批量） */
export function itemDelete(itemNos: string[]) {
  const list = itemNos.filter(Boolean)
  if (list.length === 0) {
    return Promise.resolve(null)
  }
  return bxWrite('operate', [
    {
      serviceName: 'srvdaq_item_cfg_delete',
      condition: [{ colName: 'item_no', ruleType: 'in', value: list.join(',') }],
    },
  ])
}

// ── 选项 ─────────────────────────────────────────────────────

/**
 * 按题目批量取选项
 *
 * 用 `item_no in (...)` 一次取回（实测 11 题 → 16 选项一次拿到）。
 * 不用 `activity_no`：该服务的服务列里没有这一列，传了会报
 * `CONDITION_COLUMS_NOT_EXISTS`（与 `record_reply_merge_select` 同类问题）。
 */
export function optionSelectByItems(itemNos: string[]) {
  const list = itemNos.filter(Boolean)
  if (list.length === 0) {
    return Promise.resolve(null)
  }
  return bxSelect<DaqOptionCfgRow>({
    serviceName: 'srvdaq_option_cfg_select',
    colNames: ['*'],
    condition: [{ colName: 'item_no', ruleType: 'in', value: list.join(',') }],
    page: { pageNo: 1, rownumber: EDITOR_PAGE_SIZE },
  })
}

/** 批量新增选项（同题多选项一次插入） */
export function optionAdd(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return Promise.resolve(null)
  }
  return bxWrite('operate', [
    { serviceName: 'srvdaq_option_cfg_add', data: rows },
  ])
}

/** 更新单个选项 */
export function optionUpdate(optionNo: string, row: Record<string, unknown>) {
  return bxWrite('operate', [
    {
      serviceName: 'srvdaq_option_cfg_update',
      condition: [{ colName: 'option_no', ruleType: 'eq', value: optionNo }],
      data: [row],
    },
  ])
}

/** 删除选项（批量） */
export function optionDelete(optionNos: string[]) {
  const list = optionNos.filter(Boolean)
  if (list.length === 0) {
    return Promise.resolve(null)
  }
  return bxWrite('operate', [
    {
      serviceName: 'srvdaq_option_cfg_delete',
      condition: [{ colName: 'option_no', ruleType: 'in', value: list.join(',') }],
    },
  ])
}
