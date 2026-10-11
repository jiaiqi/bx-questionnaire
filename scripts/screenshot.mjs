/**
 * 页面截图（CDP 真实浏览器）
 *
 * 用途：给业务方看实际效果，以及留人工验收的证据图。项目里其它脚本只做断言，
 * 没有一个能「把页面拍下来」。
 *
 * 用法：
 *   node scripts/screenshot.mjs "<hash 路由或完整 URL>" [--out docs/screenshots] [--name 前缀]
 *
 * 例：
 *   node scripts/screenshot.mjs "/pages/questionnaire/index/index?activity_no=xxx&formType=form&status=进行中" --name 演示问卷
 *
 * 前置：`pnpm dev` 已启动。每个视口各出一张 PNG，文件名形如 `前缀-PC.png`。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const BASE = process.env.BX_BASE || 'http://localhost:5173'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9376

/** 视口：与用户要求一致 —— 浏览器 PC / 移动端都要看，小程序另有竖屏与横屏 */
const VIEWPORTS = [
  { name: 'PC', width: 1440, height: 900, mobile: false },
  { name: '移动竖屏', width: 375, height: 812, mobile: true },
]

const args = process.argv.slice(2)
const target = args.find(a => !a.startsWith('--')) || '/'
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const OUT_DIR = resolve(flag('out', 'docs/screenshots'))
const NAME = flag('name', 'page')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function fetchJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`)
  return res.json()
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

const userDataDir = mkdtempSync(join(tmpdir(), 'bx-shot-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' })

try {
  mkdirSync(OUT_DIR, { recursive: true })
  const ws = new WebSocket(await connect())
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })

  const cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  const url = target.startsWith('http') ? target : `${BASE}/#${target}`
  console.log(`目标：${url}`)

  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    })

    // 先回空白页：uni-app 的 onLoad 只在页面首次创建时执行
    await cdp.send('Page.navigate', { url: 'about:blank' })
    await sleep(300)
    await cdp.send('Page.navigate', { url })

    // Vite dev 按需编译，轮询到有内容为止，不用固定 sleep
    let textLen = 0
    for (let i = 0; i < 20; i++) {
      await sleep(700)
      const probe = await cdp.send('Runtime.evaluate', {
        expression: '((document.querySelector("uni-app")||document.body).innerText||"").length',
        returnByValue: true,
      })
      textLen = Number(probe?.result?.value ?? 0)
      if (textLen > 20) break
    }

    // 等图片解码：题目里有图片题，早拍会是空白框
    await cdp.send('Runtime.evaluate', {
      expression: 'Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r })))',
      awaitPromise: true, returnByValue: true,
    })
    await sleep(400)

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    })
    const file = join(OUT_DIR, `${NAME}-${vp.name}.png`)
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    console.log(`  ✓ ${file}  （文本 ${textLen} 字，${vp.width}×${vp.height}）`)
  }

  ws.close()
}
finally {
  chrome.kill()
  await sleep(500)
  rmSync(userDataDir, { recursive: true, force: true })
}
