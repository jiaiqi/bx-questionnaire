/**
 * 页面冒烟测试（CDP 真实浏览器）
 *
 * 项目没有 @vue/test-utils，页面与组件层无法用单测覆盖 —— 这是测试保护面里
 * 最大的一块空白。这里用 Chrome 无头 + CDP 遍历全部页面，检查：
 *   1. 页面是否真的渲染出内容（不是白屏）；
 *   2. 控制台有没有报错、有没有未捕获异常；
 *   3. 关键 DOM 是否出现（导航栏、内容容器等）。
 *
 * 用法：node scripts/smoke.mjs [baseUrl]
 * 前置：pnpm dev h5 已启动。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertBaseReachable, resolveBaseUrl } from './lib/base-url.mjs'
import { CHROME } from './lib/chrome.mjs'

const BASE = resolveBaseUrl()

// 目标地址不可达就直接退出：否则脚本会在浏览器错误页上「通过」，是最危险的假绿
await assertBaseReachable(BASE).catch((error) => {
  console.error(`\n❌ ${error.message}\n`)
  process.exit(1)
})

const ACTIVITY_NO = '20261010100256000001'
// 评估建议面板要求 activity_no + fill_batch_no 同时存在才请求（对齐老工程）
const FILL_BATCH_NO = '4d5b54fb88144b53bd136776f6a383d3'

/**
 * 每页：路由 + 关键选择器
 *
 * 注意 markers 只用于「确认页面壳挂上了」，不能要求具体业务 class ——
 * 空态、错误态页面本来就不渲染 .bx-container / .cover，那样会把正常的
 * 空态误判成白屏。判定「渲染成功」主要看文本长度。
 *
 * `hasNavBar` 标记该页是否**带自绘导航栏**（`BxNavBar`）。断言分两层：
 * - 普通浏览器：导航栏必须在（回归「自绘导航栏被误删」）；
 * - 公众号 H5 / 小程序 web-view：导航栏必须不在（微信自己的标题栏已经占位）。
 * 不标这个字段的页面（封面 / 编辑器 / 登录）不参与导航栏断言。
 *
 * `hasProgressRecords` 标记该页在**导航栏隐藏时**是否把「记录」入口挪到吸顶进度区
 * （`.runner__progress-records`）：宿主模式下必须在，普通浏览器下必须不在
 * （普通浏览器由导航栏右侧承载，重复出现就是两个入口）。
 */
const RENDERED = ['uni-app']

