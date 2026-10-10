/**
 * 端到端交互冒烟：真实作答 → 校验状态 → 暂存草稿
 *
 * 此前的冒烟只验证「页面能渲染」，没有验证过任何一次真实交互。
 * 这里用 CDP 派发真实鼠标/键盘事件走一遍作答流程，验证：
 *   1. 点选项能改变作答状态（进度从「已答 0」变成「已答 4」）；
 *   2. 输入框输入能进入状态（不是只改了 DOM value）；
 *   3. 「暂存草稿」能真的调用保存接口并回传批次号。
 *
 * 注意必须用 Input.dispatchMouseEvent / Input.insertText —— 直接改 DOM 的
 * value 或用 element.click() 都不会让 Vue 的 v-model 更新，测出来的「通过」
 * 是假的。这一点在早期验证里踩过。
 *
 * 默认**不提交**（提交会产生真实记录）。加 --submit 才走最后一步。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || 'http://localhost:5174'
const DO_SUBMIT = process.argv.includes('--submit')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9336
const ACTIVITY_NO = '20261010100256000001'
const ITEMS = {
  radio: 'q-20261010100256000002',
  checkbox: 'q-20261010100256000007',
  text: 'q-20261010100256000011',
  number: 'q-20261010100256000012',
}

const userDataDir = mkdtempSync(join(tmpdir(), 'bxq-e2e-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = ms => new Promise(r => setTimeout(r, ms))

let id = 0
const pending = new Map()
let send

/**
 * 抓到的网络请求（只留写操作）。
 *
 * 「出现成功提示」不足以证明按钮生效 —— 自动保存也会给出同样的提示。
 * 必须看到真的发出了 srvdaq_activity_result_save 请求才算数。
 */
const writeRequests = []

/** 取元素中心点坐标，用于派发真实鼠标事件 */
async function centerOf(selector) {
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      const b = el.getBoundingClientRect()
      if (b.width === 0 && b.height === 0) return null
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    })()`,
    returnByValue: true,
  })
  return r.result.value
}

async function clickSelector(selector, label) {
  const pt = await centerOf(selector)
  if (!pt) {
    console.log(`  [跳过] ${label}：找不到 ${selector}`)
    return false
  }
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type, x: pt.x, y: pt.y, button: 'left', clickCount: 1,
    })
  }
  await sleep(400)
  console.log(`  [点击] ${label}`)
  return true
}

/**
 * 往输入框写值
 *
 * 为什么不用 Input.insertText：headless + mobile 视口下，dispatchMouseEvent
 * 派发到输入框坐标后 document.activeElement 仍是 BODY，insertText 落不进去
 * （实测输入框 value 始终为空）。坐标派发在这个环境里不可靠。
 *
 * 改用「聚焦 + 原型上的 value setter + 派发 input 事件」：
 * 走原型 setter 是为了绕过组件可能对实例属性的拦截，派发冒泡的 input 事件
 * 才能让 Vue 的 v-model 真正更新 —— 只改 value 不派事件的话框架收不到，
 * 那样的「通过」是假的。
 */
async function typeInto(selector, text, label) {
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return 'not-found'
      el.focus()
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      setter.call(el, ${JSON.stringify(text)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return el.value
    })()`,
    returnByValue: true,
  })
  await sleep(400)
  console.log(`  [输入] ${label}：「${text}」（写入后 value=${JSON.stringify(r.result.value)}）`)
  return r.result.value === text
}

