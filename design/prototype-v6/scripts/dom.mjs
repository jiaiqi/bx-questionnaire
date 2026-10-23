#!/usr/bin/env node
/**
 * 打印某个屏的可交互元素（排查选择器用）。
 * 用法：node design/prototype-v6/scripts/dom.mjs "#/answer/survey" [选择器]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CHROME } from '../../../scripts/lib/chrome.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const fileUrl = pathToFileURL(join(root, 'index.html')).href
const hash = process.argv[2] || '#/answer/cover'
const selector = process.argv[3] || 'button, a, input, select, textarea, [role="tab"], [tabindex]'
const PORT = 9390
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const dir = mkdtempSync(join(tmpdir(), 'bxq-dom-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--allow-file-access-from-files',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' })

async function json(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`)
  return res.json()
}
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await json('/json/list')
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(300)
  }
  throw new Error('连不上 Chrome')
}

try {
  const ws = new WebSocket(await connect())
  await new Promise((res) => ws.addEventListener('open', res, { once: true }))
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
    }
  })
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id
    pending.set(mid, res)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: fileUrl + hash })
  await sleep(1200)
  const out = await send('Runtime.evaluate', {
    expression: `(() => {
      const list = [...document.querySelectorAll(${JSON.stringify(selector)})]
      return list.map((el, i) => {
        const r = el.getBoundingClientRect()
        const cls = typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''
        return [i, el.tagName.toLowerCase() + cls, JSON.stringify((el.textContent || '').trim().slice(0, 28)), el.type || '', Math.round(r.width) + 'x' + Math.round(r.height)].join(' | ')
      }).join('\\n')
    })()`,
    returnByValue: true,
  })
  console.log(out?.result?.value || '(空)')
  ws.close()
} finally {
  chrome.kill()
  await sleep(300)
  rmSync(dir, { recursive: true, force: true })
}
