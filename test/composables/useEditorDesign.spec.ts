// @vitest-environment node

/**
 * 可视化设计器页面逻辑（`useEditorDesign`）的行为契约
 *
 * ## 测什么
 *
 * 页面 `pages/editor/design/index.vue` 只做绑定，题目增删改排序、选项编辑、
 * 拖拽重排、保存编排与校验定位全在这里。所以这组断言覆盖的是**页面级的编排**：
 * `onLoad` 的加载分支、选中态、换题型、删除的二次确认、选项的边界移动、
 * 拖拽落点、保存的四条出口（无改动 / 有改动 / 校验失败 / 网络失败）。
 *
 * ## 不测什么
 *
 * - **不测领域规则本身**：`moveInArray` 的越界语义、`dropIndexAt` 的行高换算、
 *   `validateDocument` 的每一条必填、`planSave` 的差异计算都有各自的纯函数测试
 *   （`test/domain/editor-*.spec.ts`），这里只断言「编排层把正确的参数递了过去」。
 * - **不碰真实网络**：`@/api/daq/editor` 整体打桩，`@dcloudio/uni-app` 的 `onLoad`
 *   换成捕获回调的桩，`@/utils/ui` 的弹窗/提示换成 `vi.fn()`。
 * - **不测模板与样式**：宽窄屏布局、`v-if` 的显隐由 `test/components/editor-layout.spec.ts`
 *   这类读源码的测试守着；本文件不渲染组件（环境是 node，也没有 @vue/test-utils）。
 * - **不测 `usePointerReorder` / `useEditorDocument` 的内部实现**：只通过控制器的
 *   返回值与打桩的接口调用参数来观察它们的效果。
 *
 * 用例里凡是标了「回归防护」的，注释会写清「如果这条红了说明什么被改坏了」。
 */

import type { DaqActivityRow, DaqItemRow, DaqOptionCfgRow } from '@/api/daq/types'
import type { EditorDesignController } from '@/composables/useEditorDesign'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ITEM_ROW_HEIGHT } from '@/components/editor/constants'
import { useEditorDesign } from '@/composables/useEditorDesign'
import { BxError } from '@/utils/request'

/** 所有外部依赖都换成可断言的桩；`vi.hoisted` 保证 mock 工厂能引用到它们 */
const mocks = vi.hoisted(() => ({
  activitySelectOne: vi.fn(),
  itemSelectByActivity: vi.fn(),
  optionSelectByItems: vi.fn(),
  activityAdd: vi.fn(),
  activityUpdate: vi.fn(),
  itemAdd: vi.fn(),
  itemUpdate: vi.fn(),
  itemDelete: vi.fn(),
  optionAdd: vi.fn(),
  optionUpdate: vi.fn(),
  optionDelete: vi.fn(),
  confirmDialog: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/daq/editor', () => ({
  activitySelectOne: mocks.activitySelectOne,
  itemSelectByActivity: mocks.itemSelectByActivity,
  optionSelectByItems: mocks.optionSelectByItems,
  activityAdd: mocks.activityAdd,
  activityUpdate: mocks.activityUpdate,
  itemAdd: mocks.itemAdd,
  itemUpdate: mocks.itemUpdate,
  itemDelete: mocks.itemDelete,
  optionAdd: mocks.optionAdd,
  optionUpdate: mocks.optionUpdate,
  optionDelete: mocks.optionDelete,
}))

vi.mock('@/utils/ui', () => ({
  confirmDialog: mocks.confirmDialog,
  toast: mocks.toast,
}))

/** 捕获页面注册的 `onLoad` 回调，测试里直接调用它 */
const registered: { onLoad?: (query?: Record<string, unknown>) => unknown } = {}

vi.mock('@dcloudio/uni-app', () => ({
  onLoad: (fn: (query?: Record<string, unknown>) => unknown) => {
    registered.onLoad = fn
  },
}))

/** `uni.redirectTo` 的桩（跳列表页、新建成功后换地址） */
let uniStub: { redirectTo: ReturnType<typeof vi.fn> }

// ── 服务端返回的固定数据 ──
// 这份数据刻意是**校验能通过**的：无改动的保存路径会先跑 validateDocument，
// 少一个必填列就会变成「校验失败」，测不到「计划为空则短路」那条分支。

const ACTIVITY_ROW: DaqActivityRow = {
  activity_no: 'A1',
  title: '演示问卷',
  classify: 'DAQ202409230006',
  keyword: '演示',
  activity_image: 'F1',
  start_time: '2026-10-01 00:00:00',
  end_time: '2026-10-31 00:00:00',
  remark: '问卷说明',
}

const ITEM_ROWS: DaqItemRow[] = [
  {
    item_no: 'I1',
    item_seq: 1,
    item_title: '第一题',
    item_type: '单选',
    item_type_attr: '{"radioType":"single"}',
  },
  {
    item_no: 'I2',
    item_seq: 2,
    item_title: '第二题',
    item_type: '文本',
    item_type_attr: '{"view_model":"text"}',
  },
]

