/**
 * 题型 → 色条语气
 *
 * 设计器的画布用「左侧 2px 类型色条」区分题型（规范 §7.6）。
 *
 * 但 9 种题型给 9 种颜色是不行的：规范 §2.4 说「一屏最多两处主色」，
 * 语义色只在真的表达语义时用 —— 而「这是一道选择题」并不表达任何语义，
 * 撒开配色只会把界面变成调色盘。
 *
 * 所以按**作答形态**分三族：一族一种语气，其余靠题型标签上的文字说明。
 * 这里用的全是既有令牌（主色 / 石墨 / 淡石墨），不新增令牌。
 */
export type TypeTone = 'choice' | 'fill' | 'ref'

/**
 * 取题型的语气
 *
 * - `choice` 选择类：有选项列表，作答时是「点一个」
 * - `fill`   填空类：自己写字或选日期
 * - `ref`    引用类：从别处取一条记录（图片 / 地址 / 引用）
 */
export function typeTone(type: string): TypeTone {
  switch (type) {
    case '单选':
    case '多选':
    case '选项':
      return 'choice'
    case '文本':
    case '数字':
    case '时间日期':
      return 'fill'
    default:
      return 'ref'
  }
}
