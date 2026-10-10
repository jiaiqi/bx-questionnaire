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
