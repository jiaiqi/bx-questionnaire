// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { toQuestionFields } from '@/domain/questionnaire/mapper'
import {
  clampStepIndex,
  firstIssueStepIndex,
  isLastStep,
  nextStepIndex,
  prevStepIndex,
  resolveDisplayMode,
  stepIndexForKey,
  stepIssue,
  stepProgress,
  toSteps,
} from '@/domain/questionnaire/steps'

const fields = toQuestionFields([
  { item_no: 'q1', item_seq: 1, item_title: '第一题', item_type: '单选', is_require: '是', option_data: [{ option_no: 'o1', option_value: '甲' }] },
  { item_no: 'sec1', item_seq: 2, item_title: '第二部分', item_type: '分节符' },
  { item_no: 'q2', item_seq: 3, item_title: '第二题', item_type: '文本', is_require: '是' },
  { item_no: 'q3', item_seq: 4, item_title: '第三题', item_type: '数字', is_require: '否' },
  { item_no: 'sec2', item_seq: 5, item_title: '第三部分', item_type: '分节符' },
  { item_no: 'q4', item_seq: 6, item_title: '第四题', item_type: '文本', is_require: '是' },
])

describe('resolveDisplayMode', () => {
  it('只有「逐个」进逐个模式', () => {
    expect(resolveDisplayMode('逐个')).toBe('step')
  })

  it('去首尾空白后仍是「逐个」', () => {
    expect(resolveDisplayMode(' 逐个 ')).toBe('step')
  })

  /**
   * 空值 /「全部」/ 未知取值必须落回整卷：这是「老行为完全不变」的守卫 ——
   * 任何配置脏数据都不该把用户挡进一次一题的流程。
   */
  it.each([
    ['全部'],
    [''],
    [undefined],
    [null],
    ['一次性'],
    ['逐个全部'],
    ['未知'],
  ])('取值 %s 按整卷处理', (value) => {
    expect(resolveDisplayMode(value)).toBe('all')
  })
})

describe('toSteps', () => {
  it('分节符不占步骤，只保留可作答的题', () => {
    const steps = toSteps(fields)
    expect(steps.map(step => step.field.key)).toEqual(['q1', 'q2', 'q3', 'q4'])
  })

  it('每道题带上最近一个分节符的标题', () => {
    const steps = toSteps(fields)
    expect(steps.map(step => step.sectionLabel)).toEqual(['', '第二部分', '第二部分', '第三部分'])
  })

  it('卷首就是分节符时，第一题也带小节标题', () => {
    const sectionFirst = toQuestionFields([
      { item_no: 'sec', item_seq: 1, item_title: '第一部分', item_type: '分节符' },
      { item_no: 'a1', item_seq: 2, item_title: '题目', item_type: '文本' },
    ])
    expect(toSteps(sectionFirst)).toEqual([
      { field: sectionFirst[1], sectionLabel: '第一部分' },
    ])
  })

  it('全是分节符时步骤为空', () => {
    const sections = toQuestionFields([
      { item_no: 's1', item_seq: 1, item_title: '第一部分', item_type: '分节符' },
      { item_no: 's2', item_seq: 2, item_title: '第二部分', item_type: '分节符' },
    ])
    expect(toSteps(sections)).toEqual([])
  })
})

describe('clampStepIndex', () => {
  it('合法下标原样返回', () => {
    expect(clampStepIndex(0, 3)).toBe(0)
    expect(clampStepIndex(2, 3)).toBe(2)
  })

  it('越界下标夹到首 / 末', () => {
    expect(clampStepIndex(-1, 3)).toBe(0)
    expect(clampStepIndex(3, 3)).toBe(2)
    expect(clampStepIndex(99, 3)).toBe(2)
  })

  it('没有题目或非法数值时退回首题', () => {
    expect(clampStepIndex(0, 0)).toBe(0)
    expect(clampStepIndex(2, -1)).toBe(0)
    expect(clampStepIndex(Number.NaN, 3)).toBe(0)
    expect(clampStepIndex(Number.POSITIVE_INFINITY, 3)).toBe(0)
    expect(clampStepIndex(1, Number.NaN)).toBe(0)
  })

  it('小数下标向下取整', () => {
    expect(clampStepIndex(1.9, 3)).toBe(1)
    expect(clampStepIndex(2.9, 3)).toBe(2)
  })
})