const OPTION_ROWS: DaqOptionCfgRow[] = [
  { option_no: 'O1', item_no: 'I1', option_value: '甲', option_seq: 1, answer: '是' },
  { option_no: 'O2', item_no: 'I1', option_value: '乙', option_seq: 2 },
]

/** 每次调用都返回新对象：`raw` 行会被文档持有，避免用例之间共享同一份引用 */
const activityEnvelope = () => ({ data: [{ ...ACTIVITY_ROW }] })
const itemEnvelope = () => ({ data: ITEM_ROWS.map(row => ({ ...row })) })
const optionEnvelope = () => ({ data: OPTION_ROWS.map(row => ({ ...row })) })

/** 造一个「已从服务端载入、没有任何改动、且校验能通过」的控制器 */
async function loadedController(): Promise<EditorDesignController> {
  const controller = useEditorDesign()
  registered.onLoad?.({ activity_no: 'A1' })
  await vi.waitFor(() => {
    expect(controller.loaded.value).toBe(true)
  })
  return controller
}

/** 选项的 clientKey 序列，用来断言顺序（下标会变，标识不会） */
function optionKeys(controller: EditorDesignController): string[] {
  return controller.selectedItem.value?.options.map(option => option.clientKey) ?? []
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
  mocks.activitySelectOne.mockImplementation(async () => activityEnvelope())
  mocks.itemSelectByActivity.mockImplementation(async () => itemEnvelope())
  mocks.optionSelectByItems.mockImplementation(async () => optionEnvelope())
  mocks.activityAdd.mockResolvedValue('A-NEW')
  mocks.activityUpdate.mockResolvedValue(null)
  mocks.itemAdd.mockResolvedValue([{ item_no: 'I1' }])
  mocks.itemUpdate.mockResolvedValue(null)
  mocks.itemDelete.mockResolvedValue(null)
  mocks.optionAdd.mockResolvedValue(null)
  mocks.optionUpdate.mockResolvedValue(null)
  mocks.optionDelete.mockResolvedValue(null)
  // 默认「用户点了确定」：需要走取消分支的用例自己覆盖一次
  mocks.confirmDialog.mockResolvedValue(true)

  uniStub = { redirectTo: vi.fn() }
  ;(globalThis as Record<string, unknown>).uni = uniStub
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).uni
})

describe('useEditorDesign · 初始状态与页面契约', () => {
  it('新建：默认停在题目页、没有选中项、没有改动', () => {
    const c = useEditorDesign()

    expect(c.navTitle.value).toBe('新建问卷')
    expect(c.activeTab.value).toBe('items')
    expect(c.addingType.value).toBe(false)
    expect(c.selectedKey.value).toBe('')
    expect(c.selectedIndex.value).toBe(-1)
    expect(c.selectedItem.value).toBeUndefined()
    expect(c.itemDragging.value).toBe(false)
    expect(c.dirty.value).toBe(false)
    expect(c.doc.value.items).toEqual([])
  })

  it('暴露页面解构用到的全部名字', () => {
    // 页面用解构取这些名字；少一个模板里就是 undefined —— 绑定静默失效、不报错
    const bag = useEditorDesign() as unknown as Record<string, unknown>

    const refs = [
      'doc',
      'loading',
      'saving',
      'loaded',
      'loadError',
      'saveError',
      'issues',
      'dirty',
      'selectedKey',
      'selectedIndex',
      'selectedItem',
      'activeTab',
      'addingType',
      'navTitle',
      'itemDragging',
      'itemFromIndex',
      'itemOverIndex',
    ]
    for (const name of refs) {
      expect(name in bag, `缺少状态 ${name}`).toBe(true)
    }

    const methods = [
      'beginItemDrag',
      'onItemDragMove',
      'onItemDragEnd',
      'onItemDragCancel',
      'moveItem',
      'onActivityPatch',
      'onItemPatch',
      'onItemAttrPatch',
      'onItemIssues',
      'onPickType',
      'onRemoveItem',
      'onSelectItem',
      'onClosePanel',
      'onChangeType',
      'onBackToList',
      'onOptionAdd',
      'onOptionRemove',
      'onOptionMoveUp',
      'onOptionMoveDown',
      'onOptionDragDrop',
      'onOptionUpdateValue',
      'onOptionUpdateAnswer',
      'onOptionUpdatePoints',
      'onSave',
      'onDiscard',
    ]
    for (const name of methods) {
      expect(typeof bag[name], `${name} 应是函数`).toBe('function')
    }
  })
})

