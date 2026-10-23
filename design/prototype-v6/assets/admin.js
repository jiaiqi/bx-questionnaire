/* ═══════════════════════════════════════════════════════════════════════════
   V6「清简」· 管理端交互
   —— 问卷列表 / 列表加载 / 可视化设计器 / 桌面登录
   只通过 window.Proto 的公开 API 与外壳协作。
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict'

  const Proto = window.Proto
  if (!Proto) return

  const esc = Proto.esc
  const icon = Proto.icon
  const fmt = Proto.fmt

  /* ── 常量与工具 ─────────────────────────────────────────────────────────── */

  const PAGE_SIZE = 5
  const STATUSES = ['全部', '未开始', '进行中', '已结束']

  const TYPES = [
    { value: 'radio', label: '单选' },
    { value: 'checkbox', label: '多选' },
    { value: 'text', label: '文本' },
    { value: 'textarea', label: '多行文本' },
    { value: 'number', label: '数字' },
    { value: 'date', label: '日期' },
    { value: 'address', label: '地址' },
    { value: 'image', label: '图片' },
    { value: 'ref', label: '引用' },
  ]
  const OPTION_TYPES = ['radio', 'checkbox', 'ref']
  const SCORE_TYPES = ['radio', 'checkbox']

  const pad2 = (n) => (n < 10 ? '0' + n : String(n))
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const typeLabel = (type) => (TYPES.find((item) => item.value === type) || {}).label || '文本'
  const hasOptions = (type) => OPTION_TYPES.indexOf(type) >= 0
  const hasScore = (type) => SCORE_TYPES.indexOf(type) >= 0

  function stampShort() {
    const d = new Date()
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  }

  function stampNo() {
    const d = new Date()
    return (
      'ACT' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds())
    )
  }

  function defaultDeadline() {
    const d = new Date()
    d.setDate(d.getDate() + 45)
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
  }

  function avatarText(name) {
    const text = String(name || '').trim()
    return text ? text.slice(0, 1) : '林'
  }

  /* ── 列表页 UI 状态（跨重渲染保留） ─────────────────────────────────────── */

  const listView = { q: '', status: '全部', page: 1, flash: null }

  function ensureAdminState(ctx) {
    const state = ctx.state
    if (!Array.isArray(state.activities)) state.activities = []
    if (!state.session) state.session = { loggedIn: false, name: '林一舟', dept: '技术部' }
    return state
  }

  function findActivity(ctx, no) {
    const list = ctx.state.activities || []
    return list.find((item) => item.no === no) || null
  }

  function filteredActivities(ctx) {
    const keyword = listView.q.trim().toLowerCase()
    return (ctx.state.activities || []).filter((item) => {
      if (listView.status !== '全部' && item.status !== listView.status) return false
      if (!keyword) return true
      return [item.title, item.desc, item.no, item.owner].some(
        (value) => String(value || '').toLowerCase().indexOf(keyword) >= 0,
      )
    })
  }

  function hasFilters() {
    return listView.q.trim() !== '' || listView.status !== '全部'
  }

  function statusTag(status) {
    const map = {
      进行中: 'tag--accent',
      未开始: 'tag--warn',
      已结束: 'tag--muted',
    }
    return (
      '<span class="tag ' + (map[status] || 'tag--muted') + '">' +
      '<span class="tag__dot" aria-hidden="true"></span>' + esc(status) +
      '</span>'
    )
  }

  /* ── 弹层（自建：用于表单 / 预览，支持焦点陷阱与 Esc） ────────────────── */

  let activeDialog = null

  function closeDialog() {
    if (activeDialog) activeDialog.close()
  }

  function openDialog(root, options) {
    closeDialog()
    const opts = options || {}
    const host = root.parentElement && root.parentElement.classList.contains('device__screen')
      ? root.parentElement
      : root

    const el = document.createElement('div')
    el.className = 'adm-dialog' + (opts.className ? ' ' + opts.className : '')
    el.innerHTML =
      '<div class="adm-dialog__scrim" data-dialog-scrim></div>' +
      '<div class="adm-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="adm-dialog-title">' +
        '<div class="adm-dialog__head">' +
          '<div>' +
            '<div class="adm-dialog__title" id="adm-dialog-title">' + esc(opts.title || '') + '</div>' +
            (opts.sub ? '<div class="adm-dialog__sub">' + esc(opts.sub) + '</div>' : '') +
          '</div>' +
          '<button type="button" class="adm-dialog__close" data-dialog-close aria-label="关闭弹层">' +
            icon('close', 18) +
          '</button>' +
        '</div>' +
        '<div class="adm-dialog__body">' + (opts.body || '') + '</div>' +
        (opts.foot ? '<div class="adm-dialog__foot">' + opts.foot + '</div>' : '') +
      '</div>'

    const lastFocus = document.activeElement
    const panel = el.querySelector('.adm-dialog__panel')

    const focusables = () =>
      Array.from(
        panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((node) => !node.disabled && node.offsetParent !== null)

    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
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

    function close() {
      if (!activeDialog || activeDialog.el !== el) return
      activeDialog = null
      document.removeEventListener('keydown', onKey, true)
      el.remove()
      if (lastFocus && lastFocus.isConnected && typeof lastFocus.focus === 'function') lastFocus.focus()
      if (typeof opts.onClose === 'function') opts.onClose()
    }

    activeDialog = { el, panel, close }
    document.addEventListener('keydown', onKey, true)

    el.querySelectorAll('[data-dialog-close]').forEach((node) => node.addEventListener('click', close))
    const scrim = el.querySelector('[data-dialog-scrim]')
    if (scrim) scrim.addEventListener('click', close)
    host.appendChild(el)

    const target = (opts.focus && panel.querySelector(opts.focus)) || focusables()[0]
    if (target) target.focus()
    return { el, panel, close }
  }

  /* ── 通用：管理端顶栏 ───────────────────────────────────────────────────── */

  function appbarMarkup(ctx, crumb, options) {
    const opts = options || {}
    const session = ctx.state.session || {}
    let right = ''
    if (opts.static) {
      right =
        '<div class="adm-user">' +
          '<span class="adm-user__avatar" aria-hidden="true">' + esc(avatarText(session.name)) + '</span>' +
          '<div class="adm-user__text">' +
            '<span class="adm-user__name">' + esc(session.name || '未登录') + '</span>' +
            '<span class="adm-user__dept">' + esc(session.dept || '') + '</span>' +
          '</div>' +
        '</div>'
    } else if (session.loggedIn) {
      right =
        '<div class="adm-user">' +
          '<span class="adm-user__avatar" aria-hidden="true">' + esc(avatarText(session.name)) + '</span>' +
          '<div class="adm-user__text">' +
            '<span class="adm-user__name">' + esc(session.name || '未登录') + '</span>' +
            '<span class="adm-user__dept">' + esc(session.dept || '') + '</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="adm-appbar__link" data-act="logout">退出</button>'
    } else {
      right = '<button type="button" class="btn btn--ghost btn--sm" data-act="login">登录</button>'
    }

    return (
      '<header class="adm-appbar">' +
        '<div class="adm-appbar__brand">' +
          '<span class="adm-mark" aria-hidden="true">问</span>' +
          '<span class="adm-wordmark">园区问卷</span>' +
        '</div>' +
        '<span class="adm-appbar__div" aria-hidden="true"></span>' +
        '<span class="adm-appbar__crumb">' + esc(crumb) + '</span>' +
        '<span class="adm-appbar__spacer"></span>' +
        right +
      '</header>'
    )
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     屏 1 · 问卷列表
     ═══════════════════════════════════════════════════════════════════════════ */

  function pageHeadMarkup(ctx) {
    const list = ctx.state.activities || []
    const running = list.filter((item) => item.status === '进行中').length
    const replies = list.reduce((sum, item) => sum + (Number(item.replies) || 0), 0)
    return (
      '<div class="adm-pagehead">' +
        '<div>' +
          '<h1 class="adm-pagehead__title">问卷列表</h1>' +
          '<div class="adm-pagehead__sub">' +
            '<span>共 <b class="tnum">' + fmt(list.length) + '</b> 份</span>' +
            '<span class="adm-dotsep" aria-hidden="true"></span>' +
            '<span>进行中 <b class="tnum">' + fmt(running) + '</b></span>' +
            '<span class="adm-dotsep" aria-hidden="true"></span>' +
            '<span>累计回收 <b class="tnum">' + fmt(replies) + '</b> 份</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn btn--primary" data-act="create">' +
          icon('plus', 16) + '<span>新建问卷</span>' +
        '</button>' +
      '</div>'
    )
  }

  function toolbarMarkup() {
    return (
      '<div class="adm-toolbar">' +
        '<div class="adm-search">' +
          '<span class="adm-search__icon" aria-hidden="true">' + icon('search', 16) + '</span>' +
          '<input class="input" type="search" data-ref="search" value="' + esc(listView.q) +
            '" placeholder="搜索问卷名称、编号或负责人" aria-label="搜索问卷" autocomplete="off">' +
          '<button type="button" class="adm-search__clear" data-act="clear-search" aria-label="清除搜索"' +
            (listView.q ? '' : ' hidden') + '>' + icon('close', 16) + '</button>' +
        '</div>' +
        '<div class="seg adm-statusseg" role="group" aria-label="按状态筛选">' +
          STATUSES.map((status) =>
            '<button type="button" class="seg__item' + (listView.status === status ? ' is-active' : '') +
              '" data-status="' + esc(status) + '" aria-pressed="' + (listView.status === status) + '">' +
              esc(status) + '</button>',
          ).join('') +
        '</div>' +
        '<span class="adm-appbar__spacer"></span>' +
        '<button type="button" class="btn btn--quiet btn--sm" data-act="reset"' +
          (hasFilters() ? '' : ' disabled') + '>' + icon('refresh', 14) + '<span>重置</span></button>' +
      '</div>'
    )
  }

  function listRowMarkup(activity) {
    return (
      '<tr data-no="' + esc(activity.no) + '"' + (listView.flash === activity.no ? ' class="is-new"' : '') + '>' +
        '<td>' +
          '<div class="adm-q">' +
            '<div class="adm-q__title" title="' + esc(activity.title) + '">' + esc(activity.title) + '</div>' +
            '<div class="adm-q__desc">' + esc(activity.desc || '—') + '</div>' +
          '</div>' +
        '</td>' +
        '<td>' + statusTag(activity.status) + '</td>' +
        '<td class="adm-cell--num">' + fmt(activity.items || 0) + '</td>' +
        '<td class="adm-cell--num">' + fmt(activity.replies || 0) + '</td>' +
        '<td class="adm-cell--time">' + esc(activity.deadline || '—') + '</td>' +
        '<td class="adm-cell--time">' + esc(activity.updatedAt || '—') + '</td>' +
        '<td class="adm-morecell">' +
          '<div class="adm-rowacts">' +
            '<button type="button" class="adm-act" data-act="edit" data-no="' + esc(activity.no) + '">编辑</button>' +
            '<button type="button" class="adm-act" data-act="answer" data-no="' + esc(activity.no) + '">作答</button>' +
            '<button type="button" class="adm-act adm-act--icon" data-act="menu" data-no="' + esc(activity.no) +
              '" aria-label="更多操作" aria-haspopup="menu" aria-expanded="false">' + icon('more', 16) + '</button>' +
          '</div>' +
        '</td>' +
      '</tr>'
    )
  }

  function pagerMarkup(page, pages) {
    if (pages <= 1) return ''
    let numbers = ''
    for (let i = 1; i <= pages; i += 1) {
      numbers +=
        '<button type="button" class="adm-pagebtn' + (i === page ? ' is-active' : '') +
        '" data-act="page" data-page="' + i + '" aria-label="第 ' + i + ' 页"' +
        (i === page ? ' aria-current="page"' : '') + '>' + i + '</button>'
    }
    return (
      '<div class="adm-pager">' +
        '<button type="button" class="adm-pagebtn" data-act="prev" aria-label="上一页"' +
          (page <= 1 ? ' disabled' : '') + '>' + icon('back', 14) + '</button>' +
        numbers +
        '<button type="button" class="adm-pagebtn" data-act="next" aria-label="下一页"' +
          (page >= pages ? ' disabled' : '') + '>' + icon('forward', 14) + '</button>' +
      '</div>'
    )
  }

  function emptyArt() {
    return (
      '<svg width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" ' +
        'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M22 12h20l10 10v34a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z"/>' +
        '<path d="M42 12v10h10"/>' +
        '<path d="M27 30h16M27 38h11"/>' +
        '<circle cx="46" cy="47" r="9"/>' +
        '<path d="m52.6 53.6 6.4 6.4"/>' +
      '</svg>'
    )
  }

  function renderList(ctx) {
    ensureAdminState(ctx)
    const rows = filteredActivities(ctx)
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
    const page = Math.min(Math.max(1, listView.page), pages)
    listView.page = page
    const start = (page - 1) * PAGE_SIZE
    const pageRows = rows.slice(start, start + PAGE_SIZE)

    const body =
      pageRows.map((activity) => listRowMarkup(activity)).join('')

    return (
      '<div class="adm adm--list dense">' +
        appbarMarkup(ctx, '问卷') +
        '<main class="adm-main">' +
          pageHeadMarkup(ctx) +
          toolbarMarkup() +
          '<div class="adm-card adm-tablewrap">' +
            '<table class="adm-table" aria-label="问卷列表">' +
              '<colgroup>' +
                '<col>' +
                '<col class="adm-col--status">' +
                '<col class="adm-col--items">' +
                '<col class="adm-col--replies">' +
                '<col class="adm-col--deadline">' +
                '<col class="adm-col--updated">' +
                '<col class="adm-col--acts">' +
              '</colgroup>' +
              '<thead>' +
                '<tr>' +
                  '<th scope="col">问卷</th>' +
                  '<th scope="col">状态</th>' +
                  '<th scope="col" class="adm-th--num">题量</th>' +
                  '<th scope="col" class="adm-th--num">回收份数</th>' +
                  '<th scope="col">截止</th>' +
                  '<th scope="col">更新</th>' +
                  '<th scope="col">操作</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody data-ref="rows">' + body + '</tbody>' +
            '</table>' +
            '<div class="empty adm-empty" data-ref="empty"' + (rows.length ? ' hidden' : '') + '>' +
              '<div class="empty__art">' + emptyArt() + '</div>' +
              '<div class="empty__title">没有匹配的问卷</div>' +
              '<div class="empty__tip">换个关键字，或点右上角新建一份</div>' +
              '<button type="button" class="btn btn--ghost btn--sm" data-act="reset">清除筛选</button>' +
            '</div>' +
            '<div class="adm-tablefoot">' +
              '<span data-ref="count">' + footerCountText(rows.length, start, pageRows.length) + '</span>' +
              '<div data-ref="pager">' + pagerMarkup(page, pages) + '</div>' +
            '</div>' +
          '</div>' +
        '</main>' +
      '</div>'
    )
  }

  function footerCountText(total, start, shown) {
    if (!total) return '共 0 份'
    return '显示 ' + (start + 1) + '–' + (start + shown) + ' · 共 ' + total + ' 份'
  }

  function mountList(root, ctx) {
    ensureAdminState(ctx)
    const tbody = root.querySelector('[data-ref="rows"]')
    const emptyEl = root.querySelector('[data-ref="empty"]')
    const countEl = root.querySelector('[data-ref="count"]')
    const pagerEl = root.querySelector('[data-ref="pager"]')
    const searchInput = root.querySelector('[data-ref="search"]')
    const clearBtn = root.querySelector('[data-act="clear-search"]')
    const resetBtn = root.querySelector('[data-act="reset"]')
    const segWrap = root.querySelector('.adm-statusseg')

    let openMenuEl = null
    let openMenuBtn = null

    function closeMenu(refocus) {
      if (!openMenuEl) return
      const btn = openMenuBtn
      openMenuEl.remove()
      openMenuEl = null
      openMenuBtn = null
      if (btn) {
        btn.setAttribute('aria-expanded', 'false')
        if (refocus) btn.focus()
      }
    }

    function syncToolbarState() {
      if (clearBtn) clearBtn.hidden = !listView.q
      if (resetBtn) resetBtn.disabled = !hasFilters()
      if (segWrap) {
        segWrap.querySelectorAll('[data-status]').forEach((btn) => {
          const active = btn.getAttribute('data-status') === listView.status
          btn.classList.toggle('is-active', active)
          btn.setAttribute('aria-pressed', active ? 'true' : 'false')
        })
      }
    }

    function paint() {
      const rows = filteredActivities(ctx)
      const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
      const page = Math.min(Math.max(1, listView.page), pages)
      listView.page = page
      const start = (page - 1) * PAGE_SIZE
      const pageRows = rows.slice(start, start + PAGE_SIZE)

      tbody.innerHTML = pageRows.map((activity) => listRowMarkup(activity)).join('')
      if (emptyEl) emptyEl.hidden = rows.length > 0
      if (countEl) countEl.textContent = footerCountText(rows.length, start, pageRows.length)
      if (pagerEl) pagerEl.innerHTML = pagerMarkup(page, pages)
      syncToolbarState()
      closeMenu(false)
    }

    function openMenu(button) {
      const menuNo = button.getAttribute('data-no')
      closeMenu(false)
      if (!menuNo) return
      const cell = button.closest('.adm-morecell')
      if (!cell) return
      const menu = document.createElement('div')
      menu.className = 'adm-menu'
      menu.setAttribute('role', 'menu')
      menu.setAttribute('aria-label', '更多操作')
      menu.innerHTML =
        '<button type="button" role="menuitem" class="adm-menu__item" data-act="copy" data-no="' + esc(menuNo) + '">' +
          icon('copy', 16) + '<span>复制问卷</span></button>' +
        '<button type="button" role="menuitem" class="adm-menu__item adm-menu__item--danger" data-act="delete" data-no="' +
          esc(menuNo) + '">' + icon('trash', 16) + '<span>删除问卷</span></button>'
      cell.appendChild(menu)
      openMenuEl = menu
      openMenuBtn = button
      button.setAttribute('aria-expanded', 'true')
      const first = menu.querySelector('button')
      if (first) first.focus()
    }

    function answerActivity(no) {
      const act = findActivity(ctx, no)
      const survey = ctx.state.survey || {}
      if (act && survey.no && act.no !== survey.no) {
        ctx.toast('作答端演示使用「员工满意度调查」数据', 'info')
      }
      ctx.go('survey')
    }

    function openCreate() {
      const dialog = openDialog(root, {
        title: '新建问卷',
        sub: '创建后进入设计器添加题目；也可以直接从模板开始。',
        body:
          '<div class="adm-form">' +
            '<div class="field" data-field="title">' +
              '<label class="field__label" for="adm-new-title">问卷名称 <span class="field__req">*</span></label>' +
              '<input class="input" id="adm-new-title" data-new="title" placeholder="例如：员工满意度调查" autocomplete="off">' +
              '<div class="field__error" data-error="title" hidden>' + icon('close', 14) + '<span>请填写问卷名称</span></div>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field__label" for="adm-new-desc">说明</label>' +
              '<input class="input" id="adm-new-desc" data-new="desc" placeholder="一句话说明问卷用途（选填）" autocomplete="off">' +
            '</div>' +
            '<div class="adm-form__row">' +
              '<div class="field">' +
                '<label class="field__label" for="adm-new-deadline">截止日期</label>' +
                '<input class="input" id="adm-new-deadline" type="date" data-new="deadline" value="' + defaultDeadline() + '">' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="adm-new-template">模板</label>' +
                '<select class="select" id="adm-new-template" data-new="template">' +
                  '<option value="blank">空白问卷</option>' +
                  '<option value="survey">员工满意度调研模板</option>' +
                '</select>' +
              '</div>' +
            '</div>' +
            '<p class="adm-props__hint">空白问卷从 0 题开始；模板会带入 11 道示例题目，可随时增删。</p>' +
          '</div>',
        foot:
          '<button type="button" class="btn btn--quiet" data-dialog-action="cancel">取消</button>' +
          '<button type="button" class="btn btn--primary" data-dialog-action="create">' +
            icon('plus', 16) + '<span>创建问卷</span></button>',
        focus: '[data-new="title"]',
      })

      const panel = dialog.panel
      const titleInput = panel.querySelector('[data-new="title"]')
      const descInput = panel.querySelector('[data-new="desc"]')
      const deadlineInput = panel.querySelector('[data-new="deadline"]')
      const templateSelect = panel.querySelector('[data-new="template"]')
      const titleField = panel.querySelector('[data-field="title"]')
      const titleError = panel.querySelector('[data-error="title"]')

      function submit() {
        const title = titleInput.value.trim()
        if (!title) {
          titleField.classList.add('is-invalid')
          if (titleError) titleError.hidden = false
          titleInput.focus()
          titleInput.classList.add('is-invalid')
          return
        }
        const isSurveyTemplate = templateSelect.value === 'survey'
        const activity = {
          no: stampNo(),
          title,
          desc: descInput.value.trim() || '新建问卷 · 待完善说明',
          status: '未开始',
          items: isSurveyTemplate ? 11 : 0,
          replies: 0,
          deadline: deadlineInput.value || defaultDeadline(),
          updatedAt: stampShort(),
          owner: (ctx.state.session && ctx.state.session.name) || '林一舟',
        }
        ctx.state.activities.unshift(activity)
        ctx.save()
        dialog.close()
        listView.q = ''
        listView.status = '全部'
        listView.page = 1
        listView.flash = activity.no
        ctx.rerender()
        window.setTimeout(() => {
          listView.flash = null
        }, 900)
        ctx.toast('已创建「' + title + '」', 'ok')
      }

      titleInput.addEventListener('input', () => {
        titleInput.classList.remove('is-invalid')
        titleField.classList.remove('is-invalid')
        if (titleError) titleError.hidden = true
      })
      panel.querySelector('[data-dialog-action="cancel"]').addEventListener('click', () => dialog.close())
      panel.querySelector('[data-dialog-action="create"]').addEventListener('click', submit)
      panel.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
          event.preventDefault()
          submit()
        }
      })
    }

    async function deleteActivity(no) {
      const act = findActivity(ctx, no)
      if (!act) return
      const body =
        '「' + act.title + '」' +
        (act.replies ? '及 ' + fmt(act.replies) + ' 份回答' : '') +
        '将被删除，且无法恢复。'
      const ok = await ctx.confirm({
        title: '删除问卷',
        body,
        confirmText: '删除',
        cancelText: '取消',
        danger: true,
      })
      if (!ok) return
      ctx.state.activities = ctx.state.activities.filter((item) => item.no !== no)
      if (ctx.state.designer && ctx.state.designer.activityNo === no) ctx.state.designer = null
      const rows = filteredActivities(ctx)
      const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
      if (listView.page > pages) listView.page = pages
      ctx.save()
      ctx.rerender()
      ctx.toast('已删除问卷')
    }

    function copyActivity(no) {
      const list = ctx.state.activities || []
      const index = list.findIndex((item) => item.no === no)
      if (index < 0) return
      const source = list[index]
      const copy = clone(source)
      copy.no = stampNo()
      copy.title = source.title + '（副本）'
      copy.status = '未开始'
      copy.replies = 0
      copy.updatedAt = stampShort()
      copy.owner = (ctx.state.session && ctx.state.session.name) || source.owner
      list.splice(index + 1, 0, copy)
      listView.q = ''
      listView.status = '全部'
      listView.page = Math.floor((index + 1) / PAGE_SIZE) + 1
      listView.flash = copy.no
      ctx.save()
      ctx.rerender()
      window.setTimeout(() => {
        listView.flash = null
      }, 900)
      ctx.toast('已复制为「' + copy.title + '」', 'ok')
    }

    const onClick = (event) => {
      const statusBtn = event.target.closest('[data-status]')
      if (statusBtn && root.contains(statusBtn)) {
        listView.status = statusBtn.getAttribute('data-status')
        listView.page = 1
        paint()
        return
      }

      const node = event.target.closest('[data-act]')
      if (!node || !root.contains(node)) return
      const act = node.getAttribute('data-act')

      switch (act) {
        case 'create':
          openCreate()
          break
        case 'clear-search':
          listView.q = ''
          if (searchInput) searchInput.value = ''
          listView.page = 1
          paint()
          if (searchInput) searchInput.focus()
          break
        case 'reset':
          listView.q = ''
          listView.status = '全部'
          listView.page = 1
          if (searchInput) searchInput.value = ''
          paint()
          break
        case 'edit':
          closeMenu(false)
          ctx.go('designer', { no: node.getAttribute('data-no') })
          break
        case 'answer':
          closeMenu(false)
          answerActivity(node.getAttribute('data-no'))
          break
        case 'menu':
          if (openMenuBtn === node) closeMenu(true)
          else openMenu(node)
          break
        case 'copy':
          closeMenu(false)
          copyActivity(node.getAttribute('data-no'))
          break
        case 'delete':
          closeMenu(false)
          deleteActivity(node.getAttribute('data-no'))
          break
        case 'prev':
          listView.page = Math.max(1, listView.page - 1)
          paint()
          break
        case 'next':
          listView.page += 1
          paint()
          break
        case 'page':
          listView.page = Number(node.getAttribute('data-page')) || 1
          paint()
          break
        case 'logout':
          if (ctx.state.session) ctx.state.session.loggedIn = false
          ctx.save()
          ctx.go('login-d')
          break
        case 'login':
          ctx.go('login-d')
          break
        default:
          break
      }
    }

    const onSearch = () => {
      listView.q = searchInput.value
      listView.page = 1
      paint()
    }

    const onSearchKey = (event) => {
      if (event.key === 'Escape' && searchInput.value) {
        event.preventDefault()
        listView.q = ''
        searchInput.value = ''
        listView.page = 1
        paint()
      }
    }

    const onDocClick = (event) => {
      if (!openMenuEl) return
      if (openMenuEl.contains(event.target) || (openMenuBtn && openMenuBtn.contains(event.target))) return
      closeMenu(false)
    }

    const onKeyDown = (event) => {
      if (!openMenuEl) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu(true)
      }
    }

    root.addEventListener('click', onClick)
    if (searchInput) {
      searchInput.addEventListener('input', onSearch)
      searchInput.addEventListener('keydown', onSearchKey)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      root.removeEventListener('click', onClick)
      if (searchInput) {
        searchInput.removeEventListener('input', onSearch)
        searchInput.removeEventListener('keydown', onSearchKey)
      }
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
      closeMenu(false)
      closeDialog()
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     屏 2 · 列表加载骨架
     ═══════════════════════════════════════════════════════════════════════════ */

  function renderListLoading(ctx) {
    ensureAdminState(ctx)
    const rows = Array.from({ length: PAGE_SIZE }).map(() =>
      '<tr>' +
        '<td><div class="adm-skelrow">' +
          '<span class="skeleton adm-skel adm-skel--title"></span>' +
          '<span class="skeleton adm-skel adm-skel--desc"></span>' +
        '</div></td>' +
        '<td><span class="skeleton adm-skel adm-skel--status"></span></td>' +
        '<td><span class="skeleton adm-skel adm-skel--num"></span></td>' +
        '<td><span class="skeleton adm-skel adm-skel--num"></span></td>' +
        '<td><span class="skeleton adm-skel adm-skel--date"></span></td>' +
        '<td><span class="skeleton adm-skel adm-skel--time"></span></td>' +
        '<td></td>' +
      '</tr>',
    ).join('')

    return (
      '<div class="adm adm--list dense" aria-busy="true">' +
        appbarMarkup(ctx, '问卷', { static: true }) +
        '<main class="adm-main">' +
          '<div class="adm-pagehead">' +
            '<div>' +
              '<h1 class="adm-pagehead__title">问卷列表</h1>' +
              '<div class="adm-pagehead__sub"><span class="skeleton adm-skel adm-skel--sub"></span></div>' +
            '</div>' +
            '<button type="button" class="btn btn--primary" disabled>' + icon('plus', 16) + '<span>新建问卷</span></button>' +
          '</div>' +
          '<div class="adm-toolbar">' +
            '<span class="skeleton adm-skel adm-skel--search"></span>' +
            '<span class="skeleton adm-skel adm-skel--seg"></span>' +
          '</div>' +
          '<div class="adm-card adm-tablewrap">' +
            '<table class="adm-table" aria-label="正在加载问卷列表">' +
              '<colgroup>' +
                '<col><col class="adm-col--status"><col class="adm-col--items">' +
                '<col class="adm-col--replies"><col class="adm-col--deadline">' +
                '<col class="adm-col--updated"><col class="adm-col--acts">' +
              '</colgroup>' +
              '<thead><tr>' +
                '<th scope="col">问卷</th><th scope="col">状态</th>' +
                '<th scope="col" class="adm-th--num">题量</th>' +
                '<th scope="col" class="adm-th--num">回收份数</th>' +
                '<th scope="col">截止</th><th scope="col">更新</th><th scope="col">操作</th>' +
              '</tr></thead>' +
              '<tbody>' + rows + '</tbody>' +
            '</table>' +
            '<div class="adm-tablefoot">' +
              '<span class="skeleton adm-skel adm-skel--foot"></span>' +
              '<span class="skeleton adm-skel adm-skel--page"></span>' +
            '</div>' +
          '</div>' +
          '<span class="sr-only">正在加载问卷列表</span>' +
        '</main>' +
      '</div>'
    )
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     屏 3 · 可视化设计器
     ═══════════════════════════════════════════════════════════════════════════ */

  function buildDesigner(ctx, activity) {
    const survey = ctx.state.survey || {}
    const source = Array.isArray(survey.questions) ? clone(survey.questions) : []
    const items = activity && activity.items === 0 ? [] : source
    return {
      activityNo: activity ? activity.no : survey.no || '',
      title: (activity && activity.title) || survey.title || '未命名问卷',
      desc: (activity && activity.desc) || survey.subtitle || '',
      intro: survey.intro || '',
      deadline: (activity && activity.deadline) || survey.deadline || defaultDeadline(),
      selectedId: items[0] ? items[0].id : null,
      dirty: false,
      items,
    }
  }

  function ensureStudio(ctx) {
    const state = ctx.state
    const activities = Array.isArray(state.activities) ? state.activities : []
    const paramNo = ctx.params && (ctx.params.no || ctx.params.activityNo)
    let designer = state.designer

    if (paramNo) {
      const target = activities.find((item) => item.no === paramNo)
      if (!designer || !Array.isArray(designer.items) || designer.activityNo !== paramNo) {
        designer = buildDesigner(ctx, target || activities[0] || null)
        state.designer = designer
      }
    }
    if (!designer || !Array.isArray(designer.items)) {
      designer = buildDesigner(ctx, activities[0] || null)
      state.designer = designer
    }
    if (activities.length && !activities.some((item) => item.no === designer.activityNo)) {
      designer = buildDesigner(ctx, activities[0])
      state.designer = designer
    }

    if (typeof designer.title !== 'string' || !designer.title) {
      const act = activities.find((item) => item.no === designer.activityNo)
      designer.title = (act && act.title) || '未命名问卷'
    }
    if (typeof designer.desc !== 'string') designer.desc = ''
    if (typeof designer.intro !== 'string') designer.intro = (ctx.state.survey && ctx.state.survey.intro) || ''
    if (typeof designer.deadline !== 'string' || !designer.deadline) designer.deadline = defaultDeadline()
    if (!designer.selectedId || !designer.items.some((item) => item.id === designer.selectedId)) {
      designer.selectedId = designer.items[0] ? designer.items[0].id : null
    }
    designer.dirty = !!designer.dirty

    // 清理悬空的计分答案
    designer.items.forEach((item) => {
      if (!Array.isArray(item.options)) {
        if (hasOptions(item.type)) item.options = []
        else delete item.options
      }
      if (item.correct) {
        const values = Array.isArray(item.correct) ? item.correct : [item.correct]
        const kept = values.filter((value) => item.options && item.options.indexOf(value) >= 0)
        if (!kept.length) delete item.correct
        else item.correct = Array.isArray(item.correct) ? kept : kept[0]
      }
    })
    return designer
  }

  function currentActivity(ctx) {
    const designer = ctx.state.designer
    const activities = ctx.state.activities || []
    if (!designer) return activities[0] || null
    return activities.find((item) => item.no === designer.activityNo) || activities[0] || null
  }

  function studioQuestion(designer) {
    if (!designer.selectedId) return null
    return designer.items.find((item) => item.id === designer.selectedId) || null
  }

  function nextQuestionId(items) {
    let max = 0
    items.forEach((item) => {
      const match = /^q(\d+)$/.exec(String(item.id || ''))
      if (match) max = Math.max(max, Number(match[1]))
    })
    return 'q' + (max + 1)
  }

  function makeQuestion(items) {
    const question = {
      id: nextQuestionId(items),
      type: 'radio',
      title: '未命名题目',
      required: false,
      options: ['选项 1', '选项 2'],
    }
    return question
  }

  function normalizeQuestionType(question) {
    if (hasOptions(question.type)) {
      if (!Array.isArray(question.options) || !question.options.length) {
        question.options = ['选项 1', '选项 2']
      }
    } else {
      delete question.options
      delete question.correct
    }
    if (!hasScore(question.type)) {
      delete question.points
      delete question.correct
    }
  }

  function designerNameMarkup(designer, activity) {
    return (
      '<header class="adm-appbar adm-appbar--designer">' +
        '<button type="button" class="adm-appbar__back" data-act="back" aria-label="返回问卷列表">' +
          icon('back', 18) +
        '</button>' +
        '<span class="adm-appbar__div" aria-hidden="true"></span>' +
        '<input class="adm-nameinput" data-bind="designer-title" value="' + esc(designer.title) +
          '" aria-label="问卷名称" autocomplete="off">' +
        '<span class="adm-dirty' + (designer.dirty ? ' is-dirty' : '') + '" data-ref="dirty">' +
          '<span class="adm-dirty__dot" aria-hidden="true"></span>' +
          (designer.dirty ? '未保存' : '已保存') +
        '</span>' +
        '<span class="adm-appbar__spacer"></span>' +
        '<button type="button" class="btn btn--quiet btn--sm" data-act="preview">' +
          icon('eye', 16) + '<span>预览</span></button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-act="save">' +
          icon('save', 16) + '<span>保存</span></button>' +
        '<button type="button" class="btn btn--primary btn--sm" data-act="publish">' +
          icon('send', 16) + '<span>发布</span></button>' +
      '</header>'
    )
  }

  function outlineItemMarkup(designer, question, index) {
    const selected = designer.selectedId === question.id
    return (
      '<div class="adm-outline__item' + (selected ? ' is-active' : '') +
        '" role="button" tabindex="0" draggable="true" data-act="select-question" data-qid="' + esc(question.id) +
        '" aria-pressed="' + selected + '" aria-label="第 ' + (index + 1) + ' 题：' + esc(question.title) + '">' +
        '<span class="adm-outline__no tnum">' + pad2(index + 1) + '</span>' +
        '<div class="adm-outline__main">' +
          '<div class="adm-outline__title">' + esc(question.title || '未命名题目') + '</div>' +
          '<div class="adm-outline__meta">' +
            (question.required ? '<span class="adm-outline__reqdot" title="必答"></span>' : '') +
            '<span>' + esc(typeLabel(question.type)) + '</span>' +
            (hasOptions(question.type) && question.options
              ? '<span>· ' + question.options.length + ' 项</span>'
              : '') +
            (question.points ? '<span>· ' + question.points + ' 分</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="adm-outline__acts">' +
          '<button type="button" class="adm-iconbtn" data-act="move-up" data-qid="' + esc(question.id) +
            '" aria-label="上移第 ' + (index + 1) + ' 题"' + (index === 0 ? ' disabled' : '') + '>' +
            icon('arrow-up', 14) + '</button>' +
          '<button type="button" class="adm-iconbtn" data-act="move-down" data-qid="' + esc(question.id) +
            '" aria-label="下移第 ' + (index + 1) + ' 题"' + (index === designer.items.length - 1 ? ' disabled' : '') + '>' +
            icon('arrow-down', 14) + '</button>' +
        '</div>' +
      '</div>'
    )
  }

  function outlineMarkup(designer) {
    if (!designer.items.length) {
      return '<p class="adm-props__hint" style="padding:var(--sp-3) var(--sp-2)">还没有题目，点下方「添加题目」开始。</p>'
    }
    return designer.items.map((question, index) => outlineItemMarkup(designer, question, index)).join('')
  }

  function staticQuestionPreview(question) {
    if (hasOptions(question.type)) {
      const options = Array.isArray(question.options) ? question.options : []
      if (!options.length) return '<p class="adm-props__hint">尚未添加选项</p>'
      const boxed = question.type === 'checkbox'
      return options
        .map((option) =>
          '<div class="adm-optline">' +
            '<span class="adm-optline__mark' + (boxed ? ' adm-optline__mark--box' : '') + '" aria-hidden="true"></span>' +
            '<span class="adm-optline__text">' + esc(option) + '</span>' +
          '</div>',
        )
        .join('')
    }
    if (question.type === 'text') {
      return '<div class="adm-blankline">' + esc(question.placeholder || '') + '</div>'
    }
    if (question.type === 'textarea') {
      return (
        '<div class="adm-blankline">' + esc(question.placeholder || '') + '</div>' +
        '<div class="adm-blankline adm-blankline--short"></div>'
      )
    }
    if (question.type === 'number') {
      return '<div class="adm-siminput">' + esc(question.placeholder || '输入数字') + '</div>'
    }
    if (question.type === 'date') {
      return '<div class="adm-siminput">' + icon('calendar', 16) + '<span>选择日期</span></div>'
    }
    if (question.type === 'address') {
      return '<div class="adm-siminput">' + icon('pin', 16) + '<span>省 / 市 / 区</span></div>'
    }
    if (question.type === 'image') {
      return '<div class="adm-uploadtile">' + icon('image', 16) + '<span>上传照片</span></div>'
    }
    return '<div class="adm-blankline"></div>'
  }

  function correctText(question) {
    if (!question.correct) return ''
    return Array.isArray(question.correct) ? question.correct.join('、') : String(question.correct)
  }

  function paperQuestionMarkup(designer, question, index) {
    const selected = designer.selectedId === question.id
    return (
      '<article class="adm-qcard' + (selected ? ' is-active' : '') +
        '" role="button" tabindex="0" data-act="select-question" data-qid="' + esc(question.id) +
        '" aria-pressed="' + selected + '" aria-label="第 ' + (index + 1) + ' 题：' + esc(question.title) + '">' +
        '<div class="adm-qcard__head">' +
          '<span class="adm-qcard__no tnum">' + pad2(index + 1) + '</span>' +
          '<h3 class="adm-qcard__title">' + esc(question.title || '未命名题目') +
            (question.required ? '<span class="adm-qcard__req" aria-label="必答">*</span>' : '') +
          '</h3>' +
          '<span class="adm-qcard__type">' + esc(typeLabel(question.type)) + '</span>' +
        '</div>' +
        '<div class="adm-qcard__body">' + staticQuestionPreview(question) + '</div>' +
        (question.points || correctText(question)
          ? '<div class="adm-qcard__foot">' +
              (question.points ? '<span>计分 ' + question.points + ' 分</span>' : '') +
              (correctText(question) ? '<span>· 正确答案 ' + esc(correctText(question)) + '</span>' : '') +
            '</div>'
          : '') +
      '</article>'
    )
  }

  function paperMarkup(ctx) {
    const designer = ensureStudio(ctx)
    const activity = currentActivity(ctx)
    const surveySelected = !designer.selectedId
    const number = activity && activity.no ? activity.no : '未编号'
    return (
      '<section class="adm-paper__cover' + (surveySelected ? ' is-active' : '') +
        '" role="button" tabindex="0" data-act="select-survey" aria-pressed="' + surveySelected + '">' +
        '<div class="adm-paper__eyebrow">' +
          '<span>' + esc(number) + '</span>' +
          '<span aria-hidden="true">·</span>' +
          '<span>截止 ' + esc(designer.deadline) + '</span>' +
          '<span aria-hidden="true">·</span>' +
          '<span>共 ' + designer.items.length + ' 题</span>' +
        '</div>' +
        '<h2 class="adm-paper__title">' + esc(designer.title) + '</h2>' +
        '<p class="adm-paper__sub">' + esc(designer.desc || '—') + '</p>' +
        (designer.intro ? '<p class="adm-paper__intro">' + esc(designer.intro) + '</p>' : '') +
        '<div class="adm-paper__rule"></div>' +
      '</section>' +
      '<div class="adm-paper__list">' +
        designer.items.map((question, index) => paperQuestionMarkup(designer, question, index)).join('') +
      '</div>' +
      '<div class="adm-paper__foot">共 ' + designer.items.length + ' 题 · 保存后同步到列表</div>'
    )
  }

  function optionsEditMarkup(question) {
    const options = Array.isArray(question.options) ? question.options : []
    if (!options.length) {
      return (
        '<p class="adm-props__hint">还没有选项，至少添加一个再发布。</p>' +
        '<button type="button" class="adm-addopt" data-act="add-option">' +
          icon('plus', 14) + '<span>添加选项</span></button>'
      )
    }
    return (
      '<div class="adm-optlist">' +
        options.map((option, index) =>
          '<div class="adm-opt">' +
            '<span class="adm-opt__no tnum" aria-hidden="true">' + String.fromCharCode(65 + index) + '</span>' +
            '<input class="input" data-bind="opt" data-oi="' + index + '" value="' + esc(option) +
              '" aria-label="选项 ' + (index + 1) + '" autocomplete="off">' +
            '<div class="adm-opt__acts">' +
              '<button type="button" class="adm-iconbtn" data-act="opt-up" data-oi="' + index +
                '" aria-label="上移选项 ' + (index + 1) + '"' + (index === 0 ? ' disabled' : '') + '>' +
                icon('arrow-up', 13) + '</button>' +
              '<button type="button" class="adm-iconbtn" data-act="opt-down" data-oi="' + index +
                '" aria-label="下移选项 ' + (index + 1) + '"' + (index === options.length - 1 ? ' disabled' : '') + '>' +
                icon('arrow-down', 13) + '</button>' +
              '<button type="button" class="adm-iconbtn adm-iconbtn--danger" data-act="opt-del" data-oi="' + index +
                '" aria-label="删除选项 ' + (index + 1) + '">' + icon('close', 13) + '</button>' +
            '</div>' +
          '</div>',
        ).join('') +
      '</div>' +
      '<button type="button" class="adm-addopt" data-act="add-option">' +
        icon('plus', 14) + '<span>添加选项</span></button>'
    )
  }

  function questionPropsMarkup(ctx, designer, question) {
    const index = designer.items.indexOf(question)
    return (
      '<div class="adm-props__head">' +
        '<span class="adm-props__title">题目属性</span>' +
        '<span class="adm-props__index">第 ' + (index + 1) + ' / ' + designer.items.length + ' 题</span>' +
      '</div>' +
      '<div class="adm-props__body">' +
        '<div class="field">' +
          '<label class="field__label" for="adm-q-type">题型</label>' +
          '<select class="select" id="adm-q-type" data-bind="q-type">' +
            TYPES.map((type) =>
              '<option value="' + type.value + '"' + (question.type === type.value ? ' selected' : '') + '>' +
                type.label + '</option>',
            ).join('') +
          '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="adm-q-title">题目</label>' +
          '<textarea class="textarea" id="adm-q-title" rows="2" data-bind="q-title">' + esc(question.title) + '</textarea>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="adm-q-desc">说明</label>' +
          '<input class="input" id="adm-q-desc" data-bind="q-desc" value="' + esc(question.desc || '') +
            '" placeholder="补充说明（选填）" autocomplete="off">' +
        '</div>' +
        '<div class="adm-switchrow">' +
          '<div class="adm-switchrow__text">' +
            '<span class="adm-switchrow__label">必答</span>' +
            '<span class="adm-switchrow__hint">不答无法提交</span>' +
          '</div>' +
          '<label class="switch"><input type="checkbox" data-bind="q-required"' +
            (question.required ? ' checked' : '') + '><span class="switch__track"></span></label>' +
        '</div>' +
        (hasScore(question.type)
          ? '<div class="adm-switchrow">' +
              '<div class="adm-switchrow__text">' +
                '<span class="adm-switchrow__label">计分</span>' +
                '<span class="adm-switchrow__hint">用于结果计算</span>' +
              '</div>' +
              '<label class="switch"><input type="checkbox" data-bind="q-points-on"' +
                (question.points ? ' checked' : '') + '><span class="switch__track"></span></label>' +
            '</div>' +
            (question.points
              ? '<div class="adm-points">' +
                  '<input class="input" type="number" min="0" step="1" data-bind="q-points" value="' +
                    Number(question.points) + '" aria-label="本题分值">' +
                  '<span class="adm-points__unit">分</span>' +
                '</div>'
              : '')
          : '') +
        (hasOptions(question.type)
          ? '<div class="adm-props__section">' +
              '<span class="adm-props__section-title">选项</span>' +
              '<span class="adm-props__section-count">' +
                (Array.isArray(question.options) ? question.options.length : 0) + ' 项</span>' +
            '</div>' +
            optionsEditMarkup(question)
          : '<p class="adm-props__hint">' + esc(typeLabel(question.type)) + '题不需要选项。</p>') +
        '<div class="adm-props__danger">' +
          '<button type="button" class="adm-dangerbtn" data-act="delete-question">' +
            icon('trash', 16) + '<span>删除题目</span></button>' +
        '</div>' +
      '</div>'
    )
  }

  function surveyPropsMarkup(ctx, designer) {
    const activity = currentActivity(ctx)
    return (
      '<div class="adm-props__head">' +
        '<span class="adm-props__title">问卷信息</span>' +
        '<span class="adm-props__index">' + designer.items.length + ' 题</span>' +
      '</div>' +
      '<div class="adm-props__body">' +
        '<div class="field">' +
          '<label class="field__label" for="adm-info-title">问卷名称</label>' +
          '<input class="input" id="adm-info-title" data-bind="info-title" value="' + esc(designer.title) + '" autocomplete="off">' +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="adm-info-desc">副标题</label>' +
          '<input class="input" id="adm-info-desc" data-bind="info-desc" value="' + esc(designer.desc || '') +
            '" placeholder="例如：2026 年度 · 园区员工体验调研" autocomplete="off">' +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="adm-info-intro">问卷说明</label>' +
          '<textarea class="textarea" id="adm-info-intro" rows="4" data-bind="info-intro">' + esc(designer.intro || '') + '</textarea>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="adm-info-deadline">截止日期</label>' +
          '<input class="input" id="adm-info-deadline" type="date" data-bind="info-deadline" value="' + esc(designer.deadline) + '">' +
        '</div>' +
        '<div class="adm-metalist">' +
          '<div class="adm-metalist__row"><span>活动编号</span><b>' + esc(activity ? activity.no : '未编号') + '</b></div>' +
          '<div class="adm-metalist__row"><span>当前状态</span><b>' + esc(activity ? activity.status : '未开始') + '</b></div>' +
          '<div class="adm-metalist__row"><span>已回收</span><b>' + fmt(activity ? activity.replies : 0) + ' 份</b></div>' +
          '<div class="adm-metalist__row"><span>最近更新</span><b>' + esc(activity ? activity.updatedAt : '—') + '</b></div>' +
        '</div>' +
      '</div>'
    )
  }

  function propsMarkup(ctx) {
    const designer = ensureStudio(ctx)
    const question = studioQuestion(designer)
    if (!question) return surveyPropsMarkup(ctx, designer)
    return questionPropsMarkup(ctx, designer, question)
  }

  function renderDesigner(ctx) {
    ensureAdminState(ctx)
    const designer = ensureStudio(ctx)
    return (
      '<div class="adm adm--fill adm--designer dense">' +
        designerNameMarkup(designer, currentActivity(ctx)) +
        '<div class="adm-designer">' +
          '<aside class="adm-outline">' +
            '<div class="adm-outline__head">' +
              '<span class="adm-outline__label">题目</span>' +
              '<span class="adm-outline__count tnum" data-ref="outline-count">' + designer.items.length + '</span>' +
            '</div>' +
            '<div class="adm-outline__list" data-ref="outline" role="group" aria-label="题目列表">' +
              outlineMarkup(designer) +
            '</div>' +
            '<div class="adm-outline__foot">' +
              '<button type="button" class="adm-addbtn" data-act="add-question">' +
                icon('plus', 16) + '<span>添加题目</span></button>' +
              '<button type="button" class="adm-addbtn adm-addbtn--quiet' +
                (designer.selectedId ? '' : ' is-active') + '" data-act="select-survey">' +
                icon('edit', 16) + '<span>问卷信息</span></button>' +
            '</div>' +
          '</aside>' +
          '<main class="adm-canvas">' +
            '<div class="adm-paper" data-ref="paper">' + paperMarkup(ctx) + '</div>' +
          '</main>' +
          '<aside class="adm-props" data-ref="props">' + propsMarkup(ctx) + '</aside>' +
        '</div>' +
      '</div>'
    )
  }

  function previewCoverMarkup(ctx, designer) {
    const activity = currentActivity(ctx)
    return (
      '<div class="adm-pv__cover">' +
        '<div class="adm-pv__eyebrow">' + esc(designer.title) + ' · ' + designer.items.length + ' 题</div>' +
        '<h2 class="adm-pv__title">' + esc(designer.title) + '</h2>' +
        (designer.desc ? '<p class="adm-pv__sub">' + esc(designer.desc) + '</p>' : '') +
        (designer.intro ? '<p class="adm-pv__intro">' + esc(designer.intro) + '</p>' : '') +
        '<div class="adm-pv__meta">' +
          '<span class="tag tag--muted"><span class="tag__dot"></span>匿名作答</span>' +
          '<span>截止 ' + esc(designer.deadline) + '</span>' +
          '<span>编号 ' + esc(activity ? activity.no : '—') + '</span>' +
        '</div>' +
      '</div>'
    )
  }

  function previewQuestionMarkup(ctx, question, index) {
    const required = question.required
      ? '<span class="adm-qcard__req" aria-label="必答">*</span>'
      : ''
    let body = ''

    if (hasOptions(question.type)) {
      const options = Array.isArray(question.options) ? question.options : []
      const inputType = question.type === 'checkbox' ? 'checkbox' : 'radio'
      body = options.length
        ? '<div class="adm-pv__opts">' +
            options.map((option, oi) =>
              '<label class="adm-pv__opt">' +
                '<input type="' + inputType + '" name="pv-' + esc(question.id) + '" value="' + esc(option) + '"' +
                  (question.type === 'ref' ? ' disabled' : '') + '>' +
                '<span>' + esc(option) + '</span>' +
              '</label>',
            ).join('') +
          '</div>'
        : '<p class="adm-pv__hint" style="padding-left:26px">尚未添加选项</p>'
      if (question.type === 'ref') {
        body += '<p class="adm-pv__hint" style="padding-left:26px">引用题型：选项来自问卷库（预览只展示样式）</p>'
      }
    } else {
      const placeholder = esc(question.placeholder || '')
      let field = ''
      if (question.type === 'text') {
        field = '<input class="input" type="text" placeholder="' + placeholder + '" aria-label="' + esc(question.title) + '">'
      } else if (question.type === 'textarea') {
        field = '<textarea class="textarea" rows="3" maxlength="' +
          (question.maxLength || 500) + '" placeholder="' + placeholder + '" aria-label="' +
          esc(question.title) + '"></textarea>'
      } else if (question.type === 'number') {
        field = '<input class="input" type="number" inputmode="numeric" placeholder="' +
          (placeholder || '请输入数字') + '" aria-label="' + esc(question.title) + '">'
      } else if (question.type === 'date') {
        field = '<input class="input" type="date" aria-label="' + esc(question.title) + '">'
      } else if (question.type === 'address') {
        field = '<div class="adm-pv__fake">' + icon('pin', 16) + '<span>省 / 市 / 区</span></div>'
      } else if (question.type === 'image') {
        field = '<div class="adm-pv__upload">' + icon('image', 18) + '<span>点击上传照片</span></div>'
      } else {
        field = '<input class="input" type="text" aria-label="' + esc(question.title) + '">'
      }
      body = '<div class="adm-pv__field">' + field + '</div>'
    }

    return (
      '<section class="adm-pv__q">' +
        '<div class="adm-pv__qhead">' +
          '<span class="adm-pv__no tnum">' + pad2(index + 1) + '</span>' +
          '<h3 class="adm-pv__qtitle">' + esc(question.title) + required + '</h3>' +
        '</div>' +
        (question.desc ? '<p class="adm-pv__hint" style="padding-left:26px">' + esc(question.desc) + '</p>' : '') +
        body +
      '</section>'
    )
  }

  function openPreview(ctx, root) {
    const designer = ensureStudio(ctx)
    if (!designer.items.length) {
      ctx.toast('还没有题目，先添加题目再预览', 'warn')
      return
    }
    const dialog = openDialog(root, {
      title: '手机预览',
      sub: '宽度 360 · 内部可滚动 · 预览不产生数据',
      className: 'adm-dialog--preview',
      body:
        '<div class="adm-preview">' +
          '<div class="adm-phone" role="document" aria-label="问卷手机预览">' +
            '<div class="adm-phone__head">' +
              '<span>园区问卷 · 预览</span>' +
              '<span>' + designer.items.length + ' 题</span>' +
            '</div>' +
            '<div class="adm-phone__scroll">' +
              previewCoverMarkup(ctx, designer) +
              designer.items.map((question, index) => previewQuestionMarkup(ctx, question, index)).join('') +
            '</div>' +
            '<div class="adm-phone__foot">预览模式 · 提交不会写入数据</div>' +
          '</div>' +
        '</div>',
      foot: '<button type="button" class="btn btn--ghost" data-dialog-close>关闭预览</button>',
      focus: '[data-dialog-close]',
    })
    void dialog
  }

  function mountDesigner(root, ctx) {
    ensureAdminState(ctx)
    let designer = ensureStudio(ctx)

    const paperEl = root.querySelector('[data-ref="paper"]')
    const outlineList = root.querySelector('[data-ref="outline"]')
    const outlineCount = root.querySelector('[data-ref="outline-count"]')
    const propsEl = root.querySelector('[data-ref="props"]')
    const dirtyEl = root.querySelector('[data-ref="dirty"]')
    const nameInput = root.querySelector('[data-bind="designer-title"]')
    const surveyButton = root.querySelector('[data-act="select-survey"]')

    let dragId = null

    function refreshPaper() {
      if (paperEl) paperEl.innerHTML = paperMarkup(ctx)
    }

    function refreshOutline() {
      if (outlineList) outlineList.innerHTML = outlineMarkup(designer)
      if (outlineCount) outlineCount.textContent = String(designer.items.length)
      if (surveyButton) surveyButton.classList.toggle('is-active', !designer.selectedId)
    }

    function refreshProps() {
      if (propsEl) propsEl.innerHTML = propsMarkup(ctx)
    }

    function refreshDirty() {
      if (!dirtyEl) return
      dirtyEl.classList.toggle('is-dirty', designer.dirty)
      dirtyEl.innerHTML =
        '<span class="adm-dirty__dot" aria-hidden="true"></span>' + (designer.dirty ? '未保存' : '已保存')
    }

    function markDirty() {
      designer.dirty = true
      refreshDirty()
    }

    function focusAfter(selector) {
      if (!selector) return
      const node = root.querySelector(selector)
      if (node) node.focus()
    }

    function focusOutlineQuestion(qid) {
      const node = root.querySelector('.adm-outline__item[data-qid="' + qid + '"]')
      if (node) node.focus()
    }

    function selectQuestion(qid) {
      if (!qid || designer.selectedId === qid) return
      designer.selectedId = qid
      refreshOutline()
      refreshPaper()
      refreshProps()
    }

    function selectSurvey() {
      if (!designer.selectedId) return
      designer.selectedId = null
      refreshOutline()
      refreshPaper()
      refreshProps()
    }

    function addQuestion() {
      const question = makeQuestion(designer.items)
      designer.items.push(question)
      designer.selectedId = question.id
      markDirty()
      refreshOutline()
      refreshPaper()
      refreshProps()
      const input = root.querySelector('[data-bind="q-title"]')
      if (input) {
        input.focus()
        input.select()
      }
    }

    async function deleteQuestion() {
      const question = studioQuestion(designer)
      if (!question) return
      const index = designer.items.indexOf(question)
      const ok = await ctx.confirm({
        title: '删除题目',
        body: '「' + (question.title || '未命名题目') + '」将从问卷中移除。',
        confirmText: '删除',
        cancelText: '取消',
        danger: true,
      })
      if (!ok) return
      designer.items.splice(index, 1)
      const next = designer.items[index] || designer.items[index - 1] || null
      designer.selectedId = next ? next.id : null
      markDirty()
      refreshOutline()
      refreshPaper()
      refreshProps()
      ctx.toast('已删除题目')
    }

    function moveQuestion(qid, direction) {
      const from = designer.items.findIndex((item) => item.id === qid)
      const to = from + direction
      if (from < 0 || to < 0 || to >= designer.items.length) return
      const moved = designer.items.splice(from, 1)[0]
      designer.items.splice(to, 0, moved)
      markDirty()
      refreshOutline()
      refreshPaper()
      focusOutlineQuestion(qid)
    }

    function saveDesigner(opts) {
      const options = opts || {}
      const activity = currentActivity(ctx)
      designer.title = designer.title.trim() || '未命名问卷'
      if (nameInput && nameInput.value !== designer.title) nameInput.value = designer.title
      if (activity) {
        activity.title = designer.title
        activity.desc = designer.desc
        activity.deadline = designer.deadline
        activity.items = designer.items.length
        activity.updatedAt = stampShort()
      }
      const survey = ctx.state.survey
      if (survey && activity && survey.no === activity.no) {
        survey.title = designer.title
        survey.subtitle = designer.desc
        survey.intro = designer.intro
        survey.deadline = designer.deadline
        survey.questions = clone(designer.items)
      }
      designer.dirty = false
      ctx.save()
      refreshDirty()
      if (!options.silent) ctx.toast(options.text || '已保存', 'ok')
    }

    function publishDesigner() {
      if (!designer.items.length) {
        ctx.toast('至少添加一道题再发布', 'warn')
        return
      }
      saveDesigner({ silent: true })
      const activity = currentActivity(ctx)
      if (activity) {
        activity.status = '进行中'
        activity.updatedAt = stampShort()
      }
      ctx.save()
      refreshDirty()
      ctx.toast('已发布，问卷进入进行中', 'ok')
    }

    function discardAndLeave() {
      const activity = currentActivity(ctx)
      ctx.state.designer = buildDesigner(ctx, activity)
      ctx.save()
      closeDialog()
      ctx.go('list')
    }

    async function leave() {
      if (!designer.dirty) {
        closeDialog()
        ctx.go('list')
        return
      }
      const ok = await ctx.confirm({
        title: '放弃未保存的修改？',
        body: '设计器里还有未保存的改动，离开后将丢失。',
        confirmText: '放弃修改',
        cancelText: '继续编辑',
        danger: true,
      })
      if (!ok) return
      discardAndLeave()
    }

    function addOption() {
      const question = studioQuestion(designer)
      if (!question || !hasOptions(question.type)) return
      if (!Array.isArray(question.options)) question.options = []
      const option = '选项 ' + (question.options.length + 1)
      question.options.push(option)
      markDirty()
      refreshPaper()
      refreshProps()
      const list = root.querySelectorAll('[data-bind="opt"]')
      const last = list[list.length - 1]
      if (last) {
        last.focus()
        last.select()
      }
    }

    function moveOption(index, direction) {
      const question = studioQuestion(designer)
      if (!question || !Array.isArray(question.options)) return
      const to = index + direction
      if (to < 0 || to >= question.options.length) return
      const moved = question.options.splice(index, 1)[0]
      question.options.splice(to, 0, moved)
      markDirty()
      refreshPaper()
      refreshProps()
      const buttons = root.querySelectorAll('[data-act="opt-' + (direction < 0 ? 'up' : 'down') + '"]')
      const target = buttons[Math.min(to, buttons.length - 1)]
      if (target) target.focus()
    }

    function deleteOption(index) {
      const question = studioQuestion(designer)
      if (!question || !Array.isArray(question.options)) return
      const removed = question.options[index]
      question.options.splice(index, 1)
      if (question.correct) {
        if (Array.isArray(question.correct)) {
          question.correct = question.correct.filter((value) => value !== removed)
          if (!question.correct.length) delete question.correct
        } else if (question.correct === removed) {
          delete question.correct
        }
      }
      markDirty()
      refreshPaper()
      refreshProps()
      const next = root.querySelectorAll('[data-bind="opt"]')[Math.min(index, question.options.length - 1)]
      if (next) next.focus()
    }

    function syncSurveyTitleInto(name, value) {
      designer.title = value
      if (nameInput && nameInput !== document.activeElement) nameInput.value = value
      const infoTitle = root.querySelector('[data-bind="info-title"]')
      if (infoTitle && infoTitle !== document.activeElement) infoTitle.value = value
    }

    function onBind(input) {
      const bind = input.getAttribute('data-bind')
      const question = studioQuestion(designer)
      switch (bind) {
        case 'designer-title':
          syncSurveyTitleInto(nameInput, input.value)
          markDirty()
          refreshPaper()
          break
        case 'info-title':
          designer.title = input.value
          if (nameInput) nameInput.value = input.value
          markDirty()
          refreshPaper()
          break
        case 'info-desc':
          designer.desc = input.value
          markDirty()
          refreshPaper()
          break
        case 'info-intro':
          designer.intro = input.value
          markDirty()
          refreshPaper()
          break
        case 'info-deadline':
          designer.deadline = input.value
          markDirty()
          refreshPaper()
          break
        case 'q-title':
          if (!question) return
          question.title = input.value
          markDirty()
          refreshPaper()
          refreshOutline()
          break
        case 'q-desc':
          if (!question) return
          question.desc = input.value
          markDirty()
          refreshPaper()
          break
        case 'q-type':
          if (!question) return
          question.type = input.value
          normalizeQuestionType(question)
          markDirty()
          refreshPaper()
          refreshOutline()
          refreshProps()
          focusAfter('[data-bind="q-type"]')
          break
        case 'q-required':
          if (!question) return
          question.required = input.checked
          markDirty()
          refreshPaper()
          refreshOutline()
          break
        case 'q-points-on':
          if (!question) return
          if (input.checked) {
            question.points = question.points || 10
          } else {
            delete question.points
            delete question.correct
          }
          markDirty()
          refreshPaper()
          refreshOutline()
          refreshProps()
          focusAfter(input.checked ? '[data-bind="q-points"]' : '[data-bind="q-points-on"]')
          break
        case 'q-points':
          if (!question) return
          question.points = Math.max(0, Number(input.value) || 0)
          markDirty()
          refreshPaper()
          refreshOutline()
          break
        case 'opt': {
          if (!question || !Array.isArray(question.options)) return
          const index = Number(input.getAttribute('data-oi'))
          if (!Number.isFinite(index)) return
          question.options[index] = input.value
          markDirty()
          refreshPaper()
          break
        }
        default:
          break
      }
    }

    function onInput(event) {
      const input = event.target.closest('[data-bind]')
      if (!input || !root.contains(input)) return
      if (input.getAttribute('data-bind') === 'q-type') return
      onBind(input)
    }

    function onSelectChange(event) {
      const input = event.target.closest('[data-bind]')
      if (!input || !root.contains(input)) return
      const bind = input.getAttribute('data-bind')
      if (bind === 'q-type' || bind === 'q-required' || bind === 'q-points-on') onBind(input)
    }

    function onKeyDown(event) {
      const item = event.target.closest('.adm-outline__item')
      if (item && root.contains(item)) {
        const qid = item.getAttribute('data-qid')
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectQuestion(qid)
          focusOutlineQuestion(qid)
          return
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          if (event.altKey) {
            event.preventDefault()
            moveQuestion(qid, event.key === 'ArrowUp' ? -1 : 1)
            return
          }
          event.preventDefault()
          const items = Array.from(root.querySelectorAll('.adm-outline__item'))
          const index = items.indexOf(item)
          const next = items[index + (event.key === 'ArrowUp' ? -1 : 1)]
          if (next) {
            selectQuestion(next.getAttribute('data-qid'))
            next.focus()
          }
          return
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
          if (designer.selectedId === qid) {
            event.preventDefault()
            selectQuestion(qid)
            deleteQuestion()
          }
        }
        return
      }

      const card = event.target.closest('.adm-qcard, .adm-paper__cover')
      if (card && root.contains(card)) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          if (card.classList.contains('adm-paper__cover')) selectSurvey()
          else selectQuestion(card.getAttribute('data-qid'))
        }
      }
    }

    function onDragStart(event) {
      const item = event.target.closest('.adm-outline__item')
      if (!item) return
      dragId = item.getAttribute('data-qid')
      item.classList.add('is-dragging')
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', dragId)
      }
    }

    function onDragOver(event) {
      if (!dragId) return
      const item = event.target.closest('.adm-outline__item')
      if (!item || item.getAttribute('data-qid') === dragId) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      root.querySelectorAll('.adm-outline__item.is-drop').forEach((node) => node.classList.remove('is-drop'))
      item.classList.add('is-drop')
    }

    function onDrop(event) {
      if (!dragId) return
      const item = event.target.closest('.adm-outline__item')
      const targetId = item ? item.getAttribute('data-qid') : null
      root.querySelectorAll('.adm-outline__item.is-drop').forEach((node) => node.classList.remove('is-drop'))
      const draggingId = dragId
      dragId = null
      if (!targetId || targetId === draggingId) return
      event.preventDefault()
      const from = designer.items.findIndex((question) => question.id === draggingId)
      let to = designer.items.findIndex((question) => question.id === targetId)
      if (from < 0 || to < 0) return
      if (from < to) to -= 1
      const moved = designer.items.splice(from, 1)[0]
      designer.items.splice(to, 0, moved)
      markDirty()
      refreshOutline()
      refreshPaper()
      focusOutlineQuestion(draggingId)
    }

    function onDragEnd() {
      dragId = null
      root.querySelectorAll('.adm-outline__item').forEach((node) => {
        node.classList.remove('is-dragging')
        node.classList.remove('is-drop')
      })
    }

    const onClick = (event) => {
      const cover = event.target.closest('.adm-paper__cover')
      if (cover && root.contains(cover)) {
        selectSurvey()
        return
      }
      const node = event.target.closest('[data-act]')
      if (!node || !root.contains(node)) return
      const act = node.getAttribute('data-act')
      const qid = node.getAttribute('data-qid')
      switch (act) {
        case 'back':
          leave()
          break
        case 'preview':
          openPreview(ctx, root)
          break
        case 'save':
          saveDesigner()
          break
        case 'publish':
          publishDesigner()
          break
        case 'add-question':
          addQuestion()
          break
        case 'select-question':
          selectQuestion(qid)
          break
        case 'select-survey':
          selectSurvey()
          break
        case 'move-up':
          moveQuestion(qid, -1)
          break
        case 'move-down':
          moveQuestion(qid, 1)
          break
        case 'delete-question':
          deleteQuestion()
          break
        case 'add-option':
          addOption()
          break
        case 'opt-up':
          moveOption(Number(node.getAttribute('data-oi')), -1)
          break
        case 'opt-down':
          moveOption(Number(node.getAttribute('data-oi')), 1)
          break
        case 'opt-del':
          deleteOption(Number(node.getAttribute('data-oi')))
          break
        default:
          break
      }
    }

    const onBeforeUnload = (event) => {
      if (!designer.dirty) return
      event.preventDefault()
      event.returnValue = ''
    }

    root.addEventListener('click', onClick)
    root.addEventListener('input', onInput)
    root.addEventListener('change', onSelectChange)
    root.addEventListener('keydown', onKeyDown)
    root.addEventListener('dragstart', onDragStart)
    root.addEventListener('dragover', onDragOver)
    root.addEventListener('drop', onDrop)
    root.addEventListener('dragend', onDragEnd)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      root.removeEventListener('click', onClick)
      root.removeEventListener('input', onInput)
      root.removeEventListener('change', onSelectChange)
      root.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('dragstart', onDragStart)
      root.removeEventListener('dragover', onDragOver)
      root.removeEventListener('drop', onDrop)
      root.removeEventListener('dragend', onDragEnd)
      window.removeEventListener('beforeunload', onBeforeUnload)
      closeDialog()
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     屏 4 · 桌面登录
     ═══════════════════════════════════════════════════════════════════════════ */

  function loginBrandMarkup() {
    return (
      '<div class="adm-login__brand">' +
        '<div class="adm-login__brandhead">' +
          '<span class="adm-login__mark" aria-hidden="true">问</span>' +
          '<div>' +
            '<div class="adm-login__wordmark">园区问卷</div>' +
            '<div class="adm-login__brandsub">健康与体验调研</div>' +
          '</div>' +
        '</div>' +
        '<div class="adm-login__brandbody">' +
          '<p class="adm-login__claim display">好的问卷，<br>从清晰的问题开始。</p>' +
          '<div class="adm-login__rule" aria-hidden="true"></div>' +
          '<div class="adm-login__brandmeta">2026 年度 · 园区员工体验调研</div>' +
          '<div class="adm-specimen" aria-hidden="true">' +
            '<div class="adm-specimen__eyebrow">员工满意度调查 · 示例</div>' +
            '<div class="adm-specimen__q">你所在的部门</div>' +
            '<div class="adm-specimen__opts">' +
              ['技术部', '产品部', '市场部', '职能部']
                .map((text) =>
                  '<span class="adm-specimen__opt">' +
                    '<span class="adm-specimen__mark"></span>' + text + '</span>',
                )
                .join('') +
            '</div>' +
            '<div class="adm-specimen__rule"></div>' +
            '<div class="adm-specimen__foot">匿名作答 · 仅用于整体分析</div>' +
          '</div>' +
        '</div>' +
        '<div class="adm-login__brandfoot">' +
          '<span>© 2026 园区服务中心</span>' +
          '<span>内部系统 · 请勿外传</span>' +
        '</div>' +
      '</div>'
    )
  }

  function renderLogin(ctx) {
    ensureAdminState(ctx)
    const session = ctx.state.session || {}
    return (
      '<div class="adm adm--login">' +
        '<section class="adm-login">' +
          loginBrandMarkup() +
          '<div class="adm-login__form">' +
            '<div class="adm-login__forminner" data-ref="forminner">' +
              '<div class="adm-login__eyebrow">管理端</div>' +
              '<h1 class="adm-login__title">登录园区问卷</h1>' +
              '<p class="adm-login__sub">使用组织账号登录，管理问卷与回收数据。</p>' +
              (session.loggedIn
                ? '<div class="adm-login__notice">' +
                    '<span>当前已登录 <b>' + esc(session.name || '') + ' · ' + esc(session.dept || '') + '</b></span>' +
                    '<button type="button" class="adm-login__link" data-act="enter">进入问卷列表</button>' +
                  '</div>'
                : '') +
              '<form class="adm-login__fields" novalidate>' +
                '<div class="field" data-field="account">' +
                  '<label class="field__label" for="adm-login-account">账号</label>' +
                  '<input class="input" id="adm-login-account" data-login="account" placeholder="工号或手机号" ' +
                    'autocomplete="username" aria-describedby="adm-login-error">' +
                '</div>' +
                '<div class="field" data-field="password">' +
                  '<label class="field__label" for="adm-login-password">密码</label>' +
                  '<div class="adm-login__pw">' +
                    '<input class="input" id="adm-login-password" type="password" data-login="password" ' +
                      'placeholder="请输入密码" autocomplete="current-password" aria-describedby="adm-login-error">' +
                    '<button type="button" class="adm-login__eye" data-act="toggle-password" aria-label="显示密码">' +
                      icon('eye', 18) + '</button>' +
                  '</div>' +
                '</div>' +
                '<div class="adm-login__row">' +
                  '<label class="switch"><input type="checkbox" data-login="remember" checked>' +
                    '<span class="switch__track"></span><span class="switch__text">记住我</span></label>' +
                  '<button type="button" class="adm-login__forgot" data-act="forgot">忘记密码</button>' +
                '</div>' +
                '<div class="adm-login__error" id="adm-login-error" data-ref="error" role="alert" hidden>' +
                  '<span data-ref="error-text"></span>' +
                '</div>' +
                '<button type="submit" class="btn btn--primary adm-login__submit" data-ref="submit">登录</button>' +
              '</form>' +
              '<div class="adm-login__hint">' +
                '演示账号 <b>admin</b> · 密码 <b>123456</b><br>' +
                '忘记密码请联系园区服务中心（内线 8100）。' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</div>'
    )
  }

  function mountLogin(root, ctx) {
    ensureAdminState(ctx)
    const form = root.querySelector('.adm-login__fields')
    const account = root.querySelector('[data-login="account"]')
    const password = root.querySelector('[data-login="password"]')
    const remember = root.querySelector('[data-login="remember"]')
    const submitBtn = root.querySelector('[data-ref="submit"]')
    const errorEl = root.querySelector('[data-ref="error"]')
    const errorText = root.querySelector('[data-ref="error-text"]')
    const fieldAccount = root.querySelector('[data-field="account"]')
    const fieldPassword = root.querySelector('[data-field="password"]')
    const formInner = root.querySelector('[data-ref="forminner"]')
    const eyeBtn = root.querySelector('[data-act="toggle-password"]')

    let timer = null

    function showError(message) {
      if (errorEl) errorEl.hidden = false
      if (errorText) errorText.textContent = message
      fieldAccount.classList.add('is-invalid')
      fieldPassword.classList.add('is-invalid')
      account.setAttribute('aria-invalid', 'true')
      password.setAttribute('aria-invalid', 'true')
      if (formInner) {
        formInner.classList.remove('is-shake')
        void formInner.offsetWidth
        formInner.classList.add('is-shake')
      }
    }

    function clearError() {
      if (errorEl) errorEl.hidden = true
      if (errorText) errorText.textContent = ''
      fieldAccount.classList.remove('is-invalid')
      fieldPassword.classList.remove('is-invalid')
      account.removeAttribute('aria-invalid')
      password.removeAttribute('aria-invalid')
    }

    function submit() {
      const accountValue = account.value.trim()
      const passwordValue = password.value
      if (!accountValue || !passwordValue) {
        showError('请输入账号和密码')
        ;(accountValue ? password : account).focus()
        return
      }
      if (accountValue !== 'admin' || passwordValue !== '123456') {
        showError('账号或密码不正确，请重试')
        password.focus()
        password.select()
        return
      }
      clearError()
      submitBtn.disabled = true
      submitBtn.textContent = '正在登录…'
      const session = ctx.state.session
      session.loggedIn = true
      session.name = '林一舟'
      session.dept = '技术部'
      session.remember = !!(remember && remember.checked)
      ctx.save()
      timer = window.setTimeout(() => {
        ctx.toast('欢迎回来，林一舟', 'ok')
        ctx.go('list')
      }, 420)
    }

    function onFormSubmit(event) {
      event.preventDefault()
      submit()
    }

    function onEye() {
      const visible = password.type === 'text'
      password.type = visible ? 'password' : 'text'
      eyeBtn.innerHTML = icon(visible ? 'eye' : 'eye-off', 18)
      eyeBtn.setAttribute('aria-label', visible ? '显示密码' : '隐藏密码')
      password.focus()
    }

    function onKeyDown(event) {
      if (event.key !== 'Enter') return
      if (event.target === account || event.target === password) {
        event.preventDefault()
        submit()
      }
    }

    const onClick = (event) => {
      const node = event.target.closest('[data-act]')
      if (!node || !root.contains(node)) return
      const act = node.getAttribute('data-act')
      if (act === 'toggle-password') onEye()
      else if (act === 'forgot') ctx.toast('请联系园区服务中心 · 内线 8100 重置密码', 'info')
      else if (act === 'enter') ctx.go('list')
    }

    form.addEventListener('submit', onFormSubmit)
    account.addEventListener('keydown', onKeyDown)
    password.addEventListener('keydown', onKeyDown)
    root.addEventListener('click', onClick)
    account.addEventListener('input', clearError)
    password.addEventListener('input', clearError)

    return () => {
      if (timer) window.clearTimeout(timer)
      form.removeEventListener('submit', onFormSubmit)
      account.removeEventListener('keydown', onKeyDown)
      password.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('click', onClick)
      account.removeEventListener('input', clearError)
      password.removeEventListener('input', clearError)
    }
  }

  /* ── 注册 ───────────────────────────────────────────────────────────────── */

  Proto.register('list', {
    group: 'admin',
    label: '问卷列表',
    note: '搜索真实过滤、状态分段、分页、行内操作、新建与删除',
    render: renderList,
    mount: mountList,
  })

  Proto.register('list-loading', {
    group: 'admin',
    label: '列表加载',
    note: '首屏骨架：保留表头与页头结构，内容以骨架占位',
    render: renderListLoading,
  })

  Proto.register('designer', {
    group: 'admin',
    label: '可视化设计器',
    note: '三栏编辑：目录 / 纸面 / 属性，右侧改动实时反映到纸面',
    render: renderDesigner,
    mount: mountDesigner,
  })

  Proto.register('login-d', {
    group: 'login',
    label: '桌面登录',
    note: '左右分栏：品牌区 + 表单，含错误态、记住我与明文切换',
    render: renderLogin,
    mount: mountLogin,
  })
})()
