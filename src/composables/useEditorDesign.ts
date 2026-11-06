/**
 * 可视化问卷设计器的页面逻辑
 *
 * 页面（`pages/editor/design/index.vue`）只保留模板、样式与绑定，题目增删改排序、
 * 选项编辑、拖拽重排、保存编排与校验定位都在这里。
 *
 * ## 为什么抽出来
 *
 * 这些处理函数原先挤在页面里，其中一大批（`onItemPatch` / `onOptionUpdateValue` 之类）
 * 只是把子组件的 emit 原样转给 `useEditorDocument`，页面于是同时承担「模板绑定」
 * 与「业务编排」两件事。抽到这里之后页面回到纯绑定，转发这一层也有了唯一去处：
 * 将来加「保存前自动暂存」之类的横切逻辑，只改这一个文件。
 *
 * ## 拖拽排序
 *
 * 题目列表的拖拽浮层覆盖整页（拖到列表外也能接住指针），
 * 落点由 `usePointerReorder` 按**相对位移**算出，不查询 DOM。
 * 选项列表在题目面板内部，用自己的一层浮层（见 `EditorOptionEditor`）。
 *
 * ## 保存
 *
 * 校验失败时**留在本页并跳到第一个出问题的位置**（题目问题 → 选中那道题；
 * 活动问题 → 切回「问卷信息」标签）。只弹一个 toast 的话，用户知道有错却不知道改哪。
 */

import type { ComputedRef, Ref } from 'vue'
import type { EditorActivity, EditorDocument, EditorIssue, EditorItem } from '@/domain/editor'

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref, watch } from 'vue'

import { ITEM_ROW_HEIGHT } from '@/components/editor/constants'
import { useEditorDocument } from '@/composables/useEditorDocument'
import { usePointerReorder } from '@/composables/usePointerReorder'
import {
  describeIssues,
  editorDesignUrl,
  editorListUrl,
  planSummary,
} from '@/domain/editor'
import { EditorValidationError } from '@/domain/editor/validation'
import { readQuery } from '@/utils/query'
import { BxError } from '@/utils/request'
import { confirmDialog, toast } from '@/utils/ui'

export interface EditorDesignController {
  /** 当前编辑中的文档（题目列表、活动字段都从这里读） */
  doc: Ref<EditorDocument>
  loading: Ref<boolean>
  saving: Ref<boolean>
  loaded: Ref<boolean>
  /** 读取失败的原因 */
  loadError: Ref<string>
  /** 保存失败的原因 */
  saveError: Ref<string>
  /** 当前全部校验问题（活动表单用来逐字段标注） */
  issues: ComputedRef<EditorIssue[]>
  /** 是否存在未保存的改动 */
  dirty: ComputedRef<boolean>
  /** 当前选中的题目（`clientKey`）；空串表示未选中 */
  selectedKey: Ref<string>
  /** 选中题目在列表中的下标；未选中为 -1 */
  selectedIndex: ComputedRef<number>
  /** 选中的题目对象；未选中为 `undefined` */
  selectedItem: ComputedRef<EditorItem | undefined>
  /** 窄屏下的标签页；宽屏由 CSS 强制两个区都显示 */
  activeTab: Ref<'info' | 'items'>
  /** 是否展开「添加题目」的题型面板 */
  addingType: Ref<boolean>
  navTitle: ComputedRef<string>
  /** 题目拖拽状态（模板据此渲染浮层与落点高亮） */
  itemDragging: Ref<boolean>
  itemFromIndex: Ref<number>
  itemOverIndex: Ref<number>
  beginItemDrag: (index: number, event: unknown) => void
  onItemDragMove: (event: unknown) => void
  onItemDragEnd: () => void
  onItemDragCancel: () => void
  /** 改活动字段 */
  onActivityPatch: (patch: Partial<EditorActivity>) => void
  /** 改选中题目的字段 */
  onItemPatch: (patch: Partial<EditorItem>) => void
  /** 改选中题目的 `item_type_attr` */
  onItemAttrPatch: (patch: Record<string, unknown>) => void
  /** 取某道题的校验问题（列表行用来标红） */
  onItemIssues: (clientKey: string) => EditorIssue[]
  onPickType: (type: string) => void
  onRemoveItem: (clientKey: string) => Promise<void>
  /** 复制题目：副本插在原题之后并自动选中 */
  onDuplicateItem: (clientKey: string) => void
  onSelectItem: (clientKey: string) => void
  onClosePanel: () => void
  onChangeType: (type: string) => void
  onBackToList: () => void
  onOptionAdd: () => void
  /** 批量替换选项文案（粘贴多行文本） */
  onOptionReplaceAll: (values: string[]) => void
  onOptionRemove: (index: number) => void
  onOptionMoveUp: (index: number) => void
  onOptionMoveDown: (index: number) => void
  onOptionDragDrop: (from: number, to: number) => void
  onOptionUpdateValue: (index: number, value: string) => void
  onOptionUpdateAnswer: (index: number, isAnswer: boolean) => void
  onOptionUpdatePoints: (index: number, points: number) => void
  onSave: () => Promise<void>
  onDiscard: () => Promise<void>
  /** 移动题目（列表行上的上移/下移按钮直接用，不经转发函数） */
  moveItem: (from: number, to: number) => void
}

