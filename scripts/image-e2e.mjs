/**
 * 图片题端到端验证（真实网关）
 *
 * 用法：
 *   node scripts/image-e2e.mjs [base] [--activity=<no>]
 *
 * 默认活动 `20261011113133000003`（「bxq 特殊题型测试问卷」，含图片/引用/地址/文本各一题），
 * 可用 --activity 指定别的。
 *
 * ## 为什么用桩替换 uni.chooseImage
 *
 * headless Chrome 里 `input.click()` 会**立即触发 `cancel` 事件**（没有真实文件选择器可开），
 * uni-app H5 的 chooseImage 监听 cancel 并 `reject('chooseImage:fail cancel')`，
 * 于是组件按「用户取消」静默返回 —— 后续注入的 change 事件已经晚了。
 *
 * 实测证据：
 *   CHOOSE_CALL#1 → CHOOSE_FAIL#1 {"errMsg":"chooseImage:fail cancel"}（点击瞬间）
 *   之后 DOM.setFileInputFiles → change 触发，但 promise 已 reject
 *
 * 所以只把**平台选图弹窗**这一步换成桩：桩返回一个真实 PNG 的 blob URL，
 * 下游（uni.uploadFile 的 multipart 组装、票据 header、服务端落库、
 * 回显地址、作答值写入、提交请求体）**全部是真实链路**。
 *
 * 未被覆盖的：选图弹窗本身的交互（原生行为，无法在 headless 验证）。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://localhost:5174'
const ACTIVITY = (process.argv.find(a => a.startsWith('--activity=')) || '').split('=')[1] || '20261011113133000003'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9375

// 1×1 真实 PNG
const pngPath = join(mkdtempSync(join(tmpdir(), 'bxq-png-')), 'e2e-photo.png')
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
writeFileSync(pngPath, Buffer.from(PNG_BASE64, 'base64'))

const userDataDir = mkdtempSync(join(tmpdir(), 'bxq-img-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = ms => new Promise(r => setTimeout(r, ms))

let targets = null
for (let i = 0; i < 40 && !targets; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    if (res.ok) {
      targets = await res.json()
    }
  }
  catch { /* 等 Chrome */ }
  if (!targets) {
    await sleep(250)
  }
}
if (!targets) {
  console.error('Chrome 未就绪')
  chrome.kill()
  process.exit(2)
}

const page = targets.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true })
  ws.addEventListener('error', rej, { once: true })
})

let id = 0
const pending = new Map()
const requests = []
/** /file/upload 的响应状态（multipart 的 postData CDP 拿不到，只能从响应侧断言） */
let uploadStatus = null
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
  if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'POST') {
    requests.push({ url: m.params.request.url, body: m.params.request.postData || '' })
  }
  if (m.method === 'Network.responseReceived' && m.params.response.url.includes('/file/upload')) {
    uploadStatus = m.params.response.status
  }
})
const send = (method, params = {}) => {
  const msgId = ++id
  return new Promise((resolve) => {
    pending.set(msgId, m => resolve(m.result))
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}
const evaluate = async (expr, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise })
  if (r?.exceptionDetails) {
    const d = r.exceptionDetails
    const detail = d.exception?.description || d.text || '未知'
    console.error(`  [求值异常] ${String(detail).split('\n').slice(0, 3).join(' | ').slice(0, 300)}`)
    return { __err: String(detail).slice(0, 200) }
  }
  return r?.result?.value
}
const clickText = async (text) => {
  const box = await evaluate(`(() => {
    const els = [...document.querySelectorAll('uni-view')].filter(e => (e.innerText||'').trim() === ${JSON.stringify(text)})
    const el = els[els.length - 1]
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const b = el.getBoundingClientRect()
    return { x: b.left + b.width/2, y: b.top + b.height/2 }
  })()`)
  if (!box) {
    return false
  }
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }
  return true
}

