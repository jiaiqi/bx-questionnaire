/**
 * 页面参数解析
 *
 * 各页面此前各自写 `String(query?.xxx ?? '')`，需要解码的再自己调 `decodeURIComponent`
 * —— 口径不一致，而且裸调 `decodeURIComponent` 遇到含裸 `%` 的值会抛 `URIError`，
 * 直接把页面打白屏（活动标题写成「完成率 100%」这种就会触发）。
 *
 * 这里统一成一个入口：安全解码，解码失败时回退原值 —— 宁可原样展示，也不崩页面。
 */

/** 安全解码：对未编码的值是幂等的；解码失败（如含裸 `%`）时返回原值 */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

/**
 * 读取页面参数并安全解码。
 *
 * `title` 这类来自外部入口的值可能经过编码，需要解码；`activity_no` /
 * `fill_batch_no` 是系统生成的纯数字与十六进制串，解码是幂等的，统一走这里不会出错。
 */
export function readQuery(
  query: Record<string, unknown> | undefined,
  key: string,
  fallback = '',
): string {
  const raw = query?.[key]
  if (raw === undefined || raw === null || raw === '') {
    return fallback
  }
  return safeDecode(String(raw))
}
