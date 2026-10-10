/**
 * 性能探测：在构建产物上测首屏关键指标
 *
 * 两个前提，缺一个数字就没有意义（都踩过）：
 *
 * 1. **必须测 dist 产物**：dev server 不做压缩、不做 tree-shaking、模块按需编译。
 * 2. **必须用 --mode test 构建**：生产构建的网关指向 gxqcxkj.com，测试活动在那边
 *    不存在，页面会显示「活动编号不存在」，测出来的「首屏可见」其实是错误页
 *    （或 storage 里活动快照的缓存命中）。正确做法：
 *
 *        pnpm build h5 --mode test && pnpm serve:dist 4180
 *        pnpm perf http://localhost:4180
 *
 * 指标口径用浏览器原生 Performance API，不自己造指标；另加一项「首屏可见」——
 * 轮询 innerText 出现内容，比 FCP 更贴近「用户到底看到了什么」。
 *
 * 指标口径（用浏览器原生 Performance API，不自己造指标）：
 *  - TTFB：首字节时间
 *  - FCP：首次内容绘制
 *  - DOMContentLoaded / load
 *  - 首屏可见文案出现的时间（轮询探测，比 FCP 更贴近「用户看到了什么」）
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || 'http://localhost:4180'
const ROUTES = [
  { name: '封面页', path: '/pages/questionnaire/cover/index', expect: '' },
  { name: '作答页', path: '/pages/questionnaire/index/index?activity_no=20261010100256000001&formType=form', expect: '题' },
  { name: '记录页', path: '/pages/questionnaire/history/history?activity_no=20261010100256000001', expect: '作答记录' },
  { name: '我的测评', path: '/pages/questionnaire/couple/couple', expect: '我的测评' },
]
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9339

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'bxq-perf-'))
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    '--window-size=375,812', 'about:blank',
  ], { stdio: 'ignore' })

  let wsUrl = null
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(400)
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await r.json()
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
  // 必须用 addEventListener 并在 open 之后再挂；用 ws.onmessage 在 open 前赋值
  // 会收不到任何消息（首轮就是因此所有指标都是 undefined）。
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
    }
  })
  // 解析出 m.result（不是整个 m），与 e2e 保持一致
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: true,
  })

  const results = []
  for (const route of ROUTES) {
    await send('Page.navigate', { url: 'about:blank' })
    await sleep(300)
    await send('Page.navigate', { url: `${BASE}/#${route.path}` })

    // 轮询等首屏文案出现，记录耗时
    const started = Date.now()
    let visibleAt = null
    for (let i = 0; i < 60; i++) {
      const r = await send('Runtime.evaluate', {
        expression: `((document.querySelector('uni-app') || document.body).innerText || '').length`,
        returnByValue: true,
      })
      if ((r.result?.value ?? 0) > 20) { visibleAt = Date.now() - started; break }
      await sleep(100)
    }

    const perf = await send('Runtime.evaluate', {
      expression: `(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {}
        const paints = performance.getEntriesByType('paint') || []
        const fcp = paints.find(p => p.name === 'first-contentful-paint')
        const res = performance.getEntriesByType('resource') || []
        const transfer = res.reduce((s, r) => s + (r.transferSize || 0), 0)
        const decoded = res.reduce((s, r) => s + (r.decodedBodySize || 0), 0)
        return {
          ttfb: Math.round(nav.responseStart || 0),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
          load: Math.round(nav.loadEventEnd || 0),
          fcp: fcp ? Math.round(fcp.startTime) : null,
          requests: res.length,
          transferKB: Math.round(transfer / 1024),
          decodedKB: Math.round(decoded / 1024),
        }
      })()`,
      returnByValue: true,
    })
    results.push({ route: route.name, visibleMs: visibleAt, ...perf.result.value })
  }

  console.log('视口 375×812（移动竖屏），构建产物\n')
  console.log('  页面       首屏可见   FCP    TTFB   DCL    load   请求数  传输KB  解压KB')
  for (const r of results) {
    const pad = (v, n) => String(v ?? '-').padStart(n)
    console.log(`  ${r.route.padEnd(9)} ${pad(r.visibleMs, 6)}ms ${pad(r.fcp, 5)}ms ${pad(r.ttfb, 5)}ms ${pad(r.domContentLoaded, 5)}ms ${pad(r.load, 6)}ms ${pad(r.requests, 6)} ${pad(r.transferKB, 7)} ${pad(r.decodedKB, 7)}`)
  }

  ws.close()
  chrome.kill()
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* Windows */ }
}

main().catch(e => { console.error('失败:', e.message); process.exit(1) })
