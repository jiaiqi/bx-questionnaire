/**
 * 引用题的数据源配置与作答值解析
 *
 * 引用题的作答值是**被引用记录的 `refed_col` 值**（实测本环境就是活动编号
 * `20261011113133000003`）。回顾页直接展示它，用户看到的就是一串内部 ID ——
 * 与图片题展示文件批次号是同一类问题（见验收清单）。
 *
 * 配置来源有两处，**`item_type_attr` 优先、行上独立列兜底** ——
 * 真实表里两种都存在（见老工程写法）。这段解析原先只写在 `BxRefSelector` 里，
 * 回顾页也要用，所以抽到这里，两处共用一份，不抄第二遍。
 */

export interface RefConfig {
  /** 要调用的服务 */
  serviceName: string
  /** 应用名；缺省跟随全局 daq */
  app?: string
  /** 作答值存哪一列 */
  valueCol: string
  /** 界面展示哪一列 */
  labelCol: string
}

/** `item_type_attr` 可能是 JSON 字符串，也可能是已解析的对象 */
export function parseItemTypeAttr(value: unknown): Record<string, unknown> {
  if (!value) {
    return {}
  }
  if (typeof value === 'object') {
    return value as Record<string, unknown>
  }
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
}

/**
 * 解析引用题的数据源配置
 *
 * 服务名缺失时返回 `null`（该题没配数据源，调用方应给出提示而不是静默留空）。
 */
export function parseRefConfig(raw: Record<string, unknown>): RefConfig | null {
  const attr = parseItemTypeAttr(raw.item_type_attr)
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = attr[key] ?? raw[key]
      if (value !== null && value !== undefined && String(value) !== '') {
        return String(value)
      }
    }
    return ''
  }

  const serviceName = pick('serviceName', 'servicename')
  if (!serviceName) {
    return null
  }

  const app = pick('srv_app')
  return {
    serviceName,
    ...(app ? { app } : {}),
    valueCol: pick('refed_col') || 'no',
    labelCol: pick('key_disp_col') || 'name',
  }
}

/** 结果页/回顾页里的一条作答，只要够挑出引用题即可 */
export interface RefAnswerSlot {
  key: string
  /** 题型（`mapper` 里的 `field.widget`） */
  widget: string
  /** 作答原值（被引用记录的 `refed_col` 值） */
  value: unknown
  /** 题目原始行，用于解析数据源配置 */
  raw: Record<string, unknown>
}

/** 一条待解析的引用作答 */
export interface RefAnswerTarget {
  key: string
  value: string
  config: RefConfig
}

/**
 * 挑出「需要解析展示标签」的引用作答
 *
 * 只认 `widget === 'ref'`、值非空、且配了数据源的题。同一题同一值去重。
 */
export function refAnswerTargets(slots: RefAnswerSlot[]): RefAnswerTarget[] {
  const targets: RefAnswerTarget[] = []
  const seen = new Set<string>()

  for (const slot of slots) {
    if (slot.widget !== 'ref') {
      continue
    }
    const config = parseRefConfig(slot.raw)
    if (!config) {
      continue
    }

    const values = Array.isArray(slot.value) ? slot.value : [slot.value]
    for (const value of values) {
      const text = typeof value === 'string' ? value.trim() : ''
      if (!text || seen.has(`${slot.key}:${text}`)) {
        continue
      }
      seen.add(`${slot.key}:${text}`)
      targets.push({ key: slot.key, value: text, config })
    }
  }

  return targets
}

/**
 * 从服务端返回的行里取展示标签
 *
 * 取不到 `labelCol` 时回退到值本身 —— 宁可露出原值便于排查，也不要显示空白，
 * 因为空白会被下游当成「未作答」，而用户其实作答了。
 */
export function pickRefLabel(rows: Array<Record<string, unknown>>, target: RefAnswerTarget): string {
  for (const row of rows) {
    if (String(row[target.config.valueCol] ?? '') !== target.value) {
      continue
    }
    const label = String(row[target.config.labelCol] ?? '').trim()
    if (label) {
      return label
    }
  }
  return target.value
}
