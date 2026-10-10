/**
 * 死代码守卫
 *
 * 为什么做成单测而不是只做成脚本：脚本靠的是「记得跑」，单测才是结构性保证。
 *
 * 这个检查抓到过真实的未接线代码 —— `src/stores/session.ts` 的
 * `setTicket` / `setUserInfo` / `isLogin` 长期只在测试里被调用，src 里零调用点：
 * 文件看起来功能完整、类型正确、测试也过，但登录态根本没接线。
 */
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scanDeadSymbols } from '../scripts/lib/dead-exports.mjs'

/** 仓库根：单测的 cwd 是仓库根，显式传进去避免依赖 vitest 的工作目录 */
const ROOT = join(__dirname, '..')

describe('死代码扫描', () => {
  it('没有完全死代码（src 与 test 都没引用）', () => {
    const { fullyDead } = scanDeadSymbols(ROOT)

    // 失败时打印明细，否则只看到一个数字不知道是哪个符号
    const detail = fullyDead.map(d => `${d.file}: ${d.name}`).join('\n')
    expect(fullyDead, `完全死代码：\n${detail}`).toEqual([])
  })

  it('没有「仅测试使用」的符号（生产代码未接线）', () => {
    const { onlyTest } = scanDeadSymbols(ROOT)

    // 这类最隐蔽：测试全绿，但生产路径根本没调到它
    const detail = onlyTest.map(d => `${d.file}: ${d.name}（test 引用 ${d.inTest} 处）`).join('\n')
    expect(onlyTest, `仅测试使用：\n${detail}`).toEqual([])
  })

  it('扫描确实覆盖到符号（防止实现坏了变成空扫描）', () => {
    // 反向保护：如果解析逻辑坏掉、一个符号都没收集到，上面两个断言会「因为空而通过」。
    // 这里给一个下界，让「扫描器静默失效」也会变红。
    const { symbolCount, fileCount } = scanDeadSymbols(ROOT)

    expect(fileCount).toBeGreaterThan(30)
    expect(symbolCount).toBeGreaterThan(80)
  })
})
