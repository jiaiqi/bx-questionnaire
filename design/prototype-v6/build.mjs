#!/usr/bin/env node
/**
 * 把多文件原型内联成单个 standalone.html（双击即可离线打开、便于外发评审）。
 *
 * 用法：node design/prototype-v6/build.mjs
 *
 * 只做两件事：把 <link rel="stylesheet" href="assets/*.css"> 换成 <style>，
 * 把 <script src="assets/*.js"> 换成内联 <script>。不压缩、不改语义，
 * 便于评审时仍能「查看源代码」。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(here, 'index.html')
const outPath = join(here, 'standalone.html')

let html = readFileSync(htmlPath, 'utf8')
const missing = []

html = html.replace(
  /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g,
  (match, href) => {
    const file = join(here, href)
    if (!existsSync(file)) {
      missing.push(href)
      return `<!-- 缺失样式：${href} -->`
    }
    const css = readFileSync(file, 'utf8')
    return `<style data-src="${href}">\n${css}\n</style>`
  },
)

html = html.replace(
  /<script\s+src="([^"]+)"><\/script>/g,
  (match, src) => {
    const file = join(here, src)
    if (!existsSync(file)) {
      missing.push(src)
      return `<!-- 缺失脚本：${src} -->`
    }
    const js = readFileSync(file, 'utf8').replace(/<\/script>/gi, '<\\/script>')
    return `<script data-src="${src}">\n${js}\n</script>`
  },
)

html = html.replace(
  '<body>',
  `<body>\n  <!-- 由 build.mjs 生成：${new Date().toISOString()} · 单文件离线版 -->`,
)

writeFileSync(outPath, html, 'utf8')
const kb = (html.length / 1024).toFixed(1)
console.log(`✓ ${outPath}  (${kb} KB)`)

if (missing.length) {
  console.error(`\n✗ 以下资源不存在，产物不完整：\n  - ${missing.join('\n  - ')}`)
  process.exitCode = 1
}
