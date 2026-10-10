/**
 * 死代码扫描的核心逻辑（供 CLI 与单测共用）
 *
 * 抽成模块是为了让 `pnpm test` 能直接守住它 —— 只做成脚本的话，靠的是「记得跑」，
 * 而结构性保证比靠记忆可靠。
 *
 * ## 判定口径
 *
 *   src 引用 > 0（含本文件内）      → 已接线，正常
 *   src 引用 = 0，test 引用 > 0     → **仅测试使用**（生产未接线）
 *   src 引用 = 0，test 引用 = 0     → 完全死代码
 *
 * 三个容易踩的坑，都在实现里处理了：
 *
 *  1. **声明本身算 1 次引用**，必须减掉，否则所有符号看起来都「被用过」。
 *  2. **同一文件内的使用也算使用**。类型常只在本文件内当参数/返回值用，
 *     若按「文件外引用」判定，`AreaRow`、`InitLoadQuery` 这类会被全报成死代码。
 *  3. **test 语料不含 src 文件**，所以减「定义文件自身引用」时不能对两个语料一刀切。
 *
 * 第一版同时踩了 2 和 3，误报 24 个「完全死代码」，其中多数是本文件内正常使用的类型。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT_FILES = ['vite.config.ts', 'vitest.config.ts', 'uno.config.ts', 'pages.config.ts', 'manifest.config.ts']

/**
 * 允许清单：由框架或外部约定调用，源码里查不到引用点
 *
 * 不加白名单会把它们误报成未使用，而误报会训练出「忽略这个检查」的习惯，
 * 最后真的死代码也漏掉。
 */
export const ALLOWED = [
  {
    file: 'src/main.ts',
    name: 'createApp',
    reason: 'uni-app 框架约定入口：由框架在启动时调用，源码里不会出现调用点',
  },
  {
    file: 'src/stores/session.ts',
    name: 'setTicket',
    reason: '登录链路尚未接入（需要新的后端服务，超出「接口不变」范围）—— 保留设计待接线',
  },
  {
    file: 'src/stores/session.ts',
    name: 'setUserInfo',
    reason: '登录链路尚未接入（需要新的后端服务，超出「接口不变」范围）—— 保留设计待接线',
  },
  {
    file: 'src/stores/session.ts',
    name: 'isLogin',
    reason: '登录链路尚未接入（需要新的后端服务，超出「接口不变」范围）—— 保留设计待接线',
  },
  {
    file: 'src/api/daq/record.ts',
    name: 'recordShareAdd',
    reason: '分享埋点刻意未接线：H5 分享需要微信 JSSDK，小程序端需新后端服务，均超出「接口不变」范围',
  },
  {
    file: 'src/composables/useRecordHistoryPage.ts',
    name: 'RECORD_HISTORY_PAGE_STYLE',
    reason: 'composable 依赖的页面配置契约：页面配置只能在编译期的 definePage 宏里写，运行期改不了，所以这份常量由单测用来校验页面声明是否与之一致 —— 它的消费者就是那个守卫',
  },
]

/**
 * 收集文件，返回**相对 cwd 的 posix 路径**
 *
 * 必须相对化：允许清单里写的是 `src/main.ts` 这样的相对路径，若返回绝对路径
 * 就永远匹配不上，`createApp` 会被误报成未接线。第一版就是这样。
 */
function collect(cwd, dir, filter, acc = []) {
  const absDir = join(cwd, dir)
  if (!statSync(absDir, { throwIfNoEntry: false }))
    return acc
  for (const name of readdirSync(absDir)) {
    const absPath = join(absDir, name)
    const relPath = `${dir}/${name}`.replace(/\\/g, '/')
    if (statSync(absPath).isDirectory()) {
      collect(cwd, relPath, filter, acc)
      continue
    }
    if (filter(name))
      acc.push(relPath)
  }
  return acc
}

const isSource = n => /\.(?:ts|vue)$/.test(n) && !n.endsWith('.d.ts')

function countRefs(corpus, name) {
  const re = new RegExp(`(?<![\\w$.])${name.replace(/[$]/g, '\\$')}(?![\\w$])`, 'g')
  return (corpus.match(re) ?? []).length
}

