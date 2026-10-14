/**
 * 可视化设计器的界面级端到端验证（CDP 真实浏览器 + 真实后端）
 *
 * 用途：证明「在页面上改一下 → 点保存 → 服务端数据真的变了」这条完整链路。
 * 接口层验证（服务名、请求体、回执）证明不了它 —— 表单到请求体之间的映射、
 * 保存按钮有没有接线、dirty 有没有置位，都只有走一遍界面才看得见。
 *
 * 用法：
 *   node scripts/editor-e2e.mjs            # 对演示问卷做一次「改标题 → 保存 → 还原」
 *   BX_ACTIVITY_NO=xxx node scripts/editor-e2e.mjs
 *
 * 前置：`pnpm dev` 已启动；`.env.local` 里有有效票据（过期会报 0011）。
 *
 * 注意：**会真的写服务端**。脚本在同一个活动上改标题再改回来，跑完恢复原值；
 * 中途失败会把标题留在「·UI联调」状态，重跑一次即可还原。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

const PORT = 9381
const ACTIVITY_NO = process.env.BX_ACTIVITY_NO || '20261011154728000005'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 票据与网关：从 .env.local / .env.development 读，和页面用的是同一份
const envLocal = readFileSync('.env.local', 'utf8')
const envDev = readFileSync('.env.development', 'utf8')
const TICKET = (envLocal.match(/^VITE_BX_TICKET=(.+)$/m) || [])[1]?.trim()
const GATEWAY = (envDev.match(/^VITE_BX_GATEWAY=(.+)$/m) || [])[1]?.trim()
if (!TICKET || !GATEWAY) {
  console.error('读不到票据或网关')
  process.exit(1)
}

/** 直接问服务端：现在库里这条活动的标题是什么 */
async function fetchTitle() {
  const res = await fetch(`${GATEWAY}/daq/select/srvdaq_activity_cfg_select`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'bx_auth_ticket': TICKET,
      'bx-auth-ticket': TICKET,
    },
    body: JSON.stringify({
      serviceName: 'srvdaq_activity_cfg_select',
      colNames: ['*'],
      condition: [{ colName: 'activity_no', ruleType: 'eq', value: ACTIVITY_NO }],
    }),
  })
  const json = await res.json()
  const row = json?.data?.[0]
  return { title: row?.title, state: json?.state, code: json?.resultCode, msg: json?.resultMessage }
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find(t => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    }
    catch {}
    await sleep(500)
  }
  throw new Error('连不上 Chrome')
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.errors = []
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)
        this.pending.delete(m.id)
        if (m.error) reject(new Error(m.error.message))
        else resolve(m.result)
        return
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
        this.errors.push((m.params.args || []).map(a => a.value ?? a.description ?? '').join(' '))
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`超时 ${method}`)) }
      }, 30000)
    })
  }
  async eval(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
    if (r.exceptionDetails) throw new Error(`页面内报错：${r.exceptionDetails.text}`)
    return r.result?.value
  }
  async click(selector) {
    const point = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    })()`)
    if (!point) return false
    const { x, y } = JSON.parse(point)
    // mousePressed 必须带 buttons，只给 button 时点击静默无效
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
    return true
  }
  /** 往输入框写值：走原型 setter + 冒泡 input 事件，Vue 的 v-model 才收得到 */
  async type(selector, value) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      el.focus()
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return el.value
    })()`)
  }
  async waitText(predicate, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs
    let last = ''
    while (Date.now() < deadline) {
      last = await this.eval('((document.querySelector("uni-app")||document.body).innerText||"")')
      if (predicate(last)) return last
      await sleep(500)
    }
    return last
  }
}

const dir = mkdtempSync(join(tmpdir(), 'bx-save-'))
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' })

let ok = true
function check(label, pass, extra = '') {
  console.log(`  ${pass ? '✓' : '✗'} ${label}${extra ? ` —— ${extra}` : ''}`)
  if (!pass) ok = false
}

