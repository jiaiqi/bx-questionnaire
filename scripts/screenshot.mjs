/**
 * 页面截图（CDP 真实浏览器）
 *
 * 用途：给业务方看实际效果，以及留人工验收的证据图。项目里其它脚本只做断言，
 * 没有一个能「把页面拍下来」。
 *
 * 用法：
 *   node scripts/screenshot.mjs "<hash 路由或完整 URL>" [--out docs/screenshots] [--name 前缀] [--click 选择器]
 *
 * 例：
 *   node scripts/screenshot.mjs "/pages/questionnaire/index/index?activity_no=xxx&formType=form&status=进行中" --name 演示问卷
 *   node scripts/screenshot.mjs "/pages/editor/design/index?activity_no=xxx" --name 设计器 --click ".bx-editor-item-row:nth-child(2)"
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
const CLICK = flag('click', '')

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

    // Vite dev 按需编译，轮询到内容稳定为止，不用固定 sleep。
    // 只看「长度 > 20」会拍到「加载中…」那一刻：列表页/详情页先渲染骨架再填数据，
    // 骨架本身就有几十个字。所以要求连续两次读到的文本完全一致。
    let textLen = 0
    let lastText = null
    let stable = 0
    for (let i = 0; i < 30; i++) {
      await sleep(700)
      const probe = await cdp.send('Runtime.evaluate', {
        expression: '((document.querySelector("uni-app")||document.body).innerText||"")',
        returnByValue: true,
      })
      const text = String(probe?.result?.value ?? '')
      textLen = text.length
      if (text === lastText) stable++
      else stable = 0
      lastText = text
      if (textLen > 20 && stable >= 2) break
    }

    // 等图片解码：题目里有图片题，早拍会是空白框
    await cdp.send('Runtime.evaluate', {
      expression: 'Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r })))',
      awaitPromise: true, returnByValue: true,
    })
    await sleep(400)

    // 可选：先点一下再拍（用于「点开某道题」这类需要交互才能看到的状态）
    if (CLICK) {
      const rect = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(CLICK)})
          if (!el) return null
          el.scrollIntoView({ block: 'center' })
          const r = el.getBoundingClientRect()
          return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
        })()`,
        returnByValue: true,
      })
      const point = rect?.result?.value ? JSON.parse(rect.result.value) : null
      if (!point) {
        console.log(`  ! 找不到 --click 选择器：${CLICK}（跳过点击）`)
      }
      else {
        console.log(`  点击 ${CLICK} @ (${Math.round(point.x)}, ${Math.round(point.y)})`)
        // `buttons` 必须给：只给 `button:'left'` 时 Chrome 不把它当有效按下，点击静默无效
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1,
        })
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1,
        })
        await sleep(600)
      }
    }

    // 显式给 clip：`captureBeyondViewport` 单独用时，图片宽度会按 innerWidth 算，
    // 而 innerWidth 会随滚动条变化（emulate 1440 时实测出图 1425），
    // 于是**最右侧约 15px 被静默裁掉** —— 恰好是导航栏右侧按钮所在的位置，
    // 看起来像「按钮被切了」的布局缺陷。用 cssContentSize 明确高度、宽度取视口宽。
    const metrics = await cdp.send('Page.getLayoutMetrics')
    const contentHeight = Math.ceil(
      metrics.cssContentSize?.height ?? metrics.contentSize?.height ?? vp.height,
    )

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: vp.width, height: contentHeight, scale: 1 },
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
