/**
 * 死代码扫描 CLI
 *
 * 逻辑在 `scripts/lib/dead-exports.mjs`，同一份实现也被 `test/dead-code.spec.ts`
 * 引用 —— 只做成脚本的话靠的是「记得跑」，做成单测才是结构性保证。
 *
 * 用法：node scripts/find-dead-exports.mjs
 */
import { scanDeadSymbols } from './lib/dead-exports.mjs'

const { fileCount, symbolCount, onlyTest, fullyDead } = scanDeadSymbols()

console.log(`扫描 ${fileCount} 个 src 文件，发现 ${symbolCount} 个导出 / store 成员`)
console.log(`（引用统计区分 src 与 test：只在测试里被引用 = 生产未接线）\n`)

if (onlyTest.length === 0 && fullyDead.length === 0) {
  console.log('== 所有符号都在 src 里被引用，或在允许清单中 ==')
  process.exit(0)
}

if (fullyDead.length > 0) {
  console.log(`== 完全死代码 ${fullyDead.length} 个（src 与 test 都没用）==`)
  for (const d of fullyDead) console.log(`  ${d.file}: ${d.name}`)
  console.log('')
}
if (onlyTest.length > 0) {
  console.log(`== 仅测试使用 ${onlyTest.length} 个（生产代码未接线）==`)
  for (const d of onlyTest) console.log(`  ${d.file}: ${d.name}（test 引用 ${d.inTest} 处）`)
}
process.exit(1)
