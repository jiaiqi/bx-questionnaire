/* ═══════════════════════════════════════════════════════════════════════════
   V6「清简」· 作答端（8 屏）
   cover / survey / survey-invalid / submit / result / records / couple / login-m
   —— 只通过 window.Proto 注册与交互；文案见 CONTRACT §8。
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict'

  const P = () => window.Proto

  // ── 小工具 ───────────────────────────────────────────────────────────────

  const pad2 = (n) => (n < 10 ? '0' + n : String(n))

  function esc(value) {
    const proto = P()
    if (proto && typeof proto.esc === 'function') return proto.esc(value)
    return String(value == null ? '' : value)
  }

  function nowStamp() {
    const d = new Date()
    return (
      d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    )
  }

  function batchStamp() {
    const d = new Date()
    return (
      'B' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      '-' + pad2(d.getMinutes())
    )
  }

  const reduceMotion = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function scrollBehavior() {
    return reduceMotion() ? 'auto' : 'smooth'
  }

  // ── 示例数据（目录直达时使用）────────────────────────────────────────────

  const DEMO_ANSWERS = { q5: '非常满意', q6: ['团队氛围'] }

  const DEMO_RESULT = {
    score: 10,
    total: 20,
    correct: 1,
    wrong: 1,
    unanswered: 0,
    submittedAt: '2026-10-22 10:32',
    batchNo: 'B20261022-32',
    demo: true,
  }

  const HISTORY = [
    {
      key: 'health',
      title: '2026 年度健康体检自评',
      no: 'ACT202610180002',
      score: 16,
      total: 20,
      correct: 1,
      wrong: 1,
      unanswered: 0,
      submittedAt: '2026-09-18 14:20',
      batchNo: 'B20260918-07',
      dims: ['睡眠', '压力'],
      historical: true,
      customReview: [
        {
          no: '03',
          title: '你平均每晚的睡眠时长',
          mine: '6 小时',
          right: '7–8 小时',
          score: 6,
          points: 10,
          ok: false,
          note: '本题按区间给分。',
        },
        {
          no: '07',
          title: '过去一个月，你感到压力较大的频率',
          mine: '偶尔',
          right: '偶尔',
          score: 10,
          points: 10,
          ok: true,
          note: '',
        },
      ],
    },
    {
      key: 'canteen',
      title: '园区食堂服务满意度',
      no: 'ACT202610120003',
      score: 18,
      total: 20,
      correct: 1,
      wrong: 1,
      unanswered: 0,
      submittedAt: '2026-08-26 11:05',
      batchNo: 'B20260826-02',
      dims: ['口味', '卫生'],
      historical: true,
      customReview: [
        {
          no: '02',
          title: '你对食堂菜品的整体口味评价',
          mine: '满意',
          right: '满意',
          score: 10,
          points: 10,
          ok: true,
          note: '',
        },
        {
          no: '05',
          title: '你对高峰时段排队时长的评价',
          mine: '一般',
          right: '满意',
          score: 8,
          points: 10,
          ok: false,
          note: '本题按区间给分。',
        },
      ],
    },
  ]

  const ADDRESS = {
    江苏省: {
      南京市: ['玄武区', '秦淮区', '鼓楼区', '江宁区'],
      苏州市: ['姑苏区', '工业园区', '吴中区'],
    },
    浙江省: {
      杭州市: ['西湖区', '滨江区', '余杭区'],
      宁波市: ['海曙区', '鄞州区'],
    },
    上海市: {
      上海市: ['黄浦区', '徐汇区', '浦东新区', '静安区'],
    },
    北京市: {
      北京市: ['朝阳区', '海淀区', '西城区', '昌平区'],
    },
    广东省: {
      深圳市: ['南山区', '福田区', '罗湖区'],
      广州市: ['天河区', '越秀区', '海珠区'],
    },
  }

  // ── 作答数据计算 ─────────────────────────────────────────────────────────

  function isAnswered(value) {
    if (value == null) return false
    if (Array.isArray(value)) return value.length > 0
    return String(value).trim() !== ''
  }

  function countAnswered(survey, answers) {
    return survey.questions.filter((q) => isAnswered(answers[q.id])).length
  }

  function missingRequired(survey, answers) {
    return survey.questions.filter((q) => q.required && !isAnswered(answers[q.id]))
  }

  function sameSet(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    const left = a.slice().sort()
    const right = b.slice().sort()
    return left.every((v, i) => v === right[i])
  }

  function computeResult(survey, answers) {
    let score = 0
    let total = 0
    let correct = 0
    let wrong = 0
    let unanswered = 0
    survey.questions.forEach((q) => {
      if (!q.points) return
      total += q.points
      const value = answers[q.id]
      if (!isAnswered(value)) {
        unanswered += 1
        return
      }
      const ok = Array.isArray(q.correct) ? sameSet(value, q.correct) : value === q.correct
      if (ok) {
        score += q.points
        correct += 1
      } else {
        wrong += 1
      }
    })
    return {
      score,
      total,
      correct,
      wrong,
      unanswered,
      submittedAt: nowStamp(),
      batchNo: batchStamp(),
    }
  }

  function buildReview(ctx, result, demo) {
    if (result.customReview) return result.customReview
    const survey = ctx.state.survey
    const answers = demo ? DEMO_ANSWERS : ctx.state.answers
    return survey.questions
      .filter((q) => q.points)
      .map((q) => {
        const value = answers[q.id]
        const empty = !isAnswered(value)
        const ok = !empty && (Array.isArray(q.correct) ? sameSet(value, q.correct) : value === q.correct)
        return {
          no: pad2(survey.questions.indexOf(q) + 1),
          title: q.title,
          mine: empty ? '未作答' : Array.isArray(value) ? value.join(' · ') : String(value),
          right: Array.isArray(q.correct) ? q.correct.join(' · ') : String(q.correct || '—'),
          score: ok ? q.points : 0,
          points: q.points,
          ok,
          note: q.type === 'checkbox' ? '多选题需全部选对才计分。' : '',
        }
      })
  }

  // ── 通用片段 ─────────────────────────────────────────────────────────────

  function appbar(ctx, options) {
    const opts = options || {}
    return (
      '<header class="appbar">' +
        (opts.back === false
          ? '<span class="ans-appbar__spacer"></span>'
          : '<button type="button" class="appbar__back" data-goto="' + esc(opts.backTo || 'cover') + '" aria-label="返回">' +
              ctx.icon('back', 20) +
            '</button>') +
        '<span class="appbar__title">' + esc(opts.title || '') + '</span>' +
        (opts.action || '<span class="ans-appbar__spacer"></span>') +
      '</header>'
    )
  }

  function wireGoto(root, ctx) {
    root.querySelectorAll('[data-goto]').forEach((el) => {
      el.addEventListener('click', () => ctx.go(el.getAttribute('data-goto')))
    })
  }

  function errorTextFor(q) {
    switch (q.type) {
      case 'radio':
        return '请选择一项'
      case 'checkbox':
        return '请至少选择一项'
      case 'address':
        return '请选择所在地区'
      case 'ref':
        return '请选择一份问卷'
      case 'image':
        return '请上传一张照片'
      case 'date':
        return '请选择日期'
      default:
        return '请填写此题'
    }
  }

  function pickMarkup(ctx, q, value) {
    const placeholder = q.type === 'address' ? '选择省 / 市 / 区' : '选择一份问卷'
    return (
      '<div class="ans-pick-wrap" data-pick-wrap="' + q.id + '">' +
        '<button type="button" class="ans-pick" data-pick="' + q.id + '" aria-haspopup="dialog">' +
          '<span class="ans-pick__icon">' + ctx.icon(q.type === 'address' ? 'pin' : 'link', 18) + '</span>' +
          '<span class="ans-pick__text' + (value ? '' : ' is-empty') + '" data-pick-text>' +
            esc(value || placeholder) +
          '</span>' +
          '<span class="ans-pick__chev">' + ctx.icon('down', 16) + '</span>' +
        '</button>' +
        (value
          ? '<button type="button" class="ans-pick__clear" data-clear="' + q.id + '" aria-label="清除选择">' +
              ctx.icon('close', 16) +
            '</button>'
          : '') +
      '</div>'
    )
  }

  function imageMarkup(ctx, q, name) {
    if (!name) {
      return (
        '<button type="button" class="ans-img__add" data-img-add="' + q.id + '" aria-label="上传工作环境照片">' +
          ctx.icon('plus', 20) +
          '<span class="ans-img__cap">点击上传</span>' +
        '</button>' +
        '<div class="ans-img__meta">' +
          '<p class="ans-img__meta-tip">支持 JPG / PNG，单张不超过 10 MB。照片只用于本次分析。</p>' +
        '</div>'
      )
    }
    return (
      '<div class="ans-img__thumb" role="img" aria-label="已上传的工作环境照片预览">' +
        '<span class="ans-img__thumb-icon">' + ctx.icon('image', 22) + '</span>' +
      '</div>' +
      '<div class="ans-img__meta">' +
        '<p class="ans-img__meta-name">' + esc(name) + '</p>' +
        '<p class="ans-img__meta-tip">已上传 1 张 · 仅用于本次分析</p>' +
        '<button type="button" class="ans-img__remove" data-img-del="' + q.id + '">删除照片</button>' +
      '</div>'
    )
  }

  function questionBody(ctx, q, value, invalid) {
    const labelId = 't-' + q.id
    const errorId = 'e-' + q.id
    if (q.type === 'radio' || q.type === 'checkbox') {
      const options = q.options || []
      return (
        '<div class="ans-opts" role="' + (q.type === 'radio' ? 'radiogroup' : 'group') + '"' +
          ' aria-labelledby="' + labelId + '" aria-describedby="' + errorId + '"' +
          (invalid ? ' aria-invalid="true"' : '') + '>' +
          options
            .map((opt) => {
              const checked = q.type === 'radio' ? value === opt : Array.isArray(value) && value.indexOf(opt) >= 0
              return (
                '<label class="ans-opt' + (q.type === 'checkbox' ? ' ans-opt--check' : '') + '">' +
                  '<input class="ans-opt__input" type="' + (q.type === 'checkbox' ? 'checkbox' : 'radio') + '"' +
                    ' name="' + q.id + '" value="' + esc(opt) + '"' + (checked ? ' checked' : '') + '>' +
                  '<span class="ans-opt__mark" aria-hidden="true">' +
                    (q.type === 'checkbox' ? ctx.icon('check', 12) : '') +
                  '</span>' +
                  '<span class="ans-opt__label">' + esc(opt) + '</span>' +
                '</label>'
              )
            })
            .join('') +
        '</div>'
      )
    }
    if (q.type === 'text') {
      return (
        '<div class="ans-input-wrap">' +
          '<input class="input ans-answer" type="text" id="f-' + q.id + '" data-qid="' + q.id + '"' +
            ' value="' + esc(value || '') + '" aria-labelledby="' + labelId + '"' +
            ' placeholder="' + esc(q.placeholder || '请输入') + '">' +
        '</div>'
      )
    }
    if (q.type === 'number') {
      return (
        '<div class="ans-input-wrap ans-num">' +
          '<input class="input ans-num__input ans-answer" type="text" inputmode="numeric" id="f-' + q.id + '"' +
            ' data-qid="' + q.id + '" data-numeric="1" value="' + esc(value || '') + '"' +
            ' aria-labelledby="' + labelId + '" placeholder="' + esc(q.placeholder || '请输入数字') + '">' +
          '<span class="ans-num__unit">年</span>' +
        '</div>'
      )
    }
    if (q.type === 'date') {
      return (
        '<div class="ans-date">' +
          '<input class="input ans-date__input" type="date" id="f-' + q.id + '" data-qid="' + q.id + '"' +
            ' value="' + esc(value || '') + '" aria-labelledby="' + labelId + '">' +
          '<span class="ans-date__icon">' + ctx.icon('calendar', 18) + '</span>' +
        '</div>'
      )
    }
    if (q.type === 'address' || q.type === 'ref') {
      return pickMarkup(ctx, q, value)
    }
    if (q.type === 'image') {
      return imageMarkup(ctx, q, value)
    }
    if (q.type === 'textarea') {
      const text = value || ''
      const max = q.maxLength || 200
      return (
        '<textarea class="textarea ans-textarea ans-answer" id="f-' + q.id + '" data-qid="' + q.id + '"' +
          ' maxlength="' + max + '" aria-labelledby="' + labelId + '"' +
          ' placeholder="可以写具体一点，例如餐饮、通勤、工位">' + esc(text) + '</textarea>' +
        '<div class="ans-count" data-count-wrap>' +
          '<span data-count>' + text.length + '</span> / ' + max +
        '</div>'
      )
    }
    return ''
  }

  function questionMarkup(ctx, q, index, invalidIds) {
    const invalid = invalidIds.has(q.id)
    const flags = []
    if (q.required) flags.push('<span class="ans-q__sep"></span><span class="ans-q__flag">必答</span>')
    if (q.points) {
      flags.push('<span class="ans-q__sep"></span><span class="ans-q__flag ans-q__flag--pts">计分 ' + q.points + ' 分</span>')
    }
    return (
      '<section class="ans-q' + (invalid ? ' is-invalid' : '') + '" id="q-' + q.id + '" data-q="' + q.id + '">' +
        '<div class="ans-q__meta">' +
          '<span class="ans-q__no tnum">' + pad2(index + 1) + '</span>' +
          flags.join('') +
        '</div>' +
        '<h3 class="ans-q__title" id="t-' + q.id + '">' + esc(q.title) + '</h3>' +
        '<div class="ans-q__body">' + questionBody(ctx, q, ctx.state.answers[q.id], invalid) + '</div>' +
        '<p class="ans-q__err" id="e-' + q.id + '" data-err' + (invalid ? '' : ' hidden') + '>' +
          (invalid ? ctx.icon('close', 14) + '<span>' + esc(errorTextFor(q)) + '</span>' : '') +
        '</p>' +
      '</section>'
    )
  }

  // ── 底部弹层 ─────────────────────────────────────────────────────────────

  function closeSheet(root) {
    if (root && typeof root.__ansSheet === 'function') root.__ansSheet()
  }

  function createSheet(root, options) {
    closeSheet(root)
    const proto = P()
    const opts = options || {}
    const parent = root.parentElement
    const insideDevice = parent && parent.classList.contains('device__screen')
    const host = insideDevice ? parent : document.body
    const layer = document.createElement('div')
    layer.className = 'ans-sheet-layer' + (insideDevice ? '' : ' ans-sheet-layer--fixed')
    layer.innerHTML =
      '<div class="ans-sheet__scrim" data-sheet-close></div>' +
      '<div class="ans-sheet" role="dialog" aria-modal="true" aria-labelledby="ans-sheet-title">' +
        '<div class="ans-sheet__grab"></div>' +
        '<div class="ans-sheet__head">' +
          '<h2 class="ans-sheet__title" id="ans-sheet-title">' + esc(opts.title || '') + '</h2>' +
          '<button type="button" class="ans-sheet__close" data-sheet-close aria-label="关闭">' +
            proto.icon('close', 18) +
          '</button>' +
        '</div>' +
        '<div class="ans-sheet__crumbs" data-sheet-crumbs hidden></div>' +
        '<div class="ans-sheet__body" data-sheet-body></div>' +
        '<div class="ans-sheet__foot" data-sheet-foot hidden></div>' +
      '</div>'
    host.appendChild(layer)

    const sheetEl = layer.querySelector('.ans-sheet')
    const body = layer.querySelector('[data-sheet-body]')
    const crumbs = layer.querySelector('[data-sheet-crumbs]')
    const foot = layer.querySelector('[data-sheet-foot]')
    const lastFocus = document.activeElement
    let closed = false

    const focusables = () =>
      Array.from(
        sheetEl.querySelectorAll(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)

    function close() {
      if (closed) return
      closed = true
      document.removeEventListener('keydown', onKey, true)
      layer.remove()
      root.__ansSheet = null
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true })
      if (typeof opts.onClose === 'function') opts.onClose()
    }

    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
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

    layer.querySelectorAll('[data-sheet-close]').forEach((el) => el.addEventListener('click', close))
    document.addEventListener('keydown', onKey, true)
    root.__ansSheet = close
    requestAnimationFrame(() => {
      const first =
        body.querySelector('.ans-sheet__opt, button, input') || sheetEl.querySelector('.ans-sheet__close')
      if (first) first.focus({ preventScroll: true })
    })

    return {
      layer,
      body,
      crumbs,
      foot,
      setCrumbs(html) {
        crumbs.innerHTML = html || ''
        crumbs.hidden = !html
      },
      setFoot(html) {
        foot.innerHTML = html || ''
        foot.hidden = !html
      },
      close,
    }
  }

  function openAddressSheet(root, ctx, q, onPick) {
    const current = String(ctx.state.answers[q.id] || '')
    const parts = current.split(' ').filter(Boolean)
    let prov = parts[0] || ''
    let city = parts[1] || ''
    let dist = parts[2] || ''
    let level = prov ? (city ? (dist ? 2 : 1) : 0) : 0
    const sheet = createSheet(root, { title: '选择所在地区' })

    const crumb = (label, target, current2) =>
      '<button type="button" class="ans-crumb' + (current2 ? ' is-current' : '') + '" data-crumb="' + target + '">' +
        esc(label) +
      '</button>'

    const draw = () => {
      sheet.setCrumbs(
        crumb(prov || '省份', 0, level === 0) +
        '<span class="ans-crumb-sep">/</span>' +
        (prov ? crumb(city || '城市', 1, level === 1) : '<span class="ans-crumb is-disabled">城市</span>') +
        '<span class="ans-crumb-sep">/</span>' +
        (city ? crumb(dist || '区县', 2, level === 2) : '<span class="ans-crumb is-disabled">区县</span>'),
      )
      let items = []
      if (level === 0) {
        items = Object.keys(ADDRESS).map((v) => ({ v, on: v === prov }))
      } else if (level === 1) {
        items = Object.keys(ADDRESS[prov] || {}).map((v) => ({ v, on: v === city }))
      } else {
        items = (ADDRESS[prov] && ADDRESS[prov][city] ? ADDRESS[prov][city] : []).map((v) => ({
          v,
          on: v === dist,
        }))
      }
      if (!items.length) {
        sheet.body.innerHTML = '<p class="ans-sheet__empty">暂无地区数据</p>'
        return
      }
      sheet.body.innerHTML =
        '<div class="ans-sheet__list">' +
        items
          .map(
            (it) =>
              '<button type="button" class="ans-sheet__opt' + (it.on ? ' is-on' : '') + '" data-addr="' + esc(it.v) + '">' +
                '<span class="ans-sheet__opt-mark" aria-hidden="true"></span>' +
                '<span>' + esc(it.v) + '</span>' +
                '<span class="ans-sheet__opt-check" aria-hidden="true">' + ctx.icon('check', 16) + '</span>' +
              '</button>',
          )
          .join('') +
        '</div>'
      requestAnimationFrame(() => {
        const first = sheet.body.querySelector('.ans-sheet__opt')
        if (first) first.focus({ preventScroll: true })
      })
    }

    draw()

    sheet.body.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-addr]')
      if (!btn) return
      const value = btn.getAttribute('data-addr')
      if (level === 0) {
        prov = value
        city = ''
        dist = ''
        level = 1
        draw()
      } else if (level === 1) {
        city = value
        dist = ''
        level = 2
        draw()
      } else {
        dist = value
        onPick(prov + ' ' + city + ' ' + dist)
        sheet.close()
      }
    })

    sheet.crumbs.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-crumb]')
      if (!btn) return
      level = Number(btn.getAttribute('data-crumb'))
      if (level === 0) {
        city = ''
        dist = ''
      } else if (level === 1) {
        dist = ''
      }
      draw()
    })
  }

  function openRefSheet(root, ctx, q, onPick) {
    const current = ctx.state.answers[q.id]
    const sheet = createSheet(root, { title: '选择一份问卷' })
    const options = q.options || []
    sheet.body.innerHTML =
      '<div class="ans-sheet__list">' +
      options
        .map(
          (opt) =>
            '<button type="button" class="ans-sheet__opt' + (opt === current ? ' is-on' : '') + '" data-ref="' + esc(opt) + '">' +
              '<span class="ans-sheet__opt-mark" aria-hidden="true"></span>' +
              '<span>' + esc(opt) + '</span>' +
              '<span class="ans-sheet__opt-check" aria-hidden="true">' + ctx.icon('check', 16) + '</span>' +
            '</button>',
        )
        .join('') +
      '</div>'
    sheet.setFoot(
      '<button type="button" class="btn btn--quiet" data-sheet-close>取消</button>',
    )
    sheet.body.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-ref]')
      if (!btn) return
      onPick(btn.getAttribute('data-ref'))
      sheet.close()
    })
  }

  // ── 1. 问卷封面 ──────────────────────────────────────────────────────────

  function renderCover(ctx) {
    const s = ctx.state
    const survey = s.survey
    const done = !!s.submitted
    const result = s.result
    const answered = countAnswered(survey, s.answers)

    const infoItems = [
      '<b class="tnum">' + survey.questions.length + '</b> 题',
      '约 <b class="tnum">3</b> 分钟',
      '截止 <b class="tnum">' + esc(String(survey.deadline || '').slice(5)) + '</b>',
      '<b class="tnum">' + ctx.fmt(survey.submittedCount) + '</b> 人已答',
    ]

    const actions = done
      ? '<div class="ans-cover__done">' +
          '<div class="ans-cover__done-head">' +
            '<span class="tag tag--ok"><span class="tag__dot"></span>已提交</span>' +
            '<span class="ans-cover__done-title">你已完成本次问卷</span>' +
          '</div>' +
          '<p class="ans-cover__done-meta">' +
            esc(result ? result.submittedAt : '') +
            (result ? ' · 批次 ' + esc(result.batchNo) : '') +
          '</p>' +
          '<div class="ans-cover__done-actions">' +
            '<button type="button" class="btn btn--primary btn--block" data-view-result>查看结果</button>' +
            '<button type="button" class="btn btn--ghost btn--block" data-goto="records">看看我的记录</button>' +
            '<button type="button" class="ans-cover__restart" data-restart>重新作答</button>' +
          '</div>' +
        '</div>'
      : '<div class="ans-cover__actions">' +
          '<button type="button" class="btn btn--primary ans-cover__cta" data-start>开始作答</button>' +
          '<button type="button" class="btn btn--quiet btn--block" data-goto="records">看看我的记录</button>' +
        '</div>'

    return (
      '<div class="ans ans--cover">' +
        '<div class="ans-page ans-cover">' +
          '<div class="ans-cover__top">' +
            '<span class="ans-cover__brand">园区问卷 · 健康与体验调研</span>' +
            '<button type="button" class="ans-cover__records" data-goto="records">' +
              '作答记录' + ctx.icon('forward', 14) +
            '</button>' +
          '</div>' +
          '<div class="ans-cover__head">' +
            '<p class="ans-cover__kicker">匿名问卷</p>' +
            '<h1 class="ans-cover__title">' + esc(survey.title) + '</h1>' +
            '<p class="ans-cover__subtitle">' + esc(survey.subtitle) + '</p>' +
            '<p class="ans-cover__intro">' + esc(survey.intro) + '</p>' +
          '</div>' +
          '<div class="ans-cover__info">' +
            infoItems
              .map(
                (item, index) =>
                  (index ? '<span class="ans-cover__info-dot" aria-hidden="true">·</span>' : '') +
                  '<span class="ans-cover__info-item">' + item + '</span>',
              )
              .join('') +
          '</div>' +
          '<div class="ans-cover__more">' +
            '<button type="button" class="ans-cover__toggle" data-more aria-expanded="false" aria-controls="cover-more">' +
              '作答说明' +
              ctx.icon('down', 16) +
            '</button>' +
            '<div class="ans-cover__more-body" id="cover-more" hidden>' +
              '<p>答案随填随存。中途离开，再打开可以继续作答。</p>' +
              '<p>必答题共 ' + missingRequired(survey, s.answers).length + ' 道，全部完成后才能提交。</p>' +
              '<p>提交后不可修改，结果仅本人可见。</p>' +
            '</div>' +
          '</div>' +
          actions +
          (done
            ? '<p class="ans-cover__foot">已答 ' + answered + ' / ' + survey.questions.length + ' 题 · 匿名作答 · 仅用于整体分析</p>'
            : '<p class="ans-cover__foot">匿名作答 · 数据仅用于整体分析</p>') +
        '</div>' +
      '</div>'
    )
  }

  function mountCover(root, ctx) {
    wireGoto(root, ctx)

    const start = root.querySelector('[data-start]')
    if (start) start.addEventListener('click', () => ctx.go('survey'))

    const more = root.querySelector('[data-more]')
    if (more) {
      more.addEventListener('click', () => {
        const panel = root.querySelector('#cover-more')
        const open = more.getAttribute('aria-expanded') === 'true'
        more.setAttribute('aria-expanded', String(!open))
        if (panel) panel.hidden = open
      })
    }

    const view = root.querySelector('[data-view-result]')
    if (view) {
      view.addEventListener('click', () => {
        ctx.state.viewingResult = null
        ctx.go('result')
      })
    }

    const restart = root.querySelector('[data-restart]')
    if (restart) {
      restart.addEventListener('click', () => {
        resetAnswerState(ctx)
        ctx.go('survey')
        ctx.toast('已开始新的作答', 'ok')
      })
    }
  }

  function resetAnswerState(ctx) {
    ctx.state.answers = {}
    ctx.state.submitted = false
    ctx.state.result = null
    ctx.state.viewingResult = null
    ctx.state.draftSavedAt = ''
    ctx.state.submitInfo = null
    submitForm = null
    ctx.save()
  }

  // ── 2. 作答页 ────────────────────────────────────────────────────────────

  let saveTimer = null
  let submitTimer = null
  let submitForm = null

  function renderSurvey(ctx, options) {
    const opts = options || {}
    const s = ctx.state
    const survey = s.survey
    const answered = countAnswered(survey, s.answers)
    const missing = missingRequired(survey, s.answers)
    const showErrors = !!opts.invalid && missing.length > 0
    const invalidIds = new Set(showErrors ? missing.map((q) => q.id) : [])
    const total = survey.questions.length
    const pct = total ? (answered / total) * 100 : 0
    const errorList = showErrors ? missing : []

    return (
      '<div class="ans ans--survey">' +
        appbar(ctx, {
          title: survey.title,
          backTo: 'cover',
          action:
            '<button type="button" class="appbar__action" data-goto="records" aria-label="作答记录">' +
              ctx.icon('list', 18) +
            '</button>',
        }) +
        '<div class="ans-prog" data-prog>' +
          '<div class="ans-prog__row">' +
            '<span class="ans-prog__count">已答 <b data-answered>' + answered + '</b> / ' + total + '</span>' +
            '<span class="ans-prog__req" data-req>' +
              (missing.length ? '还剩 ' + missing.length + ' 道必答' : '必答已完成') +
            '</span>' +
            '<span class="ans-prog__save' + (s.draftSavedAt ? ' is-on' : '') + '" data-save>' +
              (s.draftSavedAt ? '已暂存 ' + esc(s.draftSavedAt) : '') +
            '</span>' +
          '</div>' +
          '<div class="progress" role="progressbar" data-progress aria-label="作答进度"' +
            ' aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + answered + '">' +
            '<span class="progress__fill" data-fill style="width:' + pct.toFixed(2) + '%"></span>' +
          '</div>' +
        '</div>' +
        '<div class="ans-page">' +
          '<div class="ans-alert" data-alert role="alert"' + (showErrors ? '' : ' hidden') + '>' +
            (showErrors ? alertInner(ctx, survey, errorList) : '') +
          '</div>' +
          '<div class="ans-qs">' +
            survey.questions
              .map((q, index) => questionMarkup(ctx, q, index, invalidIds))
              .join('') +
          '</div>' +
        '</div>' +
        '<div class="sticky-bar ans-submitbar">' +
          '<span class="sticky-bar__hint" data-barhint>草稿自动暂存</span>' +
          '<button type="button" class="btn btn--primary" data-submit>提交问卷</button>' +
        '</div>' +
      '</div>'
    )
  }

  function alertInner(ctx, survey, missing) {
    return (
      '<div class="ans-alert__head">' +
        ctx.icon('close', 16) +
        '<span data-alert-text>还有 ' + missing.length + ' 道必答没完成</span>' +
      '</div>' +
      '<ul class="ans-alert__list" data-alert-list>' +
      missing
        .map((q) => {
          const index = survey.questions.indexOf(q)
          return (
            '<li><button type="button" class="ans-alert__jump" data-jump="' + q.id + '">' +
              '<span class="tnum">' + pad2(index + 1) + '</span>' +
              '<span>' + esc(q.title) + '</span>' +
              ctx.icon('forward', 14) +
            '</button></li>'
          )
        })
        .join('') +
      '</ul>'
    )
  }

  function mountSurvey(root, ctx) {
    const state = ctx.state
    const survey = state.survey
    const answers = state.answers
    const byId = {}
    survey.questions.forEach((q) => {
      byId[q.id] = q
    })

    wireGoto(root, ctx)

    const saveEl = root.querySelector('[data-save]')
    const barhint = root.querySelector('[data-barhint]')

    function showSaved() {
      if (!saveEl) return
      saveEl.textContent = '已暂存 ' + state.draftSavedAt
      saveEl.classList.add('is-on')
      if (barhint) barhint.textContent = '已暂存 ' + state.draftSavedAt
    }

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        state.draftSavedAt = ctx.now ? ctx.now() : ''
        ctx.save()
        showSaved()
      }, 1200)
    }

    function refreshProgress() {
      const answered = countAnswered(survey, answers)
      const missing = missingRequired(survey, answers)
      const total = survey.questions.length
      const counted = root.querySelector('[data-answered]')
      if (counted) counted.textContent = answered
      const fill = root.querySelector('[data-fill]')
      if (fill) fill.style.width = (total ? (answered / total) * 100 : 0).toFixed(2) + '%'
      const bar = root.querySelector('[data-progress]')
      if (bar) bar.setAttribute('aria-valuenow', String(answered))
      const req = root.querySelector('[data-req]')
      if (req) {
        req.textContent = missing.length ? '还剩 ' + missing.length + ' 道必答' : '必答已完成'
        req.classList.toggle('is-done', missing.length === 0)
      }
      refreshAlert(missing)
    }

    function refreshAlert(missing) {
      const alert = root.querySelector('[data-alert]')
      if (!alert || alert.hidden) return
      if (!missing.length) {
        alert.hidden = true
        return
      }
      alert.innerHTML = alertInner(ctx, survey, missing)
    }

    function markInvalid(q) {
      const block = root.querySelector('#q-' + q.id)
      if (!block) return
      block.classList.add('is-invalid')
      const err = block.querySelector('[data-err]')
      if (err) {
        err.hidden = false
        err.innerHTML = ctx.icon('close', 14) + '<span>' + esc(errorTextFor(q)) + '</span>'
      }
      const group = block.querySelector('[role="radiogroup"], [role="group"]')
      if (group) group.setAttribute('aria-invalid', 'true')
      const single = block.querySelector('input, textarea, .ans-pick')
      if (single) single.setAttribute('aria-invalid', 'true')
    }

    function clearInvalid(qid) {
      const block = root.querySelector('#q-' + qid)
      if (!block) return
      block.classList.remove('is-invalid')
      const err = block.querySelector('[data-err]')
      if (err) {
        err.hidden = true
        err.innerHTML = ''
      }
      block.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'))
    }

    function setAnswer(qid, value) {
      answers[qid] = value
      clearInvalid(qid)
      refreshProgress()
      scheduleSave()
    }

    function applyPick(q, value) {
      setAnswer(q.id, value)
      const wrap = root.querySelector('.ans-pick-wrap[data-pick-wrap="' + q.id + '"]')
      if (wrap) {
        wrap.outerHTML = pickMarkup(ctx, q, value)
        const btn = root.querySelector('.ans-pick[data-pick="' + q.id + '"]')
        if (btn) btn.focus({ preventScroll: true })
      }
    }

    function focusQuestion(qid) {
      const block = root.querySelector('#q-' + qid)
      if (!block) return
      block.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
      const target = block.querySelector('.ans-opt__input, input, textarea, .ans-pick, button')
      if (target) {
        window.setTimeout(() => target.focus({ preventScroll: true }), 80)
      }
    }

    function submit() {
      const missing = missingRequired(survey, answers)
      const alert = root.querySelector('[data-alert]')
      if (missing.length) {
        if (alert) {
          alert.innerHTML = alertInner(ctx, survey, missing)
          alert.hidden = false
        }
        missing.forEach(markInvalid)
        focusQuestion(missing[0].id)
        ctx.toast('还有 ' + missing.length + ' 道必答没完成', 'warn')
        return
      }
      if (saveTimer) clearTimeout(saveTimer)
      ctx.go('submit')
    }

    function saveNow() {
      if (saveTimer) clearTimeout(saveTimer)
      state.draftSavedAt = ctx.now ? ctx.now() : ''
      ctx.save()
      showSaved()
      ctx.toast('草稿已保存', 'ok')
    }

    // 输入类
    root.addEventListener('input', (event) => {
      const target = event.target
      if (!target.classList || !target.classList.contains('ans-answer')) return
      const qid = target.getAttribute('data-qid')
      if (!qid) return
      let value = target.value
      if (target.getAttribute('data-numeric') === '1') {
        value = value.replace(/[^\d]/g, '').slice(0, 3)
        if (target.value !== value) target.value = value
      }
      setAnswer(qid, value)
      if (target.classList.contains('ans-textarea')) {
        const wrap = target.parentElement.querySelector('[data-count-wrap]')
        if (wrap) {
          const count = wrap.querySelector('[data-count]')
          if (count) count.textContent = value.length
          const max = Number(target.getAttribute('maxlength')) || 200
          wrap.classList.toggle('is-near-limit', value.length > max - 20)
        }
      }
    })

    // 选项 / 日期
    root.addEventListener('change', (event) => {
      const target = event.target
      if (target.classList.contains('ans-opt__input')) {
        const qid = target.getAttribute('name')
        const q = byId[qid]
        if (!q) return
        if (q.type === 'checkbox') {
          const list = Array.isArray(answers[qid]) ? answers[qid].slice() : []
          const index = list.indexOf(target.value)
          if (target.checked && index < 0) list.push(target.value)
          if (!target.checked && index >= 0) list.splice(index, 1)
          setAnswer(qid, list)
        } else {
          setAnswer(qid, target.value)
        }
        return
      }
      if (target.classList.contains('ans-date__input')) {
        setAnswer(target.getAttribute('data-qid'), target.value)
      }
    })

    // 点击：跳题 / 暂存 / 提交 / 弹层 / 图片 / 日期
    root.addEventListener('click', (event) => {
      const jump = event.target.closest('[data-jump]')
      if (jump) {
        focusQuestion(jump.getAttribute('data-jump'))
        return
      }
      if (event.target.closest('[data-submit]')) {
        submit()
        return
      }
      const pick = event.target.closest('[data-pick]')
      if (pick) {
        const q = byId[pick.getAttribute('data-pick')]
        if (!q) return
        if (q.type === 'address') openAddressSheet(root, ctx, q, (value) => applyPick(q, value))
        else openRefSheet(root, ctx, q, (value) => applyPick(q, value))
        return
      }
      const clear = event.target.closest('[data-clear]')
      if (clear) {
        const q = byId[clear.getAttribute('data-clear')]
        if (q) applyPick(q, '')
        return
      }
      const imgAdd = event.target.closest('[data-img-add]')
      if (imgAdd) {
        const q = byId[imgAdd.getAttribute('data-img-add')]
        if (!q) return
        const wrap = root.querySelector('[data-img="' + q.id + '"]')
        if (wrap) wrap.classList.add('is-uploading')
        window.setTimeout(() => {
          if (!root.isConnected) return
          setAnswer(q.id, '工作环境-窗边.jpg')
          const current = root.querySelector('[data-img="' + q.id + '"]')
          if (current) {
            current.classList.remove('is-uploading')
            current.innerHTML = imageMarkup(ctx, q, '工作环境-窗边.jpg')
          }
        }, 320)
        return
      }
      const imgDel = event.target.closest('[data-img-del]')
      if (imgDel) {
        const q = byId[imgDel.getAttribute('data-img-del')]
        if (!q) return
        setAnswer(q.id, '')
        const current = root.querySelector('[data-img="' + q.id + '"]')
        if (current) current.innerHTML = imageMarkup(ctx, q, '')
        return
      }
      const dateWrap = event.target.closest('.ans-date')
      if (dateWrap) {
        const input = dateWrap.querySelector('.ans-date__input')
        if (input) {
          if (typeof input.showPicker === 'function') {
            try {
              input.showPicker()
            } catch (error) {
              input.focus()
            }
          } else {
            input.focus()
          }
        }
      }
    })

    return () => {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      closeSheet(root)
    }
  }

  // ── 3. 提交信息 ──────────────────────────────────────────────────────────

  function ensureSubmitForm(ctx) {
    if (submitForm) return submitForm
    const s = ctx.state
    submitForm = {
      name: (s.answers && s.answers.q1) || (s.session && s.session.loggedIn ? s.session.name : ''),
      dept: s.session && s.session.loggedIn ? s.session.dept : '',
      phone: '',
    }
    return submitForm
  }

  function renderSubmit(ctx) {
    const s = ctx.state
    const info = ensureSubmitForm(ctx)
    const deptOptions = ['技术部', '产品部', '市场部', '职能部', '其他']
    if (info.dept && deptOptions.indexOf(info.dept) < 0) deptOptions.unshift(info.dept)

    return (
      '<div class="ans ans--submit">' +
        appbar(ctx, { title: '提交信息', backTo: 'survey' }) +
        '<div class="ans-page ans-submit">' +
          '<div class="ans-lede">' +
            '<p class="ans-lede__kicker">最后一步</p>' +
            '<h1 class="ans-lede__title">确认你的联系信息</h1>' +
            '<p class="ans-lede__body">问卷本身是匿名的。下面三项只用于结果关联与必要回访，不会出现在公开报表里。</p>' +
          '</div>' +
          '<form class="ans-form" data-submit-form novalidate>' +
            '<div class="field" data-field="name">' +
              '<label class="field__label" for="sub-name">姓名<span class="field__req">必填</span></label>' +
              '<input class="input" id="sub-name" name="name" type="text" autocomplete="name"' +
                ' value="' + esc(info.name) + '" placeholder="请输入姓名">' +
              '<span class="field__error" data-err hidden></span>' +
            '</div>' +
            '<div class="field" data-field="dept">' +
              '<label class="field__label" for="sub-dept">部门<span class="field__req">必填</span></label>' +
              '<div class="ans-select">' +
                '<select class="select" id="sub-dept" name="dept">' +
                  '<option value="">请选择部门</option>' +
                  deptOptions
                    .map(
                      (dept) =>
                        '<option value="' + esc(dept) + '"' + (dept === info.dept ? ' selected' : '') + '>' +
                          esc(dept) +
                        '</option>',
                    )
                    .join('') +
                '</select>' +
                '<span class="ans-select__icon">' + ctx.icon('down', 16) + '</span>' +
              '</div>' +
              '<span class="field__error" data-err hidden></span>' +
            '</div>' +
            '<div class="field" data-field="phone">' +
              '<label class="field__label" for="sub-phone">手机号<span class="muted">选填</span></label>' +
              '<input class="input" id="sub-phone" name="phone" type="text" inputmode="numeric"' +
                ' maxlength="11" value="' + esc(info.phone) + '" placeholder="11 位手机号，用于必要时回访">' +
              '<span class="field__error" data-err hidden></span>' +
            '</div>' +
            '<div class="ans-note">' +
              '<span class="ans-note__icon">' + ctx.icon('lock', 18) + '</span>' +
              '<div>' +
                '<p class="ans-note__title">信息如何使用</p>' +
                '<p class="ans-note__body">姓名与部门用于核对同一岗位的作答分布；手机号仅在确有回访需求时使用，不用于营销，也不进入绩效评估。</p>' +
              '</div>' +
            '</div>' +
            '<div class="ans-form__actions">' +
              '<button type="submit" class="btn btn--primary btn--block" data-submit-info>提交问卷</button>' +
              '<button type="button" class="btn btn--quiet btn--block" data-goto="survey">返回继续作答</button>' +
            '</div>' +
            '<p class="ans-form__foot">提交后答案不可修改，可在作答记录里查看结果</p>' +
          '</form>' +
        '</div>' +
      '</div>'
    )
  }

  function mountSubmit(root, ctx) {
    wireGoto(root, ctx)
    const form = root.querySelector('[data-submit-form]')
    if (!form) return undefined
    const info = ensureSubmitForm(ctx)
    const nameEl = root.querySelector('#sub-name')
    const deptEl = root.querySelector('#sub-dept')
    const phoneEl = root.querySelector('#sub-phone')
    let busy = false

    const sync = () => {
      info.name = nameEl.value
      info.dept = deptEl.value
      info.phone = phoneEl.value
    }
    nameEl.addEventListener('input', sync)
    deptEl.addEventListener('change', sync)
    phoneEl.addEventListener('input', () => {
      const digits = phoneEl.value.replace(/[^\d]/g, '').slice(0, 11)
      if (phoneEl.value !== digits) phoneEl.value = digits
      sync()
    })

    function setError(fieldName, message) {
      const field = root.querySelector('[data-field="' + fieldName + '"]')
      if (!field) return
      field.classList.toggle('is-invalid', !!message)
      const err = field.querySelector('[data-err]')
      if (err) {
        err.hidden = !message
        err.innerHTML = message ? ctx.icon('close', 14) + '<span>' + esc(message) + '</span>' : ''
      }
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      if (busy) return
      const name = nameEl.value.trim()
      const dept = deptEl.value
      const phone = phoneEl.value.trim()
      let first = null
      setError('name', name ? '' : '请填写姓名')
      if (!name) first = first || nameEl
      setError('dept', dept ? '' : '请选择部门')
      if (!dept) first = first || deptEl
      const phoneBad = !!phone && !/^1\d{10}$/.test(phone)
      setError('phone', phoneBad ? '请填写 11 位手机号' : '')
      if (phoneBad) first = first || phoneEl
      if (first) {
        first.focus()
        return
      }

      busy = true
      const btn = root.querySelector('[data-submit-info]')
      btn.disabled = true
      btn.innerHTML = '<span class="ans-spin" aria-hidden="true"></span><span>正在提交</span>'
      ctx.toast('正在提交', 'info')

      submitTimer = window.setTimeout(() => {
        submitTimer = null
        const state = ctx.state
        state.submitInfo = { name: name, dept: dept, phone: phone, at: nowStamp() }
        if (!isAnswered(state.answers.q1)) state.answers.q1 = name
        state.submitted = true
        state.result = computeResult(state.survey, state.answers)
        state.viewingResult = null
        ctx.save()
        submitForm = null
        ctx.go('result')
        ctx.toast('提交成功', 'ok')
      }, 600)
    })

    return () => {
      if (submitTimer) {
        clearTimeout(submitTimer)
        submitTimer = null
      }
    }
  }

  // ── 4. 作答结果 ──────────────────────────────────────────────────────────

  const RING_C = 364.42

  function renderResult(ctx) {
    const s = ctx.state
    const viewing = s.viewingResult
    const result = viewing || s.result || DEMO_RESULT
    const demo = !viewing && !s.result
    const total = result.total || 20
    const score = result.score || 0
    const pct = total ? Math.max(0, Math.min(1, score / total)) : 0
    const review = buildReview(ctx, result, demo)
    const title = viewing ? viewing.title : s.survey.title
    const historical = !!result.historical
    const perfect = score >= total
    const suggest = perfect
      ? '全部计分题答对。把结果分享给同事，能帮助下一次问卷的回收。'
      : '多选题需要全部选对才计分。回看「薪酬福利」相关说明，再测一次通常就能拿到满分。'

    return (
      '<div class="ans ans--result">' +
        appbar(ctx, {
          title: '作答结果',
          backTo: 'cover',
          action:
            '<button type="button" class="appbar__action" data-goto="records" aria-label="作答记录">' +
              ctx.icon('list', 18) +
            '</button>',
        }) +
        '<div class="ans-page">' +
          '<div class="ans-result">' +
            '<div class="ans-status">' +
              '<span class="tag tag--ok"><span class="tag__dot"></span>已提交</span>' +
              '<span class="ans-status__meta">' + esc(result.submittedAt) + ' · ' + esc(result.batchNo) + '</span>' +
            '</div>' +
            '<div class="ans-hero">' +
              '<p class="ans-result__survey">' + esc(title) + '</p>' +
              '<p class="ans-hero__label">你的得分</p>' +
              '<div class="ans-ring">' +
                '<svg viewBox="0 0 132 132" aria-hidden="true" focusable="false">' +
                  '<circle class="ans-ring__track" cx="66" cy="66" r="58"></circle>' +
                  '<circle class="ans-ring__val" data-ring data-score="' + score + '" data-total="' + total +
                    '" cx="66" cy="66" r="58"></circle>' +
                '</svg>' +
                '<div class="ans-ring__center">' +
                  '<span class="ans-ring__score">' + score + '</span>' +
                  '<span class="ans-ring__total">/ ' + total + '</span>' +
                '</div>' +
              '</div>' +
              '<p class="ans-hero__cap">计分题 <span class="tnum">' + review.length + '</span> 道 · 满分 <span class="tnum">' + total + '</span> 分</p>' +
            '</div>' +
            '<div class="ans-stats">' +
              '<div class="ans-stat ans-stat--ok"><span class="ans-stat__num">' + (result.correct || 0) + '</span><span class="ans-stat__label">答对</span></div>' +
              '<div class="ans-stat ans-stat--bad"><span class="ans-stat__num">' + (result.wrong || 0) + '</span><span class="ans-stat__label">答错</span></div>' +
              '<div class="ans-stat"><span class="ans-stat__num">' + (result.unanswered || 0) + '</span><span class="ans-stat__label">未答</span></div>' +
            '</div>' +
            '<section class="ans-review">' +
              '<button type="button" class="ans-review__toggle" data-review-toggle aria-expanded="true" aria-controls="review-body">' +
                '<span class="ans-review__title">逐题回顾</span>' +
                '<span class="ans-review__meta tnum">' + review.length + ' 道计分题</span>' +
                ctx.icon('down', 16) +
              '</button>' +
              '<div class="ans-review__body" id="review-body" data-review-body>' +
                review.map((item) => reviewItemMarkup(item)).join('') +
              '</div>' +
            '</section>' +
            '<div class="ans-note ans-suggest">' +
              '<span class="ans-note__icon">' + ctx.icon('spark', 18) + '</span>' +
              '<div>' +
                '<p class="ans-suggest__title">下一步建议</p>' +
                '<p class="ans-suggest__body">' + esc(suggest) + '</p>' +
              '</div>' +
            '</div>' +
            '<div class="ans-actions">' +
              (historical
                ? '<button type="button" class="btn btn--primary btn--block" data-goto="records">查看记录</button>' +
                  '<button type="button" class="btn btn--ghost btn--block" data-share>分享结果</button>'
                : '<button type="button" class="btn btn--primary btn--block" data-again>再测一次</button>' +
                  '<div class="ans-actions__row">' +
                    '<button type="button" class="btn btn--ghost" data-goto="records">查看记录</button>' +
                    '<button type="button" class="btn btn--ghost" data-share>分享</button>' +
                  '</div>') +
            '</div>' +
            '<p class="ans-foot">问卷编号 ' + esc(viewing ? viewing.no : s.survey.no) + ' · 截止 ' + esc(s.survey.deadline) + '</p>' +
          '</div>' +
        '</div>' +
      '</div>'
    )
  }

  function reviewItemMarkup(item) {
    const scoreClass = item.ok ? ' ans-rq__score--ok' : item.score > 0 ? '' : ' ans-rq__score--bad'
    const mineClass = item.ok ? ' is-ok' : item.score > 0 ? '' : ' is-bad'
    return (
      '<div class="ans-rq' + (item.ok ? '' : '') + '">' +
        '<div class="ans-rq__head">' +
          '<span class="ans-rq__no tnum">' + esc(item.no) + '</span>' +
          '<span class="ans-rq__title">' + esc(item.title) + '</span>' +
          '<span class="ans-rq__score tnum' + scoreClass + '">' + item.score + ' / ' + item.points + '</span>' +
        '</div>' +
        '<div class="ans-rq__cols">' +
          '<div class="ans-rq__col">' +
            '<span class="ans-rq__label">我的作答</span>' +
            '<span class="ans-rq__val' + mineClass + '">' + esc(item.mine) + '</span>' +
          '</div>' +
          '<div class="ans-rq__col">' +
            '<span class="ans-rq__label">正确答案</span>' +
            '<span class="ans-rq__val">' + esc(item.right) + '</span>' +
          '</div>' +
        '</div>' +
        (item.note ? '<p class="ans-rq__note">' + esc(item.note) + '</p>' : '') +
      '</div>'
    )
  }

  function mountResult(root, ctx) {
    wireGoto(root, ctx)

    const ring = root.querySelector('[data-ring]')
    if (ring) {
      const score = Number(ring.getAttribute('data-score')) || 0
      const total = Number(ring.getAttribute('data-total')) || 1
      const target = RING_C * (1 - Math.max(0, Math.min(1, score / total)))
      if (reduceMotion()) {
        ring.style.transition = 'none'
        ring.style.strokeDashoffset = String(target)
      } else {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            ring.style.strokeDashoffset = String(target)
          })
        })
      }
    }

    const toggle = root.querySelector('[data-review-toggle]')
    const body = root.querySelector('[data-review-body]')
    if (toggle && body) {
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') === 'true'
        toggle.setAttribute('aria-expanded', String(!open))
        body.hidden = open
      })
    }

    const again = root.querySelector('[data-again]')
    if (again) {
      again.addEventListener('click', () => {
        resetAnswerState(ctx)
        ctx.go('survey')
        ctx.toast('已开始新的作答', 'ok')
      })
    }

    const share = root.querySelector('[data-share]')
    if (share) {
      share.addEventListener('click', () => ctx.toast('分享链接已复制', 'ok'))
    }

    return () => {
      ctx.state.viewingResult = null
    }
  }

  // ── 5. 作答记录 ──────────────────────────────────────────────────────────

  function buildRecords(ctx) {
    const s = ctx.state
    const survey = s.survey
    const submitted = !!s.submitted && !!s.result
    const answered = countAnswered(survey, s.answers)
    const current = {
      key: 'current',
      title: survey.title,
      status: submitted ? 'submitted' : 'draft',
      score: submitted ? s.result.score : null,
      total: submitted ? s.result.total : null,
      time: submitted ? s.result.submittedAt : s.draftSavedAt ? '暂存于 ' + s.draftSavedAt : '尚未作答',
      batch: submitted ? s.result.batchNo : '',
      progress: '已答 ' + answered + ' / ' + survey.questions.length + ' 题',
      action: submitted ? 'view' : 'continue',
    }
    const rows = [current].concat(
      HISTORY.map((item) => ({
        key: item.key,
        title: item.title,
        status: 'submitted',
        score: item.score,
        total: item.total,
        time: item.submittedAt,
        batch: item.batchNo,
        progress: item.dims.join(' · '),
        action: 'history',
      })),
    )
    return rows
  }

  function renderRecords(ctx) {
    const rows = buildRecords(ctx)
    return (
      '<div class="ans ans--records">' +
        appbar(ctx, { title: '作答记录', backTo: 'cover' }) +
        '<div class="ans-page ans-records">' +
          '<div class="ans-records__bar">' +
            '<div class="seg" role="tablist" aria-label="筛选记录">' +
              '<button type="button" class="seg__item is-active" role="tab" aria-selected="true" data-filter="all">全部</button>' +
              '<button type="button" class="seg__item" role="tab" aria-selected="false" data-filter="submitted">已提交</button>' +
              '<button type="button" class="seg__item" role="tab" aria-selected="false" data-filter="draft">草稿</button>' +
            '</div>' +
            '<span class="ans-records__count tnum" data-rec-count>' + rows.length + ' 条</span>' +
          '</div>' +
          '<div class="ans-recs" data-recs>' +
            rows
              .map((row) => {
                const tag =
                  row.status === 'submitted'
                    ? '<span class="tag tag--ok"><span class="tag__dot"></span>已提交</span>'
                    : '<span class="tag tag--muted"><span class="tag__dot"></span>草稿</span>'
                const score =
                  row.score == null
                    ? ''
                    : '<span class="ans-rec__score tnum">' + row.score + '<span> / ' + row.total + '</span></span>'
                let action = ''
                if (row.action === 'continue') {
                  action = '<button type="button" class="ans-rec__link" data-continue>继续作答' + ctx.icon('forward', 14) + '</button>'
                } else if (row.action === 'view') {
                  action = '<button type="button" class="ans-rec__link" data-view-current>查看结果' + ctx.icon('forward', 14) + '</button>'
                } else {
                  action = '<button type="button" class="ans-rec__link" data-history="' + row.key + '">查看结果' + ctx.icon('forward', 14) + '</button>'
                }
                return (
                  '<article class="ans-rec" data-status="' + row.status + '">' +
                    '<div class="ans-rec__top">' +
                      '<h3 class="ans-rec__title">' + esc(row.title) + '</h3>' +
                      score +
                    '</div>' +
                    '<div class="ans-rec__meta">' +
                      tag +
                      '<span class="ans-rec__meta-sep"></span>' +
                      '<span>' + esc(row.time) + '</span>' +
                      (row.batch ? '<span class="ans-rec__meta-sep"></span><span>' + esc(row.batch) + '</span>' : '') +
                    '</div>' +
                    '<div class="ans-rec__bottom">' +
                      '<span class="ans-rec__progress">' + esc(row.progress) + '</span>' +
                      action +
                    '</div>' +
                  '</article>'
                )
              })
              .join('') +
          '</div>' +
          '<div class="empty ans-records__empty" data-recs-empty hidden>' +
            '<span class="empty__art">' + ctx.icon('paper', 40) + '</span>' +
            '<p class="empty__title">没有符合条件的记录</p>' +
            '<p class="empty__tip">换个筛选，或回到封面开始一份新的问卷。</p>' +
            '<button type="button" class="btn btn--ghost" data-goto="cover">回到封面</button>' +
          '</div>' +
          '<p class="ans-foot">草稿只保存在当前浏览器 · 换设备登录可查看已提交记录</p>' +
        '</div>' +
      '</div>'
    )
  }

  function mountRecords(root, ctx) {
    wireGoto(root, ctx)

    const empty = root.querySelector('[data-recs-empty]')
    const count = root.querySelector('[data-rec-count]')
    const filters = root.querySelectorAll('[data-filter]')

    function applyFilter(key) {
      let visible = 0
      root.querySelectorAll('.ans-rec').forEach((rec) => {
        const show = key === 'all' || rec.getAttribute('data-status') === key
        rec.hidden = !show
        if (show) visible += 1
      })
      if (count) count.textContent = visible + ' 条'
      if (empty) empty.hidden = visible > 0
    }

    filters.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-filter')
        filters.forEach((other) => {
          const on = other === btn
          other.classList.toggle('is-active', on)
          other.setAttribute('aria-selected', String(on))
        })
        applyFilter(key)
      })
    })

    const continued = root.querySelector('[data-continue]')
    if (continued) continued.addEventListener('click', () => ctx.go('survey'))

    const currentView = root.querySelector('[data-view-current]')
    if (currentView) {
      currentView.addEventListener('click', () => {
        ctx.state.viewingResult = null
        ctx.go('result')
      })
    }

    root.querySelectorAll('[data-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-history')
        const item = HISTORY.find((entry) => entry.key === key)
        if (!item) return
        ctx.state.viewingResult = item
        ctx.go('result')
      })
    })
  }

  // ── 6. 我的测评 ──────────────────────────────────────────────────────────

  function renderCouple(ctx) {
    const s = ctx.state
    const session = s.session || { loggedIn: false }
    if (!session.loggedIn) {
      return (
        '<div class="ans ans--couple">' +
          appbar(ctx, { title: '我的测评', backTo: 'cover' }) +
          '<div class="ans-page">' +
            '<div class="ans-guest">' +
              '<span class="ans-guest__art">' + ctx.icon('users', 26) + '</span>' +
              '<h1 class="ans-guest__title">登录后查看全部测评</h1>' +
              '<p class="ans-guest__tip">已完成的测评、分数与维度会保存在你的账号里，换设备登录也能看到。</p>' +
              '<button type="button" class="btn btn--primary" data-login>登录查看</button>' +
              '<p class="ans-guest__foot">账号由园区统一发放</p>' +
            '</div>' +
          '</div>' +
        '</div>'
      )
    }

    const cards = HISTORY.map(
      (item) =>
        '<button type="button" class="ans-mcard" data-history="' + item.key + '">' +
          '<span class="ans-mcard__top">' +
            '<span class="ans-mcard__title">' + esc(item.title) + '</span>' +
            '<span class="ans-mcard__score tnum">' + item.score + '<span> / ' + item.total + '</span></span>' +
          '</span>' +
          '<span class="ans-mcard__meta">' +
            '<span class="tag tag--ok"><span class="tag__dot"></span>已提交</span>' +
            '<span class="ans-rec__meta-sep"></span>' +
            '<span class="tnum">' + esc(item.submittedAt) + '</span>' +
          '</span>' +
          '<span class="ans-mcard__dims">' +
            item.dims.map((dim) => '<span class="chip chip--muted">' + esc(dim) + '</span>').join('') +
          '</span>' +
          '<span class="ans-mcard__go">查看结果' + ctx.icon('forward', 14) + '</span>' +
        '</button>',
    ).join('')

    return (
      '<div class="ans ans--couple">' +
        appbar(ctx, {
          title: '我的测评',
          backTo: 'cover',
          action: '<button type="button" class="appbar__action" data-logout>退出</button>',
        }) +
        '<div class="ans-page">' +
          '<div class="ans-me">' +
            '<span class="ans-me__avatar">' + esc(String(session.name || '林').slice(0, 1)) + '</span>' +
            '<div>' +
              '<p class="ans-me__name">' + esc(session.name || '林一舟') + '</p>' +
              '<p class="ans-me__dept">' + esc(session.dept || '技术部') + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="ans-sec">' +
            '<span class="ans-sec__label">已完成</span>' +
            '<span class="ans-sec__count tnum">' + HISTORY.length + ' 份</span>' +
          '</div>' +
          '<div class="ans-mcards">' + cards + '</div>' +
          '<p class="ans-foot">测评结果仅本人可见</p>' +
        '</div>' +
      '</div>'
    )
  }

  function mountCouple(root, ctx) {
    wireGoto(root, ctx)

    const login = root.querySelector('[data-login]')
    if (login) login.addEventListener('click', () => ctx.go('login-m'))

    const logout = root.querySelector('[data-logout]')
    if (logout) {
      logout.addEventListener('click', () => {
        ctx
          .confirm({
            title: '退出登录',
            body: '退出后需要重新登录才能查看已完成的测评。',
            confirmText: '退出',
          })
          .then((ok) => {
            if (!ok) return
            ctx.state.session.loggedIn = false
            ctx.save()
            ctx.rerender()
            ctx.toast('已退出登录', 'info')
          })
      })
    }

    root.querySelectorAll('[data-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-history')
        const item = HISTORY.find((entry) => entry.key === key)
        if (!item) return
        ctx.state.viewingResult = item
        ctx.go('result')
      })
    })
  }

  // ── 7. 移动登录 ──────────────────────────────────────────────────────────

  let showPassword = false

  function renderLogin(ctx) {
    return (
      '<div class="ans ans--login">' +
        '<div class="ans-login">' +
          '<button type="button" class="btn btn--icon ans-login__back" data-goto="couple" aria-label="返回">' +
            ctx.icon('back', 20) +
          '</button>' +
          '<div class="ans-brand">' +
            '<span class="ans-brand__mark" aria-hidden="true">问</span>' +
            '<p class="ans-brand__word">园区问卷</p>' +
            '<span class="ans-brand__tag">健康与体验调研</span>' +
          '</div>' +
          '<h1 class="ans-login__title">登录你的账号</h1>' +
          '<p class="ans-login__sub">查看已完成的测评与历史记录</p>' +
          '<form class="ans-login__form" data-login-form novalidate>' +
            '<div class="field" data-field="acc">' +
              '<label class="field__label" for="acc">账号</label>' +
              '<input class="input" id="acc" name="account" type="text" autocomplete="username" placeholder="请输入账号">' +
            '</div>' +
            '<div class="field" data-field="pass">' +
              '<label class="field__label" for="pass">密码</label>' +
              '<div class="ans-pass">' +
                '<input class="input" id="pass" name="password" type="password" autocomplete="current-password" placeholder="请输入密码">' +
                '<button type="button" class="ans-pass__toggle" data-eye aria-label="显示密码" aria-pressed="false">' +
                  ctx.icon(showPassword ? 'eye-off' : 'eye', 20) +
                '</button>' +
              '</div>' +
            '</div>' +
            '<label class="switch ans-login__remember">' +
              '<input type="checkbox" checked>' +
              '<span class="switch__track"></span>' +
              '<span class="switch__text">记住我</span>' +
            '</label>' +
            '<p class="ans-login__err" data-login-err role="alert" hidden></p>' +
            '<button type="submit" class="btn btn--primary btn--block">登录</button>' +
            '<p class="ans-login__hint">演示账号 linyizhou · 密码 123456</p>' +
          '</form>' +
          '<p class="ans-login__foot"><span>账号由园区统一发放</span><span>忘记密码请联系行政</span></p>' +
        '</div>' +
      '</div>'
    )
  }

  function mountLogin(root, ctx) {
    wireGoto(root, ctx)
    const form = root.querySelector('[data-login-form]')
    if (!form) return undefined
    const accEl = root.querySelector('#acc')
    const passEl = root.querySelector('#pass')
    const errEl = root.querySelector('[data-login-err]')
    const eye = root.querySelector('[data-eye]')
    let busy = false

    if (eye) {
      eye.addEventListener('click', () => {
        showPassword = !showPassword
        passEl.type = showPassword ? 'text' : 'password'
        eye.setAttribute('aria-pressed', String(showPassword))
        eye.setAttribute('aria-label', showPassword ? '隐藏密码' : '显示密码')
        eye.innerHTML = ctx.icon(showPassword ? 'eye-off' : 'eye', 20)
        passEl.focus({ preventScroll: true })
      })
    }

    function showError(message, target) {
      if (errEl) {
        errEl.innerHTML = ctx.icon('close', 14) + '<span>' + esc(message) + '</span>'
        errEl.hidden = false
      }
      form.classList.remove('ans-shake')
      void form.offsetWidth
      form.classList.add('ans-shake')
      if (target) target.focus()
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      if (busy) return
      const account = accEl.value.trim()
      const password = passEl.value
      if (!account) {
        showError('请输入账号', accEl)
        return
      }
      if (!password) {
        showError('请输入密码', passEl)
        return
      }
      if (account.toLowerCase() !== 'linyizhou' || password !== '123456') {
        showError('账号或密码不正确', accEl)
        return
      }
      busy = true
      if (errEl) errEl.hidden = true
      ctx.state.session.loggedIn = true
      ctx.state.session.name = '林一舟'
      ctx.state.session.dept = '技术部'
      ctx.save()
      ctx.go('couple')
      ctx.toast('已登录', 'ok')
    })
  }

  // ── 注册 ─────────────────────────────────────────────────────────────────

  const register = (id, def) => P().register(id, def)

  register('cover', {
    group: 'answer',
    label: '问卷封面',
    note: '大标题 + 信息条 + 单一主行动',
    render: renderCover,
    mount: mountCover,
  })

  register('survey', {
    group: 'answer',
    label: '作答页',
    note: '吸顶进度 + 整行选项 + 自动暂存',
    render: (ctx) => renderSurvey(ctx, {}),
    mount: (root, ctx) => mountSurvey(root, ctx),
  })

  register('survey-invalid', {
    group: 'answer',
    label: '作答页 · 校验失败',
    note: '必答校验失败：错误摘要 + 题块标红',
    render: (ctx) => renderSurvey(ctx, { invalid: true }),
    mount: (root, ctx) => mountSurvey(root, ctx),
  })

  register('submit', {
    group: 'answer',
    label: '提交信息',
    note: '提交前确认联系信息 · 隐私说明',
    render: renderSubmit,
    mount: mountSubmit,
  })

  register('result', {
    group: 'answer',
    label: '作答结果',
    note: 'SVG 分数环 + 逐题回顾（我的作答 / 正确答案）',
    render: renderResult,
    mount: mountResult,
  })

  register('records', {
    group: 'answer',
    label: '作答记录',
    note: '草稿与历史记录 · 筛选与空态',
    render: renderRecords,
    mount: mountRecords,
  })

  register('couple', {
    group: 'answer',
    label: '我的测评',
    note: '登录后查看已完成测评',
    render: renderCouple,
    mount: mountCouple,
  })

  register('login-m', {
    group: 'answer',
    label: '移动登录',
    note: '账号密码 · 明文切换 · 错误抖动',
    render: renderLogin,
    mount: mountLogin,
  })
})()
