/**
 * 题型注册表
 *
 * ## 题型取值来自元数据，不是猜的
 *
 * `bxdaq_item_cfg.item_type` 是 `Enum` 列，但它的 `option_list` 是 null ——
 * 真实取值在 `option_list_v2` 里，端点：
 *
 * ```text
 * POST /daq/select/srvsys_service_columnex_v2_select?colsel_v2=srvdaq_item_cfg_add
 * body: { condition: [{service_name: srvdaq_item_cfg_add}, {use_type: add}] }
 * ```
 *
 * 实测本部署是 **9 个值**：`单选 / 多选 / 文本 / 数字 / 时间日期 / 图片 / 选项 / 地址 / 引用`。
 *
 * **没有「分节符」**：老工程用这个值（`index.vue` L313/L697/L818），
 * 但本部署逐值写入探测时 `分节符` 被拒（`[问题条目类型]字段值数据类型不匹配`），
 * 同批 18 个候选全被拒，而 9 个合法值全部通过 —— 对照组通过，所以是真被拒。
 * 因此编辑器**不提供**分节符；`mapper` 的 section 分支靠伪造字段的用例覆盖。
 *
 * ## `item_type_attr` 的键来自实测数据
 *
 * 每个题型的附加属性键不是从文档抄的，是从**真实回读**里确认的
 * （演示问卷 `20261011154728000005` 与特殊题型问卷 `20261011113133000003`）：
 *
 * | 题型 | 实测 `item_type_attr` |
 * | --- | --- |
 * | 文本 | `{"view_model":"text"}` / `{"view_model":"textarea"}` |
 * | 单选 | `{"radioType":"single"}` |
 * | 多选 | `{"radioType":"multi"}` |
 * | 选项 | `{"radioType":"single"}`（`multi` 即多选） |
 * | 时间日期 | `{"dateType":"date"}` |
 * | 图片 | `{"fileNum":3}` |
 * | 地址 | `{"refed_col":"area_no","srv_app":"config","servicename":"srvconfig_area_adj_select","key_disp_col":"area_name"}` |
 * | 引用 | `{"refed_col":"activity_no","srv_app":"daq","servicename":"srvdaq_activity_cfg_select","key_disp_col":"title"}` |
 * | 数字 | `{}`（无附加属性） |
 */

/** 本部署支持的 9 种题型，顺序即编辑器题型面板的展示顺序 */
export const ITEM_TYPES = [
  '单选',
  '多选',
  '文本',
  '数字',
  '时间日期',
  '图片',
  '选项',
  '地址',
  '引用',
] as const

export type ItemType = (typeof ITEM_TYPES)[number]

/**
 * 该题目是否为「只能有一个正确答案」的单选形态
 *
 * **不能只看题型**：「选项」题型的单/多选由 `item_type_attr.radioType` 决定
 * （`multi` 才是多选，与作答端 `mapper.resolveWidget` 的读法一致）。
 * 这里原先放的是两个静态数组 `SINGLE_CHOICE_TYPES` / `MULTI_CHOICE_TYPES`，
 * 对「选项」题型必然判错；而且全仓没有任何地方引用它们 —— 属于「写了但没接线」，
 * 换成这个真正被校验与交互用到的函数。
 */
export function isSingleChoice(type: string, attr: Record<string, unknown>): boolean {
  if (type === '多选') {
    return false
  }
  if (type === '单选') {
    return true
  }
  if (type === '选项') {
    return attr.radioType !== 'multi'
  }
  // 其余题型（文本 / 数字 / 时间日期 / 图片 / 地址 / 引用）没有选项，谈不上单选
  return false
}

/**
 * 选项数量上限
 *
 * `option_view_no` 的枚举实测是 **A..Z 共 26 个值**，第 27 个选项没有可用的标识。
 * 这不是前端随便定的上限，是平台的枚举边界。
 */
export const MAX_OPTIONS = 26

