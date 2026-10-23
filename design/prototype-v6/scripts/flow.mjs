#!/usr/bin/env node
/**
 * 原型交互回归：真实 Chrome 里走三条主流程，断言「真的能用」。
 *
 *   node design/prototype-v6/scripts/flow.mjs
 *
 * 覆盖：作答链路（校验失败 → 补齐 → 提交 → 结果）、
 *       管理链路（搜索 → 新建 → 设计器改题 → 保存 → 预览）、
 *       登录链路（错误态 → 成功回跳）。
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
const PORT = 9392
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const dir = mkdtempSync(join(tmpdir(), 'bxq-flow-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--allow-file-access-from-files',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' })

let ws, msgId = 0
const pending = new Map()
const consoleErrors = []

async function fetchJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`)
  return res.json()
}

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await fetchJson('/json/list')
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(300)
  }
  throw new Error('连不上 Chrome 调试端口')
}

function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); rej(new Error('CDP 超时: ' + method)) }
    }, 20000)
  })
}

async function js(expression) {
  const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (out.exceptionDetails) throw new Error('页面脚本异常：' + (out.exceptionDetails.exception?.description || out.exceptionDetails.text))
  return out.result?.value
}

async function nav(hash) {
  await send('Page.navigate', { url: fileUrl + hash })
  await sleep(900)
}

async function clickText(selector, text) {
  return js(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((n) => (n.textContent || '').includes(${JSON.stringify(text)}))
    if (!el) return false
    el.click()
    return true
  })()`)
}

async function setValue(selector, value, index = 0) {
  return js(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
    if (!el) return false
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, ${JSON.stringify(String(value))})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
}

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  — ' + detail : ''}`)
}

async function flowAnswer() {
  await nav('#/answer/cover')
  await clickText('button', '开始作答')
  await sleep(700)
  check('封面 → 作答', (await js('location.hash')) === '#/answer/survey')

  // 空提交：应留在本页并出现错误摘要
  await clickText('button', '提交问卷')
  await sleep(500)
  const alertText = await js(`(() => {
    const el = document.querySelector('[data-alert]')
    return el && !el.hidden ? (el.textContent || '').trim() : ''
  })()`)
  check('空提交出现错误摘要', /必答/.test(alertText), alertText.slice(0, 40))
  check('空提交不跳转', (await js('location.hash')) === '#/answer/survey')

  // 补齐必答题
  await clickText('.ans-opt', '技术部')
  await js(`(() => {
    const nums = document.querySelectorAll('.ans-num__input')
    if (nums[0]) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(nums[0], '3')
      nums[0].dispatchEvent(new Event('input', { bubbles: true }))
    }
  })()`)
  await clickText('.ans-opt', '非常满意')
  await clickText('.ans-opt', '团队氛围')
  await clickText('.ans-opt', '薪酬福利')
  await sleep(300)

  const progress = await js(`(() => {
    const answered = document.querySelector('[data-answered]')
    const bar = document.querySelector('[data-progress]')
    return JSON.stringify({ answered: answered ? answered.textContent.trim() : '', now: bar ? bar.getAttribute('aria-valuenow') : '' })
  })()`)
  const progressObj = JSON.parse(progress)
  check('进度随作答更新', progressObj.answered === '4' || progressObj.now === '4', progress)

  await clickText('button', '提交问卷')
  await sleep(900)
  check('必答补齐后进入提交信息', (await js('location.hash')) === '#/answer/submit')

  await clickText('button', '提交问卷')
  await sleep(1200)
  const hash = await js('location.hash')
  const score = await js(`(() => {
    const el = document.querySelector('.ans-ring__score')
    return el ? (el.textContent || '').trim() : ''
  })()`)
  check('提交 → 结果页', hash === '#/answer/result', hash)
  check('结果页有分数', /\d+/.test(score), 'score=' + score)
}

async function flowAdmin() {
  await nav('#/admin/list')
  const rows0 = await js(`document.querySelectorAll('[data-ref="rows"] tr').length`)
  check('列表初始 5 行', rows0 === 5, 'rows=' + rows0)

  await setValue('[data-ref="search"]', '健康')
  await sleep(600)
  const rows1 = await js(`document.querySelectorAll('[data-ref="rows"] tr').length`)
  check('搜索过滤生效', rows1 === 2, 'rows=' + rows1)
  await js(`document.querySelector('[data-act="reset"]').click(); 1`)
  await sleep(400)
  const rows2 = await js(`document.querySelectorAll('[data-ref="rows"] tr').length`)
  check('重置搜索恢复', rows2 === 5, 'rows=' + rows2)

  // 新建
  await clickText('button', '新建问卷')
  await sleep(400)
  const dialogOpen = await js(`Boolean(document.querySelector('.adm-dialog__panel'))`)
  check('新建弹层打开', dialogOpen)
  await setValue('[data-new="title"]', '办公环境回访')
  await js(`document.querySelector('.adm-dialog [data-dialog-action="create"]').click(); 1`)
  await sleep(600)
  const created = await js(`(() => {
    const first = document.querySelector('[data-ref="rows"] tr')
    return JSON.stringify({
      dialog: Boolean(document.querySelector('.adm-dialog__panel')),
      first: first ? first.textContent.trim().slice(0, 30) : '',
      total: (document.body.innerText.match(/共 \\d+ 份/) || [''])[0],
    })
  })()`)
  const createdObj = JSON.parse(created)
  check('新建后弹层关闭且新行入列', createdObj.dialog === false && createdObj.first.includes('办公环境回访'), created)
  check('新建后总数增加', /共 7 份/.test(createdObj.total), createdObj.total)

  // 设计器
  await nav('#/admin/designer')
  await js(`[...document.querySelectorAll('.adm-outline__item')].find((n) => n.textContent.includes('你所在的部门')).click(); 1`)
  await sleep(300)
  const titleSel = `[data-bind="q-title"]`
  await setValue(titleSel, '你所在的部门（2026）')
  await sleep(400)
  const paperText = await js(`document.querySelector('[data-ref="paper"]').textContent`)
  check('设计器改标题即时同步纸面', paperText.includes('你所在的部门（2026）'))
  await js(`document.querySelector('[data-act="save"]').click(); 1`)
  await sleep(500)
  const saved = await js(`document.body.innerText.includes('已保存')`)
  check('保存出现反馈', saved)

  await js(`document.querySelector('[data-act="preview"]').click(); 1`)
  await sleep(500)
  const previewOpen = await js(`Boolean(document.querySelector('.adm-preview'))`)
  check('预览打开', previewOpen)
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`)
  await sleep(400)
  const previewClosed = await js(`!document.querySelector('.adm-preview')`)
  check('Esc 关闭预览', previewClosed)
}

async function flowLogin() {
  await nav('#/login/login-d')
  await setValue('[data-login="account"]', 'admin')
  await setValue('[data-login="password"]', 'wrong')
  const filled = await js(`(() => {
    const a = document.querySelector('[data-login="account"]')
    const p = document.querySelector('[data-login="password"]')
    return JSON.stringify({ a: a ? a.value : '', p: p ? p.value : '' })
  })()`)
  check('登录表单可填写', JSON.parse(filled).a === 'admin', filled)
  await js(`document.querySelector('.adm-login__submit').click(); 1`)
  await sleep(700)
  const err = await js(`(() => {
    const el = document.querySelector('[data-login-err], .adm-login__error')
    return el && !el.hidden ? (el.textContent || '').trim() : ''
  })()`)
  check('登录错误态可见', Boolean(err) && /密码|账号/.test(err), err.slice(0, 30))

  await setValue('[data-login="password"]', '123456')
  await js(`document.querySelector('.adm-login__submit').click(); 1`)
  await sleep(900)
  check('登录成功回列表', (await js('location.hash')) === '#/admin/list')
}

try {
  ws = new WebSocket(await connect())
  await new Promise((res) => ws.addEventListener('open', res, { once: true }))
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '))
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('[exception] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text))
    }
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) rej(new Error(msg.error.message))
      else res(msg.result)
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  await flowAnswer()
  await flowAdmin()
  await flowLogin()

  if (consoleErrors.length) {
    console.log('\n控制台错误：')
    consoleErrors.slice(0, 8).forEach((e) => console.log('  ' + e.slice(0, 240)))
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} 通过`)
  if (failed.length || consoleErrors.length) process.exitCode = 1
} finally {
  try { ws?.close() } catch {}
  chrome.kill()
  await sleep(400)
  rmSync(dir, { recursive: true, force: true })
}
