/**
 * 轻量变异测试：对核心 domain 源码注入小变异，跑测试看是否被发现。
 * 存活的变异说明测试没有覆盖到那处逻辑 —— 即「看起来在保护、实际测不出问题」。
 *
 * 只做有限且语义明确的变异，避免产生等价变异（改了但行为不变）导致误报。
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

/** 变异模式：每项是 [匹配的正则, 替换函数]，只替换第一处 */
const MUTATORS = [
  ['逻辑与 → 或', /(if \([^\n]*?)&&/],
  ['逻辑或 → 与', /(if \([^\n]*?)\|\|/],
  ['严格不等 → 严格相等', /!==/],
  ['严格相等 → 严格不等', /===/],
  ['大于等于 → 小于', />=/],
  ['小于等于 → 大于', /<=/],
  ['大于 → 小于等于', /(?<![<>!=])>(?!=)/],
  ['小于 → 大于等于', /(?<![<>!=])<(?!=)/],
  ['取反符删除', /if \(!/],
]

const TARGETS = [
  { file: 'src/domain/questionnaire/scoring.ts', test: 'test/domain/scoring.spec.ts' },
  { file: 'src/domain/questionnaire/validator.ts', test: 'test/domain/validator.spec.ts' },
  { file: 'src/domain/questionnaire/format.ts', test: 'test/domain/format.spec.ts' },
  { file: 'src/domain/questionnaire/prefill.ts', test: 'test/domain/prefill.spec.ts' },
  { file: 'src/domain/questionnaire/serializer.ts', test: 'test/domain/serializer.spec.ts' },
  { file: 'src/domain/questionnaire/draft.ts', test: 'test/domain/draft.spec.ts' },
  { file: 'src/domain/questionnaire/mapper.ts', test: 'test/domain/mapper.spec.ts' },
  { file: 'src/utils/query.ts', test: 'test/utils/query.spec.ts' },
]

function runTest(testFile) {
  try {
    execSync(`pnpm vitest run ${testFile}`, { stdio: 'pipe', timeout: 120000 })
    return true // 通过
  }
  catch {
    return false // 失败（说明变异被发现）
  }
}

const report = []
for (const { file, test } of TARGETS) {
  const original = readFileSync(file, 'utf8')
  const basePass = runTest(test)
  if (!basePass) {
    console.log(`[跳过] ${file} —— 基线测试就没通过`)
    continue
  }
  const lines = original.split('\n')
  let killed = 0
  let survived = 0
  const survivedList = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('*') || line.trim().startsWith('//') || line.trim().startsWith('/*')) {
      continue
    }
    for (const [name, re] of MUTATORS) {
      if (!re.test(line)) continue
      const mutated = line.replace(re, (m, prefix) => {
        if (name === '逻辑与 → 或') return `${prefix}||`
        if (name === '逻辑或 → 与') return `${prefix}&&`
        if (name === '严格不等 → 严格相等') return '=='
        if (name === '严格相等 → 严格不等') return '!='
        if (name === '大于等于 → 小于') return '<'
        if (name === '小于等于 → 大于') return '>'
        if (name === '大于 → 小于等于') return '<='
        if (name === '小于 → 大于等于') return '>='
        if (name === '取反符删除') return 'if ('
        return m
      })
      if (mutated === line) continue

      const next = [...lines]
      next[i] = mutated
      writeFileSync(file, next.join('\n'), 'utf8')
      const passed = runTest(test)
      writeFileSync(file, original, 'utf8')

      if (passed) {
        survived++
        survivedList.push(`    第 ${i + 1} 行 [${name}] ${mutated.trim()}`)
      }
      else {
        killed++
      }
    }
  }

  console.log(`\n=== ${file} ===`)
  console.log(`  变异总数 ${killed + survived}：被发现 ${killed}，存活 ${survived}`)
  if (survivedList.length) {
    console.log(`  存活的变异（测试盲区）：`)
    survivedList.forEach(l => console.log(l))
  }
  report.push({ file, killed, survived })
}

// 确认全部恢复
for (const { file } of TARGETS) {
  const now = readFileSync(file, 'utf8')
  const committed = execSync(`git show HEAD:${file.replace(/\\/g, '/')}`, { stdio: 'pipe' }).toString()
  const norm = s => s.replace(/\r\n/g, '\n')
  console.log(`\n恢复校验 ${file}: ${norm(now) === norm(committed) ? '与 HEAD 一致 ✓' : '不一致 ✗'}`)
}

const totalKilled = report.reduce((s, r) => s + r.killed, 0)
const totalSurvived = report.reduce((s, r) => s + r.survived, 0)
console.log(`\n== 合计：变异 ${totalKilled + totalSurvived}，被发现 ${totalKilled}，存活 ${totalSurvived} ==`)
