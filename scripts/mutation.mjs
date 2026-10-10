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
 *
 * 数值常量与 `if (x)` 条件反转是后补的：原来只有逻辑/比较运算符，于是
 * `src/utils/ui.ts`（`duration: 2000`、`if (element)`）与 `src/api/config/area.ts`
 * （`pageNo: 1, rownumber: 500`、`if (parentNo)`）的变异数都是 0 —— 纳入了目标
 * 却一个变异都产生不出来，看起来「覆盖了」其实是空的。**指标好看但含义是假的，
 * 等于没测。**
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
  // 数值常量 +1：只命中独立数字，不碰标识符里的数字（如 `bx2`）与小数
  ['数值常量 +1', /(?<![A-Za-z0-9_$.])(\d+)(?![0-9.])/],
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
  {
    file: 'src/utils/request/index.ts',
    line: 89,
    reason: '`res.statusCode ?? 0` 的兜底值只影响后续的 `status >= 400` 与 `status === 429` 判断；'
      + '0 与 1 都不满足这两个条件，落到同一个「服务无响应」分支，行为完全一致',
  },
  {
    file: 'src/domain/questionnaire/format.ts',
    line: 38,
    reason: '`value.length >= 16` 与 `>= 17` 等价：两条分支都返回 `value.slice(0, 16)`，'
      + 'length 为 16 时截断结果就是原值，length 为 17 时两条件都成立 —— 边界值不影响结果',
  },
  {
    file: 'src/composables/useDraft.ts',
    line: 43,
    reason: '`savedAt = ref(0)` 的初始值不参与任何判断，只作为「尚未保存」的占位；'
      + '保存成功后被赋成 `Date.now()`，0 与 1 在赋值前都不可观测',
  },
  {
    file: 'src/composables/useQuestionnaire.ts',
    line: 41,
    reason: '`loadToken` 只与自身递增后的值比较（`++loadToken` 后存进 token，再拿 token 与 loadToken 比），'
      + '初始值是 0 还是 1 不改变任何一次比较的结果',
  },
  {
    file: 'src/utils/request/env.ts',
    line: 47,
    reason: '`VITE_BX_TIMEOUT ?? 20000` 的兜底值在测试环境不可观测：`.env.test` 显式设了 '
      + '`VITE_BX_TIMEOUT=20000`，`??` 右侧永远不生效。生产缺该变量时才会差 1ms，'
      + '而那是构建期常量，单测无法在不改 .env.test 的前提下覆盖',
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
  { file: 'src/composables/useAriaLabel.ts', test: 'test/composables/useAriaLabel.spec.ts' },
  { file: 'src/utils/ui.ts', test: 'test/utils/ui.spec.ts' },
  { file: 'src/api/config/area.ts', test: 'test/api/area.spec.ts' },
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
        if (name === '数值常量 +1') return String(Number(m) + 1)
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
