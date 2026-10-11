/**
 * 特殊题型端到端验证（真实网关）：图片 / 引用 / 地址
 *
 * 用法：
 *   node scripts/special-e2e.mjs [base] [--activity=<no>]
 *
 * 默认活动 `20261011113133000003`（「bxq 特殊题型测试问卷」，含图片/引用/地址/文本各一题），
 * 可用 --activity 指定别的。
 *
 * ## 三个题型各自的覆盖边界
 *
 * | 题型 | 覆盖 | 未覆盖 |
 * | --- | --- | --- |
 * | 图片 | 上传→落库→回显→作答值→提交（选图弹窗用桩，见下） | 选图弹窗本身（原生行为） |
 * | 引用 | 弹层取数→选中→确定→作答值→提交 | — |
 * | 地址 | 空数据时的诚实降级（本环境 `srvconfig_area_adj_select` 恒 0 行） | 有数据时的级联选择 |
 *
 * ## 为什么图片题的选图弹窗用桩
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
/**
 * 记录一项检查
 *
 * `pass` **必须严格等于 true** —— 早期写的是 `if (!c.pass) failed++`，
 * 于是求值异常返回的对象（`{__err: ...}`）是 truthy，被当成通过，
 * 产生了一条「选中项出现 ✓ 标记」的假绿。断言失败要失败得响亮。
 */
