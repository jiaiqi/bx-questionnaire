/**
 * 把平台存的一段 HTML 变成纯文本
 *
 * ## 为什么需要它
 *
 * 平台的 `summary` / `remark` 字段存的是**富文本**（后台编辑器写的 `<p>…</p>`），
 * 列表页却把它们当纯文本直接渲染，于是用户看到的是 `<p>测试</p>` 这种源码。
 *
 * ## 为什么不用现成的库
 *
 * DOMPurify 之类的净化库依赖 DOM，小程序端没有 DOM；本工程也不引入新依赖
 * （红线之一）。这里的场景其实很窄：只需要**去掉标签**、把 `<br>` 变成换行、
 * 解码几个常见实体，不需要完整的 HTML 解析器。
 *
 * 因此这里做的是**轻量净化**而不是安全净化：
 * 它防的是「把标签当文本显示出来」，不防「把一段精心构造的 HTML 当成标记执行」。
 * 真正的安全边界在服务端（存什么、返回什么）与渲染层（uni-app 的 text 只出文本）。
 */

/** 常见实体 → 字符 */
const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': '\'',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
}

/**
 * 取出纯文本
 *
 * - `<br>` / `<br/>` → 换行
 * - 其余标签 → 直接去掉（不保留里面的空白）
 * - `&nbsp;` 等实体 → 对应字符（数字实体一并解）
 * - 结果首尾去空白；中间连续空白压成一个空格
 *
 * 空字符串（只有标签和空白）会返回 `''` —— 调用方据此决定「这一行不渲染」。
 */
export function plainText(source: string | null | undefined): string {
  if (!source) {
    return ''
  }

  const withBreaks = source.replace(/<br\s*\/?>/gi, '\n')
  const withoutTags = withBreaks.replace(/<[^>]*>/g, '')

  const decoded = withoutTags
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;/gi, match => ENTITIES[match.toLowerCase()] ?? match)

  return decoded.replace(/\s+/g, ' ').trim()
}