describe('useEditorDesign · onLoad 的加载路径', () => {
  it('带 activity_no：按活动号拉活动 / 题目 / 选项并组装成文档', async () => {
    const c = await loadedController()

    expect(mocks.activitySelectOne).toHaveBeenCalledWith('A1')
    expect(mocks.itemSelectByActivity).toHaveBeenCalledWith('A1')
    // 选项按题目编号批量取回，而不是按活动号（该服务的服务列里没有 activity_no）
    expect(mocks.optionSelectByItems).toHaveBeenCalledWith(['I1', 'I2'])

    expect(c.doc.value.activity.activityNo).toBe('A1')
    expect(c.doc.value.activity.title).toBe('演示问卷')
    expect(c.doc.value.items.map(item => item.itemNo)).toEqual(['I1', 'I2'])
    expect(c.doc.value.items[0]!.options.map(option => option.optionNo)).toEqual(['O1', 'O2'])
    expect(c.loaded.value).toBe(true)
    // 刚载入的文档与服务端一致，不算改动
    expect(c.dirty.value).toBe(false)
    expect(c.navTitle.value).toBe('问卷设计')
  })

  it('无 activity_no：一条请求都不发，保留新建文档', async () => {
    const c = useEditorDesign()

    registered.onLoad?.({})
    await Promise.resolve()

    expect(mocks.activitySelectOne).not.toHaveBeenCalled()
    expect(mocks.itemSelectByActivity).not.toHaveBeenCalled()
    expect(c.doc.value.activity.activityNo).toBe('')
    expect(c.loaded.value).toBe(false)
    expect(c.navTitle.value).toBe('新建问卷')
  })

  it('activity_no 为空串时同样不加载', async () => {
    const c = useEditorDesign()

    registered.onLoad?.({ activity_no: '' })
    await Promise.resolve()

    expect(mocks.activitySelectOne).not.toHaveBeenCalled()
    expect(c.loaded.value).toBe(false)
  })

  it('活动不存在：loadError 写服务端原因，不进入已加载态', async () => {
    mocks.activitySelectOne.mockResolvedValue({ data: [] })
    const c = useEditorDesign()

    registered.onLoad?.({ activity_no: 'A1' })
    await vi.waitFor(() => {
      expect(c.loadError.value).not.toBe('')
    })

    expect(c.loadError.value).toBe('问卷不存在或已被删除')
    expect(c.loaded.value).toBe(false)
    expect(c.doc.value.items).toEqual([])
  })

  it('加载抛非 BxError：给通用文案', async () => {
    mocks.activitySelectOne.mockRejectedValue(new Error('boom'))
    const c = useEditorDesign()

    registered.onLoad?.({ activity_no: 'A1' })
    await vi.waitFor(() => {
      expect(c.loadError.value).not.toBe('')
    })

    expect(c.loadError.value).toBe('问卷加载失败')
    expect(c.loaded.value).toBe(false)
  })
})

describe('useEditorDesign · 选中与题型', () => {
  it('选中 / 关闭面板维护 selectedKey、selectedIndex、selectedItem', async () => {
    const c = await loadedController()
    const second = c.doc.value.items[1]!

    c.onSelectItem(second.clientKey)
    expect(c.selectedKey.value).toBe(second.clientKey)
    expect(c.selectedIndex.value).toBe(1)
    expect(c.selectedItem.value?.itemNo).toBe('I2')

    c.onClosePanel()
    expect(c.selectedKey.value).toBe('')
    expect(c.selectedIndex.value).toBe(-1)
    expect(c.selectedItem.value).toBeUndefined()
  })

  it('onPickType：收起题型面板、新增题目并自动选中它', () => {
    const c = useEditorDesign()
    c.addingType.value = true
    c.activeTab.value = 'info'

    c.onPickType('单选')

    expect(c.addingType.value).toBe(false)
    // 加完题要停在题目列表上，否则用户看不到刚加的那道题
    expect(c.activeTab.value).toBe('items')
    expect(c.doc.value.items).toHaveLength(1)
    expect(c.selectedKey.value).toBe(c.doc.value.items[0]!.clientKey)
    expect(c.selectedItem.value?.type).toBe('单选')
    expect(c.selectedItem.value?.options).toHaveLength(2)
    expect(c.dirty.value).toBe(true)
  })

  it('onPickType 未知题型：只提示、不插坏题、不改选中项', () => {
    const c = useEditorDesign()
    c.onPickType('单选')
    const selected = c.selectedKey.value
    c.addingType.value = true

    c.onPickType('不存在的题型')

    expect(mocks.toast).toHaveBeenCalledWith('暂不支持题型「不存在的题型」')
    expect(c.doc.value.items).toHaveLength(1)
    expect(c.selectedKey.value).toBe(selected)
    // 面板仍要收起：用户看到提示后不该继续停在题型面板上
    expect(c.addingType.value).toBe(false)
  })

  it('onChangeType 换到图片题：attr 换成新题型的键、选项被清空', async () => {
    const c = await loadedController()
    const item = c.doc.value.items[0]!
    c.onSelectItem(item.clientKey)
    expect(item.attr).toEqual({ radioType: 'single' })
    expect(item.options).toHaveLength(2)

    c.onChangeType('图片')

    expect(item.type).toBe('图片')
    expect(Object.keys(item.attr)).toEqual(['fileNum'])
    expect(item.options).toEqual([])
  })

  it('onChangeType 换到多选：原本没有选项的文本题补 2 个选项', async () => {
    const c = await loadedController()
    const text = c.doc.value.items[1]!
    c.onSelectItem(text.clientKey)
    expect(text.options).toEqual([])

    c.onChangeType('多选')

    expect(text.type).toBe('多选')
    expect(text.attr).toEqual({ radioType: 'multi' })
    expect(text.options).toHaveLength(2)
  })

  it('未选中题目时 onItemPatch / onItemAttrPatch / onChangeType 都不动文档', async () => {
    const c = await loadedController()
    const before = JSON.stringify(c.doc.value)

    c.onChangeType('图片')
    c.onItemPatch({ title: '乱改' })
    c.onItemAttrPatch({ x: 1 })

    expect(JSON.stringify(c.doc.value)).toBe(before)
    expect(c.dirty.value).toBe(false)
  })

  it('onItemPatch / onItemAttrPatch 只改选中的那一题，attr 是合并而不是替换', async () => {
    const c = await loadedController()
    const [first, second] = c.doc.value.items
    c.onSelectItem(first!.clientKey)

    c.onItemPatch({ title: '改过的标题' })
    c.onItemAttrPatch({ fileNum: 3 })

    expect(first!.title).toBe('改过的标题')
    expect(first!.attr).toEqual({ radioType: 'single', fileNum: 3 })
    expect(second!.title).toBe('第二题')
  })

  it('onItemIssues 只返回该题自己的问题', async () => {
    const c = await loadedController()
    const [first, second] = c.doc.value.items
    c.onSelectItem(first!.clientKey)
    c.onItemPatch({ title: '   ' })

    expect(c.onItemIssues(first!.clientKey).map(issue => issue.field)).toEqual(['title'])
    // 另一道题是好的，不能被连带标红
    expect(c.onItemIssues(second!.clientKey)).toEqual([])
  })
})

