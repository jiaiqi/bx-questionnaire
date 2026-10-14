/**
 * 设计令牌一致性守卫
 *
 * 真源只有一处：`src/styles/tokens.scss`（CSS 变量）。
 *
 * 另外两处都要被这条测试管住，但方式不同：
 *  - `uno.config.ts` —— UnoCSS theme。**必须与 tokens.scss 同值**：`bg-bx-blue` 取的是
 *    UnoCSS 那份、`color: var(--bx-blue)` 取的是 CSS 变量那份，不同值就会出现两种蓝，
 *    只有对比设计稿或截图才发现。
 *  - `src/uni.scss` —— **不得再出现 `$bx-*`**。历史上有 16 个 `$bx-*` 副本，实测在
 *    `src/` 内引用次数为 0：它不是"第三份真源"，而是死代码。早期版本的这条测试曾去校验
 *    「uni.scss 与 tokens.scss 同值」，等于花力气维护一份没人用的副本 —— 现在反过来守住
 *    「别把死副本写回来」。
 *
 * 与 `style-units.spec.ts` 的产物侧守卫同理：真正危险的不是「写错」，而是「写漏了
 * 但没人发现」。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', 'src')

/** 归一化：大小写与空白差异不算差异（`#007AFF` 与 `#007aff` 同色） */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

/** 从 SCSS 源码里抽出「前缀-名字: 值」形式的变量 */
function readVars(source: string, pattern: RegExp): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of source.matchAll(pattern)) {
    out[match[1]] = normalize(match[2])
  }
  return out
}

/**
 * 取值用 `[^;]+`，不在它前面再放 `\s*`：`\s*` 与 `[^;]+` 能交换字符，
 * 会被 `regexp/no-super-linear-backtracking` 判为回溯风险。
 * 值里的前导空白交给 normalize 的 trim 处理。
 */
const tokens = readVars(
  readFileSync(join(SRC, 'styles', 'tokens.scss'), 'utf8'),
  /--bx-([\w-]+):([^;]+);/g,
)

const uniScss = readFileSync(join(SRC, 'uni.scss'), 'utf8')

/**
 * UnoCSS 的色值**直接读实际生效的配置**，而不是再解析一遍源码：
 * 解析源码只能证明「文件里写着这个数」，读配置才能证明「工具类真的会用这个数」。
 */
const unoConfig = (await import('../uno.config')).default as {
  theme?: { colors?: Record<string, Record<string, string>> }
}

const unoColors: Record<string, string> = Object.fromEntries(
  Object.entries(unoConfig.theme?.colors?.bx ?? {}).map(([name, value]) => [name, normalize(value)]),
)

describe('设计令牌一致性', () => {
  /**
   * 反向保护：正则或配置结构坏掉时，下面的比对会「因为两边都空」而全部通过。
   * 给一个下界，让「解析静默失效」也变红（同 dead-code.spec.ts 的做法）。
   */
  it('两源都能解析到足量令牌（防止空比对）', () => {
    expect(Object.keys(tokens).length, 'tokens.scss 解析到的令牌数').toBeGreaterThanOrEqual(30)
    expect(Object.keys(unoColors).length, 'uno.config.ts 解析到的色值数').toBeGreaterThanOrEqual(18)
  })

  it('uno.config.ts 的 bx 色值与 tokens.scss 同值', () => {
    const mismatched: string[] = []
    for (const [name, value] of Object.entries(unoColors)) {
      const cssValue = tokens[name]
      if (cssValue === undefined) {
        mismatched.push(`bx.${name}：uno.config.ts 有，tokens.scss 缺 --bx-${name}`)
      }
      else if (cssValue !== value) {
        mismatched.push(`bx.${name}：tokens.scss=${cssValue} vs uno.config.ts=${value}`)
      }
    }
    expect(
      mismatched,
      'UnoCSS 工具类色值必须与 CSS 变量同值，否则 bg-bx-blue 与 var(--bx-blue) 不同色',
    ).toEqual([])
  })

  it('tokens.scss 的每个颜色令牌都在 uno.config.ts 里有对应色值', () => {
    const missing: string[] = []
    for (const [name, value] of Object.entries(tokens)) {
      // 只比对颜色（十六进制）；尺寸、阴影、内容宽度不是颜色
      if (!value.startsWith('#')) {
        continue
      }
      if (unoColors[name] === undefined) {
        missing.push(`--bx-${name}（${value}）在 uno.config.ts 的 theme.colors.bx 里缺失`)
      }
    }
    expect(missing, 'tokens.scss 新增颜色时须同步补 uno.config.ts，否则没有对应工具类').toEqual([])
  })

  /**
   * 回归防护：`uni.scss` 里的 `$bx-*` 副本已被删除（实测零引用）。
   * 这条红了 = 有人又把 CSS 变量复制成 SCSS 变量，制造出第二份没人用的真源。
   */
  it('uni.scss 不得再出现 $bx-* 副本', () => {
    const copied = Object.keys(readVars(uniScss, /\$bx-([\w-]+):([^;]+);/g))
    expect(
      copied,
      'uni.scss 只应保留 uni-app 模板变量；$bx-* 一律走 tokens.scss 的 CSS 变量（它才是唯一真源）',
    ).toEqual([])
  })
})
