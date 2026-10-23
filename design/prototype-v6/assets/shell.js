/* ═══════════════════════════════════════════════════════════════════════════
   V6「清简」原型外壳
   —— 路由 / 设备框 / 状态种子 / 弹层 / toast / 图标
   各屏 JS 只通过 window.Proto 注册与交互，不直接操作外壳 DOM。
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict'

  const STORAGE_KEY = 'bxq-proto-v6'

  // ── 种子数据 ─────────────────────────────────────────────────────────────

  function seedSurvey() {
    return {
      no: 'ACT202610220001',
      title: '员工满意度调查',
      subtitle: '2026 年度 · 园区员工体验调研',
      intro:
        '这是一份匿名问卷，约 3 分钟完成。你的回答只用于改善园区服务与工作体验，不会用于绩效评估。',
      deadline: '2026-12-31',
      submittedCount: 128,
      questions: [
        { id: 'q1', type: 'text', title: '你的姓名（选填）', required: false, placeholder: '请输入姓名' },
        {
          id: 'q2',
          type: 'radio',
          title: '你所在的部门',
          required: true,
          options: ['技术部', '产品部', '市场部', '职能部'],
        },
        { id: 'q3', type: 'number', title: '你在本公司的工作年限（年）', required: true, placeholder: '例如 3' },
        { id: 'q4', type: 'date', title: '你的入职日期', required: false },
        {
          id: 'q5',
          type: 'radio',
          title: '你对当前工作的整体满意度',
          required: true,
          points: 10,
          correct: '非常满意',
          options: ['非常满意', '比较满意', '一般', '不太满意'],
        },
        {
          id: 'q6',
          type: 'checkbox',
          title: '你认为公司在哪些方面做得好？（可多选）',
          required: true,
          points: 10,
          correct: ['团队氛围', '薪酬福利'],
          options: ['团队氛围', '薪酬福利', '成长空间', '工作生活平衡'],
        },
        {
          id: 'q7',
          type: 'radio',
          title: '你愿意推荐朋友来本公司工作吗？',
          required: false,
          options: ['非常愿意', '比较愿意', '说不好', '不愿意'],
        },
        { id: 'q8', type: 'address', title: '你的工作地点所在地区', required: false },
        { id: 'q9', type: 'image', title: '上传一张你的工作环境照片', required: false },
        {
          id: 'q10',
          type: 'ref',
          title: '请选择一份你参与过的问卷',
          required: false,
          options: ['2026 年度健康体检自评', '园区食堂服务满意度', '新员工入职体验调研'],
        },
        { id: 'q11', type: 'textarea', title: '你对公司的建议', required: false, maxLength: 200 },
      ],
    }
  }

  function seedActivities() {
    return [
      {
        no: 'ACT202610220001',
        title: '员工满意度调查',
        desc: '2026 年度 · 园区员工体验调研',
        status: '进行中',
        items: 11,
        replies: 128,
        deadline: '2026-12-31',
        updatedAt: '10-22 09:41',
        owner: '林一舟',
      },
      {
        no: 'ACT202610180002',
        title: '2026 年度健康体检自评',
        desc: '压力、睡眠、运动与饮食四项维度',
        status: '进行中',
        items: 18,
        replies: 96,
        deadline: '2026-11-30',
        updatedAt: '10-21 16:20',
        owner: '周岚',
      },
      {
        no: 'ACT202610120003',
        title: '园区食堂服务满意度',
        desc: '口味、价格、排队与卫生',
        status: '未开始',
        items: 9,
        replies: 0,
        deadline: '2026-11-15',
        updatedAt: '10-20 11:02',
        owner: '陈默',
      },
      {
        no: 'ACT202609080004',
        title: '新员工入职体验调研',
        desc: '入职 30 天回访 · 已归档',
        status: '已结束',
        items: 14,
        replies: 342,
        deadline: '2026-10-08',
        updatedAt: '10-09 09:12',
        owner: '林一舟',
      },
      {
        no: 'ACT202609250005',
        title: '办公环境与工位需求',
        desc: '照明、噪声、座椅与工位面积',
        status: '进行中',
        items: 7,
        replies: 57,
        deadline: '2026-11-08',
        updatedAt: '10-19 14:35',
        owner: '周岚',
      },
      {
        no: 'ACT202607150006',
        title: '心理健康自评（简版）',
        desc: '匿名作答 · 结果仅本人可见',
        status: '已结束',
        items: 9,
        replies: 210,
        deadline: '2026-08-31',
        updatedAt: '09-01 10:00',
        owner: '陈默',
      },
    ]
  }

  function seed() {
    const survey = seedSurvey()
    return {
      survey,
      answers: {},
      submitted: false,
      result: null,
      draftSavedAt: '',
      activities: seedActivities(),
      designer: {
        activityNo: survey.no,
        title: survey.title,
        intro: survey.intro,
        deadline: survey.deadline,
        selectedId: survey.questions[0].id,
        dirty: false,
        items: JSON.parse(JSON.stringify(survey.questions)),
      },
      session: { loggedIn: true, name: '林一舟', dept: '技术部' },
      view: { answer: 'cover', admin: 'list', login: 'login-d' },
      loginDevice: 'desktop',
    }
  }

  let state = seed()

  // 只恢复数据，不恢复运行时视图状态
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && typeof saved === 'object') {
      state = Object.assign(seed(), saved)
      state.view = Object.assign(seed().view, saved.view || {})
    }
  } catch (error) {
    /* file:// 或隐私模式下不可用，忽略 */
  }

  // ── 图标（1.75 描边 / 24 栅格 / 不用 emoji 与文字符号） ─────────────────

  const ICON_PATHS = {
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    forward: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
    down: '<path d="M5.5 9.5 12 16l6.5-6.5"/>',
    up: '<path d="M5.5 14.5 12 8l6.5 6.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8 20 20"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M5 12.5 9.5 17 19 7"/>',
    edit: '<path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="M14.5 5.5 18.5 9.5"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    drag: '<circle cx="9" cy="6.5" r="1"/><circle cx="15" cy="6.5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17.5" r="1"/><circle cx="15" cy="17.5" r="1"/>',
    eye: '<path d="M2.8 12S6.3 5.8 12 5.8 21.2 12 21.2 12 17.7 18.2 12 18.2 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.4 9.4 0 0 1 12 6c5.7 0 9.2 6 9.2 6a17 17 0 0 1-3 3.7"/><path d="M6.2 7.4A16.4 16.4 0 0 0 2.8 12S6.3 18 12 18a9.7 9.7 0 0 0 4.1-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l3 1.9"/>',
    image: '<rect x="3.8" y="5" width="16.4" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20.2 15.6 16 11.5l-6.2 7.5"/>',
    pin: '<path d="M12 20.5s6-5.3 6-10.2a6 6 0 1 0-12 0c0 4.9 6 10.2 6 10.2Z"/><circle cx="12" cy="10" r="2.2"/>',
    link: '<path d="M10 13.8a4.2 4.2 0 0 0 6 0l2.2-2.2a4.2 4.2 0 0 0-6-6L11 6.8"/><path d="M14 10.2a4.2 4.2 0 0 0-6 0L5.8 12.4a4.2 4.2 0 0 0 6 6l1.2-1.2"/>',
    user: '<circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 20c.7-3.4 3.6-5.5 7.2-5.5s6.5 2.1 7.2 5.5"/>',
    users: '<circle cx="9.5" cy="8.4" r="3.2"/><path d="M3.4 19.4c.6-3 3.1-4.9 6.1-4.9s5.5 1.9 6.1 4.9"/><path d="M16 5.6a3.2 3.2 0 0 1 0 6.2M17.8 14.7c2 .5 3.3 2 3.7 4.1"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16.5v-4M12 16.5V8M16 16.5v-6.5"/>',
    list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="4.6" cy="6.5" r="1"/><circle cx="4.6" cy="12" r="1"/><circle cx="4.6" cy="17.5" r="1"/>',
    save: '<path d="M4.8 4.8h11.4l3 3V19.2H4.8V4.8Z"/><path d="M8.4 4.8v5.4h7.2V4.8"/><path d="M8.4 19.2v-5.4h7.2v5.4"/>',
    send: '<path d="M20.5 3.5 3.8 10.2l6.4 2.6 2.6 6.4 7.7-15.7Z"/><path d="M10.2 12.8 20.5 3.5"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.8 4.5v4.2h-4.2"/>',
    more: '<circle cx="5.5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18.5" cy="12" r="1.1"/>',
    filter: '<path d="M4 6h16l-6.2 7.2v5.4l-3.6 1.6v-7L4 6Z"/>',
    lock: '<rect x="5.2" y="10.5" width="13.6" height="9.5" rx="2"/><path d="M8.4 10.5V8a3.6 3.6 0 0 1 7.2 0v2.5"/>',
    spark: '<path d="M12 3.5c.6 4.4 1.7 5.5 6.1 6.1-4.4.6-5.5 1.7-6.1 6.1-.6-4.4-1.7-5.5-6.1-6.1 4.4-.6 5.5-1.7 6.1-6.1Z"/><path d="M18.5 15.5c.3 2 .8 2.5 2.8 2.8-2 .3-2.5.8-2.8 2.8-.3-2-.8-2.5-2.8-2.8 2-.3 2.5-.8 2.8-2.8Z"/>',
    'arrow-up': '<path d="M12 19.5V5M6 11l6-6 6 6"/>',
    'arrow-down': '<path d="M12 4.5V19M6 13l6 6 6-6"/>',
    download: '<path d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 17v2.5h15V17"/>',
    share: '<circle cx="6" cy="12" r="2.4"/><circle cx="17.5" cy="5.8" r="2.4"/><circle cx="17.5" cy="18.2" r="2.4"/><path d="M8.2 10.9l7-3.8M8.2 13.1l7 3.8"/>',
    paper: '<path d="M6 3.5h7.5l4.5 4.5v12.5H6V3.5Z"/><path d="M13.5 3.5V8H18"/><path d="M9 12h6M9 15.5h4"/>',
  }

  function icon(name, size) {
    const path = ICON_PATHS[name]
    const s = size || 20
    if (!path) return ''
    return (
      '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + '</svg>'
    )
  }

  // ── 工具 ─────────────────────────────────────────────────────────────────

  const esc = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]))

  const fmt = (n) => {
    const num = Number(n)
    if (!Number.isFinite(num)) return '0'
    return num.toLocaleString('zh-CN')
  }

  const pad = (n) => (n < 10 ? '0' + n : String(n))
  const now = () => {
    const d = new Date()
    return pad(d.getHours()) + ':' + pad(d.getMinutes())
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      /* 忽略不可写环境 */
    }
  }

  // ── 屏幕注册表与路由 ─────────────────────────────────────────────────────

  const screens = {}
  const GROUP_LABEL = { answer: '作答端', admin: '管理端', login: '登录' }
  const GROUP_DEFAULT = { answer: 'cover', admin: 'list', login: 'login-d' }
  const navStack = []
  let current = { id: null, params: {}, group: 'answer' }
  let pendingParams = {}
  let cleanup = null

  const Proto = {
    state,
    screens,
    register(id, def) {
      screens[id] = Object.assign({ id }, def)
    },
    go,
    back,
    rerender,
    toast,
    modal: openModal,
    confirm,
    icon,
    esc,
    fmt,
    save: persist,
    reset,
    boot,
  }
  window.Proto = Proto

  function go(id, params) {
    const def = screens[id]
    if (!def) {
      console.warn('[proto] 未注册的屏：' + id)
      return
    }
    if (current.id && current.id !== id) navStack.push(current.id)
    pendingParams = params || {}
    state.view[def.group] = id
    persist()
    const target = '#/' + def.group + '/' + id
    if (location.hash === target) render()
    else location.hash = target
  }

  function back() {
    while (navStack.length) {
      const id = navStack.pop()
      if (!screens[id]) continue
      pendingParams = {}
      const target = '#/' + screens[id].group + '/' + id
      if (location.hash === target) render()
      else location.hash = target
      return
    }
    const fallback = GROUP_DEFAULT[current.group] || 'cover'
    go(fallback)
  }

  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '').trim()
    if (!raw) return null
    const parts = raw.split('/')
    if (parts.length === 1) return { group: null, id: parts[0] }
    return { group: parts[0], id: parts[1] }
  }

  function rerender() {
    const scroller = document.querySelector('.device__screen .screen')
    const top = scroller ? scroller.scrollTop : 0
    render(true)
    const next = document.querySelector('.device__screen .screen')
    if (next) next.scrollTop = top
  }

  // ── 渲染 ─────────────────────────────────────────────────────────────────

  const frameEl = () => document.getElementById('frame')

  function deviceMarkup(group) {
    if (group === 'answer') {
      return (
        '<div class="device device--phone">' +
          '<div class="device__screen">' +
            '<div class="device__island"></div>' +
            '<div class="device__status">' +
              '<span class="tnum">9:41</span>' +
              '<span class="device__status-icons">' +
                '<span class="device__bar"><i></i><i></i><i></i><i></i></span>' +
                '<span class="device__battery"></span>' +
              '</span>' +
            '</div>' +
            '<div class="screen screen-anim" id="screen-body"></div>' +
          '</div>' +
        '</div>'
      )
    }
    const hashLabel = (location.hash || '').replace('#/', '')
    return (
      '<div class="device device--desktop">' +
        '<div class="device__titlebar">' +
          '<span class="device__dots"><i></i><i></i><i></i></span>' +
          '<span class="device__url"><b>quest.100xsys.cn</b>/quest/#' + esc(hashLabel) + '</span>' +
        '</div>' +
        '<div class="device__screen">' +
          '<div class="screen screen-anim" id="screen-body"></div>' +
        '</div>' +
      '</div>'
    )
  }

  function render(force) {
    const parsed = parseHash()
    let id = parsed && parsed.id
    let def = screens[id]

    if (!def) {
      const group = (parsed && parsed.group) || 'answer'
      id = GROUP_DEFAULT[group] || 'cover'
      def = screens[id]
      if (!def) return
      location.replace('#/' + (GROUP_DEFAULT[id] ? group : def.group) + '/' + id)
    }

    if (!force && current.id === id && !pendingParams) {
      // 同一屏重复 render 无害，但避免重复动画
    }

    if (cleanup) {
      try { cleanup() } catch (error) { /* 忽略清理异常 */ }
      cleanup = null
    }

    current = { id, group: def.group, params: pendingParams }
    const params = pendingParams
    pendingParams = {}

    const ctx = makeContext(def, params)
    const wrap = frameEl()
    wrap.innerHTML = deviceMarkup(def.group)
    fitDevice()

    const body = document.getElementById('screen-body')
    let html = ''
    try {
      html = def.render(ctx) || ''
    } catch (error) {
      console.error('[proto] 屏 ' + id + ' 渲染失败', error)
      html =
        '<div class="empty"><div class="empty__title">这一屏渲染失败了</div>' +
        '<div class="empty__tip">' + esc(error && error.message ? error.message : String(error)) + '</div></div>'
    }
    body.innerHTML = html

    if (typeof def.mount === 'function') {
      try {
        cleanup = def.mount(body, ctx) || null
      } catch (error) {
        console.error('[proto] 屏 ' + id + ' 绑定失败', error)
      }
    }

    updateChrome(def)
    requestAnimationFrame(fitDevice)
  }

  function makeContext(def, params) {
    return {
      state,
      params,
      group: def.group,
      go,
      back,
      rerender,
      save: persist,
      toast,
      modal: openModal,
      confirm,
      icon,
      esc,
      fmt,
      now,
    }
  }

  function updateChrome(def) {
    document.querySelectorAll('[data-group]').forEach((el) => {
      const active = el.getAttribute('data-group') === def.group
      el.classList.toggle('is-active', active)
      el.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    const label = document.querySelector('.proto__caption-label')
    const note = document.querySelector('.proto__caption-note')
    if (label) label.textContent = def.label || def.id
    if (note) note.textContent = def.note || ''
    document.title = '园区问卷 · ' + (def.label || def.id)
  }

  // ── 设备框适配 ───────────────────────────────────────────────────────────

  function fitDevice() {
    const stage = document.querySelector('.proto__stage')
    const wrap = frameEl()
    if (!stage || !wrap) return
    const device = wrap.firstElementChild
    if (!device) return

    const isPhone = device.classList.contains('device--phone')
    const naturalW = isPhone ? 410 : 1322
    const naturalH = isPhone ? 800 : 920

    const availW = stage.clientWidth - 32
    const availH = stage.clientHeight - 120

    let scale = availW / naturalW
    if (isPhone) scale = Math.min(scale, availH / naturalH)
    scale = Math.max(0.52, Math.min(1, scale || 1))

    device.style.transform = 'scale(' + scale + ')'
    wrap.style.width = Math.round(naturalW * scale) + 'px'
    wrap.style.height = Math.round(naturalH * scale) + 'px'
  }

  // ── toast / modal ────────────────────────────────────────────────────────

  function toast(text, type) {
    const host = document.getElementById('toasts')
    if (!host) return
    const el = document.createElement('div')
    el.className = 'toast' + (type && type !== 'info' ? ' toast--' + type : '')
    el.setAttribute('role', 'status')
    el.innerHTML = icon(type === 'warn' ? 'close' : 'check', 16) + '<span>' + esc(text) + '</span>'
    host.appendChild(el)
    setTimeout(() => {
      el.classList.add('is-out')
      setTimeout(() => el.remove(), 220)
    }, 2200)
  }

  let closeActiveModal = null

  function openModal(options) {
    const opts = options || {}
    return new Promise((resolve) => {
      const host = document.getElementById('modal')
      if (!host) return resolve('cancel')
      if (closeActiveModal) closeActiveModal('cancel')

      const actions = opts.actions || [
        { label: '取消', value: 'cancel', variant: 'quiet' },
        { label: '确认', value: 'confirm', variant: 'primary' },
      ]
      const buttons = actions
        .map((action) => {
          const variant = action.variant === 'primary'
            ? ' btn--primary'
            : action.variant === 'danger'
              ? ' btn--danger'
              : action.variant === 'ghost'
                ? ' btn--ghost'
                : ' btn--quiet'
          return (
            '<button type="button" class="btn' + variant + '" data-value="' +
            esc(action.value) + '">' + esc(action.label) + '</button>'
          )
        })
        .join('')

      host.innerHTML =
        '<div class="modal__scrim" data-close></div>' +
        '<div class="modal__panel' + (opts.wide ? ' modal__panel--wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
          '<div class="modal__head">' +
            '<div><div class="modal__title" id="modal-title">' + esc(opts.title || '') + '</div>' +
            (opts.sub ? '<div class="modal__sub">' + esc(opts.sub) + '</div>' : '') + '</div>' +
            '<button type="button" class="btn btn--icon" data-value="cancel" aria-label="关闭">' + icon('close', 18) + '</button>' +
          '</div>' +
          '<div class="modal__body">' + (opts.body || '') + '</div>' +
          '<div class="modal__foot">' + buttons + '</div>' +
        '</div>'
      host.classList.add('is-open')

      const lastFocus = document.activeElement
      const panel = host.querySelector('.modal__panel')
      const focusables = () =>
        Array.from(panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
          .filter((el) => !el.disabled && el.offsetParent !== null)

      function finish(value) {
        document.removeEventListener('keydown', onKey, true)
        host.classList.remove('is-open')
        host.innerHTML = ''
        closeActiveModal = null
        if (lastFocus && lastFocus.focus) lastFocus.focus()
        resolve(value)
      }

      function onKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault()
          finish('cancel')
          return
        }
        if (event.key !== 'Tab') return
        const list = focusables()
        if (!list.length) return
        const first = list[0]
        const last = list[list.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }

      closeActiveModal = finish
      host.querySelectorAll('[data-value]').forEach((el) => {
        el.addEventListener('click', () => finish(el.getAttribute('data-value')))
      })
      host.querySelector('[data-close]').addEventListener('click', () => finish('cancel'))
      document.addEventListener('keydown', onKey, true)
      const firstButton = focusables()[0]
      if (firstButton) firstButton.focus()
    })
  }

  function confirm(options) {
    const opts = options || {}
    return openModal({
      title: opts.title || '确认操作',
      body:
        '<p class="sub" style="margin:0">' + esc(opts.body || '') + '</p>' +
        (opts.hint ? '<p class="cap" style="margin:var(--sp-3) 0 0">' + esc(opts.hint) + '</p>' : ''),
      actions: [
        { label: opts.cancelText || '取消', value: 'cancel', variant: 'quiet' },
        {
          label: opts.confirmText || '确认',
          value: 'confirm',
          variant: opts.danger ? 'danger' : 'primary',
        },
      ],
    }).then((value) => value === 'confirm')
  }

  // ── 顶栏 / 目录 / 重置 ───────────────────────────────────────────────────

  function boot() {
    const tabs = document.getElementById('tabs')
    if (tabs) {
      tabs.innerHTML =
        '<div class="seg" role="tablist" aria-label="切换端">' +
          Object.keys(GROUP_LABEL)
            .map(
              (group) =>
                '<button type="button" class="seg__item" role="tab" aria-selected="false" data-group="' +
                group + '">' + GROUP_LABEL[group] + '</button>',
            )
            .join('') +
        '</div>'
      tabs.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-group]')
        if (!btn) return
        const group = btn.getAttribute('data-group')
        go(state.view[group] || GROUP_DEFAULT[group])
      })
    }

    const catalog = document.getElementById('catalog')
    const openCatalog = () => {
      if (!catalog) return
      catalog.innerHTML = catalogMarkup()
      catalog.classList.add('is-open')
      catalog.querySelector('.catalog__scrim').addEventListener('click', closeCatalog)
      catalog.querySelector('[data-catalog-close]').addEventListener('click', closeCatalog)
      catalog.querySelectorAll('[data-screen-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          closeCatalog()
          go(btn.getAttribute('data-screen-id'))
        })
      })
      const active = catalog.querySelector('.catalog__item.is-active')
      if (active) active.focus()
    }
    const closeCatalog = () => {
      if (catalog) catalog.classList.remove('is-open')
    }

    document.getElementById('catalog-btn').addEventListener('click', openCatalog)
    document.getElementById('reset-btn').addEventListener('click', reset)
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && catalog && catalog.classList.contains('is-open')) closeCatalog()
    })

    window.addEventListener('resize', () => requestAnimationFrame(fitDevice))
    window.addEventListener('hashchange', () => {
      if (!parseHash()) {
        location.replace('#/answer/cover')
        return
      }
      render()
    })

    if (!parseHash()) location.replace('#/answer/cover')
    render()
  }

  function catalogMarkup() {
    const groups = ['answer', 'admin', 'login']
    return (
      '<div class="catalog__scrim"></div>' +
      '<aside class="catalog__panel" role="dialog" aria-modal="true" aria-label="屏幕目录">' +
        '<div class="catalog__head">' +
          '<div><div class="h3">屏幕目录</div><div class="cap">共 ' + Object.keys(screens).length + ' 屏</div></div>' +
          '<button type="button" class="btn btn--icon" data-catalog-close aria-label="关闭目录">' + icon('close', 18) + '</button>' +
        '</div>' +
        groups
          .map((group) => {
            const items = Object.keys(screens).filter((id) => screens[id].group === group)
            if (!items.length) return ''
            return (
              '<section class="catalog__group">' +
                '<div class="catalog__group-title">' + GROUP_LABEL[group] + '</div>' +
                items
                  .map(
                    (id) =>
                      '<button type="button" class="catalog__item' + (current.id === id ? ' is-active' : '') +
                      '" data-screen-id="' + id + '">' +
                        '<span class="catalog__item-label">' + esc(screens[id].label || id) + '</span>' +
                        '<span class="catalog__item-note">' + esc(screens[id].note || '') + '</span>' +
                      '</button>',
                  )
                  .join('') +
              '</section>'
            )
          })
          .join('') +
      '</aside>'
    )
  }

  async function reset() {
    const ok = await confirm({
      title: '重置原型数据',
      body: '作答内容、列表数据与设计器改动都会回到初始状态。',
      confirmText: '重置',
      danger: true,
    })
    if (!ok) return
    state = seed()
    Proto.state = state
    navStack.length = 0
    try { localStorage.removeItem(STORAGE_KEY) } catch (error) { /* 忽略 */ }
    location.hash = '#/answer/cover'
    render()
    toast('已重置', 'ok')
  }

  // 暴露给模块内部使用
  Proto.__internal = { fitDevice, render, deviceMarkup }

  // 各屏 JS 在本文件之后同步加载；DOMContentLoaded 时它们都已注册完成
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()

