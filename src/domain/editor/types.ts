/**
 * 可视化编辑器的领域模型
 *
 * 与平台行（`api/daq/types`）解耦：平台行是「数据库里长什么样」，
 * 这里是「编辑器里长什么样」。两者之间的转换集中在 `document.ts`。
 *
 * ## 两条刻意的建模选择
 *
 * 1. **顺序就是数组顺序**，模型里不存 `item_seq` / `option_seq` / `option_view_no`。
 *    平台侧这三个字段都表示「第几个」，若模型里也存一份，就必然出现
 *    「数组顺序说 A、字段说 B」的漂移。保存时按数组下标生成（`index + 1`、`A..Z`），
 *    读取时按平台字段排序后装进数组。
 * 2. **每个实体带 `raw`**（平台原始行，新增项为 null）。保存时是否要更新，
 *    由「当前 payload」与「`raw` 反解出的 payload」比较得出，**不靠 UI 维护的
 *    dirty 标记** —— 忘标记一次就是「改了但没保存」的静默失效。
 *
 * 纯数据 + 纯函数，不依赖 Vue / uni-app，可直接单测。
 */

import type { DaqActivityRow, DaqItemRow, DaqOptionCfgRow } from '@/api/daq/types'

/**
 * 客户端稳定标识
 *
 * 新增的题目/选项在保存前**没有平台主键**，而列表渲染的 key 与拖拽定位都需要
 * 一个稳定标识。用数组下标当 key 会在重排时错位（Vue 会复用错组件），
 * 所以每个新增项在创建时就分配一个。
 */
let clientSeq = 0

export function nextClientKey(prefix: string): string {
  clientSeq += 1
  return `${prefix}-${clientSeq}`
}

/** 选项 */
export interface EditorOption {
  /** 客户端标识，列表 key 与拖拽定位用 */
  clientKey: string
  /** 平台主键 `option_no`；新增项为 `''` */
  optionNo: string
  /** 选项文案 `option_value` */
  value: string
  /** 是否为正确答案 */
  isAnswer: boolean
  /** 选项分值 */
  points: number
  /** 平台原始行；新增项为 null */
  raw: DaqOptionCfgRow | null
}

/** 题目 */
export interface EditorItem {
  clientKey: string
  /** 平台主键 `item_no`；新增项为 `''` */
  itemNo: string
  title: string
  /** 平台题型 `item_type`，取值见 `itemTypes.ts` 的 `ITEM_TYPES` */
  type: string
  required: boolean
  points: number
  /**
   * 正确答案 `answer`（≤100）
   *
   * 仅**非选项类**题型有意义（文本/数字）。选项类题目的正确答案记在
   * `EditorOption.isAnswer` 上 —— 两个位置各管一类，不重叠。
   */
  answer: string
  /** 答案分析解读 `answer_analysis` */
  answerAnalysis: string
  /** 得分策略 `score_strategy`：选项分值累加 / 完全正确 / 错误不得分 */
  scoreStrategy: string
  /** `item_type_attr`，已归一化为对象 */
  attr: Record<string, unknown>
  /** 选项列表；仅 `typeHasOptions(type)` 为真时有意义 */
  options: EditorOption[]
  /** 平台原始行；新增项为 null */
  raw: DaqItemRow | null
}

/** 活动 */
export interface EditorActivity {
  /** 平台主键 `activity_no`；新增时为 `''` */
  activityNo: string
  title: string
  /** 分类编号 `classify`（必填） */
  classify: string
  keyword: string
  /** 封面图 `activity_image`，值是附件的 `file_no` */
  activityImage: string
  startTime: string
  endTime: string
  remark: string
  /** 状态：未开始 / 进行中 / 已结束 */
  status: string
  /** 权限类型：匿名访问 / 登录访问 */
  permType: string
  /** 填写次数：1次 / 多次 */
  answerTimes: string
  /** 展示方式：全部 / 逐个 */
  itemDispWay: string
  summary: string
  startRemark: string
  endRemark: string
  submittedTip: string
  submitLabel: string
  /** 提交后是否可修改：是 / 否 */
  modifyAfterSubmit: string
  /** 修改周期：一次 / 多次 / 一天内一次 / … */
  modifyPeriond: string
  /** 选项模式：评分 / 提交确认 */
  actOption: string
  /** 通过分数 */
  passingMark: string
  /** 平台原始行；新增时为 null */
  raw: DaqActivityRow | null
}

/** 一份完整文档：活动 + 有序题目（含选项） */
export interface EditorDocument {
  activity: EditorActivity
  items: EditorItem[]
}

/**
 * 得分策略默认值
 *
 * 取平台自身在新增时回填的值（实测 `srvdaq_item_cfg_add` 的 `effect_data`
 * 里 `score_strategy` 是「完全正确」），而不是前端自己发明一个。
 */
export const DEFAULT_SCORE_STRATEGY = '完全正确'

/** 新建问卷默认的有效期（天） */
export const DEFAULT_ACTIVITY_DAYS = 30

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * `Date` → 平台时间格式 `YYYY-MM-DD HH:mm:ss`
 *
 * **不能用 `toISOString()`**：它输出 UTC，在东八区会把时间整整差 8 小时 ——
 * 新建的问卷会显示成 8 小时前启用。这里一律用本地时间字段拼。
 */
export function formatDateTime(date: Date): string {
  const ymd = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  const hms = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  return `${ymd} ${hms}`
}

/**
 * 新建问卷的默认时间窗：`now` 到 `now + DEFAULT_ACTIVITY_DAYS` 天
 *
 * 抽成接收 `now` 的纯函数是为了可测：用 `new Date()` 的话，
 * 「30 天后」这种跨月/跨年的边界只能靠碰运气覆盖。
 */
export function defaultActivityWindow(now: Date): { startTime: string, endTime: string } {
  const end = new Date(now.getTime() + DEFAULT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000)
  return { startTime: formatDateTime(now), endTime: formatDateTime(end) }
}

/**
 * 空活动（新建问卷的初值）
 *
 * 两处默认值**刻意与平台的 `init_expr` 不同**（见 `enums.ts` 的说明）：
 * - `status` 用「进行中」而不是平台的「未开始」：新建的问卷应当立刻能作答；
 * - `permType` 用「匿名访问」而不是平台的「登录访问」：问卷分享出去后要求登录会卡住填写者。
 *
 * 两处都是用户可改的，只是换一个更少踩坑的起点。
 */
export function emptyActivity(): EditorActivity {
  return {
    activityNo: '',
    title: '',
    classify: '',
    keyword: '',
    activityImage: '',
    startTime: '',
    endTime: '',
    remark: '',
    status: '进行中',
    permType: '匿名访问',
    answerTimes: '1次',
    itemDispWay: '全部',
    summary: '',
    startRemark: '',
    endRemark: '',
    submittedTip: '',
    submitLabel: '',
    modifyAfterSubmit: '否',
    modifyPeriond: '一次',
    actOption: '提交确认',
    passingMark: '',
    raw: null,
  }
}

/** 空选项 */
export function emptyOption(): EditorOption {
  return {
    clientKey: nextClientKey('option'),
    optionNo: '',
    value: '',
    isAnswer: false,
    points: 0,
    raw: null,
  }
}

/** 空题目 */
export function emptyItem(type: string, attr: Record<string, unknown>): EditorItem {
  return {
    clientKey: nextClientKey('item'),
    itemNo: '',
    title: '',
    type,
    required: false,
    points: 0,
    answer: '',
    answerAnalysis: '',
    scoreStrategy: DEFAULT_SCORE_STRATEGY,
    attr: { ...attr },
    options: [],
    raw: null,
  }
}
