import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 产物安全扫描
 *
 * 判定标准随构建模式而变 —— 这不是宽松，而是**两种模式的正确含义不同**：
 *
 *   --mode test       本地联调产物。Vite 的加载顺序是
 *                     `.env.test.local` > `.env.test` > `.env.local` > `.env`，
 *                     所以 `.env.local` 里的联调票据**必然**被打进产物，
 *                     这是预期行为。此时要求「0 票据字面量」是错的断言。
 *
 *   --mode production 生产产物。`.env.production` 刻意保留一行空的
 *                     `VITE_BX_TICKET=`，作用是**阻断** `.env.local` 的票据
 *                     进入生产包（Vite 里已定义的键不会被低优先级文件覆盖）。
 *                     所以生产产物必须 0 票据字面量 —— 这是硬红线。
 *
 * 用法：node scripts/scan-dist.mjs <test|production>
 */
const mode = process.argv[2] || 'test'
if (!['test', 'production'].includes(mode)) {
  console.error(`未知模式：${mode}（只接受 test / production）`)
  process.exit(2)
}

const ROOT = 'dist/build/h5'
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else files.push(p)
  }
}
walk(ROOT)

let devGateway = 0
let prodGateway = 0
let ticketLiteral = 0
const hits = []

for (const f of files) {
  if (!/\.(js|html|css|json)$/.test(f)) continue
  const c = readFileSync(f, 'utf8')
  if (c.includes('192.168.0.214')) { devGateway++; hits.push(`[开发网关] ${f}`) }
  if (c.includes('gxqcxkj.com')) { prodGateway++; hits.push(`[生产网关] ${f}`) }
  if (/xabxdzkj-[0-9a-f]{8}-/.test(c)) { ticketLiteral++; hits.push(`[票据字面量] ${f}`) }
}

const size = files.reduce((s, f) => s + statSync(f).size, 0)
console.log(`模式：${mode}`)
console.log(`扫描 ${files.length} 个文件 / ${(size / 1024).toFixed(1)} KB`)
console.log(`  开发网关 192.168.0.214: ${devGateway}`)
console.log(`  生产网关 gxqcxkj.com:   ${prodGateway}`)
console.log(`  票据字面量:             ${ticketLiteral}`)
console.log('')
for (const h of hits) console.log(`  ${h}`)

const failures = []
if (mode === 'production') {
  // 生产硬红线：绝不能带联调票据，也绝不能连内网开发网关
  if (ticketLiteral > 0) failures.push(`生产产物出现票据字面量（${ticketLiteral} 处）—— 严重泄漏`)
  if (devGateway > 0) failures.push(`生产产物指向内网开发网关（${devGateway} 处）`)
  if (prodGateway === 0) failures.push('生产产物没有生产网关 —— 构建模式可能不对')
}
else {
  // 联调产物：必须连对网关，否则 e2e / perf 会打到不存在的环境
  if (devGateway === 0) failures.push('联调产物没有开发网关 —— 构建模式不对，e2e 与 perf 会连错环境')
  if (prodGateway > 0) failures.push(`联调产物指向生产网关（${prodGateway} 处）—— 会污染生产数据`)
}

console.log(failures.length === 0 ? '\n== 检查通过 ==' : `\n== 问题 ${failures.length} 项 ==\n${failures.map(f => '  ' + f).join('\n')}`)
process.exit(failures.length === 0 ? 0 : 1)
