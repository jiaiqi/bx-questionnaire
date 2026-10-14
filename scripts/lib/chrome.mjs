/**
 * Chrome / Edge 可执行文件定位（CDP 脚本共用）
 *
 * 此前 9 个 CDP 脚本各自硬编码 Windows 路径
 * `C:\Program Files\Google\Chrome\Application\chrome.exe`，换机器、换系统或改用 Edge
 * 都要逐个改，而且找不到时 `spawn` 只报 `ENOENT`，看不出是路径问题。
 *
 * 解析优先级：
 *   1. 环境变量 `BX_CHROME_PATH` / `CHROME_PATH` —— 显式指定，最高优先级
 *   2. 各平台常见安装路径（Windows / macOS / Linux，含 Edge 兜底）
 *   3. 都没有时抛错，并在错误里给出设置环境变量的示例
 *
 * 用法：`import { CHROME } from './lib/chrome.mjs'`
 */

import { existsSync } from 'node:fs'
import process from 'node:process'

/** 各平台候选路径；Windows 额外带 Edge，避免只装 Edge 的机器无法联调 */
const CANDIDATES = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
}

export function resolveChromePath() {
  const fromEnv = process.env.BX_CHROME_PATH || process.env.CHROME_PATH
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new Error(`BX_CHROME_PATH 指向的文件不存在：${fromEnv}`)
    }
    return fromEnv
  }

  for (const candidate of CANDIDATES[process.platform] ?? []) {
    // LOCALAPPDATA 缺失时上面的模板会拼出相对路径，这里统一挡掉
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    '找不到 Chrome / Edge 可执行文件，请用环境变量显式指定：\n'
    + '  PowerShell: $env:BX_CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"\n'
    + '  bash:       export BX_CHROME_PATH=/usr/bin/google-chrome',
  )
}

/** 解析结果，供脚本直接交给 `spawn` */
export const CHROME = resolveChromePath()