try {
  const before = await fetchTitle()
  console.log(`服务端当前标题：${JSON.stringify(before.title)}（${before.state}/${before.code}）`)
  if (before.title === undefined) {
    console.error(`取不到活动，无法继续：${before.msg}`)
    process.exit(1)
  }

  const ws = new WebSocket(await connect())
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  await cdp.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await cdp.send('Page.navigate', { url: `${BASE}/#/pages/editor/design/index?activity_no=${ACTIVITY_NO}` })

  let text = await cdp.waitText(t => t.includes('题目') && t.includes('保存'))
  check('设计器加载出已有问卷', text.includes('问卷设计'), text.slice(0, 40).replace(/\n/g, ' / '))
  check('页面上没有「放弃」按钮（刚载入不算有改动）', !text.includes('放弃'))

  // 第 1 个输入框就是问卷标题（实测 ancestorAria=问卷标题）
  //
  // 必须等 load() 落地：新建态的壳里同样有「题目」「保存」，只看文本会立刻通过，
  // 于是拿到的是空表单 —— 上一版就栽在这里，把「新建态」当成了「已载入」。
  const inputSel = 'input.uni-input-input'
  let original = ''
  for (let i = 0; i < 60; i++) {
    original = await cdp.eval(`document.querySelector('${inputSel}')?.value ?? ''`)
    if (original) break
    await sleep(500)
  }
  check('等到已载入（标题输入框有值）', original.length > 0, JSON.stringify(original))
  text = await cdp.eval('((document.querySelector("uni-app")||document.body).innerText||"")')
  check('载入后标题为「问卷设计」而非「新建问卷」', text.includes('问卷设计'), text.slice(0, 30).replace(/\n/g, ' / '))

  const NEW_TITLE = `${original}·UI联调`
  const written = await cdp.type(inputSel, NEW_TITLE)
  check('标题已写入输入框', written === NEW_TITLE, JSON.stringify(written))

  await sleep(400)
  text = await cdp.eval('((document.querySelector("uni-app")||document.body).innerText||"")')
  check('改完之后出现「放弃」按钮（dirty 生效）', text.includes('放弃'))

  const clicked = await cdp.click('[aria-label="保存问卷"]')
  check('点到「保存」按钮', clicked)

  // 等「已保存」提示，或等「放弃」消失（保存成功后回到未改动状态）
  text = await cdp.waitText(t => t.includes('已保存') || !t.includes('放弃'), 40000)
  check('保存给出反馈', text.includes('已保存') || !text.includes('放弃'), text.includes('已保存') ? '出现「已保存」' : '「放弃」消失')

  await sleep(1200)
  const after = await fetchTitle()
  console.log(`服务端保存后标题：${JSON.stringify(after.title)}`)
  check('服务端标题确实变了', after.title === NEW_TITLE, `期望 ${JSON.stringify(NEW_TITLE)}，实际 ${JSON.stringify(after.title)}`)

  // 还原：改回原标题再存一次，避免把联调痕迹留在演示问卷上
  await cdp.type(inputSel, original)
  await sleep(400)
  await cdp.click('[aria-label="保存问卷"]')
  await cdp.waitText(t => t.includes('已保存') || !t.includes('放弃'), 40000)
  await sleep(1200)
  const restored = await fetchTitle()
  check('已还原原标题', restored.title === original, JSON.stringify(restored.title))

  if (cdp.errors.length) console.log(`  页面 console.error ${cdp.errors.length} 条：${cdp.errors.slice(0, 3).join(' | ')}`)
  ws.close()
}
finally {
  chrome.kill()
  await sleep(400)
  rmSync(dir, { recursive: true, force: true })
}

console.log(ok ? '\n== 界面保存链路验证通过 ==' : '\n== 有失败项 ==')
process.exit(ok ? 0 : 1)
