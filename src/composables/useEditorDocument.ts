/**
 * 可视化编辑器的文档状态与保存流程
 *
 * ## 读取用「表查询」而不是 `init_view_select`
 *
 * `srvdaq_init_view_select` 一次就能拿到活动 + 嵌套的题目与选项，看起来更省事。
 * 但它是**作答侧**的服务，题目表里有 `show_cfg`（显隐配置）这类会影响返回集的字段；
 * 一旦它按显隐过滤，编辑器就会**看不到**被隐藏的题目 —— 而 `planSave` 把
 * 「当前文档里没有、原始文档里有」的题目判定为**已删除**，
 * 于是「打开编辑器 → 保存」就会把隐藏题目真删掉。这是静默的数据丢失。
 *
 * 所以这里用三张表的原始查询（`srvdaq_activity_cfg_select` /
 * `srvdaq_item_cfg_select` / `srvdaq_option_cfg_select`），它们不做业务过滤。
 * 代价是多两次请求，换来的是「编辑器看到的就是库里全部」。
 *
 * ## 保存后重新拉取
 *
 * 保存完不回读、而是直接把本地对象当成结果，会让界面与库不一致
 * （`item_seq` 被重排、选项字母被服务端归一、默认值被回填）。
 * 这里选择**保存成功后整体重载**：界面显示的就是库里真实的样子。
 */

import type { ComputedRef, Ref } from 'vue'
import type { DaqActivityRow, DaqItemRow, DaqOptionCfgRow } from '@/api/daq/types'
import type { EditorActivity, EditorDocument, EditorIssue, EditorItem, SavePlan } from '@/domain/editor'

import { computed, ref } from 'vue'

import {
  activityAdd,
  activitySelectOne,
  activityUpdate,
  itemAdd,
  itemDelete,
  itemSelectByActivity,
  itemUpdate,
  optionAdd,
  optionDelete,
  optionSelectByItems,
  optionUpdate,
} from '@/api/daq/editor'
import {
  defaultActivityWindow,
  documentFromRows,
  emptyDocument,
  emptyItem,
  emptyOption,
  groupOptionsByItemNo,
  isSingleChoice,
  issuesForItem,
  itemTypeSpec,
  MAX_OPTIONS,
  moveInArray,
  planHasChanges,
  planSave,
  validateDocument,
} from '@/domain/editor'
import { nextClientKey } from '@/domain/editor/types'
import { EditorValidationError } from '@/domain/editor/validation'
import { BxError } from '@/utils/request'

export interface EditorDocumentController {
  /**
   * 当前编辑中的文档
   *
   * 刻意不叫 `document`：那会遮蔽 DOM 全局 `document`，
   * 在同一作用域里再想用 DOM API 就会拿到这个 ref 而不是文档对象。
   */
  doc: Ref<EditorDocument>
  loading: Ref<boolean>
  saving: Ref<boolean>
  loaded: Ref<boolean>
  /** 读取失败的原因 */
  loadError: Ref<string>
  /** 保存失败的原因（校验失败不写这里，见 `save()` 的异常类型） */
  saveError: Ref<string>
  /** 当前全部校验问题 */
  issues: ComputedRef<EditorIssue[]>
  /** 本次保存将要执行的操作（用于保存前确认「会删几道题」） */
  plan: ComputedRef<SavePlan>
  /** 是否存在未保存的改动 */
  dirty: ComputedRef<boolean>
  /** 是否是一份还没保存过的新问卷 */
  isNew: ComputedRef<boolean>
  load: (activityNo: string) => Promise<void>
  save: () => Promise<string>
  discard: () => void
  itemIssues: (clientKey: string) => EditorIssue[]
  findItem: (clientKey: string) => EditorItem | undefined
  /** 改活动字段（页面必须走这里，不要直接 Object.assign 文档） */
  patchActivity: (patch: Partial<EditorActivity>) => void
  /** 改题目字段 */
  patchItem: (clientKey: string, patch: Partial<EditorItem>) => void
  /** 改题目的 `item_type_attr` */
  patchItemAttr: (clientKey: string, patch: Record<string, unknown>) => void
  addItem: (type: string) => EditorItem | null
  /** 复制题目：副本插在原题之后，不带平台主键 */
  duplicateItem: (clientKey: string) => EditorItem | null
  removeItem: (clientKey: string) => void
  moveItem: (from: number, to: number) => void
  changeItemType: (clientKey: string, type: string) => void
  addOption: (itemKey: string) => void
  /** 批量替换选项文案（粘贴多行文本），按位置保留已有正确答案标记 */
  replaceOptions: (itemKey: string, values: string[]) => void
  removeOption: (itemKey: string, optionKey: string) => void
  moveOption: (itemKey: string, from: number, to: number) => void
  /** 改选项内容 */
  setOptionValue: (itemKey: string, index: number, value: string) => void
  /** 改选项分值 */
  setOptionPoints: (itemKey: string, index: number, points: number) => void
  setOptionAnswer: (itemKey: string, index: number, isAnswer: boolean) => void
}

