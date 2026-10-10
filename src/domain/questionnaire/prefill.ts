/**
 * 登记信息预填
 *
 * 老工程把登记表单序列化进 `?submitInfo=` 传给答题页，但答题页从未消费该参数，
 * 登记信息实际从未生效。新工程改为写入本地存储，再由这里按**题目标题关键词**预填，
 * 仅在题目尚未作答时生效。
 *
 * 抽成纯函数是为了可测：这段匹配逻辑原先埋在组件里，而测试活动的题目标题
 * 不含「单位 / 姓名 / 电话 / 手机」，无法在真实数据上触发，只能靠单测保证。
 */

/** 登记信息（与 `STORAGE_KEYS.ENTRY_PARAMS` 存储的形状一致） */
export interface EntryParams {
  company?: string
  user_name?: string
  user_phone?: string
}

/**
 * 关键词 → 登记字段的映射
 *
 * 顺序有意义：「电话」与「手机」都指向 `user_phone`，两者命中同一字段；
 * `单位` / `姓名` 各自独立。取**第一个有值且命中**的规则。
 */
const RULES: Array<[string, keyof EntryParams]> = [
  ['单位', 'company'],
  ['姓名', 'user_name'],
  ['电话', 'user_phone'],
  ['手机', 'user_phone'],
]

/**
 * 按题目标题匹配出应当预填的值
 *
 * @returns 匹配到的值；标题不含关键词、或对应登记项为空时返回 `undefined`
 */
export function matchEntryPrefill(label: string, entry: EntryParams): string | undefined {
  if (!label) {
    return undefined
  }
  const matched = RULES.find(([keyword, key]) => {
    const value = entry[key]
    return !!value && label.includes(keyword)
  })
  if (!matched) {
    return undefined
  }
  return entry[matched[1]]
}
