/**
 * 页面配置一致性守卫
 *
 * 守住一类**静默失效**：页面级生命周期注册了，但页面配置没开，于是运行时根本不触发
 * —— 没有报错、没有告警，功能就是不工作。
 *
 * 具体是下拉刷新：`onPullDownRefresh` 只有在页面声明了 `enablePullDownRefresh` 时才会
 * 触发，而声明必须写在页面文件的 `definePage` 宏里（编译期），composable 运行时改不了。
 *
 * 另有一个更隐蔽的坑：`definePage` 写成**扁平键**能通过类型检查、也会写进 pages.json，
 * 但 uni-app 只读 `style` 嵌套 —— 小程序端 page json 完全拿不到。实测踩过：
 *
 *   definePage({ enablePullDownRefresh: true })            ← 静默失效
 *   definePage({ style: { enablePullDownRefresh: true } }) ← 正确
 *
 * 这里**读源码**而不是读生成的 pages.json：pages.json 被 gitignore，新克隆的仓库里
 * 不存在，测试会直接 ENOENT —— 那等于把一个「靠先构建」的隐性前提塞进单测。
 * 产物侧的对应保证放在 scripts/check-mp.mjs（比对源码声明与小程序 page json）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RECORD_HISTORY_PAGE_STYLE } from '@/composables/useRecordHistoryPage'

const ROOT = join(__dirname, '..')

function collectPages(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      collectPages(p, acc)
      continue
    }
    if (name.endsWith('.vue'))
      acc.push(p.replace(/\\/g, '/'))
  }
  return acc
}

/** 取出页面里 `definePage({ ... })` 的实参原文；没有则返回 null */
function readDefinePage(src: string): string | null {
  const idx = src.indexOf('definePage(')
  if (idx === -1)
    return null
  // 从宏名后的第一个 `(` 起做括号配对，避免嵌套对象把 `})` 提前截断
  let depth = 0
  const open = src.indexOf('(', idx)
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') {
      depth++
    }
    else if (src[i] === ')') {
      depth--
      if (depth === 0)
        return src.slice(open + 1, i)
    }
  }
  return null
}

const PAGES = collectPages(join(ROOT, 'src/pages'))

describe('页面配置一致性', () => {
  it('使用 useRecordHistoryPage 的页面都声明了下拉刷新', () => {
    const offenders: string[] = []

    for (const file of PAGES) {
      const src = readFileSync(file, 'utf8')
      if (!src.includes('useRecordHistoryPage'))
        continue

      const route = file.replace(/^.*\/src\//, '').replace(/\.vue$/, '')
      const arg = readDefinePage(src)
      if (arg === null) {
        offenders.push(`${route}: 没有 definePage 声明`)
        continue
      }
      for (const key of Object.keys(RECORD_HISTORY_PAGE_STYLE)) {
        // 只认 style 嵌套 —— 扁平键会被 uni-app 忽略
        if (!new RegExp(`style\\s*:\\s*\\{[^}]*\\b${key}\\b`).test(arg)) {
          offenders.push(`${route}: definePage 里 style.${key} 缺失（扁平键无效，必须放进 style）`)
        }
      }
    }

    expect(offenders, `页面配置与 composable 声明不一致：\n${offenders.join('\n')}`).toEqual([])
  })

  it('definePage 里没有写在顶层的页面配置键', () => {
    // 扁平键会被 uni-app 忽略：能通过类型检查、也写进 pages.json，但产物拿不到。
    const FLAT_KEYS = ['enablePullDownRefresh', 'navigationBarTitleText', 'navigationStyle', 'disableScroll']
    const offenders: string[] = []

    for (const file of PAGES) {
      const arg = readDefinePage(readFileSync(file, 'utf8'))
      if (arg === null)
        continue
      const route = file.replace(/^.*\/src\//, '').replace(/\.vue$/, '')
      // 去掉 style: { ... } 内部再判断，否则 style 里的键也会被当成顶层键
      const withoutStyle = arg.replace(/style\s*:\s*\{[^}]*\}/g, '')
      for (const key of FLAT_KEYS) {
        if (new RegExp(`\\b${key}\\s*:`).test(withoutStyle)) {
          offenders.push(`${route}: "${key}" 写在 definePage 顶层，应放进 style`)
        }
      }
    }

    expect(offenders, `扁平页面配置会被 uni-app 忽略：\n${offenders.join('\n')}`).toEqual([])
  })

  it('至少覆盖到了 history 两个页面（防止扫描静默失效）', () => {
    // 反向保护：若 collectPages 或匹配逻辑坏掉，上面两条会「因为没扫到而通过」
    const users = PAGES.filter(f => readFileSync(f, 'utf8').includes('useRecordHistoryPage'))
    expect(users.length).toBe(2)
  })
})