const PAGES = [
  {
    name: '封面页',
    route: '/pages/questionnaire/cover/index',
    markers: RENDERED,
  },
  {
    name: '问卷作答页',
    route: `/pages/questionnaire/index/index?activity_no=${ACTIVITY_NO}&formType=form&status=进行中`,
    markers: RENDERED,
    hasNavBar: true,
    // 导航栏隐藏时「记录」入口挪到吸顶进度区右侧，不能跟着丢
    hasProgressRecords: true,
  },
  {
    name: '登记信息页',
    route: `/pages/questionnaire/index/submitInfo?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
    hasNavBar: true,
  },
  {
    name: '结果页',
    route: `/pages/questionnaire/index/result?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
    hasNavBar: true,
  },
  {
    name: '作答记录页',
    route: `/pages/questionnaire/history/history?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
    hasNavBar: true,
  },
  {
    name: '我的测评页',
    route: '/pages/questionnaire/couple/couple',
    markers: RENDERED,
    hasNavBar: true,
  },
  {
    name: '调研页',
    route: `/pages/questionnaire/survey/survey?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
    hasNavBar: true,
    hasProgressRecords: true,
  },
  {
    name: '调研记录页',
    route: `/pages/questionnaire/survey/history?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
    hasNavBar: true,
  },
  {
    name: '调研结果页',
    route: `/pages/questionnaire/survey/result?activity_no=${ACTIVITY_NO}&fill_batch_no=${FILL_BATCH_NO}`,
    markers: RENDERED,
    hasNavBar: true,
  },
  {
    name: '评估结果页',
    route: `/pages/questionnaire/assessmentResult/assessmentResult?activity_no=${ACTIVITY_NO}&fill_batch_no=${FILL_BATCH_NO}`,
    markers: RENDERED,
    hasNavBar: true,
  },
  {
    // 缺批次号时必须给出明确提示，而不是把网关的「系统繁忙」透出来
    name: '评估结果页（缺批次号）',
    route: `/pages/questionnaire/assessmentResult/assessmentResult?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
    hasNavBar: true,
    expectText: '缺少作答批次号',
  },
  {
    name: '问卷列表页',
    route: '/pages/editor/list/index',
    markers: RENDERED,
  },
  {
    name: '可视化设计器（新建）',
    route: '/pages/editor/design/index',
    markers: RENDERED,
  },
  {
    name: '可视化设计器（编辑已有问卷）',
    route: `/pages/editor/design/index?activity_no=${ACTIVITY_NO}`,
    markers: RENDERED,
  },
  {
    // 登录页：会话过期后由 App.vue reLaunch 到这里，白屏就等于用户再也登不回来
    name: '登录页',
    route: '/pages/login/index',
    markers: RENDERED,
  },
  {
    // 参数传递链路：会话过期跳转时要带上 reason 与回跳地址，
    // 读不出来就会显示默认文案（曾出现中文提示以 `%E7%99%BB...` 原文显示）
    name: '登录页（会话过期）',
    route: '/pages/login/index?reason=expired&redirect=%2Fpages%2Feditor%2Flist%2Findex',
    markers: RENDERED,
  },
]

const userDataDir = mkdtempSync(join(tmpdir(), 'bxq-smoke-'))
const PORT = 9333

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { stdio: 'ignore' })

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`)
  return res.json()
}

/** 极简 CDP 客户端：只用到我们需要的几个命令 */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.events = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
      else if (msg.method) {
        this.events.push(msg)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP 超时: ${method}`))
        }
      }, 30000)
    })
  }

  takeEvents() {
    const taken = this.events
    this.events = []
    return taken
  }
}

/**
 * 视口：用户明确要求同时适配 PC 与移动端，小程序还要竖屏/横屏两套布局。
 * 横向溢出是最典型的适配缺陷 —— 窄屏下卡片、表格、长文本很容易撑破视口，
 * 表现为整页可以左右拖，移动端尤其明显。
 *
 * 「公众号 H5」单列一档：它是**微信内置浏览器**（iOS 上 WKWebView、安卓上 XWeb），
 * 内核与 Chrome 近似但不相同，且微信会给 UA 加 `MicroMessenger` 标记。真机无法
 * 本地覆盖，但可以用 `Emulation.setUserAgentOverride` 把 UA 换成微信的，验证页面
 * 在有微信标记时仍然正常渲染 —— 至少能排除「代码里按 UA 分支却写错了」这类问题。
 * 微信内置浏览器自带标题栏，所以这一档也是 `hostChrome: true`。
 *
 * 「小程序 web-view」同样能本地模拟：微信 7.0 起 web-view 的 UA 会带
 * `miniProgram` 字样，替换 UA 即可验证「宿主已有导航栏时自绘导航栏不渲染」。
 * `hostChrome: true` 表示该视口由宿主提供标题栏，带 `hasNavBar` 的页面
 * 应当**没有** `.bx-navbar`。
 *
 * `expectWx` 显式声明该视口**期望**是否带微信标记。不要从 name 里推断 ——
 * 首版写成 `name.includes('微信')`，给 PC 错配 UA 做反向验证时提示语成了
 * 「期望不带 MicroMessenger，实际 wx=false」，自相矛盾且看不出问题在哪。
 */
const WX_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003128) NetType/WIFI Language/zh_CN'
const WX_MP_UA = 'Mozilla/5.0 (Linux; Android 13; 2211133C Build/TKQ1.221114.001; wv) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160065 MMWEBSDK/20231202 '
  + 'MicroMessenger/8.0.47.2560(0x28002F35) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64 '
  + 'miniProgram/wx1234567890abcdef'

