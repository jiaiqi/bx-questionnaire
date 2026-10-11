/**
 * 地址题的作答值解析
 *
 * 地址题的作答值是地区的 `no`（编号），实测就是 `bxq99` 这种编码。
 * 回顾页直接展示它，用户选的是「bxq测试省」、看到的却是编号 ——
 * 与图片题展示文件批次号、引用题展示被引用记录编号是**同一类问题**的第三个实例。
 *
 * 展示列优先 `path_name`（老工程的 `showCol`），回退 `name`（名称），最后才是 `no`。
 * **不能直接回退到 `no`** —— 那正是要避免的东西。实测本环境 `path_name` 为 null，
 * 所以 `name` 这一层是必需的，不是可有可无的兜底。
 */

/** 地址题作答值 → 展示标签时需要的最小字段 */
export interface AreaLabelRow {
  no?: string | null
  name?: string | null
  path_name?: string | null
}

/** 从地区行里取展示标签；都取不到时回退到编号本身 */
export function pickAreaLabel(rows: AreaLabelRow[], no: string): string {
  for (const row of rows) {
    if (String(row.no ?? '') !== no) {
      continue
    }
    const label = String(row.path_name ?? row.name ?? '').trim()
    if (label) {
      return label
    }
  }
  return no
}

/** 结果页/回顾页里的一条作答，只要够挑出地址题即可 */
export interface AddressAnswerSlot {
  key: string
  /** 题型（`mapper` 里的 `field.widget`） */
  widget: string
  /** 作答原值（地区的 `no`） */
  value: unknown
}

/**
 * 挑出「需要解析展示标签」的地址作答
 *
 * 只认 `widget === 'address'` 且值非空；多值逐个返回并去重。
 */
export function addressAnswerTargets(slots: AddressAnswerSlot[]): Array<{ key: string, no: string }> {
  const targets: Array<{ key: string, no: string }> = []
  const seen = new Set<string>()

  for (const slot of slots) {
    if (slot.widget !== 'address') {
      continue
    }
    const values = Array.isArray(slot.value) ? slot.value : [slot.value]
    for (const value of values) {
      const no = typeof value === 'string' ? value.trim() : ''
      if (!no || seen.has(`${slot.key}:${no}`)) {
        continue
      }
      seen.add(`${slot.key}:${no}`)
      targets.push({ key: slot.key, no })
    }
  }

  return targets
}
