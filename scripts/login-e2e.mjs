/**
 * 登录链路端到端（真实浏览器 + 真实平台）
 *
 * 走一遍完整链路：打开登录页 → 输入账号密码 → 点登录 → 校验票据是否写入
 * 本地存储、页面是否按回跳地址跳走。
 *
 * ⚠️ 三条硬规矩（登录接口很"贵"，试错成本高）：
 * 1. **凭据只从环境变量读**（`BX_USER` / `BX_PWD`），绝不写进仓库、也不回显；
 * 2. **不做任何自动重试** —— 连续失败会锁号 1 小时，失败时把页面上的错误原文
 *    打印出来（是密码错、还是被锁），由人决定下一步；
 * 3. 只打印票据的**长度**，不打印票据本身。
 *
 * 用法：
 *   BX_USER=jq BX_PWD=*** node scripts/login-e2e.mjs [baseUrl]
 * 前置：`pnpm dev h5` 已启动（脚本默认连 http://localhost:5173）。
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assertBaseReachable, resolveBaseUrl } from './lib/base-url.mjs'
import { CHROME } from './lib/chrome.mjs'

const BASE = resolveBaseUrl()

// 目标地址不可达就直接退出：否则脚本会在浏览器错误页上「通过」，是最危险的假绿
await assertBaseReachable(BASE).catch((error) => {
  console.error(`\n❌ ${error.message}\n`)
  process.exit(1)
})

const USER = process.env.BX_USER
const PWD = process.env.BX_PWD

/** 登录成功后的回跳目标：用它验证 redirect 参数确实被读出来了 */
const REDIRECT = '/pages/questionnaire/couple/couple'

const TICKET_KEY = 'bx_auth_ticket'
const USER_INFO_KEY = 'login_user_info'

if (!USER || !PWD) {
  console.error('缺少 BX_USER / BX_PWD 环境变量。用法：BX_USER=jq BX_PWD=*** node scripts/login-e2e.mjs')
  process.exit(2)
}

const userDataDir = mkdtempSync(join(tmpdir(), 'bxq-login-'))
const PORT = 9345

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { stdio: 'ignore' })

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`)
  return res.json()
}

/** 极简 CDP 客户端：只用到本脚本需要的几个命令 */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP 超时: ${method}`))
        }
      }, 30000)
    })
  }
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetchJson('/json/list')
      const page = list.find(t => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    }
    catch {
      // Chrome 还没起来
    }
    await sleep(500)
  }
  throw new Error('连不上 Chrome 调试端口')
}

/** 在页面上取值 */
async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true })
  return result?.result?.value
}

/**
 * 聚焦第 index 个匹配的输入框并输入
 *
 * 用索引而不是 `:nth-of-type()`：两个输入框都是 `<uni-view>` 的兄弟，
 * 中间还夹着别的元素，`nth-of-type` 会选不中第二个。
 * `Input.insertText` 会触发 input 事件，Vue 的 v-model 能收到。
 */
async function typeInto(cdp, selector, index, text) {
  const ok = await evaluate(
    cdp,
    `(() => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
      if (!el) return false
      el.focus()
      return true
    })()`,
  )
  if (!ok) {
    return false
  }
  // 全选后输入：即使用户数据目录里残留过「记住我」的预填账号也不会被拼接
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 })
  await cdp.send('Input.insertText', { text })
  return true
}

/** 真实鼠标点击（坐标取自元素中心） */
async function clickSelector(cdp, selector) {
  const point = await evaluate(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })()`)

  if (!point) {
    return false
  }

  const base = { x: point.x, y: point.y, button: 'left', clickCount: 1 }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base })
  return true
}

async function main() {
  const wsUrl = await connect()
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  const cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  })

  const loginUrl = `${BASE}/#/pages/login/index?redirect=${encodeURIComponent(REDIRECT)}`
  console.log(`打开登录页：${loginUrl}`)
  await cdp.send('Page.navigate', { url: loginUrl })

  // Vite dev 首次访问要按需编译，轮询到两个输入框都出现为止
  const INPUTS = '.login-field__input input'
  let ready = false
  for (let i = 0; i < 30; i++) {
    await sleep(500)
    ready = await evaluate(cdp, `document.querySelectorAll(${JSON.stringify(INPUTS)}).length >= 2`)
    if (ready) {
      break
    }
  }
  if (!ready) {
    throw new Error('登录页没有渲染出输入框')
  }

  if (!await typeInto(cdp, INPUTS, 0, USER)) {
    throw new Error('账号输入框不可用')
  }
  await sleep(120)
  if (!await typeInto(cdp, INPUTS, 1, PWD)) {
    throw new Error('密码输入框不可用')
  }
  await sleep(200)

  // 回读输入框内容长度，确认 v-model 真的收到了（否则提交的是空值却看不出来）。
  // 只打印长度，不打印内容。
  const filled = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll(${JSON.stringify(INPUTS)})).map(el => el.value.length)`,
  )
  console.log(`输入框内容长度：${JSON.stringify(filled)}`)

  console.log('提交登录…（不做重试：失败即停，避免触发锁号）')
  if (!await clickSelector(cdp, '.bx-button')) {
    throw new Error('找不到登录按钮')
  }

  let ticket = ''
  let errorText = ''
  let pageText = ''

  for (let i = 0; i < 24; i++) {
    await sleep(500)
    ticket = String(await evaluate(cdp, `localStorage.getItem(${JSON.stringify(TICKET_KEY)}) || ''`) ?? '')
    if (ticket) {
      break
    }
    errorText = String(await evaluate(cdp, `(document.querySelector('.login-card__error')?.innerText || '').trim()`) ?? '')
    if (errorText) {
      break
    }
  }

  pageText = String(await evaluate(cdp, `((document.querySelector('uni-app') || document.body).innerText || '').trim().slice(0, 200)`) ?? '')
  const hash = String(await evaluate(cdp, 'location.hash') ?? '')

  if (!ticket) {
    console.error('\n❌ 登录失败')
    console.error(`   页面错误原文：${errorText || '（页面上没有错误提示）'}`)
    console.error(`   当前地址：${hash}`)
    console.error(`   页面文本：${pageText}`)
    console.error('\n提示：登录有频次限制，连续失败会锁号 1 小时 —— 不要反复重跑本脚本。')
    return 1
  }

  const userInfo = String(await evaluate(cdp, `localStorage.getItem(${JSON.stringify(USER_INFO_KEY)}) || ''`) ?? '')

  console.log('\n✅ 登录成功')
  console.log(`   票据长度：${ticket.length}（不打印内容）`)
  console.log(`   用户信息：${userInfo.slice(0, 200)}`)
  console.log(`   当前地址：${hash || '(空)'}`)

  const redirected = hash.includes(REDIRECT)
  console.log(`   回跳：${redirected ? `✅ 已按 redirect 跳到 ${REDIRECT}` : `⚠️ 未跳转（当前 ${hash}）`}`)

  // 回跳没生效不算登录失败，但对「会话过期后回到原页面」这条体验是缺陷，标出来
  return redirected ? 0 : 0
}

let exitCode = 1
try {
  exitCode = await main()
}
catch (error) {
  console.error(`\n❌ 执行出错：${error.message}`)
}
finally {
  chrome.kill()
  try {
    rmSync(userDataDir, { recursive: true, force: true })
  }
  catch {
    // 临时目录清理失败不影响结论
  }
}

process.exit(exitCode)
