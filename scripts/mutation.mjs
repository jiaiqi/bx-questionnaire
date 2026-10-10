/**
 * 轻量变异测试：对核心 domain 源码注入小变异，跑测试看是否被发现。
 * 存活的变异说明测试没有覆盖到那处逻辑 —— 即「看起来在保护、实际测不出问题」。
 *
 * 只做有限且语义明确的变异，避免产生等价变异（改了但行为不变）导致误报。
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

/**
 * 变异模式：每项是 [名称, 正则]，只替换第一处。
 *
 * `<` / `>` 的规则要求前面**不是标识符字符** —— 否则会命中泛型语法
 * （如 `reactive<AnswerMap>({})`、`bxSelect<Row>({...})`），
 * 产生「语法都变了」的假变异，白白算成测试盲区。
 */
const MUTATORS = [
  ['逻辑与 → 或', /(if \([^\n]*?)&&/],
  ['逻辑或 → 与', /(if \([^\n]*?)\|\|/],
  ['严格不等 → 严格相等', /!==/],
  ['严格相等 → 严格不等', /===/],
  ['大于等于 → 小于', /(?<![A-Za-z0-9_$])>=/],
  ['小于等于 → 大于', /(?<![A-Za-z0-9_$])<=/],
  ['大于 → 小于等于', /(?<![<>!=A-Za-z0-9_$])>(?!=)/],
  ['小于 → 大于等于', /(?<![<>!=A-Za-z0-9_$])<(?!=)/],
  ['取反符删除', /if \(!/],
]

/**
 * 已知等价变异：改法与原文**行为完全相同**，测试杀不掉是正常的，不该算盲区。
 * 只在确认过「两条实现路径在所有输入下结果一致」后才登记，理由必须写清。
 */
const EQUIVALENT = [
  {
    file: 'src/utils/request/env.ts',
    line: 22,
    reason: 'top 为 null 时 top.pathConfig 抛错被外层 catch 吞掉；'
      + 'top 存在但无 pathConfig 时返回 undefined，调用方同样按 falsy 处理',
  },
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
  // 请求层与接口层：写入路径的核心，此前未纳入变异检查
  { file: 'src/utils/request/index.ts', test: 'test/utils/request.spec.ts' },
  { file: 'src/utils/storage.ts', test: 'test/utils/draft-storage.spec.ts' },
  { file: 'src/api/daq/record.ts', test: 'test/api/daq-contract.spec.ts' },
  { file: 'src/api/daq/activity.ts', test: 'test/api/daq-contract.spec.ts' },
  // 组合式函数 / store / 环境与附件接口：补齐后覆盖全部有单测的模块
  { file: 'src/composables/useDraft.ts', test: 'test/composables/useDraft.spec.ts' },
  { file: 'src/composables/useSubmit.ts', test: 'test/composables/useSubmit.spec.ts' },
  { file: 'src/composables/useQuestionnaire.ts', test: 'test/composables/useQuestionnaire.spec.ts' },
  { file: 'src/composables/useAnswerModel.ts', test: 'test/composables/useAnswerModel.spec.ts' },
  { file: 'src/stores/session.ts', test: 'test/utils/draft-storage.spec.ts' },
  { file: 'src/utils/request/env.ts', test: 'test/utils/request.spec.ts' },
  { file: 'src/api/file/attachment.ts', test: 'test/api/attachment.spec.ts' },
  { file: 'src/directives/aria-label.ts', test: 'test/directives/aria-label.spec.ts' },
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
  let equivalent = 0
  const survivedList = []
  const equivalentList = []

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
        const equiv = EQUIVALENT.find(e => e.file === file && e.line === i + 1)
        if (equiv) {
          equivalent++
          equivalentList.push(`    第 ${i + 1} 行 [${name}] 已知等价变异：${equiv.reason}`)
        }
        else {
          survived++
          survivedList.push(`    第 ${i + 1} 行 [${name}] ${mutated.trim()}`)
        }
      }
      else {
        killed++
      }
    }
  }

  console.log(`\n=== ${file} ===`)
  console.log(`  变异总数 ${killed + survived + equivalent}：被发现 ${killed}，存活 ${survived}，已知等价 ${equivalent}`)
  if (survivedList.length) {
    console.log(`  存活的变异（测试盲区）：`)
    survivedList.forEach(l => console.log(l))
  }
  if (equivalentList.length) {
    console.log(`  已知等价变异（行为不变，无需覆盖）：`)
    equivalentList.forEach(l => console.log(l))
  }
  report.push({ file, killed, survived, equivalent })
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
const totalEquivalent = report.reduce((s, r) => s + r.equivalent, 0)
console.log(
  `\n== 合计：变异 ${totalKilled + totalSurvived + totalEquivalent}，`
  + `被发现 ${totalKilled}，存活 ${totalSurvived}，已知等价 ${totalEquivalent} ==`,
)
console.log(`== 有效变异杀伤率：${totalKilled}/${totalKilled + totalSurvived} ==`)