/** 收集 export 声明 */
function collectExports(cwd, srcFiles) {
  const out = []
  for (const f of srcFiles) {
    const c = readFileSync(join(cwd, f), 'utf8')
    const re = /^export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm
    let m = re.exec(c)
    while (m !== null) {
      out.push({ file: f, name: m[1] })
      m = re.exec(c)
    }
    const re2 = /^export\s*\{([^}]*)\}/gm
    let m2 = re2.exec(c)
    while (m2 !== null) {
      for (const part of m2[1].split(',')) {
        const t = part.trim()
        if (!t || t.startsWith('type '))
          continue
        const asMatch = t.match(/\bas\s+([A-Za-z_$][\w$]*)$/)
        const name = asMatch ? asMatch[1] : t
        if (/^[A-Za-z_$][\w$]*$/.test(name)) {
          out.push({ file: f, name })
        }
      }
      m2 = re2.exec(c)
    }
  }
  return out
}

/**
 * 收集 Pinia store 暴露的成员
 *
 * store 的 action / state **不是** `export` 声明，第一版扫描完全漏掉了它们 ——
 * 而 `session.ts` 的 `setTicket` / `setUserInfo` / `isLogin` 正是这种情况。
 */
function collectStoreMembers(cwd, srcFiles) {
  const out = []
  for (const f of srcFiles) {
    if (!f.startsWith('src/stores/'))
      continue
    const c = readFileSync(join(cwd, f), 'utf8')
    const ret = c.match(/return\s*\{([\s\S]*?)\}\s*\}\s*\)/)
    if (!ret)
      continue
    for (const part of ret[1].split(',')) {
      const t = part.trim()
      if (/^[A-Za-z_$][\w$]*$/.test(t)) {
        out.push({ file: f, name: t })
      }
    }
  }
  return out
}

/**
 * 扫描死代码
 *
 * @param cwd 项目根目录（测试里传仓库根，保证与 CLI 一致）
 * @returns 符号总数、仅测试使用列表、完全死代码列表
 */
export function scanDeadSymbols(cwd = process.cwd()) {
  const srcFiles = collect(cwd, 'src', isSource)
  const testFiles = [...collect(cwd, 'test', isSource), ...collect(cwd, 'scripts', n => n.endsWith('.mjs'))]
  const rootFiles = ROOT_FILES.filter(f => statSync(join(cwd, f), { throwIfNoEntry: false }))

  const srcCorpus = srcFiles.map(f => readFileSync(join(cwd, f), 'utf8')).join('\n')
  const testCorpus = [...testFiles, ...rootFiles].map(f => readFileSync(join(cwd, f), 'utf8')).join('\n')

  /** 计算符号的引用分布：本文件内其它引用 / 其它 src 文件引用 / test 引用 */
  function analyzeRefs(name, defFile) {
    const defContent = readFileSync(join(cwd, defFile), 'utf8')
    const inDefFile = countRefs(defContent, name)
    // 声明语句本身占 1 次；`export { a }` 形式声明与导出各 1 次
    const isReExport = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(defContent)
      && !new RegExp(`export\\s+(?:declare\\s+)?(?:const|let|var|function|class|interface|type|enum)\\s+${name}\\b`).test(defContent)
    const declCount = isReExport ? 2 : 1
    return {
      ownFileOther: Math.max(0, inDefFile - declCount),
      otherSrc: Math.max(0, countRefs(srcCorpus, name) - inDefFile),
      inTest: countRefs(testCorpus, name),
    }
  }

  const symbols = [...collectExports(cwd, srcFiles), ...collectStoreMembers(cwd, srcFiles)]
  const onlyTest = []
  const fullyDead = []

  for (const { file, name } of symbols) {
    if (ALLOWED.some(a => a.file === file && a.name === name))
      continue
    const { ownFileOther, otherSrc, inTest } = analyzeRefs(name, file)
    // 本文件内被用、或其它 src 文件被用，都算已接线
    if (ownFileOther > 0 || otherSrc > 0)
      continue
    if (inTest > 0) {
      onlyTest.push({ file, name, inTest })
    }
    else {
      fullyDead.push({ file, name })
    }
  }

  return { fileCount: srcFiles.length, symbolCount: symbols.length, onlyTest, fullyDead }
}