/** 读取当前作答进度与批次号提示 */
async function readState() {
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const t = (document.querySelector('uni-app') || document.body).innerText || ''
      const answered = (t.match(/已答\\s*(\\d+)/) || [])[1] || '?'
      const batch = (t.match(/批次\\s*([0-9a-f]{8,})/i) || [])[1] || ''
      // 输入框的真实 value：用来判断 insertText 到底有没有落到组件上
      const inputs = [...document.querySelectorAll('input, textarea')].map(e => e.value)
      return { answered, batch, inputs, text: t.replace(/\\n+/g, ' / ').slice(0, 400) }
    })()`,
    returnByValue: true,
  })
  return r.result.value
}

/** 按可见文本找元素并点击（按钮没有稳定的 class，只能按文案定位） */
async function clickByText(text, label) {
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const target = ${JSON.stringify(text)}
      // uni.showModal 在 H5 上渲染成 div/uni-view，标签不统一，
      // 所以按「文本完全匹配」在全部元素里找最内层的那个。
      const all = [...document.querySelectorAll('*')]
      const cands = all.filter(e => (e.innerText || '').trim() === target
        && e.children.length <= 2)
      const el = cands[cands.length - 1]
      if (!el) return { found: false }
      const b = el.getBoundingClientRect()
      return { found: true, x: b.left + b.width / 2, y: b.top + b.height / 2, tag: el.tagName, cls: el.className }
    })()`,
    returnByValue: true,
  })
  const pt = r.result.value
  if (!pt?.found) {
    console.log(`  [跳过] ${label}：找不到文本「${text}」`)
    return false
  }
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
  }
  await sleep(300)
  const clicked = await send('Runtime.evaluate', {
    expression: `(() => {
      const target = ${JSON.stringify(text)}
      const all = [...document.querySelectorAll('*')]
      const cands = all.filter(e => (e.innerText || '').trim() === target && e.children.length <= 2)
      const el = cands[cands.length - 1]
      if (!el) return false
      el.click()
      return true
    })()`,
    returnByValue: true,
  })
  await sleep(500)
  console.log(`  [点击] ${label}（${pt.tag}.${pt.cls} @ ${Math.round(pt.x)},${Math.round(pt.y)}；原生 click=${clicked.result.value}）`)
  return true
}