const checks = []
const check = (name, pass, extra = '') => {
  checks.push({ name, pass })
  console.log(`  ${pass ? '✓' : '✗'} ${name}${extra ? ` —— ${extra}` : ''}`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('DOM.enable')
await send('Network.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

// 清存储后进入答题页
await send('Page.navigate', { url: `${BASE}/#/pages/questionnaire/index/index?activity_no=${ACTIVITY}&formType=form&status=进行中` })
await sleep(7000)
await evaluate('localStorage.clear()')
await send('Page.navigate', { url: 'about:blank' })
await sleep(600)
await send('Page.navigate', { url: `${BASE}/#/pages/questionnaire/index/index?activity_no=${ACTIVITY}&formType=form&status=进行中` })
await sleep(12000)

console.log('\n=== 前置条件 ===')
const ready = await evaluate(`!!document.querySelector('.bx-image__upload')`)
check('图片题渲染出上传按钮', ready)
if (!ready) {
  console.log('  页面文本：', String(await evaluate(`(document.body.innerText||'').slice(0,300)`)).replace(/\n/g, ' / '))
  ws.close()
  chrome.kill()
  process.exit(1)
}
check('初始无图片', await evaluate(`!document.querySelector('.bx-image__list')`))
const beforeAnswered = await evaluate(`(((document.querySelector('uni-app')||document.body).innerText||'').match(/已答\\s*(\\d+)/)||[])[1]`)
console.log(`  初始已答：${beforeAnswered}`)

// 用真实 PNG 的 blob URL 替换选图弹窗
const stubbed = await evaluate(`(async () => {
  const b64 = ${JSON.stringify(PNG_BASE64)}
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const file = new File([bytes], 'e2e-photo.png', { type: 'image/png' })
  window.__stubBlob = URL.createObjectURL(file)
  window.__stubCalls = 0
  uni.chooseImage = (opts) => {
    window.__stubCalls++
    opts && opts.success && opts.success({ tempFilePaths: [window.__stubBlob], tempFiles: [file] })
    return Promise.resolve()
  }
  return { blob: window.__stubBlob.slice(0, 40), 类型: file.type, 字节: file.size }
})()`, true)
console.log(`\n=== 选图桩 ===\n  ${JSON.stringify(stubbed)}`)
check('选图桩返回了 blob URL', String(stubbed?.blob || '').startsWith('blob:'))

// 点上传
const clicked = await clickText('上传图片')
check('点到了上传按钮', clicked)
await sleep(1200)
check('选图桩被调用', (await evaluate('window.__stubCalls')) === 1)

// 等上传完成
let uploaded = null
for (let i = 0; i < 25; i++) {
  await sleep(1000)
  uploaded = await evaluate(`(() => ({
    imgs: document.querySelectorAll('.bx-image__item').length,
    count: ((document.querySelector('.bx-image__count')||{}).innerText||'').trim(),
    // uni-app 的 <image> 在 H5 上渲染成 uni-image，地址可能在内层 img、
    // 内层元素的 background-image 或外层属性上，逐个尝试且不抛异常
    src: (() => {
      try {
        const e = document.querySelector('.bx-image__item')
        if (!e) return ''
        // 注意：这段表达式整体在 JS 模板字符串里，反斜杠会被当转义序列吃掉，
        // 所以这里刻意不用任何带反斜杠的正则
        const strip = (v) => {
          const s = String(v)
          const i = s.indexOf('url(')
          const body = i >= 0 ? s.slice(i + 4).split(')')[0] : s
          return body.split('"').join('').split("'").join('')
        }
        const cands = []
        const innerImg = e.querySelector('img')
        if (innerImg) cands.push(innerImg.getAttribute('src'), innerImg.src)
        cands.push(e.getAttribute('src'), e.src)
        for (const d of e.querySelectorAll('div')) {
          const bg = d.style && d.style.backgroundImage
          if (bg) cands.push(strip(bg))
        }
        const ebg = e.style && e.style.backgroundImage
        if (ebg) cands.push(strip(ebg))
        return String(cands.find(c => c && String(c).length > 0) || '')
      } catch (err) { return 'ERR:' + err.message }
    })(),
    html: (() => { const e = document.querySelector('.bx-image__item'); return e ? String(e.outerHTML).slice(0, 300) : '' })(),
    clear: ((document.querySelector('.bx-image__clear-text')||{}).innerText||'').trim(),
    hint: ((document.querySelector('.bx-image__hint')||{}).innerText||'').trim(),
    uploading: ((document.querySelector('.bx-image__upload-text')||{}).innerText||'').includes('上传中'),
  }))()`)
  if (uploaded?.imgs > 0) {
    break
  }
  if (i === 24) {
    console.log(`  等满 25 秒仍未回显：${JSON.stringify(uploaded)}`)
  }
}

console.log('\n=== 上传结果 ===')
console.log(`  ${JSON.stringify(uploaded)}`)
if (uploaded?.html) {
  console.log(`  图片元素 HTML：${uploaded.html}`)
}
check('上传后回显出图片', (uploaded?.imgs || 0) > 0)
check('计数显示 1 / N', /^1\s*\/\s*\d+$/.test(String(uploaded?.count || '')))
check('出现「清空图片」入口', uploaded?.clear === '清空图片')

/**
 * 回显地址的两种合法形态
 *
 * 服务端附件列表可读 → `/file/download?filePath=...`；
 * 不可读（实测本环境 `srvfile_attachment_select` 无权限）→ 退回本地 blob 预览。
 * **两种都算通过，但退回本地时必须同时出现解释性提示** —— 否则就是「传了却看不见」。
 */
const src = String(uploaded?.src || '')
const fromServer = src.includes('/file/download')
const fromLocal = src.startsWith('blob:')
check('回显地址是服务端地址或本地预览', fromServer || fromLocal, fromServer ? '服务端' : '本地预览')
check('走本地预览时有解释提示', !fromLocal || String(uploaded?.hint || '').includes('本机预览'))
check('真的发出了 /file/upload 请求', requests.some(r => r.url.includes('/file/upload')))
check('/file/upload 返回 HTTP 200', uploadStatus === 200, String(uploadStatus))

// 作答值应写入本地草稿
await sleep(3000)
const draftKeys = await evaluate(`(() => {
  const out = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (/draft|fill_batch/.test(k)) out.push(k)
  }
  return out
})()`)
console.log(`  本地草稿 key：${JSON.stringify(draftKeys)}`)

// 图片题的容器 id 是 `q-<item_no>`，从 DOM 反推而不是写死。
// 必须在提交前取 —— 提交后页面会跳走，DOM 里就没有图片题了。
const imageItemNo = String(await evaluate(`(() => {
  let el = document.querySelector('.bx-image')
  while (el && !(el.id && el.id.startsWith('q-'))) el = el.parentElement
  return el ? el.id.slice(2) : ''
})()`))
console.log(`  图片题 item_no（提交前取）：${imageItemNo}`)
check('能从 DOM 反推出图片题 item_no', !!imageItemNo)

// 提交
requests.length = 0
await clickText('提交问卷')
await sleep(3500)
await evaluate(`(() => {
  const btn = [...document.querySelectorAll('div')].find(e => ['确定','确认','是','OK'].includes((e.innerText||'').trim()) && String(e.className).includes('uni-modal__btn'))
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(9000)

console.log('\n=== 提交 ===')
const submitReq = requests.find(r => r.url.includes('activity_result_submit'))
check('提交真的发出', !!submitReq)
if (submitReq) {
  console.log(`  提交体：${submitReq.body.slice(0, 500)}`)
  if (imageItemNo) {
    check('提交体包含图片题', submitReq.body.includes(imageItemNo))
    const seg = submitReq.body.split(imageItemNo)[1] || ''
    check('图片题作答值非空（批次号已写入）', /"option_data":\["[^"]+/.test(seg.slice(0, 120)))
  }
}
const finalHash = String(await evaluate('location.hash.slice(0, 160)'))
console.log(`  提交后 hash：${finalHash}`)
check('提交后跳到结果页或详情页', finalHash.includes('result') || finalHash.includes('detail'))

const failed = checks.filter(c => !c.pass).length
console.log(`\n== ${checks.length} 项检查，失败 ${failed} 项 ==`)
ws.close()
chrome.kill()
process.exit(failed === 0 ? 0 : 1)
