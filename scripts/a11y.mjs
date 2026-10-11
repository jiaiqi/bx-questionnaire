/**
 * 可访问性审计（CDP 真实浏览器）
 *
 * 问卷本质是表单，键盘操作与屏幕阅读器是刚需。这里检查：
 *
 * 1. **可交互元素是否有可读名称**：屏幕阅读器读不出名称的输入框等于不可用。
 * 2. **焦点是否可见**：键盘用户看不到焦点在哪就没法操作。
 * 3. **图片是否有 alt**。
 *
 * 用法：node scripts/a11y.mjs [baseUrl]
 * 前置：pnpm dev h5 已启动。
 *
 * ⚠️ 焦点检查必须用**真实 Tab 按键**（`Input.dispatchKeyEvent`），不能用
 * `el.focus()`：`:focus-visible` 的设计就是**不响应程序化聚焦**（否则鼠标点击
 * 也会出现焦点环）。首版用 `el.focus()` 测，7 个输入框全部误报「焦点不可见」，
 * 差点把已经修好的东西当成没修。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || 'http://localhost:5174'
const ACTIVITY_NO = '20261010100256000001'
const FILL_BATCH_NO = '4d5b54fb88144b53bd136776f6a383d3'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9343

const PAGES = [
  { name: '封面页', route: '/pages/questionnaire/cover/index' },
  { name: '问卷作答页', route: `/pages/questionnaire/index/index?activity_no=${ACTIVITY_NO}&formType=form&status=进行中` },
  { name: '登记信息页', route: `/pages/questionnaire/index/submitInfo?activity_no=${ACTIVITY_NO}` },
  { name: '作答记录页', route: `/pages/questionnaire/history/history?activity_no=${ACTIVITY_NO}` },
  { name: '我的测评页', route: '/pages/questionnaire/couple/couple' },
  { name: '调研页', route: `/pages/questionnaire/survey/survey?activity_no=${ACTIVITY_NO}` },
  { name: '评估结果页', route: `/pages/questionnaire/assessmentResult/assessmentResult?activity_no=${ACTIVITY_NO}&fill_batch_no=${FILL_BATCH_NO}` },
  { name: '问卷列表页', route: '/pages/editor/list/index' },
  { name: '可视化设计器', route: `/pages/editor/design/index?activity_no=${ACTIVITY_NO}` },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * 在页面里跑的可访问性检查（名称与 alt），返回逐项问题
 *
 * 选择器必须覆盖 uni-app 的**自定义元素**：BxButton 用 <view> 渲染，H5 上是
 * <uni-view>，不是 <button>。首版只查 `button`，于是报「可交互 0 个」——
 * 而页面上明明有按钮。漏报比误报更危险，因为它让审计看起来是绿的。
 */
