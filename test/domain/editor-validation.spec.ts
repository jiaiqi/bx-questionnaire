import { describe, expect, it } from 'vitest'

import { emptyDocument } from '@/domain/editor/document'
import { emptyActivity, emptyItem, emptyOption } from '@/domain/editor/types'
import { activityIssues, describeIssues, issuesForItem, validateDocument } from '@/domain/editor/validation'

/** 一份完全合法的文档：所有必填项都填上，用于「合法文档不该报错」这条基线 */
function validDocument() {
  const activity = {
    ...emptyActivity(),
    title: '满意度调查',
    classify: 'DAQ202409230006',
    keyword: '满意度',
    activityImage: 'F20261011001',
    startTime: '2026-10-11 08:00:00',
    endTime: '2026-10-11 18:00:00',
    remark: '请如实填写',
  }
  const item = {
    ...emptyItem('单选', { radioType: 'single' }),
    title: '你对本次服务满意吗？',
    options: [
      { ...emptyOption(), value: '满意', isAnswer: true },
      { ...emptyOption(), value: '不满意' },
    ],
  }
  return { activity, items: [item] }
}

describe('validateDocument · 基线', () => {
  it('合法文档返回空数组', () => {
    // 基线用例：校验若在这里就报错，说明它连正常文档都拦，用户根本保存不了
    expect(validateDocument(validDocument())).toEqual([])
  })

  it('空文档一次性报出全部活动必填项，并报「至少一题」', () => {
    const issues = validateDocument(emptyDocument())
    const fields = issues.map(issue => issue.field)

    for (const field of [
      'activity.title',
      'activity.classify',
      'activity.keyword',
      'activity.activityImage',
      'activity.startTime',
      'activity.endTime',
      'activity.remark',
      'items',
    ]) {
      expect(fields, `应报出 ${field}`).toContain(field)
    }
    // 平台只报第一个问题；前端要一次列全，所以条数也要锁住
    expect(fields).toHaveLength(8)
    expect(issues.find(issue => issue.field === 'activity.title')!.message).toBe('请填写问卷标题')
    expect(issues.find(issue => issue.field === 'items')!.message).toBe('至少需要一道题目')
  })
})

describe('validateDocument · 时间先后', () => {
  it('结束时间早于启用时间时报错', () => {
    const doc = validDocument()
    doc.activity.startTime = '2026-10-11 18:00:00'
    doc.activity.endTime = '2026-10-11 08:00:00'

    const issues = validateDocument(doc)
    expect(issues.map(issue => issue.field)).toEqual(['activity.endTime'])
    expect(issues[0]!.message).toBe('结束时间不能早于启用时间')
  })

  it('同一天不算倒置：短字符串不是更小', () => {
    // 防回归：直接比较字符串时 '2026-10-11' < '2026-10-11 08:00:00'（更短即更小），
    // 会把同一天的起止误判成倒置，用户怎么填都保存不了
    const doc = validDocument()
    doc.activity.startTime = '2026-10-11'
    doc.activity.endTime = '2026-10-11 08:00:00'

    expect(validateDocument(doc).filter(issue => issue.field === 'activity.endTime')).toEqual([])
    expect(validateDocument(doc)).toEqual([])
  })

  it('起止时间填反时才报，且只报一条', () => {
    const doc = validDocument()
    doc.activity.startTime = '2026-10-12'
    doc.activity.endTime = '2026-10-11'
    expect(validateDocument(doc).map(issue => issue.field)).toEqual(['activity.endTime'])
  })
})