const VIEWPORTS = [
  { name: 'PC', width: 1440, height: 900, mobile: false, expectWx: false },
  { name: '移动竖屏', width: 375, height: 812, mobile: true, expectWx: false },
  { name: '移动横屏', width: 812, height: 375, mobile: true, expectWx: false },
  {
    name: '公众号H5(微信内置)',
    width: 375,
    height: 812,
    mobile: true,
    ua: WX_UA,
    expectWx: true,
    hostChrome: true,
  },
  {
    name: '小程序web-view(微信)',
    width: 375,
    height: 812,
    mobile: true,
    ua: WX_MP_UA,
    expectWx: true,
    hostChrome: true,
  },
]

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetchJson('/json/list')
      const page = list.find(t => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    }
    catch {
      // Chrome 还没起来
    }
    await sleep(500)
  }
  throw new Error('连不上 Chrome 调试端口')
}

async function main() {
  const wsUrl = await connect()
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  const cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')

  const results = []

  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.mobile,
    })
    // UA 必须逐视口设置并复位：不设时会沿用上一个视口的 UA，
    // 后面新增的视口会静默继承微信标记（反之亦然），测出来的就不是预期环境。
    await cdp.send('Emulation.setUserAgentOverride', {
      userAgent: vp.ua ?? '',
    })

    for (const page of PAGES) {
      // 先回空白页：uni-app 的 onLoad 只在页面首次创建时执行，同路径不同 query
      // 会复用组件实例，导致上一页的参数残留（曾把「缺批次号」页测成有批次号）。
      await cdp.send('Page.navigate', { url: 'about:blank' })
      await sleep(300)
      cdp.takeEvents()

      // H5 是 hash 路由
      const url = `${BASE}/#${page.route}`
      await cdp.send('Page.navigate', { url })

      // Vite dev 按需编译：首次访问某页可能要等编译完成。
      // 固定 sleep 会让「编译慢」看起来像「页面白屏」，所以轮询到有内容为止。
      let r = { hit: [], textLen: 0, head: '', overflow: 0, hasNavBar: false, hasProgressRecords: false, wx: false }
      for (let attempt = 0; attempt < 20; attempt++) {
        await sleep(700)
        const probe = await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const sels = ${JSON.stringify(page.markers)}
            const hit = sels.filter(s => document.querySelector(s))
            const root = document.querySelector('uni-app') || document.body
            const text = (root.innerText || '').trim()
            // 横向溢出：整页宽度超过视口即为撑破
            const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
            // 自绘导航栏是否渲染（宿主自带标题栏时应当没有）
            const hasNavBar = !!document.querySelector('.bx-navbar')
            // 导航栏隐藏时「记录」入口是否挪到了吸顶进度区
            const hasProgressRecords = !!document.querySelector('.runner__progress-records')
            // 顺带回读 UA，确认 setUserAgentOverride 真的生效（否则微信视口是假的）
            const ua = navigator.userAgent
            return {
              hit, textLen: text.length, head: text.slice(0, 120), overflow, hasNavBar, hasProgressRecords,
              wx: ua.includes('MicroMessenger'),
            }
          })()`,
          returnByValue: true,
        })
        r = probe.result.value
        if (r.textLen > 0) break
      }

      const events = cdp.takeEvents()
      const consoleErrors = []
      const exceptions = []
      for (const e of events) {
        if (e.method === 'Runtime.exceptionThrown') {
          const d = e.params.exceptionDetails
          exceptions.push(d.exception?.description || d.text || '未知异常')
        }
        if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
          consoleErrors.push(e.params.args.map(a => a.value ?? a.description ?? '').join(' '))
        }
        if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
          consoleErrors.push(e.params.entry.text)
        }
      }

      results.push({
        name: page.name,
        viewport: vp.name,
        viewportSize: `${vp.width}×${vp.height}`,
        route: page.route,
        rendered: r.hit.length > 0 && r.textLen > 0,
        hit: r.hit,
        missing: page.markers.filter(s => !r.hit.includes(s)),
        textLen: r.textLen,
        head: r.head,
        overflow: r.overflow,
        exceptions,
        consoleErrors,
        // 可选：断言首屏文本包含某段内容（用于验证空态/错误态文案）
        expectText: page.expectText,
        textOk: page.expectText ? r.head.includes(page.expectText) : true,
        // 微信视口必须真的带上 MicroMessenger，否则测的不是微信环境
        uaOk: r.wx === vp.expectWx,
        uaIsWx: r.wx,
        uaExpectWx: vp.expectWx,
        // 自绘导航栏：带 hasNavBar 的页面在宿主自带标题栏的视口里必须不渲染
        expectNavBar: !!page.hasNavBar && !vp.hostChrome,
        hasNavBar: r.hasNavBar,
        navOk: r.hasNavBar === (!!page.hasNavBar && !vp.hostChrome),
        // 「记录」入口：宿主模式下挪到进度区，普通浏览器下仍由导航栏承载
        expectProgressRecords: !!page.hasProgressRecords && !!vp.hostChrome,
        hasProgressRecords: r.hasProgressRecords,
        progressRecordsOk: r.hasProgressRecords === (!!page.hasProgressRecords && !!vp.hostChrome),
      })
    }
  }

  ws.close()
  chrome.kill()
  try {
    rmSync(userDataDir, { recursive: true, force: true })
  }
  catch {
    // Windows 上偶尔删不掉，不影响结果
  }

  // 报告
  console.log(`\n页面冒烟（${BASE}）\n`)
  let bad = 0
  let currentVp = ''
  for (const r of results) {
    if (r.viewport !== currentVp) {
      currentVp = r.viewport
      console.log(`\n── ${r.viewport}（${r.viewportSize}）──`)
    }
    const overflowBad = r.overflow > 1
    const ok = r.rendered && r.exceptions.length === 0 && r.consoleErrors.length === 0 && r.textOk && !overflowBad && r.uaOk && r.navOk && r.progressRecordsOk
    if (!ok) bad++
    console.log(`${ok ? '✓' : '✗'} ${r.name}（文本 ${r.textLen} 字${overflowBad ? `，横向溢出 ${r.overflow}px` : ''}${r.uaOk ? '' : '，UA 不符'}）`)
    if (!r.rendered) console.log(`    未渲染出内容，路由 ${r.route}`)
    if (r.missing.length) console.log(`    未命中 ${r.missing.join(', ')}`)
    if (r.head) console.log(`    首屏：${r.head.replace(/\n/g, ' / ')}`)
    if (r.expectText && !r.textOk) console.log(`    [文案不符] 期望包含「${r.expectText}」`)
    if (!r.uaOk) console.log(`    [UA 不符] 期望${r.uaExpectWx ? '带' : '不带'} MicroMessenger，实际 ${r.uaIsWx ? '带' : '不带'}`)
    if (!r.navOk) console.log(`    [导航栏不符] 期望${r.expectNavBar ? '有' : '无'} .bx-navbar，实际${r.hasNavBar ? '有' : '无'}`)
    if (!r.progressRecordsOk) console.log(`    [记录入口不符] 期望${r.expectProgressRecords ? '有' : '无'} .runner__progress-records，实际${r.hasProgressRecords ? '有' : '无'}`)
    for (const e of r.exceptions) console.log(`    [未捕获异常] ${e.split('\n')[0]}`)
    for (const e of r.consoleErrors) console.log(`    [console.error] ${e.slice(0, 200)}`)
  }

  console.log(`\n== 共 ${results.length} 次渲染（${PAGES.length} 页 × ${VIEWPORTS.length} 视口），异常 ${bad} 次 ==`)
  process.exit(bad === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('冒烟失败:', error.message)
  chrome.kill()
  process.exit(1)
})
