/**
 * 微信小程序产物校验
 *
 * 存在的理由：第 99 轮才发现小程序端从第 92 轮起**完全构建不出来** ——
 * 自定义指令 `v-aria-label` 让 vue 编译器直接报 `unknown directive`。
 * 之前每轮都在跑 e2e / a11y / smoke，但它们**全在 H5 上**，一路全绿。
 *
 * 只验证一端等于没验证。这个脚本把小程序产物的完整性检查固化下来：
 * 页面文件齐全、无 rpx、无 H5 专属 API 泄漏、导航配置正确。
 *
 * 用法：node scripts/check-mp.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'dist/build/mp-weixin'
const APP_JSON = join(ROOT, 'app.json')

const failures = []
const notes = []

function fail(msg) {
  failures.push(msg)
}

if (!existsSync(APP_JSON)) {
  console.error(`找不到 ${APP_JSON} —— 先跑 pnpm build mp-weixin --mode test`)
  process.exit(1)
}

const appJson = JSON.parse(readFileSync(APP_JSON, 'utf8'))
const pages = appJson.pages ?? []
notes.push(`页面数 ${pages.length}`)

// ① 每个页面都要有 .js / .wxml / .json
//
//    `.wxss` **不在必查列表里**：源码没有 `<style>` 块时 uni-app 不会产出 wxss
//    （实测 history/history 与 survey/history 就是这样）。第一版把 wxss 也当必需，
//    结果报了两个不存在的「缺失」—— 审计过严会把正常情况报成缺陷。
//
//    真正有意义的是反向断言：源码**有** `<style>` 就**必须**有 wxss，
//    否则就是构建把样式丢了（页面能用但样式全无，最难发现的那种回归）。
const REQUIRED_EXT = ['js', 'wxml', 'json']
const missing = []
for (const p of pages) {
  for (const ext of REQUIRED_EXT) {
    const f = join(ROOT, `${p}.${ext}`)
    if (!existsSync(f)) {
      missing.push(`${p}.${ext}`)
    }
  }
}
if (missing.length > 0) {
  fail(`页面文件缺失 ${missing.length} 个：${missing.slice(0, 6).join('、')}`)
}

// ①b 源码有 <style> 的页面必须产出 wxss
const styleMissing = []
for (const p of pages) {
  const srcFile = join('src', `${p}.vue`)
  if (!existsSync(srcFile))
    continue
  const src = readFileSync(srcFile, 'utf8')
  const hasStyle = /<style[^>]*>[\s\S]*?<\/style>/.test(src)
  const hasWxss = existsSync(join(ROOT, `${p}.wxss`))
  if (hasStyle && !hasWxss) {
    styleMissing.push(`${p}.wxss`)
  }
}
if (styleMissing.length > 0) {
  fail(`源码有 <style> 但产物缺 wxss（样式会整页丢失）：${styleMissing.join('、')}`)
}

// ② 页面数必须与 src/pages 下的页面目录一致（漏页是最隐蔽的回归）
const SRC_PAGES = 'src/pages'
function collectPages(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      collectPages(p, acc)
      continue
    }
    if (/\.vue$/.test(name)) {
      // src/pages/questionnaire/index/index.vue → pages/questionnaire/index/index
      acc.push(p.replace(/\\/g, '/').replace(/^src\//, '').replace(/\.vue$/, ''))
    }
  }
  return acc
}
const srcPages = collectPages(SRC_PAGES)
const notInAppJson = srcPages.filter(p => !pages.includes(p))
if (notInAppJson.length > 0) {
  fail(`src 里有页面未注册进 app.json：${notInAppJson.join('、')}`)
}
notes.push(`src 页面 ${srcPages.length} 个`)

// ③ rpx 只允许出现在已知的 UnoCSS 预设工具类里
const ALLOWED_RPX = ['.px{padding-left:32rpx;padding-right:32rpx}']
const rpxOffenders = []
for (const f of readdirSync(ROOT)) {
  if (!f.endsWith('.wxss'))
    continue
  const css = readFileSync(join(ROOT, f), 'utf8')
  const re = /[^{}]*\{[^{}]*\d(?:\.\d+)?rpx[^{}]*\}/g
  let m = re.exec(css)
  while (m !== null) {
    const rule = m[0].trim()
    if (!ALLOWED_RPX.includes(rule)) {
      rpxOffenders.push(`${f}: ${rule.slice(0, 90)}`)
    }
    m = re.exec(css)
  }
}
if (rpxOffenders.length > 0) {
  fail(`非预期的 rpx 规则 ${rpxOffenders.length} 处（PC 横屏会等比放大）：${rpxOffenders[0]}`)
}

// ④ H5 专属 API 不得出现在小程序产物里
//
//    `typeof window !== 'undefined'` 这类**运行时守卫**是允许的（正是为了让同一份
//    代码在两端都能跑）；这里查的是**无守卫的属性访问**，例如 `window.location` /
//    `document.body` 出现在没有 typeof 判断的地方。小程序端没有 window / document，
//    会直接白屏。
//
//    判定方式踩了两次坑，都是「审计过严把正常代码报成缺陷」：
//      - 第一版只列 `document.querySelector` 等几个具体字符串 —— 太窄，真实泄漏
//        可能是 `document.body` 或 `document.getElementById`。
//      - 第二版改成「往前看 80 字符有没有 typeof」—— 太窄的窗口：压缩后的
//        `if("undefined"!=typeof window&&void 0!==window.location){...}` 里，
//        块内后面的几处 `window.` 离守卫已经超过 80 字符，被误报成 3 处泄漏。
//
//    现在用**括号配对**求守卫块的真实范围：找到 `typeof X` 之后，从它后面的 `{`
//    开始配对，整个块内都算已守卫。不再依赖固定距离。
function guardedRanges(code, globalName) {
  const ranges = []
  const re = new RegExp(`typeof\\s+${globalName}\\b`, 'g')
  let m = re.exec(code)
  while (m !== null) {
    const braceStart = code.indexOf('{', m.index)
    // 守卫与块之间不该隔太远（压缩后紧邻；源码里也不会跨行太远）
    if (braceStart !== -1 && braceStart - m.index < 400) {
      let depth = 0
      for (let i = braceStart; i < code.length; i++) {
        if (code[i] === '{')
          depth++
        else if (code[i] === '}') {
          depth--
          if (depth === 0) {
            ranges.push([m.index, i])
            break
          }
        }
      }
    }
    m = re.exec(code)
  }
  return ranges
}

const GLOBAL_PROPS = [
  ['document.', 'document'],
  ['window.', 'window'],
  ['localStorage.', 'localStorage'],
  ['sessionStorage.', 'sessionStorage'],
]
const leaks = []
function walkJs(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walkJs(p)
      continue
    }
    if (!name.endsWith('.js'))
      continue
    const c = readFileSync(p, 'utf8')
    for (const [api, globalName] of GLOBAL_PROPS) {
      const ranges = guardedRanges(c, globalName)
      let from = 0
      for (;;) {
        const idx = c.indexOf(api, from)
        if (idx === -1)
          break
        from = idx + 1
        if (ranges.some(([s, e]) => idx >= s && idx <= e))
          continue
        leaks.push(`${p.replace(/\\/g, '/')}: ${api}`)
      }
    }
  }
}
walkJs(ROOT)
if (leaks.length > 0) {
  fail(`小程序产物里出现无守卫的 H5 专属 API（${leaks.length} 处）：${leaks.slice(0, 4).join('、')}`)
}

// ⑤ 导航配置
if (appJson.window?.navigationStyle !== 'custom') {
  fail(`navigationStyle 应为 custom（页面自带导航栏），实际 ${appJson.window?.navigationStyle}`)
}
if ((appJson.subPackages ?? []).length > 0) {
  notes.push(`分包 ${appJson.subPackages.length} 个`)
}

// ⑥ 主包体积（微信限制 2MB）
const files = []
function walkAll(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkAll(p)
    else files.push(p)
  }
}
walkAll(ROOT)
const size = files.reduce((s, f) => s + statSync(f).size, 0)
notes.push(`${files.length} 文件 / ${(size / 1024).toFixed(1)} KB`)
if (size > 2 * 1024 * 1024) {
  fail(`主包 ${(size / 1024 / 1024).toFixed(2)} MB 超过微信 2MB 限制`)
}

// ⑦ 环境相关断言（判定标准随构建模式而变）
//
//    与 scripts/scan-dist.mjs 同样的道理：两种模式的**正确含义不同**，不是宽松。
//
//      --mode test       联调产物。Vite 的加载顺序是
//                        `.env.test.local` > `.env.test` > `.env.local` > `.env`，
//                        所以 `.env.local` 的联调票据**必然**被打进产物 —— 预期行为。
//                        此时要求「0 票据」是错的断言。必须连开发网关，
//                        否则真机联调会打到不存在的环境。
//      --mode production 生产产物。`.env.production` 刻意保留一行空的
//                        `VITE_BX_TICKET=`，作用是阻断 `.env.local` 的票据进入生产包。
//                        所以必须 0 票据字面量，且不得指向内网开发网关 —— 硬红线。
const MODE = process.argv[2] || 'test'
if (!['test', 'production'].includes(MODE)) {
  console.error(`未知模式：${MODE}（只接受 test / production）`)
  process.exit(2)
}
let devGateway = 0
let prodGateway = 0
let ticketLiteral = 0
function walkJsText(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walkJsText(p)
      continue
    }
    if (!name.endsWith('.js'))
      continue
    const c = readFileSync(p, 'utf8')
    if (c.includes('192.168.0.214'))
      devGateway++
    if (c.includes('gxqcxkj.com'))
      prodGateway++
    if (/xabxdzkj-[0-9a-f]{8}-/.test(c))
      ticketLiteral++
  }
}
walkJsText(ROOT)
notes.push(`模式 ${MODE}：开发网关 ${devGateway} / 生产网关 ${prodGateway} / 票据 ${ticketLiteral}`)

if (MODE === 'production') {
  if (ticketLiteral > 0)
    fail(`生产产物出现票据字面量（${ticketLiteral} 处）—— 严重泄漏`)
  if (devGateway > 0)
    fail(`生产产物指向内网开发网关（${devGateway} 处）`)
  if (prodGateway === 0)
    fail('生产产物没有生产网关 —— 构建模式可能不对')
}
else {
  if (devGateway === 0)
    fail('联调产物没有开发网关 —— 真机联调会打到不存在的环境')
  if (prodGateway > 0)
    fail(`联调产物指向生产网关（${prodGateway} 处）—— 会污染生产数据`)
}

console.log(`小程序产物：${notes.join('，')}`)
if (failures.length === 0) {
  console.log('== 校验通过 ==')
  process.exit(0)
}
console.log(`\n== 问题 ${failures.length} 项 ==`)
for (const f of failures) console.log(`  ${f}`)
process.exit(1)
