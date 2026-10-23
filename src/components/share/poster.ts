/**
 * 分享海报的纯逻辑
 *
 * 画布绘制本身留在组件里（需要 canvas 上下文），这里只放**可单测**的部分：
 * 海报调色板、完成时间解析、文本换行、文件名。这样「批次号解析错」「中文断行
 * 把标点甩到行首」这类问题能在 node 环境里被钉住，不必开浏览器。
 *
 * 调色板必须与 `src/styles/tokens.scss` 同值 —— canvas 里读不到 CSS 变量，
 * 只能落成常量；`test/components/share-poster.spec.ts` 会读令牌文件做一致性校验。
 */

/** 海报设计尺寸（CSS px，5:8 竖版）；导出时按 DPR 放大 */
export const POSTER_WIDTH = 300
export const POSTER_HEIGHT = 480
/** 内容左右边距 */
export const POSTER_PADDING = 24

/** 与 tokens.scss 同值；改动必须同步令牌并过测试 */
export const POSTER_PALETTE = {
  surface: '#ffffff',
  ink: '#14161a',
  ink2: '#4b5563',
  ink3: '#667080',
  line: '#e5e7eb',
  primary: '#3b4edb',
  primarySoft: '#eef1fd',
  success: '#0f7a5a',
  successSoft: '#ecf7f2',
  danger: '#c22f24',
  dangerSoft: '#fef3f2',
} as const

/** 海报上的中文文案（集中在这里，测试可断言非空） */
export const POSTER_CTA_TEXT = '打开链接 · 参与问卷'
export const POSTER_INVITE_TEXT = '邀请同事一起参与'
export const POSTER_FOOT_TEXT = '园区问卷 · 数据仅用于整体分析'

/**
 * 海报展示数据
 *
 * score 为空串表示这份问卷没有可展示的分数（例如没有计分题），
 * 海报会改用「已提交」作为主视觉，而不是画一个 0 分。
 */
export interface PosterData {
  title: string
  score: string
  total: string
  level: string
  levelTone: 'ok' | 'fail' | 'none'
  timeText: string
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 本地日期 `YYYY-MM-DD` */
export function formatPosterDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * 从作答批次号推断完成时间
 *
 * 服务端批次号有两种真实形态：
 * - 20 位时间戳式：`20261011121039186100` → 前 14 位是 `YYYYMMDDHHmmss`；
 * - 短批次式：`B20261022-32` / `20261022-32` → 只带日期。
 * 不是时间戳形态（例如 uuid 式 `4d5b54fb…`）时返回空串，**不猜**。
 */
export function parseBatchDateTime(batchNo: string): string {
  const raw = String(batchNo ?? '').trim().replace(/^B/i, '')
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/)
  if (!match) {
    return ''
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hasTime = match[4] !== undefined && match[5] !== undefined
  const hour = hasTime ? Number(match[4]) : 0
  const minute = hasTime ? Number(match[5]) : 0

  // 用 Date 反验：20261340 这类「格式对但日期不存在」的批次号不算解析成功
  const date = new Date(year, month - 1, day, hour, minute)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || date.getHours() !== hour
    || date.getMinutes() !== minute
  ) {
    return ''
  }

  const dayText = `${year}-${pad2(month)}-${pad2(day)}`
  return hasTime ? `${dayText} ${pad2(hour)}:${pad2(minute)}` : dayText
}

/**
 * 海报上的时间行
 *
 * 批次号能解析出完成时间就说「完成于」；解析不出（uuid 批次号）就说「生成于」
 * 今天 —— 不能把生成时间谎报成完成时间。
 */
export function posterTimeLabel(batchNo: string, now: Date = new Date()): string {
  const finishedAt = parseBatchDateTime(batchNo)
  return finishedAt ? `完成于 ${finishedAt}` : `生成于 ${formatPosterDate(now)}`
}

/** 下载文件名：去掉路径分隔符与非法字符，避免某些浏览器直接丢弃下载 */
export function posterFileName(title: string): string {
  const safe = String(title ?? '')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return `问卷海报-${safe || '作答结果'}.png`
}

/** 把文本切成可用于换行的最小单元：中文逐字、英文/数字按词 */
function tokenize(text: string): string[] {
  return text.match(/[A-Za-z0-9]+(?:[.'-][A-Za-z0-9]+)*|\s+|./gu) ?? []
}

/**
 * 按宽度换行
 *
 * - 行首不放过空格、行尾不留空格；
 * - 超过 `maxLines` 时只保留前 `maxLines` 行，最后一行以「…」收尾（并保证不超宽）；
 * - `measure` 由调用方注入 —— canvas 用 `ctx.measureText().width`，测试里用固定字宽的桩。
 */
export function wrapPosterText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
  maxLines = 3,
): string[] {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized || maxWidth <= 0 || maxLines <= 0) {
    return []
  }

  const lines: string[] = []
  let current = ''

  /** 把超宽的单个 token 硬切成能放下的片段 */
  function pushOversized(token: string): void {
    let rest = token
    while (rest && measure(rest) > maxWidth) {
      let cut = rest.length - 1
      while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) {
        cut--
      }
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    current = rest
  }

  for (const token of tokenize(normalized)) {
    if (!current && !token.trim()) {
      continue
    }
    const candidate = current + token
    if (measure(candidate.trimEnd()) <= maxWidth) {
      current = candidate
      continue
    }

    if (current.trim()) {
      lines.push(current.trimEnd())
    }
    current = token.trimStart()
    if (current && measure(current) > maxWidth) {
      pushOversized(current)
    }
    if (lines.length > maxLines) {
      break
    }
  }

  if (current.trim()) {
    lines.push(current.trimEnd())
  }

  if (lines.length <= maxLines) {
    return lines
  }

  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1] ?? ''
  let trimmed = last
  while (trimmed.length > 0 && measure(`${trimmed}…`) > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  kept[maxLines - 1] = `${trimmed}…`
  return kept
}
