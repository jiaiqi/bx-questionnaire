/**
 * iframe 嵌入通信验证（平台 iframe-embed 契约）
 *
 * 起一个**跨域**父页面（另一个端口），把开发服务器嵌进 iframe，
 * 收集子页发来的 postMessage，断言契约类型确实到达。
 *
 * 用法：
 *   node scripts/embed.mjs [base] [--submit]
 *
 * 默认**不提交**（提交会产生真实作答记录），加 --submit 才走提交并验证 ADD_SUCCESS。
 *
 * 为什么不用单测代替：`postMessage` 是**静默失败**的 —— 父页面没监听、
 * targetOrigin 不匹配、上下文拿错，全都表现为「什么都没发生」。
 * 只有真的跨域嵌一次、真的在父页面收到消息，才算验证过。
 *
 * 关键实现细节：iframe 绝对定位在 (0,0)，这样 iframe 内的
 * getBoundingClientRect 与顶层视口坐标一致，鼠标事件可以直接复用；
 * 作答操作要在 iframe 的**执行上下文**里求值（跨域拿不到 contentDocument）。
 */
import { createServer } from 'node:http'

const BASE = process.argv[2] || 'http://localhost:5174'
const DO_SUBMIT = process.argv.includes('--submit')
const CDP_PORT = 9365
const PARENT_PORT = 4183
const ACTIVITY = '20261010100256000001'

const ITEMS = {
  radio: 'q-20261010100256000002',
  checkbox: 'q-20261010100256000007',
  text: 'q-20261010100256000011',
  number: 'q-20261010100256000012',
}

const PARENT_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>父页面</title></head>
<body style="margin:0">
<iframe id="f" src="${BASE}/#/pages/questionnaire/index/index?activity_no=${ACTIVITY}&formType=form&status=进行中"
        style="position:absolute;top:0;left:0;width:390px;height:844px;border:0"></iframe>
<script>
  window.__msgs = [];
  window.addEventListener('message', function (e) {
    window.__msgs.push({ type: e.data && e.data.type, data: e.data && e.data.data });
  });
</script>
</body></html>`

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(PARENT_HTML)
})
await new Promise(resolve => server.listen(PARENT_PORT, resolve))

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
const page = targets.find(t => t.type === 'page')
if (!page) {
  console.error(`找不到调试目标 —— 先启动 Chrome：--remote-debugging-port=${CDP_PORT}`)
  server.close()
  process.exit(2)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true })
  ws.addEventListener('error', rej, { once: true })
})

let id = 0
const pending = new Map()
/** iframe 的执行上下文 id */
let frameContextId = null
/**
 * 期望的 iframe 源
 *
 * 不能用 `new URL(ctx.origin)`：`about:blank` 等不透明源的 origin 是 `://`，
 * `new URL('://')` 会抛 ERR_INVALID_URL 把整个脚本带崩。
 * 直接取 BASE 的 host 做子串匹配即可。
 */
const expectedHost = new URL(BASE).host

ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.executionContextCreated') {
    const ctx = m.params.context
    if (typeof ctx.origin === 'string' && ctx.origin.startsWith('http') && ctx.origin.includes(expectedHost)) {
      frameContextId = ctx.id
    }
  }
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})

const send = (method, params = {}) => {
  const msgId = ++id
  return new Promise((resolve) => {
    pending.set(msgId, m => resolve(m.result))
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  return r?.exceptionDetails ? null : r?.result?.value
}
const evaluateInFrame = async (expr) => {
  if (frameContextId === null) return null
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    contextId: frameContextId,
  })
  return r?.exceptionDetails ? null : r?.result?.value
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** 在 iframe 里点带指定文案的元素（真实鼠标事件） */
async function clickByText(text) {
  const box = await evaluateInFrame(`(() => {
    const els = [...document.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && (e.innerText || '').trim() === ${JSON.stringify(text)});
    if (!els.length) return null;
    const el = els[els.length - 1];
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  })()`)
  if (!box || typeof box !== 'string' || !box.startsWith('{')) return false
  const { x, y } = JSON.parse(box)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  }
  await sleep(300)
  return true
}

