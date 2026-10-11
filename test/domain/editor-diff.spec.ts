import type { DaqActivityRow, DaqItemRow, DaqOptionCfgRow } from '@/api/daq/types'

import { describe, expect, it } from 'vitest'

import { planHasChanges, planSave, planSummary } from '@/domain/editor/diff'
import { documentFromRows, emptyDocument } from '@/domain/editor/document'
import { emptyItem, emptyOption } from '@/domain/editor/types'

const ACTIVITY_NO = '20261011154728000005'

/**
 * 载入时的一份完整文档：1 道单选（2 个选项）+ 1 道文本
 *
 * 每次调用都重新构造，用来模拟「编辑器里的当前文档」与「载入时的快照」两份独立对象。
 */
function buildOriginal() {
  const activityRow: DaqActivityRow = {
    activity_no: ACTIVITY_NO,
    title: '演示问卷',
    classify: 'DAQ202409230006',
    keyword: '演示',
    activity_image: 'F20261011001',
    start_time: '2026-10-11 08:00:00',
    end_time: '2026-10-11 18:00:00',
    remark: '演示问卷描述',
  }
  const itemRows: DaqItemRow[] = [
    {
      item_no: 'I1',
      item_seq: 1,
      item_title: '第一题',
      item_type: '单选',
      is_require: '是',
      points: 5,
      item_type_attr: { radioType: 'single' },
    },
    {
      item_no: 'I2',
      item_seq: 2,
      item_title: '第二题',
      item_type: '文本',
      item_type_attr: { view_model: 'text' },
    },
  ]
  const optionRowsByItemNo = new Map<string, DaqOptionCfgRow[]>([
    ['I1', [
      { option_no: 'O1', item_no: 'I1', option_value: '甲', option_seq: 1, answer: '是', points: 5 },
      { option_no: 'O2', item_no: 'I1', option_value: '乙', option_seq: 2, answer: '否', points: 0 },
    ]],
  ])
  return documentFromRows(activityRow, itemRows, optionRowsByItemNo)
}

const NO_CHANGES = {
  activityCreate: 0,
  activityUpdate: 0,
  itemCreate: 0,
  itemUpdate: 0,
  itemDelete: 0,
  optionCreate: 0,
  optionUpdate: 0,
  optionDelete: 0,
}

describe('planSave · 没有改动', () => {
  it('当前文档与载入快照内容相同时计划为空', () => {
    // 载入后什么都没动就点保存，不该产生任何请求 —— 这条防的是「全量重写」
    const plan = planSave(buildOriginal(), buildOriginal())
    expect(planHasChanges(plan)).toBe(false)
    expect(planSummary(plan)).toEqual(NO_CHANGES)
    expect(plan.activityUpdate).toBeNull()
    expect(plan.activityCreate).toBeNull()
  })
})

describe('planSave · 活动', () => {
  it('已有活动改了一个字段 → 恰好 1 条活动更新，不新建', () => {
    const current = buildOriginal()
    const original = buildOriginal()
    current.activity.title = '改过的活动标题'

    const plan = planSave(current, original)
    expect(plan.activityCreate).toBeNull()
    expect(plan.activityUpdate).not.toBeNull()
    expect(plan.activityUpdate!.title).toBe('改过的活动标题')
    expect(planSummary(plan)).toEqual({ ...NO_CHANGES, activityUpdate: 1 })
  })

  it('活动 raw 为 null（新建）→ 走新建而不是更新', () => {
    const current = emptyDocument()
    current.activity.title = '新建问卷'

    const plan = planSave(current, null)
    expect(plan.activityUpdate).toBeNull()
    expect(plan.activityCreate).not.toBeNull()
    expect(plan.activityCreate!.title).toBe('新建问卷')
  })
})