describe('useEditorDesign · 删除题目', () => {
  it('已保存的题目：确认文案说明服务端会一起删，确认后移除并清空选中', async () => {
    const c = await loadedController()
    const item = c.doc.value.items[0]!
    c.onSelectItem(item.clientKey)

    await c.onRemoveItem(item.clientKey)

    expect(mocks.confirmDialog).toHaveBeenCalledWith(
      '确定删除「第一题」吗？保存后服务端的这道题与它的选项都会被删除。',
    )
    expect(c.doc.value.items.map(i => i.itemNo)).toEqual(['I2'])
    expect(c.selectedKey.value).toBe('')
    expect(c.selectedIndex.value).toBe(-1)
    expect(c.dirty.value).toBe(true)
  })

  it('取消确认：题目与选中项都原样保留', async () => {
    const c = await loadedController()
    const item = c.doc.value.items[0]!
    c.onSelectItem(item.clientKey)
    mocks.confirmDialog.mockResolvedValueOnce(false)

    await c.onRemoveItem(item.clientKey)

    expect(c.doc.value.items.map(i => i.itemNo)).toEqual(['I1', 'I2'])
    expect(c.selectedKey.value).toBe(item.clientKey)
    expect(c.dirty.value).toBe(false)
  })

  it('未保存的新增题目：文案说明不影响服务端，标题为空时用「这道题」', async () => {
    const c = useEditorDesign()
    c.onPickType('文本')

    await c.onRemoveItem(c.selectedKey.value)

    expect(mocks.confirmDialog).toHaveBeenCalledWith(
      '确定删除「这道题」吗？这道题还没保存，删除后不会影响服务端。',
    )
    expect(c.doc.value.items).toEqual([])
    expect(c.selectedKey.value).toBe('')
  })

  it('删除的不是选中项时不动选中项', async () => {
    const c = await loadedController()
    const [first, second] = c.doc.value.items
    c.onSelectItem(second!.clientKey)

    await c.onRemoveItem(first!.clientKey)

    expect(c.doc.value.items.map(i => i.itemNo)).toEqual(['I2'])
    expect(c.selectedKey.value).toBe(second!.clientKey)
    expect(c.selectedIndex.value).toBe(0)
  })

  it('clientKey 不存在时不弹确认、不改文档', async () => {
    const c = await loadedController()

    await c.onRemoveItem('item-does-not-exist')

    expect(mocks.confirmDialog).not.toHaveBeenCalled()
    expect(c.doc.value.items).toHaveLength(2)
  })
})

