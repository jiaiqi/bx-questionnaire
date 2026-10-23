#!/usr/bin/env node
/**
 * 原型自检：用真实 Chrome 逐屏截图 + 收集控制台错误。
 *
 * 用法：
 *   node design/prototype-v6/scripts/qa.mjs                 # 拍全部已注册屏
 *   node design/prototype-v6/scripts/qa.mjs --only cover,survey
 *   node design/prototype-v6/scripts/qa.mjs --width 430      # 窄屏看外壳响应式
 *   node design/prototype-v6/scripts/qa.mjs --click "#submit"
 *
 * 产物：design/prototype-v6/_shots/<屏 id>.png（整页，含设备框）
 * 依赖：本机 Chrome / Edge（复用 scripts/lib/chrome.mjs 的定位逻辑）
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CHROME } from '../../../scripts/lib/chrome.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const indexFile = resolve(flag('file', join(root, 'index.html')))
const WIDTH = Number(flag('width', 1440))
const HEIGHT = Number(flag('height', 900))
const ONLY = flag('only', '')
const CLICK = flag('click', '')
const EVAL = flag('eval', '')
const OUT = resolve(flag('out', join(root, '_shots')))
const PORT = Number(flag('port', 9388))
const DEVICE_ONLY = args.includes('--device')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`)
  return res.json()
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetchJson('/json/list')
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      /* Chrome 还没起来 */
    }
    await sleep(400)
  }
  throw new Error('连不上 Chrome 调试端口')
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.errors = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        this.errors.push(`[exception] ${d.text} ${d.exception?.description || ''}`.trim())
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
        this.errors.push('[console.error] ' + text)
      }
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
          reject(new Error('CDP 超时: ' + method))
        }
      }, 30000)
    })
  }

  async evaluate(expression, awaitPromise = false) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    })
    return res?.result?.value
  }
}

const userDataDir = mkdtempSync(join(tmpdir(), 'bxq-v6-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--allow-file-access-from-files',
  `--window-size=${WIDTH},${HEIGHT}`,
  'about:blank',
], { stdio: 'ignore' })

const fileUrl = pathToFileURL(indexFile).href
let failures = 0

try {
  mkdirSync(OUT, { recursive: true })
  const ws = new WebSocket(await connect())
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  const cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: WIDTH < 600,
  })

  await cdp.send('Page.navigate', { url: fileUrl + '#/answer/cover' })
  await sleep(1200)

  const screens = await cdp.evaluate(
    'Object.entries(Proto.screens).map(([id, s]) => ({ id, group: s.group, label: s.label }))',
  )
  if (!screens || !screens.length) throw new Error('Proto.screens 为空：脚本可能没加载')

  const filter = ONLY ? new Set(ONLY.split(',').map((s) => s.trim())) : null
  const targets = screens.filter((s) => !filter || filter.has(s.id))

  for (const screen of targets) {
    cdp.errors.length = 0
    await cdp.send('Page.navigate', { url: `${fileUrl}#/${screen.group}/${screen.id}` })
    await sleep(900)

    if (CLICK) {
      const point = await cdp.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(CLICK)})
        if (!el) return null
        el.scrollIntoView({ block: 'center' })
        const r = el.getBoundingClientRect()
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
      })()`)
      if (!point) console.log(`  ! 未找到 ${CLICK}`)
      else {
        const p = JSON.parse(point)
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 })
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 })
        await sleep(500)
      }
    }

    await sleep(500)
    const metrics = await cdp.send('Page.getLayoutMetrics')
    const contentHeight = Math.ceil(metrics.cssContentSize?.height ?? HEIGHT)

    let clip = { x: 0, y: 0, width: WIDTH, height: contentHeight, scale: 1 }
    if (DEVICE_ONLY) {
      const box = await cdp.evaluate(`(() => {
        const el = document.querySelector('.device')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return JSON.stringify({ x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height })
      })()`)
      if (box) {
        const b = JSON.parse(box)
        clip = { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.ceil(b.width), height: Math.ceil(b.height), scale: 1 }
      }
    }

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip,
    })
    const file = join(OUT, `${screen.id}.png`)
    writeFileSync(file, Buffer.from(shot.data, 'base64'))

    const mark = cdp.errors.length ? '✗' : '✓'
    console.log(`${mark} ${screen.id.padEnd(14)} ${screen.label || ''}  →  ${file}`)
    if (cdp.errors.length) {
      failures++
      cdp.errors.slice(0, 5).forEach((e) => console.log('    ' + e.slice(0, 300)))
    }
  }

  ws.close()
} finally {
  chrome.kill()
  await sleep(400)
  rmSync(userDataDir, { recursive: true, force: true })
}

if (failures) {
  console.error(`\n有 ${failures} 屏出现控制台错误`)
  process.exitCode = 1
}