export interface ItemTypeSpec {
  type: ItemType
  /** 编辑器里的题型名（与平台值一致；独立成字段以便将来本地化） */
  label: string
  /** 是否有选项列表：决定渲染选项编辑器、以及保存时要不要写 `option_data` */
  hasOptions: boolean
  /** 新建该题型时的 `item_type_attr` 初值 */
  defaultAttr: Record<string, unknown>
  /** 题型面板上的一句话说明 */
  hint: string
}

/**
 * 地址题的默认数据源
 *
 * 实测本部署地区表 `bxconfig_area_adj` 的真实列是 `no` / `name` / `parent_no`，
 * 所以展示列用 `name`、取值列用 `no`。
 *
 * 注意：演示问卷里存的是 `area_no` / `area_name`，那两个列名在地区表里**不存在**。
 * 之所以没出问题，是因为 `BxAddressPicker` 把服务与列名都写死了、并不读
 * `item_type_attr` —— 也就是说旧数据里那两个值是**惰性的**。新写入用正确列名，
 * 至少不会让存储的配置继续骗人。
 */
const AREA_ATTR = {
  servicename: 'srvconfig_area_adj_select',
  srv_app: 'config',
  refed_col: 'no',
  key_disp_col: 'name',
}

/** 引用题的默认数据源：引用问卷活动列表（列名实测存在） */
const REF_ATTR = {
  servicename: 'srvdaq_activity_cfg_select',
  srv_app: 'daq',
  refed_col: 'activity_no',
  key_disp_col: 'title',
}

export const ITEM_TYPE_SPECS: ItemTypeSpec[] = [
  {
    type: '单选',
    label: '单选',
    hasOptions: true,
    defaultAttr: { radioType: 'single' },
    hint: '选项列表，只能选一个',
  },
  {
    type: '多选',
    label: '多选',
    hasOptions: true,
    defaultAttr: { radioType: 'multi' },
    hint: '选项列表，可选多个',
  },
  {
    type: '文本',
    label: '文本',
    hasOptions: false,
    defaultAttr: { view_model: 'text' },
    hint: '单行或多行输入',
  },
  {
    type: '数字',
    label: '数字',
    hasOptions: false,
    defaultAttr: {},
    hint: '只接受数字输入',
  },
  {
    type: '时间日期',
    label: '时间日期',
    hasOptions: false,
    defaultAttr: { dateType: 'date' },
    hint: '日期 / 时间 / 日期时间',
  },
  {
    type: '图片',
    label: '图片',
    hasOptions: false,
    defaultAttr: { fileNum: 9 },
    hint: '上传图片，可设数量上限',
  },
  {
    type: '选项',
    label: '选项（可选单选或多选）',
    hasOptions: true,
    defaultAttr: { radioType: 'single' },
    hint: '与单选/多选并列的独立题型，靠属性决定单选还是多选',
  },
  {
    type: '地址',
    label: '地址',
    hasOptions: false,
    defaultAttr: { ...AREA_ATTR },
    hint: '行政区划级联',
  },
  {
    type: '引用',
    label: '引用',
    hasOptions: false,
    defaultAttr: { ...REF_ATTR },
    hint: '从另一个服务的列表里选一条记录',
  },
]

const SPEC_BY_TYPE = new Map(ITEM_TYPE_SPECS.map(spec => [spec.type, spec]))

/** 取题型定义；未知题型返回 undefined（调用方应报错而不是静默降级） */
export function itemTypeSpec(type: string): ItemTypeSpec | undefined {
  return SPEC_BY_TYPE.get(type as ItemType)
}

/** 该题型是否有选项列表 */
export function typeHasOptions(type: string): boolean {
  return itemTypeSpec(type)?.hasOptions ?? false
}

/** 题型是否合法 */
export function isKnownItemType(type: string): boolean {
  return SPEC_BY_TYPE.has(type as ItemType)
}

/**
 * 选项的展示标识：0 → A，25 → Z
 *
 * 超出 26 返回空串 —— 与其造一个平台枚举里没有的值让保存失败，
 * 不如留空，由校验层给出「选项不能超过 26 个」的明确提示。
 */
export function optionViewNo(index: number): string {
  if (index < 0 || index >= MAX_OPTIONS) {
    return ''
  }
  return String.fromCharCode(65 + index)
}