describe('planSave · 题目', () => {
  it('只改一个已有题目的标题 → 恰好 1 条题目更新，其它全 0', () => {
    const current = buildOriginal()
    const original = buildOriginal()
    current.items[1]!.title = '改过的第二题'

    const plan = planSave(current, original)
    expect(plan.itemUpdates).toHaveLength(1)
    expect(plan.itemUpdates[0]!.itemNo).toBe('I2')
    expect(plan.itemUpdates[0]!.payload.item_title).toBe('改过的第二题')
    expect(plan.itemCreates).toEqual([])
    expect(planSummary(plan)).toEqual({ ...NO_CHANGES, itemUpdate: 1 })
  })

  it('新增题目进 itemCreates、不出现在 itemUpdates；它的选项先留空 item_no', () => {
    const current = buildOriginal()
    const original = buildOriginal()
    const added = {
      ...emptyItem('单选', { radioType: 'single' }),
      title: '新增题',
      options: [{ ...emptyOption(), value: '新选项' }],
    }
    current.items.push(added)

    const plan = planSave(current, original)
    expect(plan.itemCreates).toHaveLength(1)
    expect(plan.itemCreates[0]!.clientKey).toBe(added.clientKey)
    expect(plan.itemCreates[0]!.payload.item_seq).toBe(3)
    // 新增项没有 item_no，绝不能同时出现在更新列表里（否则会对空条件发 update）
    expect(plan.itemUpdates).toEqual([])

    expect(plan.optionCreates).toHaveLength(1)
    // 题目主键要等 _add 的 effect_data 回来才知道 —— 必须显式留空串，
    // 执行器据此回填（用 undefined 会被 JSON.stringify 丢掉，更难发现）
    expect(plan.optionCreates[0]!.payload.item_no).toBe('')
    expect(plan.itemDeletes).toEqual([])
  })

  it('删除题目时它的每个选项都进 optionDeletes（先删选项再删题目）', () => {
    const current = buildOriginal()
    const original = buildOriginal()
    current.items = current.items.filter(item => item.itemNo !== 'I1')

    const plan = planSave(current, original)
    expect(plan.itemDeletes).toEqual(['I1'])
    // 只删题目不删选项，会留下挂在已删题目上的孤儿选项行
    expect(plan.optionDeletes).toEqual(['O1', 'O2'])
  })
})

describe('planSave · 选项', () => {
  it('optionCreates 的 itemClientKey 等于所属题目的 clientKey', () => {
    const current = buildOriginal()
    const original = buildOriginal()
    const added = {
      ...emptyItem('多选', { radioType: 'multi' }),
      title: '新增多选题',
      options: [{ ...emptyOption(), value: '选项一' }, { ...emptyOption(), value: '选项二' }],
    }
    current.items.push(added)

    const plan = planSave(current, original)
    expect(plan.optionCreates).toHaveLength(2)
    // 两个选项都必须挂回同一道新题，否则执行器回填不出 item_no
    expect(plan.optionCreates.map(create => create.itemClientKey))
      .toEqual([added.clientKey, added.clientKey])
  })

  it('删掉一个已有选项 → 只有它进 optionDeletes，其它选项不受影响', () => {
    const current = buildOriginal()
    const original = buildOriginal()
    current.items[0]!.options = current.items[0]!.options.filter(option => option.optionNo !== 'O1')

    const plan = planSave(current, original)
    expect(plan.optionDeletes).toEqual(['O1'])
    expect(plan.optionDeletes).not.toContain('O2')
    // 剩下的 O2 位置从 1 变成 0，但 seq / 字母是按位置重新生成的，
    // 不该被当成用户编辑而多发一条 update
    expect(plan.optionUpdates).toEqual([])
    expect(plan.itemUpdates).toEqual([])
  })

  it('已有选项改了文案 → 1 条 optionUpdates，键是 optionNo', () => {
    const current = buildOriginal()
    const original = buildOriginal()
    current.items[0]!.options[1]!.value = '乙（改过）'

    const plan = planSave(current, original)
    expect(plan.optionUpdates).toHaveLength(1)
    expect(plan.optionUpdates[0]!.optionNo).toBe('O2')
    expect(plan.optionUpdates[0]!.payload.option_value).toBe('乙（改过）')
    expect(plan.optionCreates).toEqual([])
    expect(plan.optionDeletes).toEqual([])
    expect(planSummary(plan)).toEqual({ ...NO_CHANGES, optionUpdate: 1 })
  })
})