async function main() {
  let wsUrl = null
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      wsUrl = list.find(t => t.type === 'page')?.webSocketDebuggerUrl
    }
    catch { /* 等 Chrome */ }
    if (!wsUrl) await sleep(500)
  }
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
      return
    }
    if (m.method === 'Network.requestWillBeSent') {
      const url = m.params.request.url
      if (url.includes('activity_result_save') || url.includes('activity_result_submit')) {
        writeRequests.push({ url, at: Date.now() })
      }
    }
  })
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id
    pending.set(myId, { resolve, reject })
    ws.send(JSON.stringify({ id: myId, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: `${BASE}/#/pages/questionnaire/index/index?activity_no=${ACTIVITY_NO}&formType=form&status=进行中` })
  await sleep(9000)

  const checks = []
  const initial = await readState()
  console.log(`初始：已答 ${initial.answered}`)
  checks.push({ name: '初始进度为 0', pass: initial.answered === '0' })

  console.log('\n开始作答：')
  // 单选：选第 1 项
  await clickSelector(`#${ITEMS.radio} .bx-option`, '单选题第 1 项')
  const afterRadio = await readState()
  checks.push({ name: '单选后进度 +1', pass: afterRadio.answered === '1' })

  // 多选：选前两项
  await clickSelector(`#${ITEMS.checkbox} .bx-option:nth-of-type(1)`, '多选题第 1 项')
  await clickSelector(`#${ITEMS.checkbox} .bx-option:nth-of-type(2)`, '多选题第 2 项')
  const afterCheckbox = await readState()
  checks.push({ name: '多选后进度 +1', pass: afterCheckbox.answered === '2' })

  // 文本题
  await typeInto(`#${ITEMS.text} input`, '端到端测试建议', '填空题')
  const afterText = await readState()
  console.log(`  输入框值：${JSON.stringify(afterText.inputs)}`)
  checks.push({ name: '文本输入后进度 +1', pass: afterText.answered === '3' })

  // 数字题
  await typeInto(`#${ITEMS.number} input`, '2026', '数字题')
  const afterNumber = await readState()
  console.log(`  输入框值：${JSON.stringify(afterNumber.inputs)}`)
  checks.push({ name: '数字输入后进度 +1', pass: afterNumber.answered === '4' })

  console.log(`\n作答后：已答 ${afterNumber.answered}`)

  // 暂存草稿
  console.log('\n暂存草稿：')
  const draftBefore = await readState()
  const reqBefore = writeRequests.length
  await clickByText('暂存草稿', '暂存草稿按钮')
  await sleep(3500)
  const afterDraft = await readState()
  const newReqs = writeRequests.slice(reqBefore)
  console.log(`  提示文本尾部：${afterDraft.text.slice(-140)}`)
  console.log(`  新增写请求 ${newReqs.length} 个：`)
  for (const r of newReqs) console.log(`    ${r.url.split('/').slice(-3).join('/')}`)

  checks.push({
    name: '点击暂存草稿后真的发出保存请求',
    pass: newReqs.some(r => r.url.includes('activity_result_save')),
  })
  checks.push({
    name: '暂存后进度未丢失',
    pass: afterDraft.answered === draftBefore.answered,
  })

  if (DO_SUBMIT) {
    console.log('\n提交问卷：')
    const submitBefore = writeRequests.length
    await clickByText('提交问卷', '提交问卷按钮')

    // 提交前有二次确认（confirmDialog → uni.showModal）：
    // 「提交后无法修改，确认提交吗？」。不点确认就不会发出 submit 请求 ——
    // 这正是首轮「提交 0 个写请求」的原因。
    await sleep(1200)
    const modalText = await send('Runtime.evaluate', {
      expression: `(() => {
        const t = document.body.innerText || ''
        const shown = t.includes('确认提交') || t.includes('无法修改')
        // 列出弹窗里的候选按钮，便于按真实文案点击
        const btns = [...document.querySelectorAll('*')]
          .filter(e => e.children.length === 0 && (e.innerText || '').trim())
          .map(e => (e.innerText || '').trim())
          .filter(s => s.length <= 8)
        return { shown, btns: [...new Set(btns)].slice(-12) }
      })()`,
      returnByValue: true,
    })
    console.log(`  确认弹窗：${modalText.result.value.shown ? 'shown' : 'absent'}`)
    console.log(`  候选按钮文本：${JSON.stringify(modalText.result.value.btns)}`)
    if (modalText.result.value.shown) {
      // uni.showModal 在 H5 上的确认按钮文案不固定（确定 / 确认 / 是），逐个试
      for (const label of ['确定', '确认', '是', 'OK']) {
        const ok = await clickByText(label, `确认弹窗-${label}`)
        if (ok) break
      }
    }

    await sleep(7000)
    const afterSubmit = await readState()
    const submitReqs = writeRequests.slice(submitBefore)
    console.log(`  提交后文本：${afterSubmit.text.slice(0, 200)}`)
    console.log(`  新增写请求 ${submitReqs.length} 个：`)
    for (const r of submitReqs) console.log(`    ${r.url.split('/').slice(-3).join('/')}`)
    checks.push({ name: '提交后离开作答页', pass: !afterSubmit.text.includes('提交问卷') })
    checks.push({
      name: '提交真的发出 submit 请求',
      pass: submitReqs.some(r => r.url.includes('activity_result_submit')),
    })
  }
  else {
    console.log('\n（未加 --submit，跳过提交，避免产生真实记录）')
  }

  ws.close()
  chrome.kill()
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* Windows */ }

  console.log('\n=== 结果 ===')
  let bad = 0
  for (const c of checks) {
    if (!c.pass) bad++
    console.log(`${c.pass ? '✓' : '✗'} ${c.name}`)
  }
  console.log(`\n== ${checks.length} 项检查，失败 ${bad} 项 ==`)
  process.exit(bad === 0 ? 0 : 1)
}

main().catch((e) => { console.error('失败:', e.message); chrome.kill(); process.exit(1) })