const AUDIT = `(() => {
  const root = document.querySelector('uni-app') || document.body
  const visible = el => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const s = getComputedStyle(el)
    return s.display !== 'none' && s.visibility !== 'hidden'
  }
  const nameOf = el => {
    const aria = el.getAttribute('aria-label')
    if (aria && aria.trim()) return aria.trim()
    const title = el.getAttribute('title')
    if (title && title.trim()) return title.trim()
    const text = (el.innerText || '').trim()
    if (text) return text.slice(0, 40)
    const ph = el.getAttribute('placeholder')
    if (ph && ph.trim()) return 'placeholder:' + ph.trim()
    return ''
  }

  // 覆盖原生控件 + uni-app 自定义元素 + 显式 role/tabindex
  const sel = [
    'button', 'a[href]', 'input', 'select', 'textarea',
    'uni-button', 'uni-input', 'uni-textarea', 'uni-picker',
    '[role]', '[tabindex]',
  ].join(', ')

  /**
   * uni-app H5 把 aria-label 写在**外层壳**（uni-input / uni-textarea）上，
   * 不转发给内层原生控件 —— 实测内层 input 的 aria-label 与 placeholder 都是 null。
   *
   * 于是同一个控件会被选择器命中两次：外层壳（有名称）+ 内层原生控件（没名称），
   * 审计里就出现「可交互 41 个、1 个没名称」这种**自相矛盾**的结果
   * （壳有名字、里面的控件没有）。这里按逻辑控件去重，并单独统计
   * 「名称只挂在壳上」的数量 —— 那是 uni-app 的平台限制，不是页面作者漏写，
   * 必须显式报出来，不能靠「壳上有名字」把它算成全绿。
   */
  const WRAPPER = 'uni-input, uni-textarea'
  const wrapperOf = el => (el.closest ? el.closest(WRAPPER) : null)

  const interactive = []
  let wrapperOnlyNames = 0
  for (const el of root.querySelectorAll(sel)) {
    if (!visible(el)) continue
    const isNative = el.matches('input, textarea, select')
    // 内层原生控件由外层壳那条记录代表，跳过以免同一个控件算两次
    if (isNative && wrapperOf(el)) continue

    const native = isNative ? el : el.querySelector('input, textarea, select')
    const target = native || el
    // 原生控件**自己**有没有名称：没有就说明名称只能从外层壳上取到
    const ownName = nameOf(target)
    const name = ownName || nameOf(el)
    if (!ownName && name) {
      // 作者写了标签，但 uni-app 把它放在了 uni-input / uni-textarea 壳上，
      // 内层原生控件（真正被聚焦的那个）依然没有名称 —— 屏幕阅读器读不到。
      // 这不是页面漏写，所以不算失败；但它必须被计数，否则「全部有名称」
      // 会让人以为辅助技术也能读到。
      wrapperOnlyNames++
    }
    interactive.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 50),
      role: el.getAttribute('role') || '',
      tabIndex: target.tabIndex,
      name,
      disabled: target.disabled === true || el.getAttribute('aria-disabled') === 'true',
    })
  }

  // 可点击但键盘到不了的元素（tabIndex < 0）—— 键盘用户会完全够不到。
  // 排除**分组容器**（radiogroup / group / presentation / none）：它们只是语义
  // 包装，本来就不该可聚焦，要求它们有 tabindex 是检查过严。
  const GROUP_ROLES = ['radiogroup', 'group', 'presentation', 'none', 'list', 'listbox']
  const unreachable = interactive.filter(i => !i.disabled && i.tabIndex < 0 && !GROUP_ROLES.includes(i.role))

  const imgsNoAlt = []
  for (const el of root.querySelectorAll('img')) {
    if (!visible(el)) continue
    if (!el.getAttribute('alt')) imgsNoAlt.push(el.getAttribute('src') || '(无 src)')
  }

  return {
    interactiveCount: interactive.length,
    noName: interactive.filter(i => !i.name && !i.disabled),
    unreachable,
    imgsNoAlt,
    wrapperOnlyNames,
  }
})()`

