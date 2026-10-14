/**
 * 设计令牌一致性守卫
 *
 * 同一套色值目前有**三份**声明：
 *  - `src/styles/tokens.scss` —— CSS 变量（运行时主题覆盖的入口）
 *  - `src/uni.scss`          —— SCSS 变量（编译期计算，自动注入每个组件）
 *  - `uno.config.ts`         —— UnoCSS theme（工具类 `bg-bx-blue` 等）
 *
 * 三份都靠人手同步，而**改一处忘另一处不会报错**：`bg-bx-blue` 取的是 UnoCSS
 * 那份，`color: var(--bx-blue)` 取的是 CSS 变量那份 —— 同一个页面于是出现两种蓝，
 * 只有对比设计稿或截图时才发现。这条约束靠人记不住，固化成测试。
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

const uniVars = readVars(
  readFileSync(join(SRC, 'uni.scss'), 'utf8'),
  /\$bx-([\w-]+):([^;]+);/g,
)

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
  it('三源都能解析到足量令牌（防止空比对）', () => {
    expect(Object.keys(tokens).length, 'tokens.scss 解析到的令牌数').toBeGreaterThanOrEqual(16)
    expect(Object.keys(uniVars).length, 'uni.scss 解析到的令牌数').toBeGreaterThanOrEqual(16)
    expect(Object.keys(unoColors).length, 'uno.config.ts 解析到的色值数').toBeGreaterThanOrEqual(14)
  })

  it('uni.scss 的 $bx-* 与 tokens.scss 的 --bx-* 同值', () => {
    const mismatched: string[] = []
    for (const [name, value] of Object.entries(uniVars)) {
      const cssValue = tokens[name]
      if (cssValue === undefined) {
        mismatched.push(`$bx-${name}：uni.scss 有，tokens.scss 缺 --bx-${name}`)
      }
      else if (cssValue !== value) {
        mismatched.push(`$bx-${name}：tokens.scss=${cssValue} vs uni.scss=${value}`)
      }
    }
    expect(
      mismatched,
      'SCSS 变量与 CSS 变量必须同值，否则编译期取值与运行期取值会不一致',
    ).toEqual([])
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
})