/** 新增选择题型时默认给几个选项：两个才构成「选择」 */
const DEFAULT_NEW_OPTION_COUNT = 2

/**
 * 新建问卷的初始文档
 *
 * 直接带上默认有效期（现在 ~ 30 天后）：不带的话用户得先点两个时间才能开始加题，
 * 而这两个值几乎总是「现在」与「一个月后」。
 *
 * 这**不算改动**（`touched` 仍为 false），所以新建页一打开不会显示「放弃」。
 * 也因此不能由页面自己 `Object.assign` 填默认值 —— 那样既绕过了 composable，
 * 又得靠约定「这次赋值不算改动」，容易在别处被抄成真的改动。
 */
function newDocument(): EditorDocument {
  const doc = emptyDocument()
  Object.assign(doc.activity, defaultActivityWindow(new Date()))
  return doc
}

export function useEditorDocument(): EditorDocumentController {
  const doc = ref<EditorDocument>(newDocument())
  const loading = ref(false)
  const saving = ref(false)
  const loaded = ref(false)
  const loadError = ref('')
  const saveError = ref('')

  /**
   * 用户是否动过这份文档
   *
   * 存在的理由：`dirty` 对**新建**问卷不能只看 `planHasChanges`。
   * `planSave` 在 `activity.raw === null` 时恒设 `activityCreate`（新建时保存确实
   * 要建活动，这是对的），于是新建文档一打开就 `planHasChanges === true`，
   * 界面上会立刻出现「放弃」按钮 —— 明明一个字都还没填。
   *
   * 所以新建问卷改用「有没有被改过」：所有改文档的方法都经过这里，
   * 由它们置位，载入与放弃时清零。这是结构性保证，不靠比较快照
   * （快照比较要么把自动填的默认有效期也算成改动，要么需要再造一套文档相等判定）。
   */
  const touched = ref(false)

  /** 载入时的原始行，用于 `discard()` 与「哪些被删了」的判定 */
  let rawActivity: DaqActivityRow | null = null
  let rawItems: DaqItemRow[] = []
  let rawOptions: DaqOptionCfgRow[] = []

  const original = ref<EditorDocument | null>(null)

  /**
   * 本次保存将要执行的操作
   *
   * 只算一次供多处使用：`dirty` 判断有没有改动，保存前用它算出
   * 「会删几道题」以做二次确认 —— 服务端删除不可恢复，不能默默做。
   */
  const plan = computed(() => planSave(doc.value, original.value))

  const issues = computed(() => validateDocument(doc.value))
  /**
   * 是否存在未保存的改动
   *
   * - 已有问卷：与服务端快照比对，精确到「改了又改回去」也算没改；
   * - 新建问卷：看 `touched`（见上）。
   */
  const dirty = computed(() => (original.value ? planHasChanges(plan.value) : touched.value))
  const isNew = computed(() => !doc.value.activity.activityNo)

  /** 用当前缓存的行重建文档（载入与放弃修改共用） */
  function rebuildFromRows(): EditorDocument {
    if (!rawActivity) {
      return newDocument()
    }
    return documentFromRows(rawActivity, rawItems, groupOptionsByItemNo(rawOptions))
  }

  /**
   * 读取文档
   *
   * `silent` 用于**保存成功后的整体重载**：数据已经在库里，重载失败只是刷新没成功，
   * 不能把编辑器清空、也不能切到错误页 —— 那会让用户以为保存失败、编辑内容丢了。
   */
  async function load(activityNo: string, options: { silent?: boolean } = {}): Promise<void> {
    loading.value = true
    loadError.value = ''
    saveError.value = ''

    try {
      const [activityEnvelope, itemEnvelope] = await Promise.all([
        activitySelectOne(activityNo),
        itemSelectByActivity(activityNo),
      ])

      const activityRow = activityEnvelope.data?.[0]
      if (!activityRow) {
        throw new BxError('问卷不存在或已被删除', 'NOT_FOUND')
      }

      const itemRows = itemEnvelope.data ?? []
      const itemNos = itemRows
        .map(row => (row.item_no === null || row.item_no === undefined ? '' : String(row.item_no)))
        .filter(Boolean)
      const optionEnvelope = await optionSelectByItems(itemNos)
      const optionRows = optionEnvelope?.data ?? []

      rawActivity = activityRow
      rawItems = itemRows
      rawOptions = optionRows

      // 原始快照与编辑副本各自重建：两者 clientKey 不同没关系，
      // 比对与「被删了什么」都按 item_no / option_no 走
      original.value = rebuildFromRows()
      doc.value = rebuildFromRows()
      touched.value = false
      loaded.value = true
    }
    catch (error) {
      if (options.silent) {
        // 保存后的重载失败：保留当前文档，只提示「已保存，刷新可看最新结果」。
        // 把 loadError 置上会切走整个编辑器（页面是 v-if="loadError" 的错误页），
        // 用户会以为保存失败、半小时的编辑白做了。
        saveError.value = '已保存，但刷新失败；当前内容仍可继续编辑，刷新页面可看到最新结果'
        return
      }
      loadError.value = error instanceof BxError ? error.message : '问卷加载失败'
      rawActivity = null
      rawItems = []
      rawOptions = []
      original.value = null
      doc.value = emptyDocument()
      touched.value = false
      loaded.value = false
    }
    finally {
      loading.value = false
    }
  }

  /**
   * 保存
   *
   * 校验不通过时抛 `EditorValidationError`（界面据此逐题标注并留在本页）；
   * 网络/权限失败抛 `BxError`（界面提示重试）。两者刻意不合并成一个字符串错误。
   *
   * 返回保存后的 `activity_no` —— 新建问卷的编号是服务端生成的，调用方需要它来跳转。
   */
  async function save(): Promise<string> {
    const currentIssues = validateDocument(doc.value)
    if (currentIssues.length > 0) {
      throw new EditorValidationError(currentIssues)
    }

    const plan = planSave(doc.value, original.value)
    if (!planHasChanges(plan)) {
      return doc.value.activity.activityNo
    }

    saving.value = true
    saveError.value = ''

    try {
      let activityNo = doc.value.activity.activityNo

      if (plan.activityCreate) {
        activityNo = await activityAdd(plan.activityCreate)
        if (!activityNo) {
          throw new BxError('问卷已创建，但服务端没有返回编号，请到列表页确认', 'NO_ACTIVITY_NO')
        }
      }
      else if (plan.activityUpdate) {
        await activityUpdate(activityNo, plan.activityUpdate)
      }

      // 顺序有实测依据：先删选项再删题目。反过来是否级联没有依据，不赌。
      if (plan.optionDeletes.length > 0) {
        await optionDelete(plan.optionDeletes)
      }
      if (plan.itemDeletes.length > 0) {
        await itemDelete(plan.itemDeletes)
      }

      // 新增题目一次批量插入；实测 effect_data 与入参同序且含生成的 item_no
      const itemNoByClientKey = new Map<string, string>()
      if (plan.itemCreates.length > 0) {
        const effect = await itemAdd(plan.itemCreates.map(create => create.payload))
        plan.itemCreates.forEach((create, index) => {
          const itemNo = effect[index]?.item_no
          if (itemNo === null || itemNo === undefined || String(itemNo) === '') {
            throw new BxError('题目已提交，但服务端没有返回题目编号，请刷新后确认', 'NO_ITEM_NO')
          }
          itemNoByClientKey.set(create.clientKey, String(itemNo))
        })
      }

      for (const update of plan.itemUpdates) {
        await itemUpdate(update.itemNo, update.payload)
      }

      // 新增选项：所属题目若是本次新建的，用回填的 item_no 覆盖 payload 里的空串。
      // 空 item_no 会插出无主选项，所以这里宁可中止也不提交。
      const optionRows = plan.optionCreates.map((create) => {
        const itemNo = itemNoByClientKey.get(create.itemClientKey)
          ?? String(create.payload.item_no ?? '')
        if (!itemNo) {
          throw new BxError('有选项找不到所属题目，已中止保存以免产生无主选项', 'NO_ITEM_NO')
        }
        return { ...create.payload, item_no: itemNo }
      })
      if (optionRows.length > 0) {
        await optionAdd(optionRows)
      }

      for (const update of plan.optionUpdates) {
        await optionUpdate(update.optionNo, update.payload)
      }

      // 整体重载：让界面显示库里真实的样子（seq 归一、默认值回填）。
      // silent：重载失败不能把编辑器清空 —— 数据已经保存成功了。
      await load(activityNo, { silent: true })
      return activityNo
    }
    catch (error) {
      saveError.value = error instanceof BxError ? error.message : '保存失败，请稍后重试'
      throw error
    }
    finally {
      saving.value = false
    }
  }

  /** 放弃未保存的改动 */
  function discard(): void {
    doc.value = rebuildFromRows()
    saveError.value = ''
    touched.value = false
  }

  function findItem(clientKey: string): EditorItem | undefined {
    return doc.value.items.find(item => item.clientKey === clientKey)
  }

  function itemIssues(clientKey: string): EditorIssue[] {
    return issuesForItem(issues.value, clientKey)
  }

  /**
   * 改活动字段
   *
   * 页面必须走这里而不是自己 `Object.assign(doc.activity, ...)`：
   * 一是「动过没有」的标记只能在这里置位，二是把「改文档」的入口收在一处，
   * 将来加审计/撤销也不必再去追页面里的直接赋值。
   */
  function patchActivity(patch: Partial<EditorActivity>): void {
    Object.assign(doc.value.activity, patch)
    touched.value = true
  }

  /** 改题目字段（按 `clientKey` 查**响应式代理**再改，见 `addItem` 的说明） */
  function patchItem(clientKey: string, patch: Partial<EditorItem>): void {
    const item = findItem(clientKey)
    if (item) {
      Object.assign(item, patch)
      touched.value = true
    }
  }

  /** 改题目的 `item_type_attr`（合并而不是整体替换，避免漏传的键被抹掉） */
  function patchItemAttr(clientKey: string, patch: Record<string, unknown>): void {
    const item = findItem(clientKey)
    if (item) {
      item.attr = { ...item.attr, ...patch }
      touched.value = true
    }
  }

  /**
   * 追加一道题；题型不认识时返回 null（调用方提示，而不是插一道坏题）
   *
   * 返回的是 `findItem` 查出来的**响应式代理**，不是刚造出来的原始对象：
   * 后者改了不会触发更新，调用方 `const item = addItem('单选'); item.title = 'x'`
   * 会「改成功了但界面不动」。
   */
  function addItem(type: string): EditorItem | null {
    const spec = itemTypeSpec(type)
    if (!spec) {
      return null
    }
    const item = emptyItem(type, spec.defaultAttr)
    if (spec.hasOptions) {
      item.options = Array.from({ length: DEFAULT_NEW_OPTION_COUNT }, () => emptyOption())
    }
    doc.value.items = [...doc.value.items, item]
    touched.value = true
    return findItem(item.clientKey) ?? null
  }

  /**
   * 复制题目
   *
   * 多道同构题（一组量表题之类）只能逐题重建，复制能省掉大部分重复输入。
   * 副本**不带平台主键**：`itemNo` 清空、`raw` 置 null，保存时按新增处理；
   * 选项同理清掉 `optionNo`，否则会把原题的 option_no 带过去。
   */
  function duplicateItem(clientKey: string): EditorItem | null {
    const source = findItem(clientKey)
    if (!source) {
      return null
    }
    const copy: EditorItem = {
      ...source,
      clientKey: nextClientKey('item'),
      itemNo: '',
      raw: null,
      options: source.options.map(option => ({
        ...option,
        clientKey: nextClientKey('option'),
        optionNo: '',
      })),
    }
    const index = doc.value.items.findIndex(item => item.clientKey === clientKey)
    const next = [...doc.value.items]
    next.splice(index + 1, 0, copy)
    doc.value.items = next
    touched.value = true
    return copy
  }

  function removeItem(clientKey: string): void {
    doc.value.items = doc.value.items.filter(item => item.clientKey !== clientKey)
    touched.value = true
  }

  function moveItem(from: number, to: number): void {
    doc.value.items = moveInArray(doc.value.items, from, to)
    touched.value = true
  }

  /**
   * 换题型
   *
   * `item_type_attr` 与选项列表都**跟着题型走**：不重置 attr 的话，
   * 从「时间日期」换成「图片」会把 `{dateType:'date'}` 留在图片题上；
   * 不清理选项的话，从「单选」换成「文本」会留下永远不显示的选项行 ——
   * 而且它们仍会被保存进选项表，成为谁也用不到的脏数据。
   */
  function changeItemType(clientKey: string, type: string): void {
    const spec = itemTypeSpec(type)
    const item = findItem(clientKey)
    if (!spec || !item || item.type === type) {
      return
    }
    item.type = type
    item.attr = { ...spec.defaultAttr }
    if (!spec.hasOptions) {
      item.options = []
    }
    else if (item.options.length === 0) {
      item.options = Array.from({ length: DEFAULT_NEW_OPTION_COUNT }, () => emptyOption())
    }
    touched.value = true
  }

  function addOption(itemKey: string): void {
    const item = findItem(itemKey)
    if (item) {
      item.options = [...item.options, emptyOption()]
      touched.value = true
    }
  }

  /**
   * 批量替换选项（粘贴多行文本）
   *
   * 按位置对齐保留已有选项的「正确答案」标记：前 N 个沿用原选项、只换文案，
   * 多出来的新建、超出的丢弃。这样粘贴一份新清单不会把已设的答案全清掉。
   */
  function replaceOptions(itemKey: string, values: string[]): void {
    const item = findItem(itemKey)
    if (!item) {
      return
    }
    const next = values
      .map(value => value.trim())
      .filter(Boolean)
      .slice(0, MAX_OPTIONS)
    if (next.length === 0) {
      return
    }
    item.options = next.map((value, index) => {
      const existing = item.options[index]
      return existing ? { ...existing, value } : { ...emptyOption(), value }
    })
    touched.value = true
  }

  function removeOption(itemKey: string, optionKey: string): void {
    const item = findItem(itemKey)
    if (item) {
      item.options = item.options.filter(option => option.clientKey !== optionKey)
      touched.value = true
    }
  }

  function moveOption(itemKey: string, from: number, to: number): void {
    const item = findItem(itemKey)
    if (item) {
      item.options = moveInArray(item.options, from, to)
      touched.value = true
    }
  }

  /** 改选项内容 */
  function setOptionValue(itemKey: string, index: number, value: string): void {
    const option = findItem(itemKey)?.options[index]
    if (option) {
      option.value = value
      touched.value = true
    }
  }

  /** 改选项分值 */
  function setOptionPoints(itemKey: string, index: number, points: number): void {
    const option = findItem(itemKey)?.options[index]
    if (option) {
      option.points = points
      touched.value = true
    }
  }

  /**
   * 设置某个选项是否为正确答案
   *
   * 单选形态下互斥：勾选一个就清掉其它，与作答端的选择控件行为一致
   * （否则用户能勾出两个正确答案，直到保存时才被校验拦下，体验很怪）。
   * 单/多选由 `isSingleChoice` 判断，「选项」题型还要看 `radioType`。
   */
  function setOptionAnswer(itemKey: string, index: number, isAnswer: boolean): void {
    const item = findItem(itemKey)
    const option = item?.options[index]
    if (!item || !option) {
      return
    }
    if (isAnswer && isSingleChoice(item.type, item.attr)) {
      for (const other of item.options) {
        other.isAnswer = false
      }
    }
    option.isAnswer = isAnswer
    touched.value = true
  }

  return {
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
  }
}
