/**
 * 样式单位的跨端约束
 *
 * 目标要求「微信小程序要支持移动端（竖屏）布局和 pc（横屏）布局」，而小程序端
 * 的 `rpx` 是**按 750 设计稿等比缩放**的：屏幕越宽，rpx 实际像素越大。在手机上
 * 375px 宽时 1rpx = 0.5px 刚好，到了 PC（微信 Windows/Mac 客户端，宽屏）就会
 * 被放大到 2 倍以上 —— 整页字号与间距会失控。
 *
 * 所以本项目**统一用 px**，靠 `max-width: var(--bx-content-width)` + 居中来做
 * 宽屏适配，而不是靠 rpx 自适应。这条约束靠人记不住，固化成测试。
 *
 * 反过来，H5 端若误用 rpx，uni-app 也会按 375 基准换算，同样不该出现。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', 'src')
const MP_DIST = join(__dirname, '..', 'dist', 'build', 'mp-weixin')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      out.push(...walk(p))
      continue
    }
    if (/\.(?:vue|scss|css|ts)$/.test(name))
      out.push(p)
  }
  return out
}

/** 命中 rpx 的行（排除注释里的说明） */
function findRpxLines(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split('\n')
  const hits: string[] = []
  lines.forEach((line, i) => {
    if (!/\d\s*rpx\b/.test(line))
      return
    // 注释行不算
    const trimmed = line.trim()
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*'))
      return
    hits.push(`${relative(SRC, file).replace(/\\/g, '/')}:${i + 1} ${trimmed}`)
  })
  return hits
}

describe('样式单位约束', () => {
  it('src 下不得使用 rpx（小程序 PC 横屏会被等比放大）', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      offenders.push(...findRpxLines(file))
    }
    expect(
      offenders,
      'rpx 在小程序宽屏（PC）下会等比放大，导致整页字号失控；请改用 px + max-width 居中',
    ).toEqual([])
  })

  it('内容宽度常量存在且为 px（宽屏适配依赖它）', () => {
    const tokens = readFileSync(join(SRC, 'styles', 'tokens.scss'), 'utf8')
    const m = tokens.match(/--bx-content-width:\s*(\d+)px/)
    expect(m, 'tokens.scss 应定义 --bx-content-width（px）').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(0)
  })

  /**
   * 产物侧的守卫
   *
   * 只扫 src 是不够的：`@uni-helper/unocss-preset-uni` 会把工具类里的 px 换算成
   * rpx（实测 `.px` 类产出 `padding-left:32rpx`）。那个类本项目从未使用，属于
   * 预设的固定产物，风险低 —— 但**只扫 src 的测试发现不了它**，于是「零 rpx」
   * 这条约束在产物层面是无人看管的。
   *
   * 这里断言产物里的 rpx 只出现在已知的 UnoCSS 工具类选择器里。若哪天有人
   * 在 `.vue` 里写了 rpx 又被预处理器换算进产物，或预设新增了 rpx 工具类，
   * 这条会变红。
   */
  it('小程序产物里的 rpx 只来自 UnoCSS 预设的工具类（src 侧已单独守住）', () => {
    const wxss = join(MP_DIST, 'app.wxss')
    if (!existsSync(wxss)) {
      // 未构建时跳过 —— 构建产物是外部条件，不该让单测在干净检出上失败
      return
    }
    const css = readFileSync(wxss, 'utf8')
    // 允许清单：UnoCSS 预设产出的固定工具类（本项目未使用，仅随预设带出）
    const ALLOWED = ['.px{padding-left:32rpx;padding-right:32rpx}']
    const offenders: string[] = []
    const re = /[^{}]*\{[^{}]*\d(?:\.\d+)?rpx[^{}]*\}/g
    let m = re.exec(css)
    while (m !== null) {
      const rule = m[0].trim()
      if (!ALLOWED.includes(rule)) {
        offenders.push(rule.slice(0, 120))
      }
      m = re.exec(css)
    }
    expect(
      offenders,
      '小程序产物里出现非预期的 rpx 规则：rpx 在 PC 横屏会等比放大，请改用 px',
    ).toEqual([])
  })
})