async function clickSelector(selector) {
  const box = await evaluateInFrame(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  })()`)
  if (!box || typeof box !== 'string' || !box.startsWith('{')) return false
  const { x, y } = JSON.parse(box)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  }
  await sleep(300)
  return true
}

/** 原生 setter + input 事件写入（headless 下 Input.insertText 对 uni-app 无效） */
async function setInput(selector, value) {
  const r = await evaluateInFrame(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return 'not-found';
    el.focus();
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    desc.set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`)
  await sleep(400)
  return r === 'ok'
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true })
await send('Page.navigate', { url: `http://localhost:${PARENT_PORT}/` })
await sleep(13000)

const checks = []
checks.push({ name: '拿到 iframe 的执行上下文', pass: frameContextId !== null })

let msgs = JSON.parse(await evaluate('JSON.stringify(window.__msgs || [])') || '[]')
console.log(`加载后收到：${JSON.stringify(msgs.map(m => m.type))}`)
checks.push({ name: 'FORM_READY 到达（父页面可收起加载动画）', pass: msgs.some(m => m.type === 'FORM_READY') })
checks.push({
  name: 'FORM_READY 带 serviceName',
  pass: msgs.some(m => m.type === 'FORM_READY' && m.data?.serviceName === 'srvdaq_init_view_select'),
})
checks.push({ name: 'RESIZE 到达且 height 为正数', pass: msgs.some(m => m.type === 'RESIZE' && Number(m.data?.height) > 0) })

if (DO_SUBMIT) {
  console.log('\n作答并提交：')
  const filled = [
    await clickSelector(`#${ITEMS.radio} .bx-option`),
    await clickSelector(`#${ITEMS.checkbox} .bx-option:nth-of-type(1)`),
    await clickSelector(`#${ITEMS.checkbox} .bx-option:nth-of-type(2)`),
    await setInput(`#${ITEMS.text} input`, '嵌入通信验证'),
    await setInput(`#${ITEMS.number} input`, '2026'),
  ]
  checks.push({ name: '4 道题全部作答成功', pass: filled.every(Boolean) })

  await clickByText('提交问卷')
  await sleep(1400)
  // 二次确认弹窗（文案不固定，逐个试）
  for (const label of ['确定', '确认', '是', 'OK']) {
    if (await clickByText(label)) break
  }
  await sleep(9000)

  msgs = JSON.parse(await evaluate('JSON.stringify(window.__msgs || [])') || '[]')
  console.log(`提交后收到：${JSON.stringify(msgs.map(m => m.type))}`)
  const add = msgs.find(m => m.type === 'ADD_SUCCESS')
  checks.push({ name: 'ADD_SUCCESS 到达（父页面可关弹窗/刷新列表）', pass: !!add })
  checks.push({ name: 'ADD_SUCCESS 的 action=add', pass: add?.data?.action === 'add' })
  checks.push({
    name: 'ADD_SUCCESS 的 serviceName 正确',
    pass: add?.data?.serviceName === 'srvdaq_activity_result_submit',
  })
  checks.push({
    name: 'ADD_SUCCESS 的 id 是批次号',
    pass: /^[0-9a-f]{32}$/.test(String(add?.data?.id ?? '')),
  })
  checks.push({
    name: 'ADD_SUCCESS 的 response 透传 fill_batch_no',
    pass: typeof add?.data?.response?.fill_batch_no === 'string',
  })
}

console.log('')
let failed = 0
for (const c of checks) {
  if (!c.pass) failed++
  console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`)
}
console.log(`\n== ${checks.length} 项检查，失败 ${failed} 项 ==`)

ws.close()
server.close()
process.exit(failed === 0 ? 0 : 1)
