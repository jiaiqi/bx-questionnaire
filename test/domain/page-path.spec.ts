import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 页面路径一致性检查
 *
 * 代码里硬编码的 `/pages/...` 路径必须对应真实存在的页面文件。
 * 起因：BxNavBar 的兜底跳转写成 `/pages/questionnaire/cover`（缺 `/index`），
 * 而真实页面是 `pages/questionnaire/cover/index` —— 无上级页面时点返回会静默失败。
 * 这类错误人工审查容易漏，改为结构性保证。
 */

const SRC = join(process.cwd(), 'src')

/** 页面路由：src/pages 下每个 .vue 文件对应 `/pages/...`（去掉 src/ 前缀与扩展名） */
function collectRoutes(): Set<string> {
  const routes = new Set<string>()
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.endsWith('.vue')) {
        continue
      }
      const rel = relative(SRC, full).replace(/\\/g, '/').replace(/\.vue$/, '')
      routes.add(`/${rel}`)
    }
  }
  walk(join(SRC, 'pages'))
  return routes
}

/** 递归收集源码文件 */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out)
      continue
    }
    if (/\.(?:vue|ts)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

describe('页面路径一致性', () => {
  const routes = collectRoutes()

  it('应收集到全部页面路由', () => {
    // 10 个作答/结果页 + 2 个编辑器页（问卷列表、设计器）
    expect(routes.size).toBe(12)
    expect(routes.has('/pages/questionnaire/cover/index')).toBe(true)
    expect(routes.has('/pages/questionnaire/index/index')).toBe(true)
    expect(routes.has('/pages/editor/list/index')).toBe(true)
    expect(routes.has('/pages/editor/design/index')).toBe(true)
  })

  it('代码里硬编码的页面路径都应存在对应页面文件', () => {
    const missing: string[] = []
    for (const file of collectSourceFiles(SRC)) {
      const content = readFileSync(file, 'utf8')
      // 匹配 /pages/xxx/yyy，允许后面跟 ? 或引号或反引号
      const matches = content.matchAll(/\/pages\/[\w\-/]+/g)
      for (const match of matches) {
        const path = match[0]
        // 排除注释里的示例（main.ts 的说明性注释）与带扩展名的静态资源
        if (path.endsWith('.js') || path.endsWith('.css')) {
          continue
        }
        if (!routes.has(path)) {
          missing.push(`${relative(SRC, file).replace(/\\/g, '/')} → ${path}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('应能捕获缺少 /index 的路径（反向验证）', () => {
    // 保证检查逻辑本身有效：cover 的父路径不在路由集合里
    expect(routes.has('/pages/questionnaire/cover')).toBe(false)
  })
})
