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
// 测试活动里一条已完成记录的批次号（详情模式用）
const FILL_BATCH_NO = '4d5b54fb88144b53bd136776f6a383d3'
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
/**
 * 往输入框写值并触发 Vue 的 input 事件
 *
 * 不能用 Input.insertText / 坐标点击：headless 下 dispatchMouseEvent 之后
 * document.activeElement 仍停在 BODY，值写不进去。必须直接调原型上的 value
 * setter 再派发 input 事件 —— 只设 DOM value 不派发事件，Vue 状态不会更新。
 *
 * nth 用于同一选择器命中多个元素时取第 n 个（uni-app 把 <input> 包在
 * <uni-input> 里，placeholder 属性不在内层 input 上，只能按索引定位）。
 */
async function typeInto(selector, text, label, nth = 0) {
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}]
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
      return { answered, batch, inputs, hash: location.hash, text: t.replace(/\\n+/g, ' / ').slice(0, 400) }
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
        writeRequests.push({
          url,
          at: Date.now(),
          requestId: m.params.requestId,
          // 写操作体是 JSON 数组 [{serviceName, data:[...]}]，可能就在 postData 里
          postData: m.params.request.postData ?? null,
        })
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

  // 答题记录入口：老工程标题栏常驻该按钮，新工程曾只能在记录页里手改 URL 进入。
  // 只断言存在、不点击 —— 点它会离开答题页，打断后面的作答流程。
  const navExtra = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector('.bx-navbar__side--right')
      return el ? (el.innerText || '').trim() : ''
    })()`,
    returnByValue: true,
  })
  console.log(`  导航栏右侧插槽：${JSON.stringify(navExtra.result.value)}`)
  checks.push({ name: '答题页有「记录」入口', pass: String(navExtra.result.value).includes('记录') })

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
  for (const r of newReqs) {
    console.log(`    ${r.url.split('/').slice(-3).join('/')}`)
    if (r.postData) console.log(`      请求体：${r.postData.slice(0, 500)}`)
  }

  checks.push({
    name: '点击暂存草稿后真的发出保存请求',
    pass: newReqs.some(r => r.url.includes('activity_result_save')),
  })
  checks.push({
    name: '暂存后进度未丢失',
    pass: afterDraft.answered === draftBefore.answered,
  })

  // 草稿体结构断言（默认跑也会执行，无需 --submit）：
  // 多选题必须带出两个 option_no。服务端最终只存第一个值（平台限制，见文档），
  // 所以不能靠服务端数据反推，只能直接校验请求体。
  // 同一逻辑请求会发两次，只有一个带 postData，要挑有请求体的那个。
  const draftBody = newReqs.find(r => r.url.includes('activity_result_save') && r.postData)?.postData ?? ''
  let draftParsed = null
  try { draftParsed = JSON.parse(draftBody) }
  catch { /* 解析失败按缺失处理 */ }
  const draftItems = draftParsed?.[0]?.data?.[0]?.item_data ?? []
  const draftCheckbox = draftItems.find(i => i.item_no === ITEMS.checkbox.replace(/^q-/, ''))
  checks.push({
    name: '草稿体包含多选题',
    pass: !!draftCheckbox,
  })
  checks.push({
    name: '草稿体多选题带 2 个 option_no（多选多值未被截断）',
    pass: Array.isArray(draftCheckbox?.option_data) && draftCheckbox.option_data.length === 2,
  })
  checks.push({
    name: '草稿体四题齐全',
    pass: draftItems.length === 4,
  })

  // ── 场景一续：刷新后本地草稿应恢复 ──────────────────────────────
  // 用户填到一半刷新页面是常见操作，答案必须还在。走的是 restoreLocalDraft
  // → fromLocalDraft 那条路（服务端无登录态时拿不到 user_data，只能靠本地草稿）。
  //
  // 注意要轮询到「稳定」而不是读一次：reload 后页面仍在初始化，
  // 早期读到的是中间态（曾出现同一次 reload 前后两次读结果不同，
  // 一次 4 一次 0，看起来像草稿被清空，实为时序）。
  console.log('\n  刷新页面验证草稿恢复：')
  await send('Page.reload')
  let stable = { answered: '', inputs: [] }
  for (let i = 0; i < 24; i++) {
    await sleep(700)
    const s = await readState()
    // 连续两次读到相同的非零进度才算稳定
    if (s.answered === stable.answered && s.answered !== '0') break
    stable = s
  }
  const afterReload = await readState()
  console.log(`  刷新后：已答 ${afterReload.answered}`)
  console.log(`  输入框值：${JSON.stringify(afterReload.inputs)}`)
  checks.push({ name: '刷新后答案从本地草稿恢复（已答 4）', pass: afterReload.answered === '4' })
  checks.push({
    name: '刷新后填空题内容仍在',
    pass: afterReload.inputs.includes('端到端测试建议'),
  })
  checks.push({
    name: '刷新后数字题内容仍在',
    pass: afterReload.inputs.includes('2026'),
  })

  if (DO_SUBMIT) {
    console.log('\n提交问卷：')
    const submitBefore = writeRequests.length
    // 点击前再读一次：若此刻进度已经不是 4，说明草稿恢复后在某个时点被清掉了
    const beforeClick = await readState()
    console.log(`  点击前进度：已答 ${beforeClick.answered}，输入框 ${JSON.stringify(beforeClick.inputs)}`)
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
    for (const r of submitReqs) {
      console.log(`    ${r.url.split('/').slice(-3).join('/')}`)
      if (r.postData) console.log(`      请求体：${r.postData.slice(0, 600)}`)
    }
    checks.push({ name: '提交后离开作答页', pass: !afterSubmit.text.includes('提交问卷') })
    checks.push({
      name: '提交真的发出 submit 请求',
      pass: submitReqs.some(r => r.url.includes('activity_result_submit')),
    })

    // 提交体结构断言：多选题必须带出**两个** option_data。
    // 服务端最终只存第一个值（平台限制，见文档），所以不能靠服务端数据反推，
    // 只能直接校验请求体 —— 否则序列化被改坏也不会有任何测试报警。
    // 同一逻辑请求会发两次（uni.request 内部重试/预检），其中只有一个带 postData，
    // 所以要挑「有请求体」的那个，不能直接取第一个。
    const submitBody = submitReqs.find(r => r.url.includes('activity_result_submit') && r.postData)?.postData ?? ''
    let parsed = null
    try { parsed = JSON.parse(submitBody) }
    catch { /* 解析失败下面按缺失处理 */ }
    if (!parsed) {
      console.log(`  [诊断] submit postData 长度=${submitBody.length}，前 120 字：${submitBody.slice(0, 120)}`)
    }
    const items = parsed?.[0]?.data?.[0]?.item_data ?? []
    // 请求体里的 item_no 是题目列名（纯数字 ID），不带页面上的 q- 前缀
    const checkboxNo = ITEMS.checkbox.replace(/^q-/, '')
    const checkboxItem = items.find(i => i.item_no === checkboxNo)
    if (!checkboxItem) {
      console.log(`  [诊断] 请求体 item_no 列表：${JSON.stringify(items.map(i => i.item_no))}`)
      console.log(`  [诊断] 期望找到：${checkboxNo}`)
    }
    checks.push({
      name: '提交体包含多选题',
      pass: !!checkboxItem,
    })
    checks.push({
      name: '提交体多选题带 2 个 option_data（多选多值未被截断）',
      pass: Array.isArray(checkboxItem?.option_data) && checkboxItem.option_data.length === 2,
    })
    checks.push({
      name: '提交体多选题 option_flag 与 option_data 数量一致',
      pass: Array.isArray(checkboxItem?.option_flag)
        && checkboxItem.option_flag.length === checkboxItem.option_data.length,
    })
    checks.push({
      name: '提交体携带 fill_batch_no（复用草稿批次而非新建）',
      pass: !!parsed?.[0]?.data?.[0]?.fill_batch_no,
    })
  }
  else {
    console.log('\n（未加 --submit，跳过提交，避免产生真实记录）')
  }

  // ── 场景五：草稿批次不匹配时不得恢复 ────────────────────────────
  // fromLocalDraft 的第二条过滤规则。若失效，点击历史记录里另一条未完成记录
  // 会把本机草稿套到那条记录上，提交后数据错乱 —— 是数据正确性问题，不是观感问题。
  //
  // 必须放在提交流程**之后**：本场景会导航到另一个批次，草稿因此不再恢复，
  // 若插在提交之前，后面的提交就会读到空的 answers（曾据此误判为「草稿被清空」）。
  console.log('\n\n=== 场景五：草稿批次不匹配时不得恢复 ===')
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await send('Page.navigate', {
    url: `${BASE}/#/pages/questionnaire/index/index?activity_no=${ACTIVITY_NO}&formType=form&status=进行中&fill_batch_no=ffffffffffffffffffffffffffffffff`,
  })
  await sleep(9000)
  const otherBatch = await readState()
  console.log(`  换批次后：已答 ${otherBatch.answered}`)
  console.log(`  输入框值：${JSON.stringify(otherBatch.inputs)}`)
  checks.push({
    name: '批次不同时不恢复本地草稿（已答 0）',
    pass: otherBatch.answered === '0',
  })
  checks.push({
    name: '批次不同时填空题内容未被套用',
    pass: !otherBatch.inputs.includes('端到端测试建议'),
  })

  // ── 场景六：作答记录页点进两条路径 ──────────────────────────────
  // RecordList 用 state === '未完成' 决定点进去是续答（formType=form）
  // 还是查看（formType=detail）。这是老工程的核心回流路径：用户填一半退出，
  // 从记录页点回来继续填。此前从未端到端验证过。
  //
  // 两个坑：
  //  - '未完成' 里含 '完成' 子串，按文本 includes 找会找错记录；
  //  - 记录可能在视口之外，坐标点击会落空，必须先 scrollIntoView。
  console.log('\n\n=== 场景六：作答记录页的两条跳转路径 ===')
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await send('Page.navigate', {
    url: `${BASE}/#/pages/questionnaire/history/history?activity_no=${ACTIVITY_NO}`,
  })
  await sleep(10000)

  // 用「恰好 1 个 state 行」筛出真正的记录卡片（外层容器会把 20 条的 state 全包进来）
  const findCardIndex = async (state) => {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const cards = [...document.querySelectorAll('uni-view')].filter(e => {
          const lines = (e.innerText || '').split('\\n').map(s => s.trim())
          return lines.filter(l => l === '完成' || l === '未完成').length === 1
        })
        return cards.findIndex(e => (e.innerText || '').split('\\n').map(s => s.trim()).includes(${JSON.stringify(state)}))
      })()`,
      returnByValue: true,
    })
    return r.result.value
  }

  const clickCard = async (idx) => {
    const box = await send('Runtime.evaluate', {
      expression: `(() => {
        const cards = [...document.querySelectorAll('uni-view')].filter(e => {
          const lines = (e.innerText || '').split('\\n').map(s => s.trim())
          return lines.filter(l => l === '完成' || l === '未完成').length === 1
        })
        const el = cards[${idx}]
        if (!el) return null
        el.scrollIntoView({ block: 'center' })
        const b = el.getBoundingClientRect()
        return { x: b.left + b.width / 2, y: b.top + 30 }
      })()`,
      returnByValue: true,
    })
    if (!box.result.value) return null
    const pt = box.result.value
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
    }
    await sleep(9000)
    const after = await send('Runtime.evaluate', {
      expression: `(() => ({
        hash: location.hash,
        text: ((document.querySelector('uni-app') || document.body).innerText || '').slice(0, 400),
      }))()`,
      returnByValue: true,
    })
    return after.result.value
  }

  const recordCount = await send('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('uni-view')].filter(e => (e.innerText || '').split('\\n').map(s => s.trim()).filter(l => l === '完成' || l === '未完成').length === 1).length`,
    returnByValue: true,
  })
  console.log(`  记录卡片数：${recordCount.result.value}`)
  checks.push({ name: '作答记录页渲染出记录卡片', pass: recordCount.result.value > 0 })

  /**
   * 找指定状态的记录卡片，找不到就先滚动加载更多
   *
   * 记录按创建时间倒序，而**每次跑 e2e 的「暂存草稿」都会新增一条「未完成」记录** ——
   * 「完成」记录会被逐渐挤到后面的分页里。原来这里找不到就静默跳过，
   * 表现为「e2e 全绿，但实际少验证了两件事」，越跑验证得越少。
   *
   * 所以：先滚动触发加载更多；实在找不到就把「前提不成立」本身记成一条**失败**检查，
   * 而不是悄悄略过。跳过必须是响亮的。
   */
  const findCardIndexWithLoadMore = async (state, maxScrolls = 6) => {
    for (let i = 0; i <= maxScrolls; i++) {
      const idx = await findCardIndex(state)
      if (idx >= 0) {
        return { idx, scrolls: i }
      }
      if (i === maxScrolls) {
        break
      }
      await send('Runtime.evaluate', {
        expression: '(() => { window.scrollTo(0, document.body.scrollHeight); return document.body.scrollHeight })()',
        returnByValue: true,
      })
      await sleep(2500)
    }
    return { idx: -1, scrolls: maxScrolls }
  }

  const undoneFound = await findCardIndexWithLoadMore('未完成')
  console.log(`  「未完成」卡片下标：${undoneFound.idx}（滚动 ${undoneFound.scrolls} 次后）`)
  checks.push({
    name: '记录页能找到「未完成」记录（续答检查的前提）',
    pass: undoneFound.idx >= 0,
  })
  const undoneNav = undoneFound.idx >= 0 ? await clickCard(undoneFound.idx) : null
  if (undoneNav) {
    console.log(`    跳转：${undoneNav.hash.slice(0, 110)}`)
    checks.push({ name: '点「未完成」记录走续答（formType=form）', pass: undoneNav.hash.includes('formType=form') })
    checks.push({ name: '续答带上 fill_batch_no', pass: undoneNav.hash.includes('fill_batch_no') })
    checks.push({ name: '续答页可编辑（有提交按钮）', pass: undoneNav.text.includes('提交问卷') })
  }

  // 回到记录页，点「完成」记录
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await send('Page.navigate', {
    url: `${BASE}/#/pages/questionnaire/history/history?activity_no=${ACTIVITY_NO}`,
  })
  await sleep(10000)
  const doneFound = await findCardIndexWithLoadMore('完成')
  console.log(`  「完成」卡片下标：${doneFound.idx}（滚动 ${doneFound.scrolls} 次后）`)
  checks.push({
    name: '记录页能找到「完成」记录（查看模式检查的前提）',
    pass: doneFound.idx >= 0,
  })
  if (doneFound.idx >= 0) {
    const doneNav = await clickCard(doneFound.idx)
    if (doneNav) {
      console.log(`    跳转：${doneNav.hash.slice(0, 110)}`)
      checks.push({ name: '点「完成」记录走查看（formType=detail）', pass: doneNav.hash.includes('formType=detail') })
      checks.push({ name: '查看页只读（无提交按钮）', pass: !doneNav.text.includes('提交问卷') })
    }
  }

  // ── 场景二：必填校验 ────────────────────────────────────────────
  // 空卷直接提交必须被拦住。这条路径用户一定会遇到，但此前从未验证过。
  //
  // 必须先清本地存储：草稿是跨会话保留的，场景一答完的 4 题会被恢复出来，
  // 「空卷」就变成了「已答 4」—— 首轮就是这么把校验逻辑冤枉成失效的。
  //
  // 注意 clear 必须在**目标 origin** 上执行：在 about:blank 上调用清的是空白页
  // 自己的存储，对 localhost:5174 无效（首轮踩过）。清完要 reload，
  // 因为 Pinia store 是在应用启动时读存储的。
  console.log('\n\n=== 场景二：空卷提交应被必填校验拦住 ===')
  await send('Page.navigate', {
    url: `${BASE}/#/pages/questionnaire/index/index?activity_no=${ACTIVITY_NO}&formType=form&status=进行中`,
  })
  await sleep(4000)
  const cleared = await send('Runtime.evaluate', {
    expression: `(() => { localStorage.clear(); return Object.keys(localStorage).length })()`,
    returnByValue: true,
  })
  console.log(`  清空本地存储后剩余 key 数：${cleared.result.value}`)
  await send('Page.reload')
  await sleep(9000)

  const reqBeforeEmpty = writeRequests.length
  const emptyState = await readState()
  console.log(`  初始：已答 ${emptyState.answered}（应清空为 0）`)
  checks.push({ name: '空卷初始进度为 0', pass: emptyState.answered === '0' })

  await clickByText('提交问卷', '提交问卷按钮（空卷）')
  await sleep(2500)

  const afterEmptySubmit = await readState()
  const emptyReqs = writeRequests.slice(reqBeforeEmpty)
  console.log(`  提交后文本尾部：${afterEmptySubmit.text.slice(-200)}`)
  console.log(`  新增写请求 ${emptyReqs.length} 个`)

  checks.push({
    name: '空卷提交被拦住（未发出 submit 请求）',
    pass: !emptyReqs.some(r => r.url.includes('activity_result_submit')),
  })
  checks.push({
    name: '空卷提交给出必填提示',
    pass: /必填/.test(afterEmptySubmit.text),
  })
  checks.push({
    name: '空卷提交后仍停留在作答页',
    pass: afterEmptySubmit.text.includes('提交问卷'),
  })
  checks.push({
    name: '空卷提交不弹二次确认框',
    pass: !afterEmptySubmit.text.includes('无法修改'),
  })

  // 只答一题再提交：应仍被拦住（还有 3 题必填未答）
  console.log('\n  只答第一题后再提交：')
  await clickSelector(`#${ITEMS.radio} .bx-option`, '单选题第 1 项')
  await sleep(600)
  const oneAnswered = await readState()
  console.log(`  进度：已答 ${oneAnswered.answered}`)
  checks.push({ name: '只答一题时进度为 1', pass: oneAnswered.answered === '1' })

  const reqBeforePartial = writeRequests.length
  await clickByText('提交问卷', '提交问卷按钮（只答一题）')
  await sleep(2500)
  const afterPartial = await readState()
  const partialReqs = writeRequests.slice(reqBeforePartial)
  console.log(`  提交后文本尾部：${afterPartial.text.slice(-200)}`)
  checks.push({
    name: '只答一题仍被拦住并提示必填',
    pass: /必填/.test(afterPartial.text) && afterPartial.text.includes('提交问卷'),
  })
  checks.push({
    name: '只答一题未发出 submit 请求',
    pass: !partialReqs.some(r => r.url.includes('activity_result_submit')),
  })

  // ── 场景三：无效活动号 ──────────────────────────────────────────
  console.log('\n\n=== 场景三：无效活动号应给出错误态 ===')
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await send('Page.navigate', {
    url: `${BASE}/#/pages/questionnaire/index/index?activity_no=NOT_EXIST_0000&formType=form`,
  })
  await sleep(9000)
  const invalidState = await readState()
  console.log(`  文本：${invalidState.text.slice(0, 220)}`)
  checks.push({
    name: '无效活动号显示错误态而不是白屏',
    pass: invalidState.text.length > 10 && !invalidState.text.includes('共 0 题'),
  })

  // 缺活动号
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await send('Page.navigate', {
    url: `${BASE}/#/pages/questionnaire/index/index?formType=form`,
  })
  await sleep(8000)
  const noActivity = await readState()
  console.log(`  缺活动号文本：${noActivity.text.slice(0, 160)}`)
  checks.push({
    name: '缺活动号给出明确提示',
    pass: /缺少活动编号/.test(noActivity.text),
  })

  // ── 场景四：详情模式（查看历史作答）────────────────────────────
  // 用户从「作答记录」点进已完成记录走的就是这条路：formType=detail。
  // 此时活动往往仍在进行中，只读提示不能说成「该问卷已结束」。
  console.log('\n\n=== 场景四：详情模式（查看历史作答）===')
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await send('Page.navigate', {
    url: `${BASE}/#/pages/questionnaire/index/index?formType=detail&activity_no=${ACTIVITY_NO}&status=完成&fill_batch_no=${FILL_BATCH_NO}`,
  })
  await sleep(9000)

  const detailState = await readState()
  console.log(`  文本：${detailState.text.slice(0, 260)}`)
  checks.push({
    name: '详情模式能渲染出问卷',
    pass: detailState.text.includes('共') && detailState.text.includes('题'),
  })
  checks.push({
    name: '详情模式提示为「查看模式」而非「已结束」',
    pass: detailState.text.includes('以下为查看模式') && !detailState.text.includes('该问卷已结束'),
  })
  checks.push({
    name: '详情模式不显示提交按钮',
    pass: !detailState.text.includes('提交问卷'),
  })

  // 只读：输入框应被禁用
  const readonlyProbe = await send('Runtime.evaluate', {
    expression: `(() => {
      const inputs = [...document.querySelectorAll('input, textarea')]
      if (inputs.length === 0) return { count: 0, allDisabled: true }
      return { count: inputs.length, allDisabled: inputs.every(e => e.disabled || e.readOnly) }
    })()`,
    returnByValue: true,
  })
  console.log(`  输入框 ${readonlyProbe.result.value.count} 个，全部只读：${readonlyProbe.result.value.allDisabled}`)
  checks.push({
    name: '详情模式输入框为只读',
    pass: readonlyProbe.result.value.allDisabled,
  })

  // ── 场景七：调研页（survey/survey）──────────────────────────────
  // 与 index/index 共用 QuestionnaireRunner，唯一差异是 result-path 指向
  // survey/result。这条差异此前只在冒烟里渲染过，没验证过交互与跳转目标。
  console.log('\n\n=== 场景七：调研页作答与结果页跳转 ===')
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await send('Page.navigate', {
    url: `${BASE}/#/pages/questionnaire/survey/survey?activity_no=${ACTIVITY_NO}&formType=form`,
  })
  await sleep(10000)

  // 清本地草稿：调研页与作答页共用同一份草稿，不清的话初始进度取决于此前答过什么。
  // 注意 localStorage 是分 origin 的，必须在目标页面上清，清完 reload 让 store 重读。
  await send('Runtime.evaluate', { expression: 'localStorage.clear()' })
  await send('Page.reload')
  await sleep(9000)

  // 轮询等页面真正渲染出来：survey 页首次编译可能超过 10 秒，
  // 固定 sleep 会把「还没编译完」误判成「初始进度不对」（第 74 轮踩过同款）
  let surveyState = await readState()
  for (let i = 0; i < 20 && surveyState.answered === '?'; i++) {
    await sleep(700)
    surveyState = await readState()
  }
  console.log(`  文本：${surveyState.text.slice(0, 200)}`)
  console.log(`  初始进度：已答 ${surveyState.answered}`)
  checks.push({
    name: '调研页渲染出题目',
    pass: surveyState.text.includes('共') && surveyState.text.includes('题'),
  })
  checks.push({ name: '调研页初始进度为 0（草稿已清）', pass: surveyState.answered === '0' })

  // 作答一题，确认与作答页共用同一套交互
  await clickSelector(`#${ITEMS.radio} .bx-option:nth-of-type(1)`, '调研页单选题第 1 项')
  const surveyAfter = await readState()
  console.log(`  作答一题后：已答 ${surveyAfter.answered}`)
  checks.push({ name: '调研页可作答（进度 +1）', pass: surveyAfter.answered === '1' })

  // 暂存草稿，确认写请求走的是同一套
  const surveyDraftBefore = writeRequests.length
  await clickByText('暂存草稿', '调研页暂存草稿')
  await sleep(3500)
  const surveyDrafts = writeRequests.slice(surveyDraftBefore)
  checks.push({
    name: '调研页暂存草稿发出保存请求',
    pass: surveyDrafts.some(r => r.url.includes('activity_result_save')),
  })

  // 提交后必须落到 survey/result，而不是 index/result
  if (DO_SUBMIT) {
    // 补齐剩余必填题
    await clickSelector(`#${ITEMS.checkbox} .bx-option:nth-of-type(1)`, '调研页多选题第 1 项')
    await typeInto(`#${ITEMS.text} input`, '调研端到端建议', '调研页填空题')
    await typeInto(`#${ITEMS.number} input`, '2026', '调研页数字题')
    await sleep(800)
    const surveyFilled = await readState()
    console.log(`  补齐后：已答 ${surveyFilled.answered}`)
    checks.push({ name: '调研页四题可全部作答', pass: surveyFilled.answered === '4' })

    const surveySubmitBefore = writeRequests.length
    await clickByText('提交问卷', '调研页提交按钮')
    await sleep(1200)
    const surveyModal = await send('Runtime.evaluate', {
      expression: `(() => {
        const t = document.body.innerText || ''
        return { shown: t.includes('确认提交') || t.includes('无法修改') }
      })()`,
      returnByValue: true,
    })
    if (surveyModal.result.value.shown) {
      await clickByText('确定', '调研页确认提交')
      await sleep(7000)
    }
    const surveyAfterSubmit = await readState()
    console.log(`  提交后：${surveyAfterSubmit.text.slice(0, 200)}`)
    checks.push({
      name: '调研页提交发出 submit 请求',
      pass: writeRequests.slice(surveySubmitBefore).some(r => r.url.includes('activity_result_submit')),
    })
    // 关键差异点：结果页必须是 survey/result
    checks.push({
      name: '调研页提交后跳到 survey/result（而非 index/result）',
      pass: surveyAfterSubmit.hash.includes('survey/result'),
    })
  }

  // ── 场景八：登记信息页（submitInfo）────────────────────────────
  // 老工程把登记表单序列化进 ?submitInfo= 传给答题页，但答题页从未消费该参数，
  // 登记信息实际从未生效。新工程改为写入本地存储，由答题页按题目名称预填。
  // 这里验证三条：必填校验、手机号格式校验、通过后写存储并跳转。
  console.log('\n\n=== 场景八：登记信息页校验与跳转 ===')
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await send('Page.navigate', {
    url: `${BASE}/#/pages/questionnaire/index/submitInfo?activity_no=${ACTIVITY_NO}`,
  })
  await sleep(9000)

  // 先清掉可能残留的登记信息，避免上一轮的值影响断言
  await send('Runtime.evaluate', { expression: 'localStorage.clear()' })
  await send('Page.reload')
  await sleep(9000)

  /** 读 toast 文案（uni.showToast 在 H5 渲染为 .uni-toast） */
  const readToast = async () => {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('.uni-toast, .uni-sample-toast')
        return el ? (el.innerText || '').trim() : ''
      })()`,
      returnByValue: true,
    })
    return r.result.value
  }

  const siState = await readState()
  console.log(`  页面文本：${siState.text.slice(0, 160)}`)
  checks.push({
    name: '登记信息页渲染出表单',
    pass: siState.text.includes('所属单位') && siState.text.includes('下一步'),
  })

  // ① 空单位：应被必填校验拦住
  await clickByText('下一步，开始作答', '登记页下一步（空单位）')
  await sleep(900)
  const toastEmpty = await readToast()
  const afterEmpty = await readState()
  console.log(`  空单位 toast：${JSON.stringify(toastEmpty)}，hash 是否仍在登记页：${afterEmpty.hash.includes('submitInfo')}`)
  checks.push({ name: '登记页空单位被拦住并提示', pass: toastEmpty.includes('所属单位') })
  checks.push({ name: '登记页空单位不跳转', pass: afterEmpty.hash.includes('submitInfo') })

  // ② 填单位 + 错误手机号：应被格式校验拦住
  // uni-app 的 <input placeholder> 在 H5 渲染成 uni-input 包裹结构，
  // placeholder 属性不在内层 input 上，所以只能按索引定位（3 个字段顺序固定）
  await typeInto('uni-input input', '测试单位', '登记页所属单位', 0)
  await typeInto('uni-input input', '12345', '登记页错误手机号', 2)
  await sleep(600)
  await clickByText('下一步，开始作答', '登记页下一步（错误手机号）')
  await sleep(900)
  const toastPhone = await readToast()
  const afterPhone = await readState()
  console.log(`  错误手机号 toast：${JSON.stringify(toastPhone)}`)
  checks.push({ name: '登记页错误手机号被拦住并提示', pass: toastPhone.includes('手机号码') })
  checks.push({ name: '登记页错误手机号不跳转', pass: afterPhone.hash.includes('submitInfo') })

  // ③ 正确手机号：应写入存储并跳转到答题页
  await typeInto('uni-input input', '测试姓名', '登记页姓名', 1)
  await typeInto('uni-input input', '13800138000', '登记页正确手机号', 2)
  await sleep(600)
  await clickByText('下一步，开始作答', '登记页下一步（正确）')
  await sleep(8000)
  const afterOk = await readState()
  console.log(`  填写正确后 hash：${afterOk.hash.slice(0, 110)}`)
  // H5 会把 navigateTo 的目标路径重写成 #/?query 形式，地址栏里没有 index/index，
  // 所以要按「已经离开登记页 + 带着 formType=form 与 activity_no」来判断
  checks.push({
    name: '登记页填写正确后跳转到答题页',
    pass: !afterOk.hash.includes('submitInfo')
      && afterOk.hash.includes('formType=form')
      && afterOk.hash.includes(ACTIVITY_NO),
  })

  const entry = await send('Runtime.evaluate', {
    expression: `(() => {
      try { return JSON.stringify(uni.getStorageSync('bxq:entry_params') || null) }
      catch (e) { return 'ERR:' + e.message }
    })()`,
    returnByValue: true,
  })
  console.log(`  写入的登记信息：${entry.result.value}`)
  checks.push({ name: '登记信息写入本地存储', pass: String(entry.result.value).includes('测试单位') })
  checks.push({ name: '登记信息含姓名与手机号', pass: String(entry.result.value).includes('13800138000') })

  // ── 场景九：我的测评（couple）──────────────────────────────────
  // couple 依赖 session.userInfo.user_no 过滤「完成」记录，同一问卷多次作答取最近一次。
  // 浏览器端默认没有登录态，只会走「未获取到登录信息」的降级路径 —— 那条路径
  // 前面已经验证过。这里注入真实 user_no 来验证真正的列表逻辑。
  //
  // 服务端实测：user_no 过滤确实生效（用 fc2cfd47... 查到 1 行）；
  // 且登录态的 user_no 就是账号名本身（实测存在 user_no="jq" 的完成记录），
  // 匿名作答时才是随机 hex。所以注入 user_no='jq' 等价于真实登录用户。
  console.log('\n\n=== 场景九：我的测评（注入登录态）===')
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(400)
  await send('Page.navigate', { url: `${BASE}/#/pages/questionnaire/couple/couple` })
  await sleep(8000)

  // 注入登录用户信息：store 在启动时读 storage，所以要写完再 reload
  const injected = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        uni.setStorageSync('login_user_info', { user_no: 'jq', user_name: 'jq', user_type: '1' })
        return String(uni.getStorageSync('login_user_info').user_no || '')
      }
      catch (e) { return 'ERR:' + e.message }
    })()`,
    returnByValue: true,
  })
  console.log(`  注入 user_no：${JSON.stringify(injected.result.value)}`)
  checks.push({ name: '登录态注入成功', pass: injected.result.value === 'jq' })

  // 捕获所有 select 请求体：couple 显示「暂无记录」而不是「加载失败」，
  // 说明请求成功但返回 0 行，必须看实际发出去的 condition 才能定位
  const selectReqs = []
  const selectReqIds = []
  const onSelect = (m) => {
    if (m.method !== 'Network.requestWillBeSent') return
    const u = m.params.request.url || ''
    if (!u.includes('/select/')) return
    const h = m.params.request.headers || {}
    const authKeys = Object.keys(h).filter(k => /auth|ticket|cookie/i.test(k))
    selectReqs.push({
      url: u.split('/select/')[1]?.split('?')[0],
      post: m.params.request.postData ?? null,
      authHeaders: authKeys.map(k => `${k}=${String(h[k]).slice(0, 24)}…`),
    })
    selectReqIds.push(m.params.requestId)
  }
  ws.addEventListener('message', (ev) => {
    try { onSelect(JSON.parse(ev.data)) } catch { /* 忽略 */ }
  })
  await send('Network.enable')

  // 决定性验证：脚本探测同一条件能查到 11 行，浏览器却 0 行。
  // 唯一差异是浏览器请求带 Cookie（withCredentials: true）—— 服务端可能按会话身份
  // 二次过滤。先清掉 Cookie 再试，若数据出现即证明是会话过滤（平台行为，非产品缺陷）。
  await send('Network.clearBrowserCookies')
  console.log('  已清浏览器 Cookie')

  await send('Page.reload')
  // 请求要跑网络，轮询等列表出现
  let coupleState = await readState()
  for (let i = 0; i < 20 && !coupleState.text.includes('批次'); i++) {
    await sleep(800)
    coupleState = await readState()
  }
  console.log(`  页面文本：${coupleState.text.slice(0, 220)}`)
  console.log(`  发出的 select 请求 ${selectReqs.length} 个：`)
  for (const r of selectReqs) {
    console.log(`    ${r.url}`)
    console.log(`      体：${r.post}`)
    console.log(`      认证相关头：${JSON.stringify(r.authHeaders)}`)
  }

  // 请求体正确却 0 行：用 CDP 直接读服务端响应体，看它到底返回了什么
  //
  // 注意：页面导航后 CDP 会丢弃旧请求的记录，此时 getResponseBody 报
  // 「No resource with given identifier found」。那是**正常的资源回收**，
  // 不是读取失败 —— 措辞必须区分开，否则每次跑都会打印一行看似报错的东西，
  // 让人以为有问题（这类噪音会训练出「忽略输出」的坏习惯）。
  for (const rid of selectReqIds) {
    try {
      const body = await send('Network.getResponseBody', { requestId: rid })
      console.log(`  响应体[${rid.slice(-6)}]：${String(body.body).slice(0, 400)}`)
    } catch (e) {
      const released = /No resource with given identifier found/.test(e.message)
      console.log(
        released
          ? `  响应体[${rid.slice(-6)}]：已随页面导航回收（正常，不影响断言）`
          : `  响应体[${rid.slice(-6)}]：读取失败 ${e.message}`,
      )
    }
  }
  checks.push({
    name: '我的测评渲染出记录卡片',
    pass: coupleState.text.includes('批次') && coupleState.text.includes('查看结果'),
  })
  checks.push({ name: '我的测评显示查看作答入口', pass: coupleState.text.includes('查看作答') })
  checks.push({
    name: '我的测评不再显示未获取登录信息',
    pass: !coupleState.text.includes('未获取到登录信息'),
  })

  // 同一问卷多次作答只保留最近一次。
  //
  // 注意不能断言「卡片总数 === 1」：jq 在服务端有 11 条完成记录，涉及 8 个不同
  // 活动，所以卡片本来就该有 8 张（首轮就是按 1 张写的，误判成失败）。
  // 正确的断言是「本测试活动在列表里只出现一次」—— 它实际有 2 条完成记录
  // （批次 9118ea27… 与 aba2358c…），聚合后只应保留较新的那条。
  const aggProbe = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = [...document.querySelectorAll('.cp-card')]
      const titles = cards.map(e => (e.innerText || '').split('\\n')[0].trim())
      const target = titles.filter(t => t.includes('bxq 自动化测试问卷')).length
      return { total: cards.length, target, titles: [...new Set(titles)] }
    })()`,
    returnByValue: true,
  })
  console.log(`  卡片数：${aggProbe.result.value.total}，其中本测试活动出现 ${aggProbe.result.value.target} 次`)
  checks.push({
    name: '同一问卷多次作答聚合为一张卡片',
    pass: aggProbe.result.value.target === 1,
  })
  checks.push({ name: '我的测评列出多个活动的记录', pass: aggProbe.result.value.total > 1 })

  // 点「查看作答」应走详情模式
  await clickByText('查看作答', '我的测评查看作答')
  await sleep(8000)
  const afterCouple = await readState()
  console.log(`  跳转 hash：${afterCouple.hash.slice(0, 120)}`)
  checks.push({
    name: '我的测评点查看作答走详情模式',
    pass: afterCouple.hash.includes('formType=detail') && afterCouple.hash.includes('fill_batch_no'),
  })
  checks.push({ name: '我的测评详情页只读', pass: !afterCouple.text.includes('提交问卷') })

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
