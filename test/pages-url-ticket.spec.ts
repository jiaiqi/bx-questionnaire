/**
 * 全页面 URL 票据接入守卫
 *
 * 需求是「**所有页面**中 URL 传入 bx_auth_ticket 来免登录」。单测只能覆盖到
 * 工具函数与 store，覆盖不到「某个页面忘了接」—— 而漏一个页面就是该页面
 * 首个请求以匿名身份发出（登录访问的问卷直接 0011）。
 *
 * 所以这里做结构性扫描：每个页面必须自己调用 `useUrlTicket()` / `adoptUrlTicket()`，
 * 或者使用已经采纳票据的页面逻辑 composable。新增页面时忘了接，这条会变红。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')
const PAGES_DIR = join(ROOT, 'src/pages')

/**
 * 页面逻辑在 composable 里、由 composable 内部采纳票据的入口
 *
 * 与 `src/composables/useUrlTicket.ts` 的接入约定保持一致：这些 composable
 * 的第一行都调用了 `useUrlTicket()`。
 */
const ADOPTING_COMPOSABLES = ['useResultPage', 'useRecordHistoryPage', 'useEditorDesign']

/** 递归收集页面文件（.vue） */
function collectPages(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      collectPages(abs, acc)
      continue
    }
    if (name.endsWith('.vue')) {
      acc.push(abs)
    }
  }
  return acc
}

function relative(file: string): string {
  return file.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '')
}

describe('全页面 URL 票据接入', () => {
  const pages = collectPages(PAGES_DIR)

  it('扫描到全部页面（防止扫描器静默失效）', () => {
    // 当前 14 个页面；给下界而不是精确值，新增页面时不必改这里
    expect(pages.length).toBeGreaterThanOrEqual(14)
  })

  it('每个页面都接入了 URL 票据采纳', () => {
    const missing = pages
      .filter((file) => {
        const content = readFileSync(file, 'utf8')
        return !content.includes('useUrlTicket')
          && !content.includes('adoptUrlTicket')
          && !ADOPTING_COMPOSABLES.some(name => content.includes(name))
      })
      .map(relative)

    expect(
      missing,
      `以下页面未接入 URL 票据免登录（URL 带 bx_auth_ticket 时首个请求会是匿名）：\n${missing.join('\n')}`,
    ).toEqual([])
  })
})
