// @vitest-environment node

/**
 * 编辑器文档控制器（`useEditorDocument`）的内存行为
 *
 * 这组断言在防编辑器最伤用户的三类静默失效：
 * 1. 选项勾选不互斥 —— 单选题能勾出两个正确答案，直到保存时才被服务端或校验拦下；
 * 2. 换题型不清理旧状态 —— `attr` 留着上一个题型的键、选项残留成谁也用不到的脏数据，
 *    而它们仍会被写进选项表；
 * 3. 保存计划的计数漂移 —— `plan` 是保存前二次确认（「会删几道题」）的依据，
 *    算错就等于让用户在没有提示的情况下丢题。
 *
 * 这里只覆盖**不触网**的行为：`load()` 与「有改动且校验通过」的 `save()` 会发请求，
 * 刻意不测、也不 mock 网络。
 *
 * 两处与需求描述不一致、按实际实现断言的地方，见文件末尾两条用例的注释。
 */

import type { EditorDocumentController } from '@/composables/useEditorDocument'
import type { EditorItem } from '@/domain/editor'

import { describe, expect, it } from 'vitest'

import { useEditorDocument } from '@/composables/useEditorDocument'
import { EditorValidationError } from '@/domain/editor/validation'

/** 新增一道题并断言成功，省掉每条用例里的 null 判断 */
function mustAdd(controller: EditorDocumentController, type: string): EditorItem {
  const item = controller.addItem(type)
  if (item === null) {
    throw new Error(`addItem(${type}) 不该返回 null`)
  }
  return item
}

/** 各选项当前是否为正确答案 */
function answersOf(item: EditorItem): boolean[] {
  return item.options.map(option => option.isAnswer)
}

const REF_NAMES = [
  'doc',
  'loading',
  'saving',
  'loaded',
  'loadError',
  'saveError',
  'issues',
  'plan',
  'dirty',
  'isNew',
] as const

const METHOD_NAMES = [
  'load',
  'save',
  'discard',
  'itemIssues',
  'findItem',
  'addItem',
  'removeItem',
  'moveItem',
  'changeItemType',
  'addOption',
  'removeOption',
  'moveOption',
  'setOptionAnswer',
] as const

describe('use-editor-document · 初始状态', () => {
  it('新建文档：isNew 为 true、没有题目、还没有加载过', () => {
    const controller = useEditorDocument()
    expect(controller.isNew.value).toBe(true)
    expect(controller.doc.value.activity.activityNo).toBe('')
    expect(controller.doc.value.items).toEqual([])
    expect(controller.loaded.value).toBe(false)
    expect(controller.loading.value).toBe(false)
    expect(controller.saving.value).toBe(false)
    expect(controller.loadError.value).toBe('')
    expect(controller.saveError.value).toBe('')
  })

  it('返回对象暴露全部文档状态与操作方法', () => {
    const controller = useEditorDocument()
    const bag = controller as unknown as Record<string, unknown>
    for (const name of REF_NAMES) {
      expect(name in bag, `缺少状态 ${name}`).toBe(true)
    }
    for (const name of METHOD_NAMES) {
      expect(typeof bag[name], `${name} 应是函数`).toBe('function')
    }
  })
})

describe('use-editor-document · addItem', () => {
  it('新增单选题默认给 2 个选项，属性是 radioType=single', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '单选')
    expect(item.type).toBe('单选')
    expect(item.options).toHaveLength(2)
    expect(item.attr).toEqual({ radioType: 'single' })
    expect(item.clientKey).toMatch(/^item-\d+$/)
  })

  it('新增多选题同样默认给 2 个选项', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '多选')
    expect(item.options).toHaveLength(2)
    expect(item.attr).toEqual({ radioType: 'multi' })
  })

  it('新增非选择题不给选项', () => {
    const controller = useEditorDocument()
    const text = mustAdd(controller, '文本')
    expect(text.options).toEqual([])
    expect(text.attr).toEqual({ view_model: 'text' })

    const image = mustAdd(controller, '图片')
    expect(image.options).toEqual([])
    expect(image.attr).toEqual({ fileNum: 9 })
  })

  it('未知题型返回 null，且不往文档里插坏题', () => {
    const controller = useEditorDocument()
    const item = controller.addItem('不存在的题型')
    expect(item).toBeNull()
    expect(controller.doc.value.items).toEqual([])
  })

  it('多次新增按调用顺序追加在后面', () => {
    const controller = useEditorDocument()
    const first = mustAdd(controller, '文本')
    const second = mustAdd(controller, '数字')
    expect(controller.doc.value.items.map(item => item.clientKey)).toEqual([
      first.clientKey,
      second.clientKey,
    ])
  })
})

