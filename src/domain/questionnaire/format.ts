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
  if (!text) {
    return `${index}.`
  }
  return /^\d+\s*[.、)）]/.test(text) ? text : `${index}. ${text}`
}
