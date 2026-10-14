/**
 * CDP 脚本的目标地址解析与可达性预检
 *
 * ## 为什么需要它
 *
 * 各脚本原先各自写死默认地址，且**与 `pnpm dev h5` 的实际端口不一致**：
 * dev server 默认 5173，而 `smoke` / `a11y` / `e2e` / `embed` / `special-e2e` /
 * `check-overflow` 默认连 5174。默认执行时要么连不上、要么连到别的进程上，
 * 最坏的情况是**静默在错误页上「通过」** —— 这比直接报错危险得多。
 *
 * ## 解析优先级
 *
 * 1. 命令行里的完整地址（`node scripts/smoke.mjs http://localhost:5173`）
 * 2. 环境变量 `BX_BASE`
 * 3. 默认 `http://localhost:5173`（与 dev server 一致）
 */

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

/** 解析目标地址；只认显式传入的值，不再各自写死端口 */
export function resolveBaseUrl({ argv = process.argv, env = process.env, port = 5173 } = {}) {
  const fromArgv = argv.find(arg => /^https?:\/\//.test(arg))
  if (fromArgv) {
    return stripTrailingSlash(fromArgv)
  }

  const fromEnv = (env.BX_BASE || '').trim()
  if (fromEnv) {
    return stripTrailingSlash(fromEnv)
  }

  return `http://localhost:${port}`
}

/**
 * 预检目标地址可达
 *
 * 拿不到响应就**直接退出并给出可操作的提示**，而不是让浏览器去渲染一个错误页、
 * 再由脚本把「页面渲染出了内容」当成通过。
 */
export async function assertBaseReachable(base, { timeoutMs = 8000 } = {}) {
  const hint = [
    `目标地址不可达：${base}`,
    '请先启动开发服务器：pnpm dev h5',
    '或显式指定地址：BX_BASE=http://localhost:5173 node scripts/smoke.mjs',
  ].join('\n  ')

  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(timeoutMs) })
    if (response.status >= 500) {
      throw new Error(`HTTP ${response.status}`)
    }
  }
  catch (error) {
    throw new Error(`${hint}\n  （底层错误：${error?.message ?? error}）`)
  }
}
