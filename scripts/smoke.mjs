/**
 * 页面冒烟测试（CDP 真实浏览器）
 *
 * 项目没有 @vue/test-utils，页面与组件层无法用单测覆盖 —— 这是测试保护面里
 * 最大的一块空白。这里用 Chrome 无头 + CDP 遍历全部页面，检查：
 *   1. 页面是否真的渲染出内容（不是白屏）；
 *   2. 控制台有没有报错、有没有未捕获异常；
 *   3. 关键 DOM 是否出现（导航栏、内容容器等）。
 *
 * 用法：node scripts/smoke.mjs [baseUrl]
 * 前置：pnpm dev h5 已启动。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || 'http://localhost:5174'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const ACTIVITY_NO = '20261010100256000001'
// 评估建议面板要求 activity_no + fill_batch_no 同时存在才请求（对齐老工程）
const FILL_BATCH_NO = '4d5b54fb88144b53bd136776f6a383d3'

/**
 * 每页：路由 + 关键选择器
 *
 * 注意 markers 只用于「确认页面壳挂上了」，不能要求具体业务 class ——
 * 空态、错误态页面本来就不渲染 .bx-container / .cover，那样会把正常的
 * 空态误判成白屏。判定「渲染成功」主要看文本长度。
 */
const RENDERED = ['uni-app']

const PAGES = [
  {
    name: '封面页',
    route: '/pages/questionnaire/cover/index',
    markers: RENDERED,
  },
  {
    name: '问卷作答页',
    route: `/pages/questionnaire/index/index?activity_no=${ACTIVITY_NO}&formType=form&status=进行中`,
    markers: RENDERED,
  },
  {
    name: '登记信息页',
    route: `/pages/questionnaire/index/submitInfo?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
  },
  {
    name: '结果页',
    route: `/pages/questionnaire/index/result?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
  },
  {
    name: '作答记录页',
    route: `/pages/questionnaire/history/history?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
  },
  {
    name: '我的测评页',
    route: '/pages/questionnaire/couple/couple',
    markers: RENDERED,
  },
  {
    name: '调研页',
    route: `/pages/questionnaire/survey/survey?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
  },
  {
    name: '调研记录页',
    route: `/pages/questionnaire/survey/history?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
  },
  {
    name: '调研结果页',
    route: `/pages/questionnaire/survey/result?activity_no=${ACTIVITY_NO}&fill_batch_no=${FILL_BATCH_NO}`,
    markers: RENDERED,
  },
  {
    name: '评估结果页',
    route: `/pages/questionnaire/assessmentResult/assessmentResult?activity_no=${ACTIVITY_NO}&fill_batch_no=${FILL_BATCH_NO}`,
    markers: RENDERED,
  },
  {
    // 缺批次号时必须给出明确提示，而不是把网关的「系统繁忙」透出来
    name: '评估结果页（缺批次号）',
    route: `/pages/questionnaire/assessmentResult/assessmentResult?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
    expectText: '缺少作答批次号',
  },
]

const userDataDir = mkdtempSync(join(tmpdir(), 'bxq-smoke-'))
const PORT = 9333

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

/** 极简 CDP 客户端：只用到我们需要的几个命令 */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.events = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
      else if (msg.method) {
        this.events.push(msg)
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

  takeEvents() {
    const taken = this.events
    this.events = []
    return taken
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
  await cdp.send('Log.enable')

  const results = []

  for (const page of PAGES) {
    // 先回空白页：uni-app 的 onLoad 只在页面首次创建时执行，同路径不同 query
    // 会复用组件实例，导致上一页的参数残留（曾把「缺批次号」页测成有批次号）。
    await cdp.send('Page.navigate', { url: 'about:blank' })
    await sleep(300)
    cdp.takeEvents()

    // H5 是 hash 路由
    const url = `${BASE}/#${page.route}`
    await cdp.send('Page.navigate', { url })

    // Vite dev 按需编译：首次访问某页可能要等编译完成。
    // 固定 sleep 会让「编译慢」看起来像「页面白屏」，所以轮询到有内容为止。
    let r = { hit: [], textLen: 0, head: '' }
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(700)
      const probe = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const sels = ${JSON.stringify(page.markers)}
          const hit = sels.filter(s => document.querySelector(s))
          const root = document.querySelector('uni-app') || document.body
          const text = (root.innerText || '').trim()
          return { hit, textLen: text.length, head: text.slice(0, 120) }
        })()`,
        returnByValue: true,
      })
      r = probe.result.value
      if (r.textLen > 0) break
    }

    const events = cdp.takeEvents()
    const consoleErrors = []
    const exceptions = []
    for (const e of events) {
      if (e.method === 'Runtime.exceptionThrown') {
        const d = e.params.exceptionDetails
        exceptions.push(d.exception?.description || d.text || '未知异常')
      }
      if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
        consoleErrors.push(e.params.args.map(a => a.value ?? a.description ?? '').join(' '))
      }
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
        consoleErrors.push(e.params.entry.text)
      }
    }

    results.push({
      name: page.name,
      route: page.route,
      rendered: r.hit.length > 0 && r.textLen > 0,
      hit: r.hit,
      missing: page.markers.filter(s => !r.hit.includes(s)),
      textLen: r.textLen,
      head: r.head,
      exceptions,
      consoleErrors,
      // 可选：断言首屏文本包含某段内容（用于验证空态/错误态文案）
      expectText: page.expectText,
      textOk: page.expectText ? r.head.includes(page.expectText) : true,
    })
  }

  ws.close()
  chrome.kill()
  try {
    rmSync(userDataDir, { recursive: true, force: true })
  }
  catch {
    // Windows 上偶尔删不掉，不影响结果
  }

  // 报告
  console.log(`\n页面冒烟（${BASE}）\n`)
  let bad = 0
  for (const r of results) {
    const ok = r.rendered && r.exceptions.length === 0 && r.consoleErrors.length === 0 && r.textOk
    if (!ok) bad++
    console.log(`${ok ? '✓' : '✗'} ${r.name}`)
    console.log(`    路由 ${r.route}`)
    console.log(`    渲染 ${r.rendered ? '有内容' : '空白'}（文本 ${r.textLen} 字），命中选择器 ${r.hit.length}/${r.hit.length + r.missing.length}`)
    if (r.missing.length) console.log(`    未命中 ${r.missing.join(', ')}`)
    if (r.head) console.log(`    首屏文本：${r.head.replace(/\n/g, ' / ')}`)
    if (r.expectText && !r.textOk) console.log(`    [文案不符] 期望包含「${r.expectText}」`)
    for (const e of r.exceptions) console.log(`    [未捕获异常] ${e.split('\n')[0]}`)
    for (const e of r.consoleErrors) console.log(`    [console.error] ${e.slice(0, 200)}`)
  }

  console.log(`\n== 共 ${results.length} 页，异常 ${bad} 页 ==`)
  process.exit(bad === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('冒烟失败:', error.message)
  chrome.kill()
  process.exit(1)
})