describe('useEditorDesign · 选项增删与排序', () => {
  /** 载入文档并选中那道带选项的单选题目 */
  async function selectedChoice(): Promise<EditorDesignController> {
    const c = await loadedController()
    c.onSelectItem(c.doc.value.items[0]!.clientKey)
    return c
  }

  it('onOptionAdd 往选中题目追加一个空选项', async () => {
    const c = await selectedChoice()
    const before = c.selectedItem.value!.options.length

    c.onOptionAdd()

    const options = c.selectedItem.value!.options
    expect(options).toHaveLength(before + 1)
    expect(options[options.length - 1]!.value).toBe('')
  })

  it('上移第一个 / 下移最后一个都是空操作', async () => {
    const c = await selectedChoice()
    const original = optionKeys(c)

    c.onOptionMoveUp(0)
    c.onOptionMoveDown(original.length - 1)

    expect(optionKeys(c)).toEqual(original)
  })

  it('上移 / 下移在中间位置互换相邻两项', async () => {
    const c = await selectedChoice()
    c.onOptionAdd()
    const [first, second, third] = optionKeys(c)

    c.onOptionMoveUp(2)
    expect(optionKeys(c)).toEqual([first, third, second])

    c.onOptionMoveDown(0)
    expect(optionKeys(c)).toEqual([third, first, second])
  })

  it('onOptionDragDrop 把选项搬到目标位置，同位置与越界都不动', async () => {
    const c = await selectedChoice()
    c.onOptionAdd()
    const [first, second, third] = optionKeys(c)

    c.onOptionDragDrop(0, 2)
    expect(optionKeys(c)).toEqual([second, third, first])

    const after = optionKeys(c)
    c.onOptionDragDrop(1, 1)
    c.onOptionDragDrop(0, 9)
    c.onOptionDragDrop(-1, 0)
    expect(optionKeys(c)).toEqual(after)
  })

  it('onOptionRemove 按选项标识删除，下标越界时不删任何东西', async () => {
    const c = await selectedChoice()
    const [first, second] = c.selectedItem.value!.options

    c.onOptionRemove(9)
    expect(optionKeys(c)).toEqual([first!.clientKey, second!.clientKey])

    c.onOptionRemove(0)
    expect(optionKeys(c)).toEqual([second!.clientKey])
  })

  it('未选中题目时所有选项操作都是空操作', async () => {
    const c = await loadedController()
    const before = JSON.stringify(c.doc.value)

    c.onOptionAdd()
    c.onOptionRemove(0)
    c.onOptionMoveUp(1)
    c.onOptionMoveDown(0)
    c.onOptionDragDrop(0, 1)
    c.onOptionUpdateValue(0, 'x')
    c.onOptionUpdateAnswer(0, true)
    c.onOptionUpdatePoints(0, 9)

    expect(JSON.stringify(c.doc.value)).toBe(before)
    expect(c.dirty.value).toBe(false)
  })

  it('onOptionUpdateValue / Points 按位置改到对应选项', async () => {
    const c = await selectedChoice()

    c.onOptionUpdateValue(1, '乙改')
    c.onOptionUpdatePoints(1, 5)

    const options = c.selectedItem.value!.options
    expect(options[0]!.value).toBe('甲')
    expect(options[1]!.value).toBe('乙改')
    expect(options[1]!.points).toBe(5)
  })

  it('onOptionUpdateAnswer 走单选互斥：勾第二个会顶掉第一个', async () => {
    // 若页面把 isAnswer 直接写进选项、而不是转发给 useEditorDocument，
    // 这条会红：单选题能同时勾出两个正确答案，直到保存才被拦下
    const c = await selectedChoice()
    expect(c.selectedItem.value!.options.map(option => option.isAnswer)).toEqual([true, false])

    c.onOptionUpdateAnswer(1, true)

    expect(c.selectedItem.value!.options.map(option => option.isAnswer)).toEqual([false, true])
  })

  it('onOptionUpdate* 下标越界时不抛异常也不改动', async () => {
    const c = await selectedChoice()
    const before = JSON.stringify(c.selectedItem.value!.options)

    expect(() => {
      c.onOptionUpdateValue(9, 'x')
      c.onOptionUpdateAnswer(-1, true)
      c.onOptionUpdatePoints(9, 3)
    }).not.toThrow()

    expect(JSON.stringify(c.selectedItem.value!.options)).toBe(before)
  })
})

