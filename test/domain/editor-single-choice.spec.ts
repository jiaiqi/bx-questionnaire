// @vitest-environment node

/**
 * 单选形态的判定与「最多一个正确答案」的校验
 *
 * 这组断言在防一条已经踩过的坑：单/多选**不能只看题型**。
 * 「选项」题型的单多选由 `item_type_attr.radioType` 决定，原先那两个静态数组
 * （`SINGLE_CHOICE_TYPES` / `MULTI_CHOICE_TYPES`）对「选项」题型必然判错。
 * 判定错了会连锁两处：勾选时该互斥的不互斥、保存时该校验的不校验。
 *
 * 校验那部分还防「误报」：多选形态标多个正确答案、以及问卷题 0 个正确答案，
 * 都是合法状态，报了就会把正常问卷拦在保存之外。
 */

import type { EditorActivity, EditorDocument, EditorItem } from '@/domain/editor'

import { describe, expect, it } from 'vitest'

import { emptyActivity, emptyItem, emptyOption, isSingleChoice } from '@/domain/editor'
import { validateDocument } from '@/domain/editor/validation'

/** 活动必填全部填好的文档骨架（题目由各用例自己放，避免「至少一题」的干扰） */
function validDocument(): EditorDocument {
  const activity: EditorActivity = {
    ...emptyActivity(),
    title: '满意度调查',
    classify: 'DAQ202409230006',
    keyword: '满意度',
    activityImage: 'F20261011001',
    startTime: '2026-10-11 08:00:00',
    endTime: '2026-10-11 18:00:00',
    remark: '请如实填写',
  }
  return { activity, items: [] }
}

/** 造一道选项内容都填好的选择题，`answerIndexes` 里的下标标成正确答案 */
function choiceItem(
  type: string,
  attr: Record<string, unknown>,
  answerIndexes: number[],
): EditorItem {
  const item = { ...emptyItem(type, attr), title: '你对本次服务满意吗？' }
  item.options = ['满意', '不满意'].map((value, index) => ({
    ...emptyOption(),
    value,
    isAnswer: answerIndexes.includes(index),
  }))
  return item
}

describe('single-choice · isSingleChoice 判定', () => {
  it('「单选」题型恒为单选形态', () => {
    expect(isSingleChoice('单选', {})).toBe(true)
    expect(isSingleChoice('单选', { radioType: 'multi' })).toBe(true)
  })

  it('「多选」题型不是单选形态', () => {
    expect(isSingleChoice('多选', {})).toBe(false)
    expect(isSingleChoice('多选', { radioType: 'single' })).toBe(false)
  })

  it('「选项」题型看 attr.radioType：multi 是多选', () => {
    expect(isSingleChoice('选项', { radioType: 'multi' })).toBe(false)
  })

  it('「选项」题型 radioType 为 single 时是单选', () => {
    expect(isSingleChoice('选项', { radioType: 'single' })).toBe(true)
  })

  it('「选项」题型缺 radioType 时按单选处理', () => {
    expect(isSingleChoice('选项', {})).toBe(true)
  })

  it('没有选项的题型一律不是单选形态', () => {
    for (const type of ['文本', '数字', '时间日期', '图片', '地址', '引用']) {
      expect(isSingleChoice(type, {}), `${type} 不该被判成单选`).toBe(false)
    }
  })

  it('未知题型不是单选形态', () => {
    expect(isSingleChoice('分节符', {})).toBe(false)
  })
})

describe('single-choice · 单选形态最多一个正确答案', () => {
  it('单选形态标了 2 个正确答案时，问题挂在 options 字段与该题上', () => {
    const doc = validDocument()
    doc.items = [choiceItem('单选', { radioType: 'single' }, [0, 1])]

    const issues = validateDocument(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('options')
    expect(issues[0]!.itemKey).toBe(doc.items[0]!.clientKey)
    expect(issues[0]!.message).toBe('单选题只能有一个正确答案（当前标了 2 个）')
  })

  it('「选项」题型且 radioType 为 single 时同样要报', () => {
    const doc = validDocument()
    doc.items = [choiceItem('选项', { radioType: 'single' }, [0, 1])]

    const issues = validateDocument(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('options')
    expect(issues[0]!.message).toContain('只能有一个正确答案')
  })

  it('多选题型标 2 个正确答案是合法状态', () => {
    const doc = validDocument()
    doc.items = [choiceItem('多选', { radioType: 'multi' }, [0, 1])]
    expect(validateDocument(doc)).toEqual([])
  })

  it('「选项」题型且 radioType 为 multi 标 2 个正确答案是合法状态', () => {
    const doc = validDocument()
    doc.items = [choiceItem('选项', { radioType: 'multi' }, [0, 1])]
    expect(validateDocument(doc)).toEqual([])
  })

  it('0 个正确答案不报这条 —— 问卷题可以没有正确答案', () => {
    const doc = validDocument()
    doc.items = [choiceItem('单选', { radioType: 'single' }, [])]
    expect(validateDocument(doc)).toEqual([])
  })

  it('恰好 1 个正确答案是合法状态', () => {
    const doc = validDocument()
    doc.items = [choiceItem('单选', { radioType: 'single' }, [1])]
    expect(validateDocument(doc)).toEqual([])
  })

  it('非选项类题型即使带着选项数据也不走这条判定', () => {
    // 文本题不渲染选项、保存时也不发 option_data，这条校验对它没有意义
    const doc = validDocument()
    doc.items = [choiceItem('文本', { view_model: 'text' }, [0, 1])]
    expect(validateDocument(doc)).toEqual([])
  })

  it('问题只挂在出错的那一题上，不牵连同文档里的正常题', () => {
    const doc = validDocument()
    const bad = choiceItem('单选', { radioType: 'single' }, [0, 1])
    const good = choiceItem('单选', { radioType: 'single' }, [0])
    doc.items = [bad, good]

    const issues = validateDocument(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.itemKey).toBe(bad.clientKey)
    expect(issues[0]!.itemKey).not.toBe(good.clientKey)
  })

  it('3 个正确答案时报出的条数仍是 1 条，且带上实际个数', () => {
    const doc = validDocument()
    const item = choiceItem('单选', { radioType: 'single' }, [0, 1])
    item.options.push({ ...emptyOption(), value: '说不清', isAnswer: true })
    doc.items = [item]

    const issues = validateDocument(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toBe('单选题只能有一个正确答案（当前标了 3 个）')
  })
})