describe('use-editor-document · setOptionAnswer 互斥', () => {
  it('单选题先勾第 0 个再勾第 1 个，只有第 1 个是正确答案', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '单选')

    controller.setOptionAnswer(item.clientKey, 0, true)
    expect(answersOf(item)).toEqual([true, false])

    controller.setOptionAnswer(item.clientKey, 1, true)
    expect(answersOf(item)).toEqual([false, true])
  })

  it('多选题两个选项可以同时是正确答案', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '多选')

    controller.setOptionAnswer(item.clientKey, 0, true)
    controller.setOptionAnswer(item.clientKey, 1, true)
    expect(answersOf(item)).toEqual([true, true])
  })

  it('「选项」题型 radioType=multi 时两个选项可以同时是正确答案', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '选项')
    item.attr = { radioType: 'multi' }

    controller.setOptionAnswer(item.clientKey, 0, true)
    controller.setOptionAnswer(item.clientKey, 1, true)
    expect(answersOf(item)).toEqual([true, true])
  })

  it('「选项」题型 radioType=single 时互斥', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '选项')

    controller.setOptionAnswer(item.clientKey, 0, true)
    controller.setOptionAnswer(item.clientKey, 1, true)
    expect(answersOf(item)).toEqual([false, true])
  })

  it('取消勾选不影响其它选项', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '多选')

    controller.setOptionAnswer(item.clientKey, 0, true)
    controller.setOptionAnswer(item.clientKey, 1, true)
    controller.setOptionAnswer(item.clientKey, 1, false)
    expect(answersOf(item)).toEqual([true, false])
  })

  it('单选题取消勾选后不残留正确答案', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '单选')

    controller.setOptionAnswer(item.clientKey, 0, true)
    controller.setOptionAnswer(item.clientKey, 0, false)
    expect(answersOf(item)).toEqual([false, false])
  })

  it('越界下标不抛异常，也不改动任何选项', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '单选')
    controller.setOptionAnswer(item.clientKey, 0, true)

    expect(() => controller.setOptionAnswer(item.clientKey, 5, true)).not.toThrow()
    expect(() => controller.setOptionAnswer(item.clientKey, -1, true)).not.toThrow()
    expect(answersOf(item)).toEqual([true, false])
  })

  it('不存在的 itemKey 不抛异常，也不改动任何选项', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '单选')

    expect(() => controller.setOptionAnswer('item-does-not-exist', 0, true)).not.toThrow()
    expect(answersOf(item)).toEqual([false, false])
  })
})

describe('use-editor-document · 题目增删改序', () => {
  it('removeItem 之后 findItem 返回 undefined', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '文本')
    expect(controller.findItem(item.clientKey)).toEqual(item)

    controller.removeItem(item.clientKey)
    expect(controller.findItem(item.clientKey)).toBeUndefined()
    expect(controller.doc.value.items).toHaveLength(0)
  })

  it('moveItem 把题目搬到目标位置', () => {
    const controller = useEditorDocument()
    const first = mustAdd(controller, '文本')
    first.title = '第一题'
    const second = mustAdd(controller, '文本')
    second.title = '第二题'
    const third = mustAdd(controller, '文本')
    third.title = '第三题'

    controller.moveItem(0, 2)
    expect(controller.doc.value.items.map(item => item.title)).toEqual(['第二题', '第三题', '第一题'])

    controller.moveItem(2, 0)
    expect(controller.doc.value.items.map(item => item.title)).toEqual(['第一题', '第二题', '第三题'])
  })

  it('changeItemType 换成图片题时 attr 重置且选项被清空', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '单选')
    expect(item.attr).toEqual({ radioType: 'single' })
    expect(item.options).toHaveLength(2)

    controller.changeItemType(item.clientKey, '图片')
    expect(item.type).toBe('图片')
    expect(item.attr).toEqual({ fileNum: 9 })
    // 旧题型的 attr 键不能再留着
    expect(Object.keys(item.attr)).toEqual(['fileNum'])
    expect(item.options).toEqual([])
  })

  it('changeItemType 从无选项的文本题切到多选时补 2 个选项', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '文本')
    expect(item.options).toEqual([])

    controller.changeItemType(item.clientKey, '多选')
    expect(item.type).toBe('多选')
    expect(item.attr).toEqual({ radioType: 'multi' })
    expect(item.options).toHaveLength(2)
  })

  it('changeItemType 换成未知题型时原样不动', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '文本')

    controller.changeItemType(item.clientKey, '分节符')
    expect(item.type).toBe('文本')
    expect(item.attr).toEqual({ view_model: 'text' })
  })

  it('changeItemType 传入与当前相同的题型时不重置用户改过的 attr', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '文本')
    item.attr = { view_model: 'textarea' }

    controller.changeItemType(item.clientKey, '文本')
    expect(item.attr).toEqual({ view_model: 'textarea' })
  })

  it('addOption / moveOption / removeOption 只改选项列表本身', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '单选')
    const [first, second] = item.options
    controller.addOption(item.clientKey)
    expect(item.options).toHaveLength(3)
    const third = item.options[2]!

    controller.moveOption(item.clientKey, 2, 0)
    expect(item.options.map(option => option.clientKey)).toEqual([
      third.clientKey,
      first!.clientKey,
      second!.clientKey,
    ])

    controller.removeOption(item.clientKey, second!.clientKey)
    expect(item.options.map(option => option.clientKey)).toEqual([
      third.clientKey,
      first!.clientKey,
    ])
  })

  it('itemIssues 只返回该题自己的问题', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '文本')

    // 题目标题是空的，所以该题应当有一条 title 问题；活动级问题不算在内
    expect(controller.itemIssues(item.clientKey).map(issue => issue.field)).toEqual(['title'])
  })
})