describe('useEditorDesign · moveItem 与拖拽重排', () => {
  const titlesOf = (c: EditorDesignController) => c.doc.value.items.map(item => item.title)

  /** 三题文档：顺序断言用标题，比 item_no 更直观 */
  async function threeItems(): Promise<EditorDesignController> {
    mocks.itemSelectByActivity.mockResolvedValue({
      data: [
        { item_no: 'I1', item_seq: 1, item_title: '第一题', item_type: '文本', item_type_attr: '{"view_model":"text"}' },
        { item_no: 'I2', item_seq: 2, item_title: '第二题', item_type: '文本', item_type_attr: '{"view_model":"text"}' },
        { item_no: 'I3', item_seq: 3, item_title: '第三题', item_type: '文本', item_type_attr: '{"view_model":"text"}' },
      ],
    })
    mocks.optionSelectByItems.mockResolvedValue({ data: [] })
    return loadedController()
  }

  it('moveItem 搬到目标位置，同位置与越界都不动', async () => {
    const c = await threeItems()

    c.moveItem(0, 2)
    expect(titlesOf(c)).toEqual(['第二题', '第三题', '第一题'])

    c.moveItem(2, 0)
    expect(titlesOf(c)).toEqual(['第一题', '第二题', '第三题'])

    c.moveItem(1, 1)
    c.moveItem(0, 9)
    c.moveItem(-1, 1)
    expect(titlesOf(c)).toEqual(['第一题', '第二题', '第三题'])
  })

  it('拖满一行才换位，松手后顺序跟着变、拖拽态复位', async () => {
    const c = await threeItems()

    c.beginItemDrag(0, { clientY: 100 })
    expect(c.itemDragging.value).toBe(true)
    expect(c.itemFromIndex.value).toBe(0)
    expect(c.itemOverIndex.value).toBe(0)

    // 拖动不足一行：落点仍在原位，松手即原样（可撤销的手感）
    c.onItemDragMove({ clientY: 100 + ITEM_ROW_HEIGHT - 1 })
    expect(c.itemOverIndex.value).toBe(0)
    c.onItemDragEnd()
    expect(titlesOf(c)).toEqual(['第一题', '第二题', '第三题'])

    // 拖满两行：落点算到第 3 行，松手真的搬过去
    c.beginItemDrag(0, { clientY: 100 })
    c.onItemDragMove({ clientY: 100 + ITEM_ROW_HEIGHT * 2 })
    expect(c.itemOverIndex.value).toBe(2)
    c.onItemDragEnd()

    expect(titlesOf(c)).toEqual(['第二题', '第三题', '第一题'])
    expect(c.itemDragging.value).toBe(false)
    expect(c.itemFromIndex.value).toBe(-1)
    expect(c.itemOverIndex.value).toBe(-1)
  })

  it('取消拖拽不重排，顺序原样保留', async () => {
    const c = await threeItems()

    c.beginItemDrag(0, { clientY: 100 })
    c.onItemDragMove({ clientY: 100 + ITEM_ROW_HEIGHT * 2 })
    c.onItemDragCancel()

    expect(titlesOf(c)).toEqual(['第一题', '第二题', '第三题'])
    expect(c.itemDragging.value).toBe(false)
    expect(c.itemFromIndex.value).toBe(-1)
    expect(c.itemOverIndex.value).toBe(-1)
  })

  it('读不到按下坐标时不进入拖拽态；没开始拖拽时移动 / 松手都是空操作', async () => {
    const c = await threeItems()

    // 坐标为 0 是视口顶部的合法值，读不到必须是 null 而不是退化成 0
    c.beginItemDrag(0, null)
    expect(c.itemDragging.value).toBe(false)
    expect(c.itemFromIndex.value).toBe(-1)

    c.onItemDragMove({ clientY: 500 })
    c.onItemDragEnd()

    expect(titlesOf(c)).toEqual(['第一题', '第二题', '第三题'])
    expect(c.itemOverIndex.value).toBe(-1)
  })

  it('拖拽中读到坏坐标时落点保持不变（不退回第 0 行）', async () => {
    const c = await threeItems()

    c.beginItemDrag(1, { clientY: 100 })
    c.onItemDragMove({ clientY: 100 + ITEM_ROW_HEIGHT * 2 })
    expect(c.itemOverIndex.value).toBe(2)

    // 事件里没有可用坐标时不能把落点算成 0：那会把行搬到用户没指的位置
    c.onItemDragMove({})
    c.onItemDragMove(null)
    expect(c.itemOverIndex.value).toBe(2)
    expect(c.itemDragging.value).toBe(true)
  })
})

