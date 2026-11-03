/**
 * 验证 `#ifdef H5` 条件编译是否真的在产物里被剥离
 *
 * 条件编译是**编译期宏**，不能从源码推断 —— 必须在产物里看。这个脚本对比两端：
 *
 *   H5 产物：H5 分支代码**必须存在**（否则功能丢了）
 *   小程序产物：H5 分支代码**必须不存在**（否则小程序端会引用不存在的 API）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** H5 专属代码的指纹 —— 只可能来自 #ifdef H5 块内 */
const H5_FINGERPRINTS = [
  { name: 'env.ts readHostPathConfig', pattern: 'pathConfig' },
  { name: 'ui.ts scrollToSelector', pattern: 'scrollIntoView' },
  { name: 'embed.ts notifyParent', pattern: 'postMessage' },
  { name: 'embed.ts isEmbedded', pattern: 'window.parent' },
  { name: 'embed.ts isHostChrome（宿主判定）', pattern: '__wxjs_environment' },
  { name: 'useEmbedResize', pattern: 'ResizeObserver' },
]

function collectJs(dir, acc = []) {
  if (!statSync(dir, { throwIfNoEntry: false }))
    return acc
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory())
      collectJs(p, acc)
    else if (name.endsWith('.js'))
      acc.push(p)
  }
  return acc
}

function countIn(files, pattern) {
  let n = 0
  const where = []
  for (const f of files) {
    const c = readFileSync(f, 'utf8')
    if (c.includes(pattern)) {
      n++
      where.push(f)
    }
  }
  return { n, where }
}

const h5Files = collectJs('dist/build/h5')
const mpFiles = collectJs('dist/build/mp-weixin')

if (h5Files.length === 0 || mpFiles.length === 0) {
  console.error('产物不全 —— 先跑 pnpm build h5 --mode test 与 pnpm build mp-weixin --mode test')
  process.exit(2)
}

console.log(`H5 产物 ${h5Files.length} 个 js，小程序产物 ${mpFiles.length} 个 js\n`)

const failures = []
for (const { name, pattern } of H5_FINGERPRINTS) {
  const h5 = countIn(h5Files, pattern)
  const mp = countIn(mpFiles, pattern)
  console.log(`${name}（指纹 "${pattern}"）`)
  console.log(`  H5 产物命中:       ${h5.n}   ← 应 > 0（功能要在）`)
  console.log(`  小程序产物命中:    ${mp.n}   ← 应为 0（必须被剥离）`)
  if (h5.n === 0) {
    failures.push(`${name}：H5 产物里没有 "${pattern}" —— H5 分支被误删，功能丢失`)
  }
  if (mp.n > 0) {
    failures.push(`${name}：小程序产物里出现 "${pattern}"（${mp.where[0]}）—— #ifdef 未生效`)
  }
}

console.log('')
if (failures.length === 0) {
  console.log('== 条件编译验证通过：H5 分支在 H5 产物中保留、在小程序产物中剥离 ==')
  process.exit(0)
}
console.log(`== 问题 ${failures.length} 项 ==`)
for (const f of failures) console.log(`  ${f}`)
process.exit(1)