const check = (name, pass, extra = '') => {
  const ok = pass === true
  checks.push({ name, pass: ok })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` —— ${extra}` : ''}`)
}

/** 按选择器点击（中心点真实鼠标事件） */
const clickSel = async (sel, nth = 0) => {
  const box = await evaluate(`(() => {
    const els = document.querySelectorAll(${JSON.stringify(sel)})
    const el = els[${nth}]
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const b = el.getBoundingClientRect()
    return { x: b.left + b.width/2, y: b.top + b.height/2 }
  })()`)
  if (!box || !box.x) {
    return false
  }
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }
  return true
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

// ── 引用题 ────────────────────────────────────────────────────
// 弹层数据来自 srvdaq_activity_cfg_select（活动表），真实网关返回 13 个活动
console.log('\n=== 引用题 ===')
// 控件内是「请选择\n›」两行，clickText 的精确匹配命中不了，必须按选择器点
check('点到了引用题控件', await clickSel('.bx-ref__control'))
await sleep(4000)
const refItems = await evaluate(`document.querySelectorAll('.bx-ref__item').length`)
console.log(`  弹层项数：${refItems}`)
check('引用弹层取到真实数据', typeof refItems === 'number' && refItems > 0)
check('弹层内容来自活动表', await evaluate(`(document.body.innerText||'').includes('bxq 自动化测试问卷')`) === true)

const firstRef = String(await evaluate(`(document.querySelectorAll('.bx-ref__item')[0]||{}).innerText || ''`))
console.log(`  第 1 项：${JSON.stringify(firstRef)}`)
check('点到了第 1 项', await clickSel('.bx-ref__item', 0))
await sleep(700)
check('选中项出现 ✓ 标记', await evaluate(`String((document.querySelectorAll('.bx-ref__item')[0]||{}).innerText || '').includes('✓')`) === true)
check('点到了确定', await clickSel('.bx-ref__confirm'))
await sleep(2500)

const refText = String(await evaluate(`(document.querySelector('.bx-ref')||{}).innerText || ''`))
console.log(`  引用题控件文本：${JSON.stringify(refText)}`)
check('确定后控件显示所选内容', refText.trim().length > 0 && !refText.includes('请选择'))
check('引用题计入已答', Number(await evaluate(`(((document.querySelector('uni-app')||document.body).innerText||'').match(/已答\\s*(\\d+)/)||[])[1]`)) >= 1)

/** 引用题的 item_no 也从 DOM 反推（提交后页面会跳走，必须提前取） */
const refItemNo = String(await evaluate(`(() => {
  let el = document.querySelector('.bx-ref')
  while (el && !(el.id && el.id.startsWith('q-'))) el = el.parentElement
  return el ? el.id.slice(2) : ''
})()`))
console.log(`  引用题 item_no（提交前取）：${refItemNo}`)
check('能从 DOM 反推出引用题 item_no', !!refItemNo)

// ── 地址题 ────────────────────────────────────────────────────
// 本环境 srvconfig_area_adj_select 原本恒 0 行；造了测试地区树（bxq99 等）后能验证级联。
// 两种部署形态都真实存在，所以按实际数据分支断言，而不是写死某一种 ——
// 写死的话换个环境就变成假绿或假红。
let addrItemNo = ''
console.log('\n=== 地址题 ===')
const addrPlaceholder = String(await evaluate(`((document.querySelector('.bx-address__placeholder')||{}).innerText||'').trim()`))
console.log(`  占位文案：${JSON.stringify(addrPlaceholder)}`)

/**
 * 断言的是**行为**而不是属性值
 *
 * 早先这里查 `getAttribute('disabled')` 是否 !== 'false'，结果变异（去掉守卫）后
 * 属性值变成空串 `""`，断言照样通过 —— 又是一条假绿。
 * 用户真正能感知的是「点了会不会弹出一个空的转轮」，所以直接点它、看有没有弹层。
 */
const addrPickerOpened = async () => evaluate(`(() => {
  const box = document.querySelector('.uni-picker-container')
  if (!box) return false
  const style = window.getComputedStyle(box)
  return style.display !== 'none' && style.visibility !== 'hidden'
})()`)

if (addrPlaceholder === '暂无地区数据') {
  check('无地区数据时如实提示，而不是「请选择地区」', true)
  check('点到了地址题控件', await clickSel('.bx-address__control'))
  await sleep(2500)
  const opened = await addrPickerOpened()
  check('无地区数据时点它不会弹出空的地区选择器', opened === false)
  if (opened === true) {
    console.log(`  弹层内容：${JSON.stringify(String(await evaluate(`((document.querySelector('.uni-picker-container')||{}).innerText||'').trim()`)).slice(0, 120))}`)
  }
}
else {
  check('有地区数据时显示「请选择地区」', addrPlaceholder === '请选择地区')
  check('点到了地址题控件', await clickSel('.bx-address__control'))
  await sleep(2500)

  const pickerText = String(await evaluate(`((document.querySelector('.uni-picker-container')||{}).innerText||'').trim()`))
  console.log(`  弹层内容：${JSON.stringify(pickerText)}`)
  check('地区选择器弹出', pickerText.length > 0)

  /**
   * 标签必须是**名称**而不是编号
   *
   * 地区表的列是 `no`（编号）/ `name`（名称）/ `parent_no`（父编号），
   * 而老工程取的是 `path_name`。实测本环境 `path_name` 为 **null**（`path` 有值），
   * 于是 `path_name ?? no` 的回退会把编号直接当标签 —— 用户看到的是「bxq99」。
   */
  check('地区选项显示名称而不是编号', pickerText.includes('bxq测试省') && !pickerText.includes('bxq99'))

  check('点到了地区选择器的完成', await clickSel('.uni-picker-action-confirm'))
  await sleep(2000)
  const addrAfter = String(await evaluate(`(document.querySelector('.bx-address')||{}).innerText || ''`))
  console.log(`  确定后控件文本：${JSON.stringify(addrAfter)}`)
  check('确定后控件显示所选地区名称', addrAfter.includes('bxq测试省'))

  addrItemNo = String(await evaluate(`(() => {
    let el = document.querySelector('.bx-address')
    while (el && !(el.id && el.id.startsWith('q-'))) el = el.parentElement
    return el ? el.id.slice(2) : ''
  })()`))
  console.log(`  地址题 item_no（提交前取）：${addrItemNo}`)
  check('能从 DOM 反推出地址题 item_no', !!addrItemNo)
}


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
  console.log(`  提交体：${submitReq.body.slice(0, 700)}`)
  if (imageItemNo) {
    check('提交体包含图片题', submitReq.body.includes(imageItemNo))
    const seg = submitReq.body.split(imageItemNo)[1] || ''
    check('图片题作答值非空（批次号已写入）', /"option_data":\["[^"]+/.test(seg.slice(0, 120)))
  }
  // 引用题的容器 id 同样从 DOM 反推
  if (refItemNo) {
    check('提交体包含引用题', submitReq.body.includes(refItemNo))
    const seg = submitReq.body.split(refItemNo)[1] || ''
    check('引用题作答值非空', /"option_data":\["[^"]+/.test(seg.slice(0, 120)))
  }
}
const finalHash = String(await evaluate('location.hash.slice(0, 160)'))
console.log(`  提交后 hash：${finalHash}`)
check('提交后跳到结果页或详情页', finalHash.includes('result') || finalHash.includes('detail'))

// ── 结果页的图片回显 ──────────────────────────────────────────
// 图片题的作答值是**文件批次号**。回顾页若直接展示它，用户上传的是照片、
// 看到的却是一串内部 ID（实测确认过）。所以要断言：渲染出 <image>，且**不出现批次号**。
console.log('\n=== 结果页图片回显 ===')
await sleep(4000)
const resultImg = await evaluate(`(() => {
  const imgs = [...document.querySelectorAll('uni-image.r-item__image')]
  return {
    count: imgs.length,
    first: imgs.length ? (imgs[0].querySelector('img') || {}).getAttribute?.('src') || '' : '',
    pageText: (document.body.innerText || '')
  }
})()`)
console.log(`  结果页缩略图数：${resultImg?.count}  首个 src：${String(resultImg?.first || '').slice(0, 90)}`)
check('结果页渲染出图片缩略图', (resultImg?.count || 0) > 0)
check('缩略图走服务端下载地址', String(resultImg?.first || '').includes('/file/download'))
// 图片题那一行的「我的作答」不能是批次号
const imgRowText = String(await evaluate(`(() => {
  const row = [...document.querySelectorAll('uni-view.r-item')].find(el => (el.innerText||'').includes('图片题'))
  return row ? row.innerText : ''
})()`))
console.log(`  图片题行文本：${JSON.stringify(imgRowText.slice(0, 120))}`)
check('图片题行不展示文件批次号', !!imgRowText && !/\d{20,}/.test(imgRowText))
// 图片渲染出来时不该再显示文案；读不到时才用「已上传图片」兜底 —— 两者有其一即可
check(
  '图片题行有可见的作答表达（缩略图或「已上传图片」）',
  (resultImg?.count || 0) > 0 || imgRowText.includes('已上传图片'),
)

// 引用题的作答值同样是被引用记录的编号（活动编号），必须换成展示列
const refRowText = String(await evaluate(`(() => {
  const row = [...document.querySelectorAll('uni-view.r-item')].find(el => (el.innerText||'').includes('引用题'))
  return row ? row.innerText : ''
})()`))
console.log(`  引用题行文本：${JSON.stringify(refRowText.slice(0, 140))}`)
check('引用题行有内容', !!refRowText)
check('引用题行不展示被引用记录编号', !/\d{20,}/.test(refRowText))
// 与**实际选中的那一项**比对，而不是写死某个活动名
const pickedRefLabel = firstRef.replace('✓', '').trim()
check(
  '引用题行展示的是被引用记录的标题',
  !!pickedRefLabel && refRowText.includes(pickedRefLabel),
  `期望含「${pickedRefLabel}」`,
)

// 地址题的作答值是地区编号（bxq99），必须换成名称
const addrRowText = String(await evaluate(`(() => {
  const row = [...document.querySelectorAll('uni-view.r-item')].find(el => (el.innerText||'').includes('地址题'))
  return row ? row.innerText : ''
})()`))
console.log(`  地址题行文本：${JSON.stringify(addrRowText.slice(0, 140))}`)
if (addrItemNo) {
  check('地址题行不展示地区编号', !!addrRowText && !addrRowText.includes('bxq99'))
  check('地址题行展示地区名称', addrRowText.includes('bxq测试省'))
}

const failed = checks.filter(c => !c.pass).length
console.log(`\n== ${checks.length} 项检查，失败 ${failed} 项 ==`)
ws.close()
chrome.kill()
process.exit(failed === 0 ? 0 : 1)