describe('useEditorDesign · 保存', () => {
  it('有改动时只发要改的活动更新，成功后重载', async () => {
    const c = await loadedController()
    c.onActivityPatch({ title: '改过的标题' })
    expect(c.dirty.value).toBe(true)

    await c.onSave()

    expect(mocks.activityUpdate).toHaveBeenCalledTimes(1)
    const [activityNo, payload] = mocks.activityUpdate.mock.calls[0] as [string, Record<string, unknown>]
    expect(activityNo).toBe('A1')
    expect(payload.title).toBe('改过的标题')
    // 派生列与主键一律不发：发了就是「前端算一遍、服务端再算一遍」的两处口径
    expect(payload).not.toHaveProperty('activity_no')
    expect(payload).not.toHaveProperty('classify_path')
    expect(payload).not.toHaveProperty('classify_name')
    expect(mocks.toast).toHaveBeenCalledWith('已保存', 'success')
    // 保存成功后整体重载（载入时一次 + 保存后一次），界面显示库里真实的样子
    expect(mocks.activitySelectOne).toHaveBeenCalledTimes(2)
    expect(uniStub.redirectTo).not.toHaveBeenCalled()
  })

  it('新建保存：建活动 → 建题目 → 建选项，成功后跳到带编号的编辑地址', async () => {
    const c = useEditorDesign()
    c.onActivityPatch({
      title: '新问卷',
      classify: 'DAQ202409230006',
      keyword: '新',
      activityImage: 'F1',
      remark: '说明',
    })
    c.onPickType('单选')
    c.onItemPatch({ title: '题目一' })
    c.onOptionUpdateValue(0, '甲')
    c.onOptionUpdateValue(1, '乙')
    // 先调换顺序：序号应当跟着位置走，A 给排在前面的那个
    c.onOptionDragDrop(0, 1)

    await c.onSave()

    expect(mocks.activityAdd).toHaveBeenCalledTimes(1)
    const activityRow = (mocks.activityAdd.mock.calls[0] as [Record<string, unknown>])[0]
    expect(activityRow.title).toBe('新问卷')

    expect(mocks.itemAdd).toHaveBeenCalledTimes(1)
    const itemRows = (mocks.itemAdd.mock.calls[0] as [Array<Record<string, unknown>>])[0]
    expect(itemRows).toHaveLength(1)
    expect(itemRows[0]!.item_seq).toBe(1)
    expect(itemRows[0]!.item_type_attr).toBe('{"radioType":"single"}')

    const optionRows = (mocks.optionAdd.mock.calls[0] as [Array<Record<string, unknown>>])[0]
    expect(optionRows.map(row => row.option_value)).toEqual(['乙', '甲'])
    expect(optionRows.map(row => row.option_view_no)).toEqual(['A', 'B'])
    expect(optionRows.map(row => row.option_seq)).toEqual([1, 2])
    // 新题目的 item_no 由服务端回填，选项不能插成无主选项
    expect(optionRows.map(row => row.item_no)).toEqual(['I1', 'I1'])

    expect(mocks.toast).toHaveBeenCalledWith('已保存', 'success')
    // 不换地址的话，刷新会回到空白新建页，用户可能再建一份重复问卷
    expect(uniStub.redirectTo).toHaveBeenCalledWith({
      url: '/pages/editor/design/index?activity_no=A-NEW',
    })
  })

  it('校验失败（活动级问题）：切回「问卷信息」标签并提示第一条', async () => {
    const c = await loadedController()
    c.onActivityPatch({ title: '' })
    // 只清一个必填，所以恰好一条问题 —— describeIssues 对单条不再追加「共 N 项」
    expect(c.issues.value.map(issue => issue.field)).toEqual(['activity.title'])

    await c.onSave()

    expect(c.activeTab.value).toBe('info')
    expect(c.selectedKey.value).toBe('')
    expect(mocks.toast).toHaveBeenCalledWith('请填写问卷标题')
    expect(mocks.activityUpdate).not.toHaveBeenCalled()
    expect(mocks.toast).not.toHaveBeenCalledWith('已保存', 'success')
  })

  it('校验失败（题目级问题）：切到题目标签并选中出问题的那道题', async () => {
    const c = await loadedController()
    const item = c.doc.value.items[0]!
    c.onSelectItem(item.clientKey)
    c.onItemPatch({ title: '' })
    // 用户此刻在信息页：定位要能把他拽回题目页
    c.activeTab.value = 'info'
    expect(c.issues.value.map(issue => issue.field)).toEqual(['title'])

    await c.onSave()

    expect(c.activeTab.value).toBe('items')
    expect(c.selectedKey.value).toBe(item.clientKey)
    expect(c.selectedIndex.value).toBe(0)
    expect(mocks.toast).toHaveBeenCalledWith('请填写题目标题')
    expect(mocks.activityUpdate).not.toHaveBeenCalled()
  })

  it('多条问题：提示语带上总数，定位仍看第一条（活动级优先）', async () => {
    const c = await loadedController()
    const item = c.doc.value.items[0]!
    c.onSelectItem(item.clientKey)
    c.onItemPatch({ title: '' })
    c.onActivityPatch({ title: '' })
    expect(c.issues.value).toHaveLength(2)

    await c.onSave()

    expect(mocks.toast).toHaveBeenCalledWith('请填写问卷标题（共 2 项待修正）')
    expect(c.activeTab.value).toBe('info')
  })

  it('本次会删东西时先二次确认，取消则一条写请求都不发', async () => {
    const c = await loadedController()
    await c.onRemoveItem(c.doc.value.items[0]!.clientKey)
    mocks.confirmDialog.mockResolvedValueOnce(false)

    await c.onSave()

    expect(mocks.confirmDialog).toHaveBeenLastCalledWith(
      '本次保存会删除 1 道题、2 个选项，删除后无法恢复。确定继续吗？',
    )
    expect(mocks.itemDelete).not.toHaveBeenCalled()
    expect(mocks.optionDelete).not.toHaveBeenCalled()
    expect(mocks.toast).not.toHaveBeenCalledWith('已保存', 'success')

    // 用户改主意点了确定：先删选项再删题目（顺序有实测依据，不赌级联）
    mocks.confirmDialog.mockResolvedValueOnce(true)
    await c.onSave()
    expect(mocks.optionDelete).toHaveBeenCalledWith(['O1', 'O2'])
    expect(mocks.itemDelete).toHaveBeenCalledWith(['I1'])
    expect(mocks.toast).toHaveBeenCalledWith('已保存', 'success')
  })

  it('只删了选项（没删题目）也要二次确认，计数按实际删的东西算', async () => {
    const c = await loadedController()
    c.onSelectItem(c.doc.value.items[0]!.clientKey)
    c.onOptionRemove(0)

    await c.onSave()

    expect(mocks.confirmDialog).toHaveBeenLastCalledWith(
      '本次保存会删除 0 道题、1 个选项，删除后无法恢复。确定继续吗？',
    )
    expect(mocks.optionDelete).toHaveBeenCalledWith(['O1'])
    expect(mocks.itemDelete).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('已保存', 'success')
  })

  it('保存进行中重复点保存不会发第二次请求', async () => {
    const c = await loadedController()
    c.onActivityPatch({ title: '改过的标题' })
    mocks.activityUpdate.mockReturnValue(new Promise(() => {}))

    const first = c.onSave()
    await c.onSave()

    expect(mocks.activityUpdate).toHaveBeenCalledTimes(1)
    expect(c.saving.value).toBe(true)
    void first
  })

  it('保存报 BxError：提示服务端原因并写进 saveError', async () => {
    const c = await loadedController()
    c.onActivityPatch({ title: '改过的标题' })
    mocks.activityUpdate.mockRejectedValue(new BxError('系统繁忙，请稍后再试', 'FAILURE'))

    await c.onSave()

    expect(mocks.toast).toHaveBeenCalledWith('系统繁忙，请稍后再试')
    expect(c.saveError.value).toBe('系统繁忙，请稍后再试')
    expect(c.saving.value).toBe(false)
  })

  it('保存报未知异常：给通用文案', async () => {
    const c = await loadedController()
    c.onActivityPatch({ title: '改过的标题' })
    mocks.activityUpdate.mockRejectedValue(new Error('boom'))

    await c.onSave()

    expect(mocks.toast).toHaveBeenCalledWith('保存失败，请稍后重试')
    expect(c.saveError.value).toBe('保存失败，请稍后重试')
  })
})

