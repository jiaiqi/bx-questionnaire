/**
 * 反向验证 smoke.mjs 的横向溢出检测是否真的有效。
 *
 * 冒烟脚本在 33 次渲染里都报「无溢出」。但一个恒为 0 的检查也会给出同样的
 * 结果 —— 必须先证明它能在**已知溢出**的情况下报警，否则那份「全绿」没有意义。
 *
 * 做法：在移动竖屏视口下注入一个 width:2000px 的 div，看检测值是否变大。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || 'http://localhost:5174'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9334

const userDataDir = mkdtempSync(join(tmpdir(), 'bxq-ovf-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { stdio: 'ignore' })

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  let wsUrl = null
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      wsUrl = list.find(t => t.type === 'page')?.webSocketDebuggerUrl
    }
    catch { /* 等 Chrome 起来 */ }
    if (!wsUrl) await sleep(500)
  }
  if (!wsUrl) throw new Error('连不上 Chrome')

  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })

  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id
    pending.set(myId, { resolve, reject })
    ws.send(JSON.stringify({ id: myId, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 1, mobile: true,
  })

  await send('Page.navigate', { url: `${BASE}/#/pages/questionnaire/couple/couple` })
  await sleep(6000)

  const measure = async label => {
    const r = await send('Runtime.evaluate', {
      expression: `(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth))()`,
      returnByValue: true,
    })
    console.log(`  ${label}：溢出 ${r.result.value}px`)
    return r.result.value
  }

  console.log('移动竖屏 375px 下：')
  const before = await measure('注入前')

  // 注入一个明确会撑破视口的元素
  await send('Runtime.evaluate', {
    expression: `(() => {
      const d = document.createElement('div')
      d.id = 'ovf-probe'
      d.style.cssText = 'width:2000px;height:10px;position:absolute;top:0;left:0'
      document.body.appendChild(d)
    })()`,
  })
  await sleep(500)
  const after = await measure('注入 2000px 元素后')

  // 移除后应恢复
  await send('Runtime.evaluate', {
    expression: `(() => { document.getElementById('ovf-probe')?.remove() })()`,
  })
  await sleep(500)
  const restored = await measure('移除后')

  ws.close()
  chrome.kill()
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* Windows 偶发 */ }

  const detected = after > 1
  const recovered = restored <= 1
  console.log(`\n注入后是否检出溢出：${detected ? '是 ✓' : '否 ✗'}`)
  console.log(`移除后是否恢复：${recovered ? '是 ✓' : '否 ✗'}`)
  console.log(detected && recovered && before <= 1
    ? '\n== 检测有效：能检出真实溢出，且不误报 =='
    : '\n== 检测无效，冒烟的「无溢出」结论不可信 ==')
  process.exit(detected && recovered ? 0 : 1)
}

main().catch((e) => {
  console.error('失败:', e.message)
  chrome.kill()
  process.exit(1)
})