export function useEditorDesign(): EditorDesignController {
  const {
    doc,
    loading,
    saving,
    loaded,
    loadError,
    saveError,
    issues,
    plan,
    dirty,
    isNew,
    load,
    save,
    discard,
    itemIssues,
    findItem,
    patchActivity,
    patchItem,
    patchItemAttr,
    addItem,
    duplicateItem,
    removeItem,
    moveItem,
    changeItemType,
    addOption,
    replaceOptions,
    removeOption,
    moveOption,
    setOptionValue,
    setOptionPoints,
    setOptionAnswer,
  } = useEditorDocument()

  /** 本次保存会做哪些操作的数量，用于「会删几道题」的二次确认 */
  const planCounts = computed(() => planSummary(plan.value))

  /** 当前选中的题目（`clientKey`）；空串表示未选中 */
  const selectedKey = ref('')
  /** 窄屏下的标签页；宽屏由 CSS 强制两个区都显示 */
  const activeTab = ref<'info' | 'items'>('items')
  /** 是否展开「添加题目」的题型面板 */
  const addingType = ref(false)

  const selectedIndex = computed(() =>
    doc.value.items.findIndex(item => item.clientKey === selectedKey.value),
  )
  const selectedItem = computed<EditorItem | undefined>(() =>
    selectedIndex.value >= 0 ? doc.value.items[selectedIndex.value] : undefined,
  )

  /**
   * 记住当前选中题目的平台编号
   *
   * 保存成功后 `useEditorDocument` 会整体重载，`documentFromRows` 给每道题**重新生成**
   * `clientKey`。选中态按 `clientKey` 记，重载后就对不上 —— 右栏跳回「问卷信息」、
   * 窄屏浮层被关掉，用户保存一次就被踢出当前编辑位置。
   * 这里按 `item_no`（平台主键，重载前后不变）把选中态找回来。
   */
  let selectedItemNo = ''

  watch(selectedItem, (item) => {
    if (item) {
      selectedItemNo = item.itemNo
    }
  })

  watch(() => doc.value.items, (items) => {
    if (!selectedKey.value || !selectedItemNo) {
      return
    }
    // 当前 clientKey 还在（没有重载）就不用管
    if (items.some(item => item.clientKey === selectedKey.value)) {
      return
    }
    const restored = items.find(item => item.itemNo === selectedItemNo)
    if (restored) {
      selectedKey.value = restored.clientKey
    }
  })

  const navTitle = computed(() => (isNew.value ? '新建问卷' : '问卷设计'))

  const {
    dragging: itemDragging,
    fromIndex: itemFromIndex,
    overIndex: itemOverIndex,
    begin: beginItemDrag,
    onMove: onItemDragMove,
    onEnd: onItemDragEnd,
    onCancel: onItemDragCancel,
  } = usePointerReorder({
    rowHeight: ITEM_ROW_HEIGHT,
    count: () => doc.value.items.length,
    onDrop: (from, to) => moveItem(from, to),
  })

  onLoad((query) => {
    const activityNo = readQuery(query, 'activity_no')
    if (activityNo) {
      void load(activityNo)
    }
    // 新建：初始文档（含默认有效期）由 `useEditorDocument` 提供，页面不再自己填，
    // 否则「默认值」会被当成一次真实改动，一打开就显示「放弃」
  })

  // ── 活动字段 ──

  /** 一律走 `useEditorDocument`：它负责置「动过」标记，直接改文档会让 `dirty` 失真 */
  function onActivityPatch(patch: Partial<EditorActivity>): void {
    patchActivity(patch)
  }

  // ── 题目字段 ──

  function onItemPatch(patch: Partial<EditorItem>): void {
    if (selectedKey.value) {
      patchItem(selectedKey.value, patch)
    }
  }

  function onItemAttrPatch(patch: Record<string, unknown>): void {
    if (selectedKey.value) {
      patchItemAttr(selectedKey.value, patch)
    }
  }

  function onItemIssues(clientKey: string): EditorIssue[] {
    return itemIssues(clientKey)
  }

  // ── 题目增删改与排序 ──

  function onPickType(type: string): void {
    addingType.value = false
    const item = addItem(type)
    if (!item) {
      toast(`暂不支持题型「${type}」`)
      return
    }
    selectedKey.value = item.clientKey
    activeTab.value = 'items'
  }

  /** 复制题目：副本插在原题之后并选中它，方便直接改文案 */
  function onDuplicateItem(clientKey: string): void {
    const copy = duplicateItem(clientKey)
    if (copy) {
      selectedKey.value = copy.clientKey
    }
  }

  async function onRemoveItem(clientKey: string): Promise<void> {
    const item = findItem(clientKey)
    if (!item) {
      return
    }
    const label = item.title.trim() || '这道题'
    // 已存在的题目会在保存时被真删，必须说清楚；新增但未保存的只是本地移除
    const consequence = item.itemNo
      ? '保存后服务端的这道题与它的选项都会被删除。'
      : '这道题还没保存，删除后不会影响服务端。'
    const confirmed = await confirmDialog(`确定删除「${label}」吗？${consequence}`)
    if (!confirmed) {
      return
    }
    removeItem(clientKey)
    if (selectedKey.value === clientKey) {
      selectedKey.value = ''
    }
  }

  function onSelectItem(clientKey: string): void {
    selectedKey.value = clientKey
  }

  function onClosePanel(): void {
    selectedKey.value = ''
  }

  function onChangeType(type: string): void {
    const item = selectedItem.value
    if (item) {
      changeItemType(item.clientKey, type)
    }
  }

  function onBackToList(): void {
    uni.redirectTo({ url: editorListUrl() })
  }

  // ── 选项 ──

  function onOptionAdd(): void {
    const item = selectedItem.value
    if (item) {
      addOption(item.clientKey)
    }
  }

  /** 批量替换选项（粘贴多行文本）：一次把整份清单贴进来，不用一行行加 */
  function onOptionReplaceAll(values: string[]): void {
    const item = selectedItem.value
    if (item) {
      replaceOptions(item.clientKey, values)
    }
  }

  function onOptionRemove(index: number): void {
    const item = selectedItem.value
    const optionKey = item?.options[index]?.clientKey
    if (item && optionKey) {
      removeOption(item.clientKey, optionKey)
    }
  }

  function onOptionMoveUp(index: number): void {
    const item = selectedItem.value
    if (item) {
      moveOption(item.clientKey, index, index - 1)
    }
  }

  function onOptionMoveDown(index: number): void {
    const item = selectedItem.value
    if (item) {
      moveOption(item.clientKey, index, index + 1)
    }
  }

  function onOptionDragDrop(from: number, to: number): void {
    const item = selectedItem.value
    if (item) {
      moveOption(item.clientKey, from, to)
    }
  }

  function onOptionUpdateValue(index: number, value: string): void {
    if (selectedKey.value) {
      setOptionValue(selectedKey.value, index, value)
    }
  }

  function onOptionUpdateAnswer(index: number, isAnswer: boolean): void {
    // 交给 `useEditorDocument`：单选形态下要互斥（勾一个顶掉其它），逻辑不能散在页面里
    if (selectedKey.value) {
      setOptionAnswer(selectedKey.value, index, isAnswer)
    }
  }

  function onOptionUpdatePoints(index: number, points: number): void {
    if (selectedKey.value) {
      setOptionPoints(selectedKey.value, index, points)
    }
  }

  // ── 保存 ──

  /** 把用户送到第一个出问题的位置 */
  function focusFirstIssue(list: EditorIssue[]): void {
    const first = list[0]
    if (!first) {
      return
    }
    if (first.itemKey) {
      activeTab.value = 'items'
      selectedKey.value = first.itemKey
      return
    }
    activeTab.value = 'info'
  }

  async function onSave(): Promise<void> {
    if (saving.value) {
      return
    }

    // 删除是不可恢复的，先让用户看清这次要删多少
    const counts = planCounts.value
    if (counts.itemDelete > 0 || counts.optionDelete > 0) {
      const confirmed = await confirmDialog(
        `本次保存会删除 ${counts.itemDelete} 道题、${counts.optionDelete} 个选项，删除后无法恢复。确定继续吗？`,
      )
      if (!confirmed) {
        return
      }
    }

    const wasNew = isNew.value
    try {
      const activityNo = await save()
      toast('已保存', 'success')
      if (wasNew && activityNo) {
        // 新建成功后换成「编辑已有问卷」的地址：不换的话刷新页面会回到空白新建页，
        // 用户可能再建一份重复问卷
        uni.redirectTo({ url: editorDesignUrl(activityNo) })
      }
    }
    catch (error) {
      if (error instanceof EditorValidationError) {
        toast(describeIssues(error.issues))
        focusFirstIssue(error.issues)
        return
      }
      toast(error instanceof BxError ? error.message : '保存失败，请稍后重试')
    }
  }

  async function onDiscard(): Promise<void> {
    const confirmed = await confirmDialog('放弃未保存的修改吗？')
    if (confirmed) {
      discard()
      toast('已放弃修改')
    }
  }

  return {
    doc,
    loading,
    saving,
    loaded,
    loadError,
    saveError,
    issues,
    dirty,
    selectedKey,
    selectedIndex,
    selectedItem,
    activeTab,
    addingType,
    navTitle,
    itemDragging,
    itemFromIndex,
    itemOverIndex,
    beginItemDrag,
    onItemDragMove,
    onItemDragEnd,
    onItemDragCancel,
    onActivityPatch,
    onItemPatch,
    onItemAttrPatch,
    onItemIssues,
    onPickType,
    onDuplicateItem,
    onRemoveItem,
    onSelectItem,
    onClosePanel,
    onChangeType,
    onBackToList,
    onOptionAdd,
    onOptionReplaceAll,
    onOptionRemove,
    onOptionMoveUp,
    onOptionMoveDown,
    onOptionDragDrop,
    onOptionUpdateValue,
    onOptionUpdateAnswer,
    onOptionUpdatePoints,
    onSave,
    onDiscard,
    moveItem,
  }
}