describe('useEditorDesign · 放弃与返回', () => {
  it('确认放弃：文档回到载入时的快照并提示', async () => {
    const c = await loadedController()
    c.onActivityPatch({ title: '改过的标题' })
    c.onPickType('文本')
    expect(c.dirty.value).toBe(true)

    await c.onDiscard()

    expect(mocks.confirmDialog).toHaveBeenCalledWith('放弃未保存的修改吗？')
    expect(c.doc.value.activity.title).toBe('演示问卷')
    expect(c.doc.value.items.map(item => item.itemNo)).toEqual(['I1', 'I2'])
    expect(c.dirty.value).toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith('已放弃修改')
  })

  it('取消放弃：改动与 dirty 都保留，不提示', async () => {
    const c = await loadedController()
    c.onActivityPatch({ title: '改过的标题' })
    mocks.confirmDialog.mockResolvedValueOnce(false)

    await c.onDiscard()

    expect(c.doc.value.activity.title).toBe('改过的标题')
    expect(c.dirty.value).toBe(true)
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('返回列表走 uni.redirectTo', async () => {
    const c = await loadedController()

    c.onBackToList()

    expect(uniStub.redirectTo).toHaveBeenCalledWith({ url: '/pages/editor/list/index' })
  })
})

describe('useEditorDesign · 回归防护', () => {
  it('换题型必须把 attr 与选项一起重置', async () => {
    // 如果这条红了，说明「换题型」只改了 type：
    // 旧题型的 attr 键（如 dateType）会留在新题型上，旧选项也会被写进选项表，
    // 用户看到「图片题带着日期配置」和一堆永远不显示的脏选项，且它们真的会存库。
    const c = await loadedController()
    const item = c.doc.value.items[0]!
    c.onSelectItem(item.clientKey)
    c.onItemAttrPatch({ dateType: 'datetime' })
    expect(item.attr).toEqual({ radioType: 'single', dateType: 'datetime' })

    c.onChangeType('图片')

    expect(Object.keys(item.attr)).toEqual(['fileNum'])
    expect(item.options).toEqual([])
  })

  it('新建页一打开不算「有改动」，但默认有效期已经就位', async () => {
    // 如果这条红了，说明页面自己去填了默认值、或默认有效期被当成了真实改动：
    // 表现是新建页一打开就出现「放弃」按钮 —— 用户一个字都没填却被告知有未保存的修改。
    const c = useEditorDesign()
    registered.onLoad?.({})

    expect(c.dirty.value).toBe(false)
    expect(c.doc.value.activity.startTime).not.toBe('')
    expect(c.doc.value.activity.endTime).not.toBe('')
    expect(c.selectedKey.value).toBe('')
  })

  it('打开已有问卷后直接保存，一条写请求都不能发', async () => {
    // 如果这条红了，说明「计划为空则短路」失效：
    // 打开即保存会把活动和题目全量重写；配合「当前没有 = 已删除」的判定，
    // 还可能把服务端上被显隐过滤掉的题目真删掉 —— 静默的数据丢失。
    const c = await loadedController()
    expect(c.dirty.value).toBe(false)

    await c.onSave()

    const writes = [
      'activityAdd',
      'activityUpdate',
      'itemAdd',
      'itemUpdate',
      'itemDelete',
      'optionAdd',
      'optionUpdate',
      'optionDelete',
    ] as const
    for (const name of writes) {
      expect(mocks[name], `${name} 不该被调用`).not.toHaveBeenCalled()
    }
  })
})