describe('validateDocument · 选项', () => {
  it('选项类题型 0 个选项时报错，且 itemKey 指向该题', () => {
    const doc = validDocument()
    doc.items[0]!.options = []

    const issues = validateDocument(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('options')
    expect(issues[0]!.itemKey).toBe(doc.items[0]!.clientKey)
    expect(issues[0]!.message).toBe('选项类题目至少需要一个选项')
  })

  it('选项类题型 27 个选项时报「不能超过 26 个」', () => {
    const doc = validDocument()
    doc.items[0]!.options = Array.from({ length: 27 }, (_, index) => ({
      ...emptyOption(),
      value: `选项${index + 1}`,
    }))

    const issues = validateDocument(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('options')
    expect(issues[0]!.message).toContain('不能超过 26 个')
  })

  it('26 个选项正好合法（平台枚举 A..Z 的边界）', () => {
    const doc = validDocument()
    doc.items[0]!.options = Array.from({ length: 26 }, (_, index) => ({
      ...emptyOption(),
      value: `选项${index + 1}`,
    }))
    expect(validateDocument(doc)).toEqual([])
  })

  it('非选项类题型 0 个选项不算问题', () => {
    const doc = validDocument()
    doc.items[0] = { ...emptyItem('文本', { view_model: 'text' }), title: '还有什么建议？' }
    // 文本题本来就没有选项，这里报选项问题会让用户无从下手
    expect(validateDocument(doc)).toEqual([])
  })

  it('选项内容为空时报 optionValue，且 optionKey 指向那个选项', () => {
    const doc = validDocument()
    const blank = doc.items[0]!.options[1]!
    blank.value = '   '

    const issues = validateDocument(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('optionValue')
    expect(issues[0]!.optionKey).toBe(blank.clientKey)
    expect(issues[0]!.itemKey).toBe(doc.items[0]!.clientKey)
    expect(issues[0]!.message).toBe('选项内容不能为空')
  })
})

describe('validateDocument · 题目', () => {
  it('题目标题为空时报 title，且 itemKey 指向那道题', () => {
    const doc = validDocument()
    const blank = { ...emptyItem('文本', { view_model: 'text' }), title: '' }
    doc.items = [doc.items[0]!, blank]

    const issues = validateDocument(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('title')
    expect(issues[0]!.itemKey).toBe(blank.clientKey)
    expect(issues[0]!.message).toBe('请填写题目标题')
  })

  it('未知题型报 type，且不再连带报选项问题', () => {
    const doc = validDocument()
    doc.items[0] = { ...emptyItem('分节符', {}), title: '分节' }

    const issues = validateDocument(doc)
    // 只报一条：题型都不认识时再报「缺少选项」会淹没真正的原因
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('type')
    expect(issues[0]!.itemKey).toBe(doc.items[0]!.clientKey)
    expect(issues[0]!.message).toContain('未知题型')
  })

  it('题型为空时提示「请选择题型」', () => {
    const doc = validDocument()
    doc.items[0] = { ...emptyItem('', {}), title: '没选题型' }

    const issues = validateDocument(doc)
    expect(issues.map(issue => issue.field)).toEqual(['type'])
    expect(issues[0]!.message).toBe('请选择题型')
  })
})

describe('validateDocument · 长度', () => {
  it('活动标题 255 字符合法、256 字符报长度问题', () => {
    // 上限来自平台元数据的 ngMaxlength=255，边界必须精确到 255/256
    const doc = validDocument()
    doc.activity.title = '标'.repeat(255)
    expect(validateDocument(doc)).toEqual([])

    doc.activity.title = '标'.repeat(256)
    const issues = validateDocument(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('activity.title')
    expect(issues[0]!.message).toContain('不能超过 255 个字符')
    expect(issues[0]!.message).toContain('256')
  })

  it('题目标题上限按实现的 256 字符判定（活动标题才是 255）', () => {
    const doc = validDocument()
    doc.items[0]!.title = '题'.repeat(256)
    expect(validateDocument(doc)).toEqual([])

    doc.items[0]!.title = '题'.repeat(257)
    const issues = validateDocument(doc)
    expect(issues.map(issue => issue.field)).toEqual(['title'])
    expect(issues[0]!.message).toContain('不能超过 256 个字符')
  })
})

describe('issue 分组与摘要', () => {
  it('issuesForItem 只返回该题的问题，activityIssues 只返回活动级问题', () => {
    const doc = validDocument()
    doc.activity.title = ''
    const itemKey = doc.items[0]!.clientKey
    doc.items[0]!.title = ''

    const issues = validateDocument(doc)
    expect(issuesForItem(issues, itemKey).map(issue => issue.field)).toEqual(['title'])
    expect(issuesForItem(issues, 'not-exist')).toEqual([])
    expect(activityIssues(issues).map(issue => issue.field)).toEqual(['activity.title'])
  })

  it('describeIssues：空列表空串、单条原样、多条带总数', () => {
    expect(describeIssues([])).toBe('')
    expect(describeIssues([{ field: 'title', message: '请填写题目标题' }])).toBe('请填写题目标题')

    const many = [
      { field: 'a', message: '第一个问题' },
      { field: 'b', message: '第二个问题' },
      { field: 'c', message: '第三个问题' },
    ]
    expect(describeIssues(many)).toContain('第一个问题')
    expect(describeIssues(many)).toContain('共 3 项')
  })
})