describe('nextStepIndex / prevStepIndex', () => {
  it('正常前进与后退', () => {
    expect(nextStepIndex(0, 3)).toBe(1)
    expect(nextStepIndex(1, 3)).toBe(2)
    expect(prevStepIndex(2, 3)).toBe(1)
    expect(prevStepIndex(1, 3)).toBe(0)
  })

  it('首题不能再上一题，末题不能再下一题', () => {
    expect(prevStepIndex(0, 3)).toBe(0)
    expect(nextStepIndex(2, 3)).toBe(2)
  })

  it('越界下标先夹取再移动', () => {
    expect(nextStepIndex(-5, 3)).toBe(1)
    expect(prevStepIndex(99, 3)).toBe(1)
  })

  it('没有题目时停在 0（不会出现 -1）', () => {
    expect(nextStepIndex(0, 0)).toBe(0)
    expect(prevStepIndex(0, 0)).toBe(0)
  })
})

describe('isLastStep', () => {
  it('只有落在末题才是最后一步', () => {
    expect(isLastStep(2, 3)).toBe(true)
    expect(isLastStep(0, 3)).toBe(false)
    expect(isLastStep(99, 3)).toBe(true)
  })

  /** 没有题目时「下一题」不能变成「提交」 */
  it('没有题目时恒为 false', () => {
    expect(isLastStep(0, 0)).toBe(false)
  })
})

describe('stepProgress', () => {
  it('当前题从 1 开始，百分比按位置计算', () => {
    expect(stepProgress(0, 3)).toEqual({ current: 1, total: 3, percent: 33 })
    expect(stepProgress(1, 3)).toEqual({ current: 2, total: 3, percent: 67 })
    expect(stepProgress(2, 3)).toEqual({ current: 3, total: 3, percent: 100 })
  })

  it('越界下标按夹取后的位置计算', () => {
    expect(stepProgress(99, 3)).toEqual({ current: 3, total: 3, percent: 100 })
    expect(stepProgress(-3, 3)).toEqual({ current: 1, total: 3, percent: 33 })
  })

  /** 空问卷不能算出 NaN（进度条会渲染成空 /「NaN%」） */
  it('没有题目时是 0 / 0 / 0 而不是 NaN', () => {
    const result = stepProgress(0, 0)
    expect(result).toEqual({ current: 0, total: 0, percent: 0 })
    expect(Number.isNaN(result.percent)).toBe(false)
  })
})

describe('stepIssue', () => {
  const steps = toSteps(fields)

  it('必答未填产出与整卷校验一致的提示', () => {
    const issue = stepIssue(steps[0]!.field, {})
    expect(issue).toMatchObject({ key: 'q1', index: 1, message: '第 1 题为必填项' })
  })

  it('已答的必答题没有问题项', () => {
    expect(stepIssue(steps[0]!.field, { q1: 'o1' })).toBeNull()
    expect(stepIssue(steps[1]!.field, { q2: '意见' })).toBeNull()
  })

  it('选填题不拦「下一题」', () => {
    expect(stepIssue(steps[2]!.field, {})).toBeNull()
  })

  it('多选空数组按未答处理', () => {
    const multi = toQuestionFields([
      { item_no: 'm1', item_seq: 1, item_title: '多选', item_type: '多选', is_require: '是' },
    ])
    expect(stepIssue(multi[0]!, { m1: [] })).not.toBeNull()
    expect(stepIssue(multi[0]!, { m1: ['o1'] })).toBeNull()
  })
})

describe('stepIndexForKey', () => {
  it('能按题目主键定位步骤', () => {
    const steps = toSteps(fields)
    expect(stepIndexForKey(steps, 'q1')).toBe(0)
    expect(stepIndexForKey(steps, 'q4')).toBe(3)
  })

  it('找不到（含分节符主键）返回 -1', () => {
    const steps = toSteps(fields)
    expect(stepIndexForKey(steps, 'sec1')).toBe(-1)
    expect(stepIndexForKey(steps, '不存在')).toBe(-1)
  })
})

describe('firstIssueStepIndex', () => {
  const steps = toSteps(fields)
  const issue = (key: string, index: number) => ({
    key,
    index,
    label: key,
    message: `第 ${index} 题为必填项`,
  })

  /** 按**问题顺序**定位，不是按步骤顺序：提交校验的第一条就是最该给用户看的 */
  it('返回第一条问题所在的步骤', () => {
    expect(firstIssueStepIndex(steps, [issue('q2', 2)])).toBe(1)
    expect(firstIssueStepIndex(steps, [issue('q4', 4), issue('q1', 1)])).toBe(3)
    expect(firstIssueStepIndex(steps, [issue('q1', 1), issue('q4', 4)])).toBe(0)
  })

  it('没有问题项时返回 -1', () => {
    expect(firstIssueStepIndex(steps, [])).toBe(-1)
  })

  it('问题项都不在步骤列表里时返回 -1（调用方回退到错误摘要）', () => {
    expect(firstIssueStepIndex(steps, [issue('sec1', 0)])).toBe(-1)
  })
})