describe('use-editor-document · dirty 与 plan', () => {
  it('新建文档的保存计划里有一条 activityCreate', () => {
    const controller = useEditorDocument()
    expect(controller.plan.value.activityCreate).not.toBeNull()
    expect(controller.plan.value.itemCreates).toEqual([])
    expect(controller.plan.value.itemDeletes).toEqual([])
  })

  it('addItem 之后 plan 里多出一条 itemCreates，且没有删除项', () => {
    const controller = useEditorDocument()
    const item = mustAdd(controller, '单选')

    expect(controller.plan.value.itemCreates).toHaveLength(1)
    expect(controller.plan.value.itemCreates[0]!.clientKey).toBe(item.clientKey)
    expect(controller.plan.value.itemDeletes).toEqual([])
    expect(controller.dirty.value).toBe(true)
  })

  it('新建文档一打开不算「有改动」', () => {
    // `planSave` 对新文档恒产出 activityCreate（保存确实要建活动），
    // 所以 dirty 对新建文档不能看 plan，否则一打开就显示「放弃」按钮。
    // 实现改为「所有改文档的方法都置 touched 标记」，这条守住初始值。
    const controller = useEditorDocument()
    expect(controller.dirty.value).toBe(false)
  })

  it('新建文档填了活动字段就算「有改动」', () => {
    const controller = useEditorDocument()
    controller.patchActivity({ title: '员工满意度调查' })
    expect(controller.dirty.value).toBe(true)
  })

  it('新建文档加了题才算「有改动」', () => {
    const controller = useEditorDocument()
    mustAdd(controller, '文本')
    expect(controller.dirty.value).toBe(true)
  })

  it('新建文档只填默认有效期不算「有改动」', () => {
    // 初始文档自带默认时间窗（composable 提供，不是页面自己填），
    // 若把它算成改动，新建页一打开就会显示「放弃」
    const controller = useEditorDocument()
    expect(controller.doc.value.activity.startTime).not.toBe('')
    expect(controller.doc.value.activity.endTime).not.toBe('')
    expect(controller.dirty.value).toBe(false)
  })
})

describe('use-editor-document · discard', () => {
  it('discard 丢掉未保存的新增题，回到原始快照', () => {
    const controller = useEditorDocument()
    mustAdd(controller, '单选')
    expect(controller.doc.value.items).toHaveLength(1)

    controller.discard()
    expect(controller.doc.value.items).toHaveLength(0)
    expect(controller.doc.value.activity.title).toBe('')
  })

  it('放弃之后 dirty 回到 false，且默认有效期还在', () => {
    const controller = useEditorDocument()
    mustAdd(controller, '单选')
    expect(controller.dirty.value).toBe(true)

    controller.discard()
    expect(controller.dirty.value).toBe(false)
    // 放弃 = 回到「新建问卷的初始状态」，不是回到一份连时间都空的文档
    expect(controller.doc.value.activity.startTime).not.toBe('')
  })
})

describe('use-editor-document · save 的不触网路径', () => {
  it('新建文档校验不通过时抛 EditorValidationError', async () => {
    const controller = useEditorDocument()
    await expect(controller.save()).rejects.toBeInstanceOf(EditorValidationError)
  })

  it('抛出的错误里带着具体缺什么（活动必填项）', async () => {
    const controller = useEditorDocument()
    const error = await controller.save().then(
      () => null,
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(EditorValidationError)
    const issues = (error as EditorValidationError).issues
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.map(issue => issue.field)).toContain('activity.title')
    expect(issues.map(issue => issue.field)).toContain('activity.classify')
  })

  it('校验失败不算保存失败：saveError 保持空、saving 回到 false', async () => {
    const controller = useEditorDocument()
    await controller.save().catch(() => undefined)

    expect(controller.saveError.value).toBe('')
    expect(controller.saving.value).toBe(false)
  })

  it('新建且没有任何改动时 save 仍然先撞校验 —— 「无改动直接返回空串」不可达', async () => {
    // 需求描述说「save() 在没有改动时直接返回 ''（新建且无改动）」。
    // 实际实现里校验排在「计划为空则短路」之前，而新建文档必然校验失败
    // （标题 / 分类 / 封面等必填都空），所以那条短路对新建文档走不到；
    // 而且计划里恒有 activityCreate，也永远不为空。差异已上报。
    const controller = useEditorDocument()
    expect(controller.doc.value.items).toEqual([])
    await expect(controller.save()).rejects.toBeInstanceOf(EditorValidationError)
  })
})
