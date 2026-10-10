/**
 * 题目文案格式化
 *
 * 后端 `item_title` 通常自带序号（如「1. 单选题：你更喜欢哪种沟通方式？」），
 * 若再拼一次题目序号，就会渲染成「1. 1. 单选题：…」。老工程直接使用 item_title。
 *
 * 这里对已带序号的标题原样返回，仅在确实没有序号时才补上序号。
 * 抽成共享函数是因为答题页与结果页各写过一套，第 16 轮只修了答题页、
 * 结果页漏改过一次 —— 这类"同一份逻辑抄两遍"正是漏改的根源。
 */
export function formatQuestionTitle(
  index: number | string,
  label: string | null | undefined,
): string {
  const text = String(label ?? '').trim()
  // index 为 0 表示不占题号（分节符），此时不能拼出「0. 标题」
  if (!index || index === '0') {
    return text
  }
  if (!text) {
    return `${index}.`
  }
  return /^\d+\s*[.、)）]/.test(text) ? text : `${index}. ${text}`
}

/**
 * 时间展示格式化
 *
 * 后端返回的是「2026-10-10 10:03:10」这种字符串，只做字符串切片，
 * **不要用 new Date()** —— iOS Safari 与微信小程序解析带空格的这种格式会得到 Invalid Date。
 *
 * 该逻辑原先在 RecordList 与 couple 各写了一份（且完全相同），抽到此处共用。
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  return value.length >= 16 ? value.slice(0, 16) : value
}