/** 读当前焦点元素的可见性 */
const FOCUS_READ = `(() => {
  const el = document.activeElement
  if (!el || el === document.body) return { tag: 'body', visible: null }
  const s = getComputedStyle(el)
  const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth || '0') > 0
  const hasShadow = s.boxShadow && s.boxShadow !== 'none'
  return {
    tag: el.tagName.toLowerCase(),
    cls: (el.className || '').toString().slice(0, 40),
    ariaLabel: el.getAttribute('aria-label') || '',
    outline: s.outlineStyle + '/' + s.outlineWidth,
    visible: hasOutline || hasShadow,
  }
})()`

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'bxq-a11y-'))
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    '--window-size=375,812', 'about:blank',
  ], { stdio: 'ignore' })

  let wsUrl = null
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(400)
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      wsUrl = list.find(t => t.type === 'page')?.webSocketDebuggerUrl ?? null
    }
    catch { /* 还没起来 */ }
  }
  if (!wsUrl) { chrome.kill(); throw new Error('Chrome 未就绪') }

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
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })

  let totalNoName = 0
  let totalImgNoAlt = 0
  let totalFocusInvisible = 0
  let totalUnreachable = 0
  let totalWrapperOnly = 0

  for (const page of PAGES) {
    await send('Page.navigate', { url: 'about:blank' })
    await sleep(300)
    await send('Page.navigate', { url: `${BASE}/#${page.route}` })
    for (let i = 0; i < 60; i++) {
      const r = await send('Runtime.evaluate', {
        expression: `((document.querySelector('uni-app') || document.body).innerText || '').length`,
        returnByValue: true,
      })
      if ((r.result?.value ?? 0) > 10) break
      await sleep(150)
    }
    await sleep(300)

    const res = await send('Runtime.evaluate', { expression: AUDIT, returnByValue: true })
    const a = res.result?.value
    if (!a) { console.log(`\n${page.name}：审计脚本无返回`); continue }

    console.log(`\n${page.name}（可交互 ${a.interactiveCount} 个）`)
    totalNoName += a.noName.length
    totalImgNoAlt += a.imgsNoAlt.length

    if (a.noName.length === 0) console.log('  可读名称：全部有 ✓')
    else {
      console.log(`  可读名称缺失 ${a.noName.length} 个：`)
      for (const x of a.noName.slice(0, 8)) console.log(`    <${x.tag} class="${x.cls}"> role=${x.role || '-'}`)
    }

    // 平台限制单独报：名称只在 uni-input / uni-textarea 壳上，uni-app 没有转发到
    // 内层原生控件。这不是页面漏写，但屏幕阅读器确实读不到，所以必须显式可见。
    totalWrapperOnly += a.wrapperOnlyNames || 0
    if (a.wrapperOnlyNames > 0) {
      console.log(`  名称只挂在壳上 ${a.wrapperOnlyNames} 个（uni-app 未转发给原生控件，见 docs/验收清单.md「已知限制」）`)
    }

    if (a.imgsNoAlt.length === 0) console.log('  图片 alt：全部有 ✓')
    else console.log(`  图片缺 alt ${a.imgsNoAlt.length} 个：${a.imgsNoAlt.slice(0, 5).join(', ')}`)

    totalUnreachable += a.unreachable.length
    if (a.unreachable.length === 0) console.log('  键盘可达：✓')
    else {
      console.log(`  键盘到不了 ${a.unreachable.length} 个（tabIndex < 0）：`)
      for (const x of a.unreachable.slice(0, 6)) {
        console.log(`    <${x.tag} class="${x.cls}"> role=${x.role || '-'} 文本「${x.name}」`)
      }
    }

    // 焦点：用真实 Tab 走一遍页面上的可聚焦元素
    await send('Runtime.evaluate', { expression: 'document.body.focus()' })
    const invisible = []
    const seen = []
    for (let i = 0; i < 12; i++) {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' })
      await sleep(120)
      const fr = await send('Runtime.evaluate', { expression: FOCUS_READ, returnByValue: true })
      const f = fr.result?.value
      if (!f || f.tag === 'body' || f.visible === null) continue
      seen.push(f)
      if (!f.visible) invisible.push(f)
    }
    totalFocusInvisible += invisible.length

    if (seen.length === 0) console.log('  焦点可见：无可聚焦元素（跳过）')
    else if (invisible.length === 0) console.log(`  焦点可见：✓（真实 Tab 走过 ${seen.length} 个元素）`)
    else {
      console.log(`  焦点不可见 ${invisible.length}/${seen.length} 个：`)
      for (const x of invisible.slice(0, 5)) console.log(`    <${x.tag} class="${x.cls}"> aria-label=「${x.ariaLabel}」outline=${x.outline}`)
    }
  }

  console.log(`\n== 汇总：无名称 ${totalNoName} 项 / 缺 alt ${totalImgNoAlt} 项 / 键盘到不了 ${totalUnreachable} 项 / 焦点不可见 ${totalFocusInvisible} 项 ==`)
  console.log(`== 平台限制：名称只挂在 uni-input / uni-textarea 壳上 ${totalWrapperOnly} 项（不计为失败，但不等于屏幕阅读器能读到）==`)

  ws.close()
  chrome.kill()
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* Windows */ }

  if (totalNoName > 0 || totalImgNoAlt > 0 || totalUnreachable > 0 || totalFocusInvisible > 0) process.exit(1)
}

main().catch(e => { console.error('失败:', e.message); process.exit(1) })
