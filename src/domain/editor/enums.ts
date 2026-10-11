/**
 * 编辑器用到的全部枚举取值
 *
 * ## 活动/题目列上的枚举：来自平台元数据
 *
 * 全部读自 `srvsys_service_columnex_v2_select` 的 `option_list_v2`
 * （`srvdaq_activity_cfg_add` 45 列 / `srvdaq_item_cfg_add` 33 列，实测 2026-10-11）。
 * 编辑器只提供平台真正接受的取值 —— 自由输入必然产生「界面能选、保存被拒」的组合，
 * 而用户只会把它当成后端不稳定。
 *
 * 注意两处**平台默认值与编辑器默认值不同**，都是有意的：
 *
 * | 列 | 平台 `init_expr` | 编辑器默认 | 理由 |
 * | --- | --- | --- | --- |
 * | `status` | 未开始 | 进行中 | 新建的问卷应当立刻能作答；未开始需要用户再手动改一次状态 |
 * | `perm_type` | 登录访问 | 匿名访问 | 问卷分享出去后要求登录会直接卡住填写者 |
 *
 * ## `item_type_attr` 里的取值：是本工程的约定，不是平台枚举
 *
 * `view_model` / `dateType` / `radioType` 存在 `item_type_attr` 这个 JSON 列里，
 * 平台不做枚举校验，**消费方是 `mapper.resolveWidget`**。所以这里的取值必须与它对齐
 * （已逐个核对过 `mapper.ts` L39-L63）：
 *
 * - `view_model`：只有 `textarea` 走多行，其余一律单行
 * - `radioType`：只有 `multi` 走多选（仅「选项」题型读它）
 * - `dateType`：`time` → 时间、`datetime` → 日期时间、其余 → 日期
 *
 * 两边一旦不一致，表现是「属性选了没反应」而不是报错，所以这里逐值加了注释。
 */

/** 得分策略（实测 `option_list_v2` 三项，`init_expr` = 完全正确） */
export const SCORE_STRATEGY_OPTIONS = ['选项分值累加', '完全正确', '错误不得分'] as const

/** 活动状态 */
export const ACTIVITY_STATUS_OPTIONS = ['未开始', '进行中', '已结束'] as const

/** 权限类型 */
export const PERM_TYPE_OPTIONS = ['匿名访问', '登录访问'] as const

/** 用户填写次数 */
export const ANSWER_TIMES_OPTIONS = ['1次', '多次'] as const

/** 问题显示方式：全部 = 一页列完，逐个 = 一题一屏 */
export const ITEM_DISP_WAY_OPTIONS = ['全部', '逐个'] as const

/** 选项模式：评分 / 提交确认 */
export const ACT_OPTION_OPTIONS = ['评分', '提交确认'] as const

/** 提交后是否可修改 */
export const MODIFY_AFTER_SUBMIT_OPTIONS = ['是', '否'] as const

/** 修改周期 */
export const MODIFY_PERIOND_OPTIONS = [
  '一次',
  '多次',
  '一天内一次',
  '几天内一次',
  '提交后几天内',
] as const

/** 把取值数组转成分段选择器需要的 `{label, value}`（大部分枚举的标签就等于值） */
export function toChoices(values: readonly string[]): Array<{ label: string, value: string }> {
  return values.map(value => ({ label: value, value }))
}

/**
 * 中文标签的分段选择器选项
 *
 * 这三组的 `value` 必须与作答端 `mapper.resolveWidget` 的读法一致
 * （`view_model` 只有 `textarea` 走多行、`dateType` 的 `time`/`datetime`、
 * `radioType` 只有 `multi` 走多选），改这里要同步改那边。
 *
 * 原先还并存着三个 `*_OPTIONS` 取值数组（`VIEW_MODEL_OPTIONS` 等），
 * 因为 `label` 要中文而没被这两组用到 —— 是纯重复的死代码，已删除。
 */
export const VIEW_MODEL_CHOICES = [
  { label: '单行文本', value: 'text' },
  { label: '多行文本', value: 'textarea' },
]

export const DATE_TYPE_CHOICES = [
  { label: '日期', value: 'date' },
  { label: '时间', value: 'time' },
  { label: '日期时间', value: 'datetime' },
]

export const RADIO_TYPE_CHOICES = [
  { label: '单选', value: 'single' },
  { label: '多选', value: 'multi' },
]
