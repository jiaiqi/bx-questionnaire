/**
 * 保存计划：把「当前文档」与「载入时的原始文档」比出要执行的操作
 *
 * 刻意分成「算计划」与「执行计划」两步：
 * 算计划是纯函数（可单测，能断言「只改了一个标题时恰好只发一条 update」），
 * 执行才碰网络。合成一步的话，就只能靠发请求来验证逻辑，慢且脆。
 *
 * 新增项的主键由服务端生成，所以计划里的 `itemCreates` 只带 `clientKey`；
 * 执行器拿到 `effect_data` 后再把 `item_no` 回填进对应的选项创建项
 * （`optionCreates[].itemClientKey`）。
 */

import type { EditorDocument } from './types'

import {
  activityChanged,
  activityPayload,
  itemChanged,
  itemPayload,
  optionChanged,
  optionPayload,
} from './document'

/** 要新增的题目 */
export interface ItemCreate {
  /** 新建题目的客户端标识，用于把 `effect_data` 里的 `item_no` 对回来 */
  clientKey: string
  payload: Record<string, unknown>
}

/** 要新增的选项 */
export interface OptionCreate {
  /** 所属题目的客户端标识 */
  itemClientKey: string
  /**
   * 所属题目的 `item_no`
   *
   * 题目也是新增的时候这里是空串 —— 执行器会用 `itemCreates` 的结果回填。
   * 用空串而不是 `undefined`，是为了让「忘了回填」在请求体里表现为一个
   * 空条件而不是一个被 `JSON.stringify` 丢掉的键（后者更难发现）。
   */
  payload: Record<string, unknown>
}

export interface SavePlan {
  /** 新建活动的 payload；不需要新建时为 null */
  activityCreate: Record<string, unknown> | null
  /** 更新活动的 payload；不需要更新时为 null */
  activityUpdate: Record<string, unknown> | null
  itemCreates: ItemCreate[]
  itemUpdates: Array<{ itemNo: string, payload: Record<string, unknown> }>
  /** 要删除的题目 `item_no` */
  itemDeletes: string[]
  optionCreates: OptionCreate[]
  optionUpdates: Array<{ optionNo: string, payload: Record<string, unknown> }>
  /** 要删除的选项 `option_no`（含被删题目名下的全部选项） */
  optionDeletes: string[]
}

function emptyPlan(): SavePlan {
  return {
    activityCreate: null,
    activityUpdate: null,
    itemCreates: [],
    itemUpdates: [],
    itemDeletes: [],
    optionCreates: [],
    optionUpdates: [],
    optionDeletes: [],
  }
}

/**
 * 算出保存计划
 *
 * `original` 是**载入时的文档快照**，必须原样保留、不能被编辑过程改到 ——
 * 「哪些被删了」只能靠它推出来（当前文档里已经看不到被删的项了）。
 * 新建问卷时传 null，于是所有内容都是新增。
 */
export function planSave(current: EditorDocument, original: EditorDocument | null): SavePlan {
  const plan = emptyPlan()
  const activityNo = current.activity.activityNo

  // ── 活动 ──
  if (!current.activity.raw) {
    plan.activityCreate = activityPayload(current.activity)
  }
  else if (activityChanged(current.activity)) {
    plan.activityUpdate = activityPayload(current.activity)
  }

  // ── 题目 ──
  const originalItemsByNo = new Map(
    (original?.items ?? []).filter(item => item.itemNo).map(item => [item.itemNo, item]),
  )
  const currentItemNos = new Set(current.items.map(item => item.itemNo).filter(Boolean))

  current.items.forEach((item, index) => {
    if (!item.itemNo) {
      plan.itemCreates.push({ clientKey: item.clientKey, payload: itemPayload(item, index, activityNo) })
      return
    }
    if (itemChanged(item, index, activityNo)) {
      plan.itemUpdates.push({ itemNo: item.itemNo, payload: itemPayload(item, index, activityNo) })
    }
  })

  for (const originalItem of original?.items ?? []) {
    if (!originalItem.itemNo || currentItemNos.has(originalItem.itemNo)) {
      continue
    }
    plan.itemDeletes.push(originalItem.itemNo)
    // 先删选项再删题目：实测该顺序可用；反过来是否级联没有依据，不赌
    for (const option of originalItem.options) {
      if (option.optionNo) {
        plan.optionDeletes.push(option.optionNo)
      }
    }
  }

  // ── 选项 ──
  for (const item of current.items) {
    const currentOptionNos = new Set(item.options.map(option => option.optionNo).filter(Boolean))

    item.options.forEach((option, index) => {
      if (!option.optionNo) {
        plan.optionCreates.push({
          itemClientKey: item.clientKey,
          payload: optionPayload(option, index, item.itemNo),
        })
        return
      }
      if (optionChanged(option, index, item.itemNo)) {
        plan.optionUpdates.push({
          optionNo: option.optionNo,
          payload: optionPayload(option, index, item.itemNo),
        })
      }
    })

    // 题目还在、但某些选项被删了（或题型从选项类换成了非选项类）
    const originalItem = item.itemNo ? originalItemsByNo.get(item.itemNo) : undefined
    for (const option of originalItem?.options ?? []) {
      if (option.optionNo && !currentOptionNos.has(option.optionNo)) {
        plan.optionDeletes.push(option.optionNo)
      }
    }
  }

  return plan
}

/** 计划里是否有任何要执行的操作 */
export function planHasChanges(plan: SavePlan): boolean {
  return Boolean(
    plan.activityCreate
    || plan.activityUpdate
    || plan.itemCreates.length
    || plan.itemUpdates.length
    || plan.itemDeletes.length
    || plan.optionCreates.length
    || plan.optionUpdates.length
    || plan.optionDeletes.length,
  )
}

/** 计划里各类操作的数量，用于日志与测试断言 */
export function planSummary(plan: SavePlan): Record<string, number> {
  return {
    activityCreate: plan.activityCreate ? 1 : 0,
    activityUpdate: plan.activityUpdate ? 1 : 0,
    itemCreate: plan.itemCreates.length,
    itemUpdate: plan.itemUpdates.length,
    itemDelete: plan.itemDeletes.length,
    optionCreate: plan.optionCreates.length,
    optionUpdate: plan.optionUpdates.length,
    optionDelete: plan.optionDeletes.length,
  }
}
