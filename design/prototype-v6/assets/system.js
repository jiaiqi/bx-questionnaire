/* ═══════════════════════════════════════════════════════════════════════════
   V6.1「清简」设计系统屏（system）
   —— 在桌面框里展示活的设计系统：所有色值 / 字号 / 间距 / 阴影 / 时长在
      mount 时从 assets/tokens.css 读取；对比度按 WCAG 2.1 相对亮度公式当场计算。
   —— 只写这一屏；共享组件来自 base.css，外壳 API 来自 shell.js（window.Proto）。
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict'

  // ── 内容配置 ─────────────────────────────────────────────────────────────

  const NAV = [
    ['sys-palette', '色彩'],
    ['sys-type', '字阶'],
    ['sys-space', '间距与圆角'],
    ['sys-elevation', '阴影'],
    ['sys-buttons', '按钮'],
    ['sys-inputs', '输入'],
    ['sys-states', '状态与选择'],
    ['sys-motion', '动效'],
    ['sys-icons', '图标'],
    ['sys-density', '双端密度'],
    ['sys-revision', 'V6.1 修订'],
  ]

  /*
   * 对比度标注：
   *   contrast[].label 是在色块旁显示的短标签；
   *   fg / bg 都写令牌名，mount 时解析成实际颜色再计算，数值永远来自 tokens.css。
   *   nonText 为真时按非文本 3:1 阈值判断。
   */
  const PALETTE = [
    {
      title: '画布与墨 · 中性',
      note: '画布、面、文字与线。不用色相表达层级；层级来自明度、字号与 1px 描边。',
      items: [
        { token: '--c-paper', use: '画布底', kind: 'surface' },
        { token: '--c-sheet', use: '卡片 / 输入框面', kind: 'surface' },
        { token: '--c-sheet-2', use: '次级面 / 表头 / 只读区', kind: 'surface' },
        { token: '--c-sheet-3', use: '选中浅底 / 悬停', kind: 'surface' },
        {
          token: '--c-ink',
          use: '主文字',
          contrast: [
            { label: '白面', fg: '--c-ink', bg: '--c-sheet' },
            { label: '画布', fg: '--c-ink', bg: '--c-paper' },
          ],
        },
        {
          token: '--c-ink-2',
          use: '次要文字 / 选项文案',
          contrast: [
            { label: '白面', fg: '--c-ink-2', bg: '--c-sheet' },
            { label: '画布', fg: '--c-ink-2', bg: '--c-paper' },
          ],
        },
        {
          token: '--c-ink-3',
          use: '元信息（≥12px）',
          contrast: [
            { label: '白面', fg: '--c-ink-3', bg: '--c-sheet' },
            { label: '画布', fg: '--c-ink-3', bg: '--c-paper' },
          ],
        },
        {
          token: '--c-ink-4',
          use: '仅占位符与装饰',
          contrast: [{ label: '白面', fg: '--c-ink-4', bg: '--c-sheet' }],
          cap: '不得承载信息',
        },
        { token: '--c-line', use: '描边 / 分割线', kind: 'line', contrast: [{ label: '白面', fg: '--c-line', bg: '--c-sheet' }], nonText: true },
        { token: '--c-line-2', use: '细分隔', kind: 'line', contrast: [{ label: '白面', fg: '--c-line-2', bg: '--c-sheet' }], nonText: true },
        { token: '--c-line-3', use: '强描边 / 悬停', kind: 'line', contrast: [{ label: '白面', fg: '--c-line-3', bg: '--c-sheet' }], nonText: true },
      ],
    },
    {
      title: '唯一一笔 · 靛蓝',
      note: '全站唯一强调色，只用于三件事：进度、选中、主行动。不涂标题、不做装饰、不给整行上色。',
      items: [
        {
          token: '--c-accent',
          use: '主行动 / 进度 / 选中',
          contrast: [
            { label: '白面文字', fg: '--c-accent', bg: '--c-sheet' },
            { label: '白字', fg: '--c-on-accent', bg: '--c-accent' },
          ],
        },
        {
          token: '--c-accent-hover',
          use: '悬停加深',
          contrast: [{ label: '白字', fg: '--c-on-accent', bg: '--c-accent-hover' }],
        },
        {
          token: '--c-accent-press',
          use: '按下加深',
          contrast: [{ label: '白字', fg: '--c-on-accent', bg: '--c-accent-press' }],
        },
        { token: '--c-accent-soft', use: '选中浅底 / 焦点光晕', kind: 'surface' },
        { token: '--c-accent-line', use: '主色描边', kind: 'line', contrast: [{ label: '白面', fg: '--c-accent-line', bg: '--c-sheet' }], nonText: true },
        {
          token: '--c-accent-ink',
          use: '浅底上的强调文字',
          contrast: [{ label: '浅底', fg: '--c-accent-ink', bg: '--c-accent-soft' }],
        },
      ],
    },
    {
      title: '语义色 · 三件套',
      note: '文字 / 浅底 / 描边成对出现；只在真的表达成功、警告、危险时用。',
      items: [
        { token: '--c-ok', use: '成功文字', contrast: [{ label: '白面', fg: '--c-ok', bg: '--c-sheet' }] },
        { token: '--c-ok-soft', use: '成功浅底', kind: 'surface' },
        { token: '--c-ok-line', use: '成功描边', kind: 'line', contrast: [{ label: '白面', fg: '--c-ok-line', bg: '--c-sheet' }], nonText: true },
        { token: '--c-warn', use: '警告文字', contrast: [{ label: '白面', fg: '--c-warn', bg: '--c-sheet' }] },
        { token: '--c-warn-soft', use: '警告浅底', kind: 'surface' },
        { token: '--c-warn-line', use: '警告描边', kind: 'line', contrast: [{ label: '白面', fg: '--c-warn-line', bg: '--c-sheet' }], nonText: true },
        { token: '--c-danger', use: '危险文字', contrast: [{ label: '白面', fg: '--c-danger', bg: '--c-sheet' }] },
        { token: '--c-danger-soft', use: '危险浅底', kind: 'surface' },
        { token: '--c-danger-line', use: '危险描边', kind: 'line', contrast: [{ label: '白面', fg: '--c-danger-line', bg: '--c-sheet' }], nonText: true },
      ],
    },
    {
      title: '场景专用',
      note: '焦点环实际用 --c-accent（2px 描边 + 2px offset）；--c-focus 是深色 / 图片底上的浅色备选，本版未启用。遮罩单独成令牌，避免各处手写 rgba。',
      items: [
        { token: '--c-focus', use: '浅色备选 · 未启用', contrast: [{ label: '白面', fg: '--c-focus', bg: '--c-sheet' }], nonText: true, badge: '未启用' },
        { token: '--c-scrim', use: '弹层遮罩', kind: 'surface' },
        { token: '--c-scrim-soft', use: '目录 / 抽屉遮罩', kind: 'surface' },
      ],
    },
  ]

  const TYPES = [
    { token: '--fs-display', lh: '--lh-display', size: '32', lhVal: '1.25', use: '封面大标题、结果大分数', sample: '员工满意度调查' },
    { token: '--fs-h1', lh: '--lh-h1', size: '24', lhVal: '1.32', use: '页面主标题、登录品牌字', sample: '2026 年度园区体验调研' },
    { token: '--fs-h2', lh: '--lh-h2', size: '19', lhVal: '1.40', use: '区块标题、弹层标题', sample: '你对当前工作的整体满意度' },
    { token: '--fs-h3', lh: '--lh-h3', size: '16', lhVal: '1.50', use: '题干、卡片标题', sample: '你的工作地点所在区域' },
    { token: '--fs-body', lh: '--lh-body', size: '15', lhVal: '1.70', use: '正文、选项、输入值', sample: '这是一份匿名问卷，约 3 分钟完成。回答只用于整体分析。' },
    { token: '--fs-sub', lh: '--lh-sub', size: '13', lhVal: '1.60', use: '辅助说明、元信息', sample: '匿名作答 · 仅用于整体分析 · 不用于绩效评估' },
    { token: '--fs-cap', lh: '--lh-cap', size: '12', lhVal: '1.50', use: '时间、状态、表格元信息', sample: '截止 2026-12-31 · 128 人已答' },
    { token: '--fs-micro', lh: '--lh-micro', size: '11', lhVal: '1.45', use: '编号、令牌名、极短标签', sample: 'ACT202610220001' },
  ]

  const SPACES = [
    { token: '--sp-1', val: '4', use: '图标与文字、标签内' },
    { token: '--sp-2', val: '8', use: '行内元素间距、按钮图标' },
    { token: '--sp-3', val: '12', use: '段落间距、卡片内紧凑' },
    { token: '--sp-4', val: '16', use: '卡片内边距、表单行距' },
    { token: '--sp-5', val: '20', use: '宽卡片内边距' },
    { token: '--sp-6', val: '24', use: '区块内间距、弹层内边距' },
    { token: '--sp-8', val: '32', use: '分节间距' },
    { token: '--sp-10', val: '40', use: '页面左右边距' },
    { token: '--sp-12', val: '48', use: '大分节、空态上下' },
    { token: '--sp-16', val: '64', use: '页面级留白' },
  ]

  const RADII = [
    { token: '--r-1', val: '4', use: '小标记' },
    { token: '--r-2', val: '8', use: '图标按钮 / chip 内' },
    { token: '--r-3', val: '10', use: '按钮 / 输入框' },
    { token: '--r-4', val: '14', use: '卡片 / 弹层' },
    { token: '--r-5', val: '20', use: '容器面 / 设备框' },
    { token: '--r-pill', val: '999', use: '标签 / 分段', pill: true },
  ]

  const SHADOWS = [
    { token: '--sh-1', name: '轻浮起', use: '卡片、容器面' },
    { token: '--sh-2', name: '浮层', use: '下拉、吸顶、toast' },
    { token: '--sh-3', name: '弹层', use: '模态、目录、设备框' },
  ]

  const BUTTON_VARIANTS = [
    { cls: 'btn--primary', name: '主行动', flag: '一屏一个', text: '开始作答', toast: '主按钮：一屏只放一个主行动' },
    { cls: 'btn--ghost', name: '次行动', flag: '白底 + 描边', text: '返回', toast: '次按钮：白底描边，与主按钮并排' },
    { cls: 'btn--quiet', name: '低优先', flag: '无底色', text: '取消', toast: '低优先：取消、返回类操作' },
    { cls: 'btn--danger', name: '危险', flag: '需二次确认', text: '删除问卷', toast: '危险按钮：确认后才执行，不单独出现' },
  ]

  const ICONS = [
    'back', 'forward', 'down', 'plus', 'minus', 'search', 'close', 'check',
    'edit', 'trash', 'copy', 'drag', 'eye', 'eye-off', 'calendar', 'clock',
    'image', 'pin', 'link', 'user', 'users', 'chart', 'list', 'save',
    'send', 'refresh', 'more', 'filter', 'lock', 'spark', 'arrow-up', 'arrow-down',
    'download', 'share',
  ]

  // ── 渲染片段 ─────────────────────────────────────────────────────────────

  function ratioSpan(c) {
    return (
      '<span class="sys-swatch__ratio">' + escHtmlFor(c.label) +
      ' <b data-sys-ratio data-fg="' + c.fg + '" data-bg="' + c.bg + '"></b></span>'
    )
  }

  function escHtmlFor(value) {
    return String(value == null ? '' : value)
  }

  function swatch(item) {
    const ratios = (item.contrast || []).map((c) => ratioSpan(c)).join('')
    const pairs = (item.contrast || []).map((c) => c.fg + '|' + c.bg).join(',')
    let badge = ''
    if (item.badge) {
      badge = '<span class="sys-grade">' + item.badge + '</span>'
    } else if (pairs) {
      badge = '<span class="sys-grade" data-sys-grade data-pairs="' + pairs +
        '" data-non-text="' + (item.nonText ? '1' : '') + '"></span>'
    }
    const cap = item.cap ? '<span class="sys-swatch__ratio">' + item.cap + '</span>' : ''
    return (
      '<button type="button" class="sys-swatch" data-sys-swatch="' + item.token + '" data-sys-swatch-use="' + escHtmlFor(item.use) + '"' +
        ' aria-label="' + item.token + ' ' + escHtmlFor(item.use) + '">' +
        '<span class="sys-swatch__chip" style="background:var(' + item.token + ')"></span>' +
        '<span class="sys-swatch__body">' +
          '<code class="sys-swatch__token">' + item.token + '</code>' +
          '<span class="sys-swatch__use">' + escHtmlFor(item.use) + '</span>' +
          '<span class="sys-swatch__meta">' +
            '<code class="sys-swatch__hex" data-sys-hex="' + item.token + '"></code>' +
            ratios + cap + badge +
          '</span>' +
        '</span>' +
      '</button>'
    )
  }

  function paletteGroup(group) {
    return (
      '<div class="sys-group">' +
        '<div class="sys-group__head">' +
          '<h3 class="sys-group__title">' + escHtmlFor(group.title) + '</h3>' +
          '<p class="sys-group__note">' + escHtmlFor(group.note) + '</p>' +
        '</div>' +
        '<div class="sys-swatches">' + group.items.map(swatch).join('') + '</div>' +
      '</div>'
    )
  }

  function typeRow(t, ctx) {
    return (
      '<div class="sys-type__row">' +
        '<code class="sys-type__token">' + t.token + '</code>' +
        '<span class="sys-type__spec"><b>' + t.size + '</b><span>px / ' + t.lhVal + '</span></span>' +
        '<span class="sys-type__use">' + escHtmlFor(t.use) + '</span>' +
        '<span class="sys-type__sample"' +
          ' style="font-size:var(' + t.token + ');line-height:var(' + t.lh + ')">' +
          ctx.esc(t.sample) +
        '</span>' +
      '</div>'
    )
  }

  function typeBlock(ctx) {
    const weight = (fw, name, use, text) =>
      '<div class="sys-face">' +
        '<div class="sys-face__head"><span class="sys-face__name">' + name + '</span>' +
        '<code class="sys-swatch__token">' + fw + '</code></div>' +
        '<p class="sys-face__sample" style="font-weight:' + fw + '">员工满意度调查</p>' +
        '<p class="sys-face__body">' + text + '</p>' +
        '<p class="sys-face__uses">用于：' + use + '</p>' +
      '</div>'

    return (
      '<div class="sys-group">' +
        '<div class="sys-group__head">' +
          '<h3 class="sys-group__title">字阶 · 字号 px / 行高倍数</h3>' +
          '<p class="sys-group__note">中文正文行高 1.70（作答端）；标题 1.25–1.50。数字一律 tabular-nums。</p>' +
        '</div>' +
        '<div class="sys-type">' + TYPES.map((t) => typeRow(t, ctx)).join('') + '</div>' +
        '<p class="sys-group__note">管理端 .dense 覆盖：body 13px / 1.5、sub 12px / 1.5、cap 12px、micro 11px；display 到 h3 不变，颜色不变。</p>' +
      '</div>' +
      '<div class="sys-group">' +
        '<div class="sys-group__head">' +
          '<h3 class="sys-group__title">字重与字距</h3>' +
          '<p class="sys-group__note">产品 UI 全部无衬线（--font-sans，不加载 Web Font）。层级靠 400 / 500 / 600 三档字重与 --ls-tight / --ls-wide，不靠字体家族。</p>' +
        '</div>' +
        '<div class="sys-faces">' +
          weight('var(--fw-reg)', '400 · 常规', '正文、选项、表格内容', '不抢注意力；中文 15px、行高 1.7，密度交给留白。') +
          weight('var(--fw-med)', '500 · 强调', '按钮、选中项、字段标签', '只抬高半档，用于可点或可选的位置，不用于装饰。') +
          weight('var(--fw-semi)', '600 · 标题', '标题、卡片名、弹层标题', '标题不用更大字号，用 600 + 收紧字距建立层级。') +
        '</div>' +
        '<div class="sys-mono">' +
          '<span>--ls-tight <b data-sys-val="--ls-tight"></b></span>' +
          '<span>--ls-wide <b data-sys-val="--ls-wide"></b></span>' +
          '<span>--c-accent</span><span>2026-12-31</span><span>10:32</span><span>128 / 132</span>' +
          '<span style="font-family:var(--font-sans)">标题用 --ls-tight 收紧；11px 小标签用 --ls-wide 放宽。令牌名、日期与计数走等宽 + tabular-nums。</span>' +
        '</div>' +
      '</div>'
    )
  }

  function spaceBlock() {
    return (
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">间距 · 4 基数</h3>' +
        '<p class="sys-group__note">只使用这十档；页面留白、控件内边距、图标与文字的距离都从里面取。</p></div>' +
        '<div class="sys-spaces">' +
          SPACES.map((s) =>
            '<div class="sys-space">' +
              '<code class="sys-space__token">' + s.token + '</code>' +
              '<span class="sys-space__val">' + s.val + '</span>' +
              '<span class="sys-space__bar" style="width:var(' + s.token + ')"></span>' +
              '<span class="sys-space__use">' + escHtmlFor(s.use) + '</span>' +
            '</div>',
          ).join('') +
        '</div>' +
      '</div>'
    )
  }

  function radiusBlock() {
    return (
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">圆角 · 按语义分档</h3>' +
        '<p class="sys-group__note">按钮与输入框 10、卡片 14、容器面 20、标签 999；不做「一律大圆角」。</p></div>' +
        '<div class="sys-radii">' +
          RADII.map((r) =>
            '<div class="sys-radius">' +
              (r.pill
                ? '<span class="sys-radius__box sys-radius__box--pill"></span>'
                : '<span class="sys-radius__box" style="border-radius:var(' + r.token + ')"></span>') +
              '<code class="sys-radius__token">' + r.token + '</code>' +
              '<span class="sys-radius__val">' + r.val + 'px</span>' +
              '<span class="sys-radius__val">' + escHtmlFor(r.use) + '</span>' +
            '</div>',
          ).join('') +
        '</div>' +
      '</div>'
    )
  }

  function shadowBlock() {
    return (
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">阴影 · 只表达浮起</h3>' +
        '<p class="sys-group__note">描边优先于阴影：面层靠 1px 描边 + 极轻阴影成立。阴影不表达层级高低以外的任何含义。</p></div>' +
        '<div class="sys-shadows">' +
          SHADOWS.map((s) =>
            '<div class="sys-shadow">' +
              '<span class="sys-shadow__tile" style="box-shadow:var(' + s.token + ')"></span>' +
              '<div class="sys-shadow__head">' +
                '<code class="sys-shadow__token">' + s.token + '</code>' +
                '<span class="sys-shadow__use">' + escHtmlFor(s.name) + '</span>' +
              '</div>' +
              '<code class="sys-shadow__val" data-sys-val="' + s.token + '"></code>' +
              '<span class="sys-shadow__use">' + escHtmlFor(s.use) + '</span>' +
            '</div>',
          ).join('') +
        '</div>' +
      '</div>'
    )
  }

  function buttonBlock(ctx) {
    const variants = BUTTON_VARIANTS.map((b) =>
      '<div class="sys-demo">' +
        '<div class="sys-demo__head"><span class="sys-demo__name">' + escHtmlFor(b.name) + '</span>' +
        '<span class="sys-demo__flag">' + escHtmlFor(b.flag) + '</span></div>' +
        '<div class="sys-demo__stage">' +
          '<button type="button" class="btn ' + b.cls + '" data-sys-toast="' + escHtmlFor(b.toast) + '"' +
          ' data-sys-measure="btn-' + b.cls + '">' + escHtmlFor(b.text) + '</button>' +
        '</div>' +
        '<p class="sys-demo__spec">高 <span data-sys-out="btn-' + b.cls + '"></span> · 圆角 r-3 · ' +
          (b.cls === 'btn--primary' || b.cls === 'btn--danger'
            ? '白字 <b data-sys-ratio data-fg="--c-on-accent" data-bg="' + (b.cls === 'btn--primary' ? '--c-accent' : '--c-danger') + '"></b>'
            : '文字 <b data-sys-ratio data-fg="--c-ink" data-bg="--c-sheet"></b>') +
        '</p>' +
      '</div>',
    ).join('')

    const sizes =
      '<div class="sys-demo">' +
        '<div class="sys-demo__head"><span class="sys-demo__name">小</span><span class="sys-demo__flag">表格行内</span></div>' +
        '<div class="sys-demo__stage"><button type="button" class="btn btn--ghost btn--sm" data-sys-toast="小号按钮：表格行内、工具条" data-sys-measure="btn-sm">编辑</button></div>' +
        '<p class="sys-demo__spec">--sm · 高 <span data-sys-out="btn-sm"></span></p>' +
      '</div>' +
      '<div class="sys-demo">' +
        '<div class="sys-demo__head"><span class="sys-demo__name">标准</span><span class="sys-demo__flag">默认</span></div>' +
        '<div class="sys-demo__stage"><button type="button" class="btn btn--ghost" data-sys-toast="标准按钮：默认高 44，管理端 40" data-sys-measure="btn-md">查看</button></div>' +
        '<p class="sys-demo__spec">.btn · 高 <span data-sys-out="btn-md"></span></p>' +
      '</div>' +
      '<div class="sys-demo">' +
        '<div class="sys-demo__head"><span class="sys-demo__name">大</span><span class="sys-demo__flag">封面主操作</span></div>' +
        '<div class="sys-demo__stage"><button type="button" class="btn btn--primary btn--lg" data-sys-toast="大号按钮：封面、结果页的主操作" data-sys-measure="btn-lg">提交问卷</button></div>' +
        '<p class="sys-demo__spec">--lg · 高 <span data-sys-out="btn-lg"></span></p>' +
      '</div>' +
      '<div class="sys-demo">' +
        '<div class="sys-demo__head"><span class="sys-demo__name">图标</span><span class="sys-demo__flag">必须有 aria-label</span></div>' +
        '<div class="sys-demo__stage"><button type="button" class="btn btn--icon" aria-label="更多操作" data-sys-toast="图标按钮：更多操作，必须有 aria-label">' + ctx.icon('more', 18) + '</button></div>' +
        '<p class="sys-demo__spec">--icon · 点击区 ≥34</p>' +
      '</div>' +
      '<div class="sys-demo">' +
        '<div class="sys-demo__head"><span class="sys-demo__name">撑满</span><span class="sys-demo__flag">吸底栏</span></div>' +
        '<div class="sys-demo__stage sys-demo__stage--start"><button type="button" class="btn btn--primary btn--block" data-sys-toast="撑满按钮：移动端吸底操作栏" data-sys-measure="btn-block">保存并发布</button></div>' +
        '<p class="sys-demo__spec">--block · 高 <span data-sys-out="btn-block"></span></p>' +
      '</div>'

    return (
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">四个变体</h3>' +
        '<p class="sys-group__note">同一屏最多一个主按钮。悬停加深、按下再深一档并下移 1px；禁用态 0.45 透明度，不改变布局。</p></div>' +
        '<div class="sys-btns">' + variants + '</div>' +
      '</div>' +
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">尺寸与形态</h3>' +
        '<p class="sys-group__note">移动端最小点击区 44×44；管理端 .dense 下标准按钮 40。图标按钮仍要 aria-label。</p></div>' +
        '<div class="sys-btns sys-btns--sizes">' + sizes + '</div>' +
      '</div>' +
      '<div class="sys-demo">' +
        '<div class="sys-demo__head"><span class="sys-demo__name">禁用态</span><span class="sys-demo__flag">opacity .45</span></div>' +
        '<div class="sys-demo__stage sys-demo__stage--start">' +
          '<button type="button" class="btn btn--primary" disabled>已发布</button>' +
          '<button type="button" class="btn btn--ghost" disabled>不可编辑</button>' +
        '</div>' +
        '<p class="sys-demo__spec">禁用只降低不透明度，不换色、不缩字号；aria-disabled 与 disabled 同步。</p>' +
      '</div>'
    )
  }

  function inputBlock(ctx) {
    const state = (name, hint, body) =>
      '<div class="sys-state-card">' +
        '<div class="sys-state-card__head"><span class="sys-state-card__name">' + name + '</span><span class="sys-state-card__hint">' + hint + '</span></div>' +
        body +
      '</div>'

    return (
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">输入框三态</h3>' +
        '<p class="sys-group__note">高度 44（dense 40）、圆角 10、1px 描边；聚焦 = accent 描边 + 3px 柔光环，不用 outline 以免小程序端不一致。错误态同时给红描边与文案，不单靠颜色。</p></div>' +
        '<div class="sys-inputs">' +
          state('默认', '--c-line 描边',
            '<div class="field">' +
              '<label class="field__label" for="sys-in-1">部门</label>' +
              '<input class="input" id="sys-in-1" type="text" value="技术部" data-sys-measure="input-default" autocomplete="off">' +
              '<p class="field__hint">从组织架构同步</p>' +
            '</div>') +
          state('聚焦', 'accent + 柔光环',
            '<div class="field">' +
              '<label class="field__label" for="sys-in-2">手机号</label>' +
              '<input class="input" id="sys-in-2" type="tel" value="138 0000 0000" data-sys-autofocus data-sys-measure="input-focus" autocomplete="off">' +
              '<p class="field__hint">选填 · 11 位</p>' +
            '</div>') +
          state('错误', '红描边 + 文案',
            '<div class="field is-invalid">' +
              '<label class="field__label" for="sys-in-3">姓名 <span class="field__req" aria-hidden="true">*</span></label>' +
              '<input class="input" id="sys-in-3" type="text" placeholder="请输入姓名" aria-invalid="true" aria-describedby="sys-in-3-err" data-sys-measure="input-error">' +
              '<p class="field__error" id="sys-in-3-err">姓名不能为空</p>' +
            '</div>') +
        '</div>' +
        '<p class="sys-group__note">实测高度：默认 <b data-sys-out="input-default"></b> · 错误 <b data-sys-out="input-error"></b>；placeholder 用 --c-ink-4（仅占位，不承载信息）。</p>' +
      '</div>' +
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">同类控件</h3>' +
        '<p class="sys-group__note">下拉与多行文本共用同一套描边、圆角与聚焦规则；多行文本给字数统计。</p></div>' +
        '<div class="sys-inputs__extra">' +
          state('下拉', '原生 select + 图标',
            '<div class="field">' +
              '<label class="field__label" for="sys-sel">所在部门</label>' +
              '<span class="sys-select-wrap">' +
                '<select class="select" id="sys-sel">' +
                  '<option>技术部</option><option>产品部</option><option>市场部</option><option>职能部</option>' +
                '</select>' +
                ctx.icon('down', 18) +
              '</span>' +
              '<p class="field__hint">键盘上下键可切换</p>' +
            '</div>') +
          state('多行文本', 'maxlength 200',
            '<div class="field">' +
              '<label class="field__label" for="sys-ta">你的建议</label>' +
              '<textarea class="textarea" id="sys-ta" maxlength="200" rows="3">希望食堂增加清淡窗口。</textarea>' +
              '<p class="field__hint"><span data-sys-count="sys-ta">11</span> / 200</p>' +
            '</div>') +
        '</div>' +
      '</div>'
    )
  }

  function stateBlock(ctx) {
    const tag = (cls, text) =>
      '<span class="tag ' + cls + '"><span class="tag__dot" aria-hidden="true"></span>' + text + '</span>'
    const chip = (cls, text) => '<span class="chip ' + cls + '">' + text + '</span>'
    const sw = (label, checked) =>
      '<label class="switch"><input type="checkbox"' + (checked ? ' checked' : '') + '>' +
        '<span class="switch__track" aria-hidden="true"></span><span class="switch__text">' + label + '</span></label>'
    const segItem = (text, active) =>
      '<button type="button" class="seg__item' + (active ? ' is-active' : '') + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + text + '</button>'

    return (
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">状态点 · 标签 · 开关 · 分段</h3>' +
        '<p class="sys-group__note">状态一律「点 + 文字」双编码，不允许只靠颜色；开关与分段都是真实控件，可点、可 Tab、可空格切换。</p></div>' +
        '<div class="sys-status">' +
          '<div class="sys-demo">' +
            '<div class="sys-demo__head"><span class="sys-demo__name">状态点</span><span class="sys-demo__flag">.tag</span></div>' +
            '<div class="sys-demo__stage">' +
              tag('tag--accent', '进行中') + tag('tag--ok', '未开始') + tag('tag--warn', '已逾期') + tag('tag--muted', '已结束') +
            '</div>' +
            '<p class="sys-demo__spec">点 + 文本，管理端状态列使用</p>' +
          '</div>' +
          '<div class="sys-demo">' +
            '<div class="sys-demo__head"><span class="sys-demo__name">标签</span><span class="sys-demo__flag">.chip</span></div>' +
            '<div class="sys-demo__stage">' +
              chip('chip--accent', '匿名作答') + chip('chip--ok', '已通过') + chip('chip--warn', '待补充') + chip('chip--muted', '已归档') +
            '</div>' +
            '<p class="sys-demo__spec">浅底 + 描边 + 语义文字，三件套同时出现</p>' +
          '</div>' +
          '<div class="sys-demo">' +
            '<div class="sys-demo__head"><span class="sys-demo__name">开关</span><span class="sys-demo__flag">.switch</span></div>' +
            '<div class="sys-demo__stage">' + sw('匿名作答', true) + sw('自动暂存', false) + '</div>' +
            '<p class="sys-demo__spec">整行 label 可点；运行时读 checked 状态</p>' +
          '</div>' +
          '<div class="sys-demo">' +
            '<div class="sys-demo__head"><span class="sys-demo__name">分段</span><span class="sys-demo__flag">.seg</span></div>' +
            '<div class="sys-demo__stage">' +
              '<div class="seg" role="group" aria-label="按状态筛选">' +
                segItem('全部', true) + segItem('未开始', false) + segItem('进行中', false) + segItem('已结束', false) +
              '</div>' +
            '</div>' +
            '<p class="sys-demo__spec">单选；点击切换 is-active 与 aria-pressed</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="sys-progress-demo">' +
        '<div class="sys-progress-demo__head"><span class="sys-demo__name">进度条 · 2px</span>' +
        '<span class="sys-progress-demo__val">68% · 已答 7 / 11</span></div>' +
        '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="68" aria-label="作答进度">' +
          '<span class="progress__fill" style="width:68%"></span>' +
        '</div>' +
        '<p class="sys-demo__spec">宽度过渡 260ms；主色只表达推进，不用于静态装饰。</p>' +
      '</div>' +
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">点 / 标签的语义映射</h3>' +
        '<p class="sys-group__note">进行中 = accent；未开始 = ok；已逾期 / 待补充 = warn；已结束 / 已归档 = muted。语义色不互相替代。</p></div>' +
      '</div>'
    )
  }

  function curvePlot(x1, y1, x2, y2, label) {
    const c1x = Math.round(x1 * 100)
    const c1y = Math.round(100 - y1 * 100)
    const c2x = Math.round(x2 * 100)
    const c2y = Math.round(100 - y2 * 100)
    const d = 'M 0 100 C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', 100 0'
    const grid = [25, 50, 75].map((v) =>
      '<path d="M ' + v + ' 0 V 100 M 0 ' + (100 - v) + ' H 100"/>',
    ).join('')
    return (
      '<svg class="sys-curve__plot" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="' + label + '">' +
        '<rect x="0" y="0" width="100" height="100" fill="none" stroke="var(--c-line)" stroke-width="1" vector-effect="non-scaling-stroke"/>' +
        '<g stroke="var(--c-line-2)" stroke-width="1" fill="none" vector-effect="non-scaling-stroke">' + grid + '</g>' +
        '<path d="M 0 100 H 100" stroke="var(--c-line-3)" stroke-width="1" fill="none" vector-effect="non-scaling-stroke"/>' +
        '<path d="' + d + '" stroke="var(--c-ink-2)" stroke-width="1.5" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
        '<circle cx="100" cy="0" r="2.5" fill="var(--c-accent)"/>' +
      '</svg>'
    )
  }

  function motionBlock(ctx) {
    const track = (token, use, modifier) =>
      '<div class="sys-track">' +
        '<code class="sys-track__name">' + token + ' <span data-sys-val="' + token + '"></span></code>' +
        '<span class="sys-track__rail"><span class="sys-track__dot sys-track__dot--' + modifier + '"></span></span>' +
        '<span class="sys-track__use">' + use + '</span>' +
      '</div>'

    return (
      '<div class="sys-motion">' +
        '<div class="sys-group">' +
          '<div class="sys-group__head"><h3 class="sys-group__title">两条曲线</h3>' +
          '<p class="sys-group__note">--ease-out 用于入场与展开（强减速）；--ease-inout 用于位移与循环。曲线端点即缓动函数，数值在运行时从令牌读取。</p></div>' +
          '<div class="sys-motion__grid">' +
            '<div class="sys-curve">' +
              '<div class="sys-curve__head"><code class="sys-curve__token">--ease-out</code>' +
                '<code class="sys-curve__val" data-sys-val="--ease-out"></code></div>' +
              curvePlot(0.22, 1, 0.36, 1, '缓动曲线 --ease-out') +
              '<p class="sys-curve__note">入场、展开、状态变化。起步快，尾部平稳落下。</p>' +
            '</div>' +
            '<div class="sys-curve">' +
              '<div class="sys-curve__head"><code class="sys-curve__token">--ease-inout</code>' +
                '<code class="sys-curve__val" data-sys-val="--ease-inout"></code></div>' +
              curvePlot(0.4, 0, 0.2, 1, '缓动曲线 --ease-inout') +
              '<p class="sys-curve__note">位移与循环（骨架扫光）。两端对称，不抢注意力。</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="sys-group">' +
          '<div class="sys-group__head"><h3 class="sys-group__title">三档时长</h3>' +
          '<p class="sys-group__note">只动 transform / opacity；不做入场编排，不做循环装饰。分数环 900ms 只播一次。</p></div>' +
          '<div class="sys-motion__demo">' +
            '<div class="sys-motion__demo-head">' +
              '<span class="sys-motion__title">时长与缓动</span>' +
              '<button type="button" class="btn btn--ghost btn--sm" data-sys-replay>' + ctx.icon('refresh', 16) + '重播</button>' +
            '</div>' +
            '<div class="sys-tracks">' +
              track('--dur-fast', '悬停、按下、颜色', 'fast') +
              track('--dur', '选中、展开、切屏', 'base') +
              track('--dur-slow', '进度、抽屉、骨架', 'slow') +
            '</div>' +
            '<p class="sys-motion__pref" data-sys-pref></p>' +
            '<p class="sys-demo__spec">--dur-hero 900ms：结果页分数环专用，只播一次，不做循环。</p>' +
          '</div>' +
        '</div>' +
      '</div>'
    )
  }

  function iconBlock(ctx) {
    return (
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">图标集</h3>' +
        '<p class="sys-group__note">1.75 描边 · 24 栅格 / 20 渲染 · currentColor。全部经 ctx.icon(name) 输出，禁止 emoji 与文字符号；点击任一图标可看名字。</p></div>' +
        '<div class="sys-icons">' +
          ICONS.map((name) =>
            '<button type="button" class="sys-icon" data-sys-icon="' + name + '" aria-label="图标 ' + name + '">' +
              ctx.icon(name, 20) +
              '<span class="sys-icon__name">' + name + '</span>' +
            '</button>',
          ).join('') +
        '</div>' +
      '</div>'
    )
  }

  function densityStage(prefix) {
    return (
      '<div class="field">' +
        '<label class="field__label" for="sys-' + prefix + '-dept">部门</label>' +
        '<input class="input" id="sys-' + prefix + '-dept" type="text" value="技术部" data-sys-measure="' + prefix + '-input" autocomplete="off">' +
      '</div>' +
      '<div class="sys-option is-on" data-sys-font="' + prefix + '-option" data-sys-measure="' + prefix + '-option">' +
        '<span class="sys-option__mark"></span>技术部' +
      '</div>' +
      '<div class="sys-option">' +
        '<span class="sys-option__mark"></span>产品部' +
      '</div>' +
      '<div class="sys-stack sys-stack--row">' +
        '<span class="tag tag--accent"><span class="tag__dot" aria-hidden="true"></span>进行中</span>' +
        '<button type="button" class="btn btn--primary" data-sys-toast="同一枚按钮：作答端 44，管理端 40" data-sys-measure="' + prefix + '-btn">保存</button>' +
      '</div>'
    )
  }

  function densityBlock() {
    return (
      '<div class="sys-group">' +
        '<div class="sys-group__head"><h3 class="sys-group__title">同一套语言，两种密度</h3>' +
        '<p class="sys-group__note">颜色、圆角、阴影、图标、状态语义完全一致；只有排版变量与控件高度不同。管理端把 .dense 放在容器上，不换主题。</p></div>' +
        '<div class="sys-duo">' +
          '<div class="sys-duo__panel">' +
            '<div class="sys-duo__head">' +
              '<span class="sys-duo__name">作答端 · airy</span>' +
              '<span class="sys-duo__meta">body 15 / 1.7 · 控件 44</span>' +
            '</div>' +
            '<div class="sys-duo__stage">' + densityStage('airy') + '</div>' +
          '</div>' +
          '<div class="sys-duo__panel">' +
            '<div class="sys-duo__head">' +
              '<span class="sys-duo__name">管理端 · dense</span>' +
              '<span class="sys-duo__meta">body 13 / 1.5 · 控件 40</span>' +
            '</div>' +
            '<div class="sys-duo__stage dense">' + densityStage('dense') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="sys-duo__specs">' +
          '<div class="sys-spec"><span class="sys-spec__k">正文（选项）</span><span class="sys-spec__v"><span data-sys-out-font="airy-option"></span> → <span data-sys-out-font="dense-option"></span></span></div>' +
          '<div class="sys-spec"><span class="sys-spec__k">按钮高</span><span class="sys-spec__v"><span data-sys-out="airy-btn"></span> → <span data-sys-out="dense-btn"></span></span></div>' +
          '<div class="sys-spec"><span class="sys-spec__k">输入高</span><span class="sys-spec__v"><span data-sys-out="airy-input"></span> → <span data-sys-out="dense-input"></span></span></div>' +
          '<div class="sys-spec"><span class="sys-spec__k">选项行高</span><span class="sys-spec__v"><span data-sys-out="airy-option"></span> → <span data-sys-out="dense-option"></span></span></div>' +
          '<div class="sys-spec"><span class="sys-spec__k">颜色 / 圆角 / 阴影</span><span class="sys-spec__v">两端相同</span></div>' +
          '<div class="sys-spec"><span class="sys-spec__k">动效与焦点</span><span class="sys-spec__v">两端相同</span></div>' +
        '</div>' +
        '<p class="sys-duo__rule">密度差异只来自 <b>.dense</b> 容器：它覆盖 --fs-body / --fs-sub / --fs-cap / --lh-*，并把按钮、输入、分段项压到 40 / 26。页面不该自己改字号，也不该为管理端另造一套颜色。</p>' +
      '</div>'
    )
  }

  // ── 整屏 ─────────────────────────────────────────────────────────────────

  function navMarkup() {
    return (
      '<nav class="sys-nav" aria-label="设计系统章节">' +
        '<div class="sys-nav__brand">' +
          '<span class="sys-nav__title">清简</span>' +
          '<span class="sys-nav__sub">V6.1 · 2026-10</span>' +
        '</div>' +
        '<div class="sys-nav__list">' +
          NAV.map(([id, label], index) =>
            '<button type="button" class="sys-nav__item' + (index === 0 ? ' is-active' : '') + '"' +
              ' data-sys-nav="' + id + '" aria-current="' + (index === 0 ? 'true' : 'false') + '">' +
              '<span class="sys-nav__num">' + String(index + 1).padStart(2, '0') + '</span>' +
              '<span>' + label + '</span>' +
            '</button>',
          ).join('') +
        '</div>' +
        '<div class="sys-nav__foot">' +
          '<div class="sys-nav__meta"><span class="micro">令牌源</span><code class="sys-nav__path">assets/tokens.css</code></div>' +
          '<div class="sys-nav__meta"><span class="micro">对比度</span><code class="sys-nav__path">WCAG 2.1 实测</code></div>' +
          '<div class="sys-nav__meta"><span class="micro">规范文档</span><code class="sys-nav__path">docs/UI-UX-V6-设计系统.md</code></div>' +
        '</div>' +
      '</nav>'
    )
  }

  function section(id, num, title, note, body) {
    return (
      '<section class="sys-sec" id="' + id + '" aria-labelledby="' + id + '-title">' +
        '<header class="sys-sec__head">' +
          '<span class="sys-sec__num">' + num + '</span>' +
          '<div>' +
            '<h2 class="sys-sec__title" id="' + id + '-title">' + title + '</h2>' +
            '<p class="sys-sec__note">' + note + '</p>' +
          '</div>' +
        '</header>' +
        '<div class="sys-sec__body">' + body + '</div>' +
      '</section>'
    )
  }

  function render(ctx) {
    const hero =
      '<header class="sys-hero">' +
        '<span class="micro">V6.1 设计系统 · 令牌 / 组件 / 双端</span>' +
        '<h1 class="sys-hero__title">清简。</h1>' +
        '<p class="sys-hero__lede">让作答者专注问题本身：冷白画布、墨黑文字、唯一一笔靛蓝；两级密度，克制的运动。本页是活的规范——色值、字号、间距、阴影与对比度在打开时从 tokens.css 读取并按 WCAG 2.1 计算，页面自己只用这些令牌实现。</p>' +
        '<div class="sys-hero__principles">' +
          '<div class="sys-principle"><span class="micro">原则 01</span><span class="sys-principle__title">一个安静的工作面</span><span class="sys-principle__text">冷白画布与白色面分两级层次，chrome 退场；层级靠字号、留白与 1px 描边。</span></div>' +
          '<div class="sys-principle"><span class="micro">原则 02</span><span class="sys-principle__title">字是第一设计</span><span class="sys-principle__text">无衬线六档字阶，标题 600 + 收紧字距；中文正文行高 1.7。</span></div>' +
          '<div class="sys-principle"><span class="micro">原则 03</span><span class="sys-principle__title">一笔点睛</span><span class="sys-principle__text">靛蓝只用于进度、选中、主行动；不涂标题，不做装饰。</span></div>' +
          '<div class="sys-principle"><span class="micro">原则 04</span><span class="sys-principle__title">安静的反馈</span><span class="sys-principle__text">120 / 180 / 260ms，只解释状态变化；不做入场编排。</span></div>' +
          '<div class="sys-principle"><span class="micro">原则 05</span><span class="sys-principle__title">两端一脉</span><span class="sys-principle__text">同一套令牌：作答端 airy，管理端 dense，同一个按钮与输入框。</span></div>' +
        '</div>' +
      '</header>'

    const palette = section(
      'sys-palette', '01', '色彩',
      '对比度标注为「前景 / 背景」，正文阈值 4.5:1、大字 3:1、非文本 3:1。低对比令牌会明确写出用途上限，不假装达标。',
      PALETTE.map(paletteGroup).join('') +
        '<p class="sys-group__note">描边三档（--c-line / --c-line-2 / --c-line-3）实测均低于 3:1 非文本阈值，只作面层分隔与层次；控件边界由标签、占位符与焦点环共同表达，不依赖描边单独识别。</p>',
    )

    const type = section(
      'sys-type', '02', '字阶',
      '字号单位 px，行高为倍数；数字全部 tabular-nums。示例文字取自问卷种子数据，不用英文占位。',
      typeBlock(ctx),
    )

    const space = section(
      'sys-space', '03', '间距与圆角',
      '间距只有十档、圆角只有六档；没有「顺手加个 6px」的余地。',
      spaceBlock() + radiusBlock(),
    )

    const elevation = section(
      'sys-elevation', '04', '阴影',
      '阴影只表达浮起，不表达重要性；主按钮的阴影用 --sh-accent，仍属于 accent 的语义范围。',
      shadowBlock(),
    )

    const buttons = section(
      'sys-buttons', '05', '按钮',
      '四个变体、五种尺寸形态。高度与对比度是运行时实测，不是抄来的数字。',
      buttonBlock(ctx),
    )

    const inputs = section(
      'sys-inputs', '06', '输入',
      '默认 / 聚焦 / 错误三态都来自真实控件；聚焦示例在进入本屏时自动获得焦点。',
      inputBlock(ctx),
    )

    const states = section(
      'sys-states', '07', '状态与选择',
      '状态点、标签、开关、分段与进度共用同一套语义色；交互控件可点击、可键盘操作。',
      stateBlock(ctx),
    )

    const motion = section(
      'sys-motion', '08', '动效',
      '时长与缓动都取自令牌；重播按钮会让三条轨道按真实时长与曲线跑一次，reduced-motion 下自动跳过。',
      motionBlock(ctx),
    )

    const icons = section(
      'sys-icons', '09', '图标',
      '34 枚内联 SVG，无 emoji、无外链。图标按钮必须带 aria-label 或可见文字。',
      iconBlock(ctx),
    )

    const density = section(
      'sys-density', '10', '双端密度',
      '同一组件在两种密度下的真实渲染：数值由 CSS 实测，不是示意图。',
      densityBlock(),
    )

    const revRow = (label, before, after, why) =>
      '<div class="sys-revision__row">' +
        '<span class="sys-revision__label">' + label + '</span>' +
        '<span class="sys-revision__before">' + before + '</span>' +
        '<span class="sys-revision__after">' + after + '</span>' +
        '<span class="sys-revision__why">' + why + '</span>' +
      '</div>'

    const revision = section(
      'sys-revision', '11', 'V6.1 修订',
      'V6.0「纸墨」在第一轮评审后被推翻：暖纸底加衬线标题读起来像文艺模板，不像一个能长时间使用的现代工具。V6.1 保留令牌与组件结构，只换气质——更冷、更静、更克制。',
      '<div class="sys-revision">' +
        revRow('画布', '暖纸底', '冷白画布', '暖色会吃掉靛蓝的锐度，管理端也容易显得像文档而不是工具。') +
        revRow('标题', '衬线 + 大字号', '无衬线 600 + --ls-tight', '不加载 Web Font 时中文衬线在小字号下发灰；层级改用字重与字距建立。') +
        revRow('字阶', 'display 34 · h1 26 · h2 20 · h3 17', 'display 32 · h1 24 · h2 19 · h3 16', '整体收紧一档，信息密度更像工具，而不是阅读材料。') +
        revRow('强调色', '深靛', '靛蓝 --c-accent', '在冷白底上更清晰，白字对比度仍满足 AA（见色彩节的实测标注）。') +
        revRow('结构', '令牌 / 组件 / 两级密度 / 动效纪律', '保留', '这次只改气质：同一个按钮、输入框、状态语义与两端密度关系。') +
      '</div>' +
      '<p class="sys-group__note">V6.0 的「纸墨」叙事已废弃；本页、docs/UI-UX-V6-设计系统.md 与 README 均按 V6.1「清简」描述。</p>',
    )

    const footer =
      '<footer class="sys-foot">' +
        '<p class="sys-foot__line">本页所有色值、字号、间距、阴影与时长在运行时从 assets/tokens.css 读取；对比度按 WCAG 2.1 相对亮度公式（sRGB）计算，并标注适用上限。</p>' +
        '<p class="sys-foot__line">V6.1 清简 · 2026-10</p>' +
      '</footer>'

    return (
      '<div class="sys-root">' +
        navMarkup() +
        '<main class="sys-main">' + hero + palette + type + space + elevation + buttons + inputs + states + motion + icons + density + revision + footer + '</main>' +
      '</div>'
    )
  }

  // ── 颜色与对比度（WCAG 2.1 相对亮度） ────────────────────────────────────

  function parseColor(input) {
    if (!input) return null
    const value = input.trim()
    if (value.startsWith('#')) {
      let hex = value.slice(1)
      if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
      if (hex.length !== 6) return null
      const num = parseInt(hex, 16)
      if (Number.isNaN(num)) return null
      return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255, 1]
    }
    const match = value.match(/rgba?\(([^)]+)\)/)
    if (!match) return null
    const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    if (parts.length < 3) return null
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts.length > 3 ? parts[3] : 1]
  }

  function channel(value) {
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
  }

  function luminance(rgb) {
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
  }

  function composite(fg, bg) {
    const alpha = fg[3] == null ? 1 : fg[3]
    if (alpha >= 1) return fg
    return [
      fg[0] * alpha + bg[0] * (1 - alpha),
      fg[1] * alpha + bg[1] * (1 - alpha),
      fg[2] * alpha + bg[2] * (1 - alpha),
      1,
    ]
  }

  function contrastRatio(fg, bg) {
    const solidFg = composite(fg, bg)
    const a = luminance(solidFg)
    const b = luminance(bg)
    const light = Math.max(a, b)
    const dark = Math.min(a, b)
    return (light + 0.05) / (dark + 0.05)
  }

  function gradeFor(ratio, nonText) {
    if (nonText) {
      return ratio >= 3
        ? { text: '非文本达标', tone: 'pass' }
        : { text: '仅分隔', tone: 'limit' }
    }
    if (ratio >= 7) return { text: 'AAA', tone: 'pass' }
    if (ratio >= 4.5) return { text: 'AA', tone: 'pass' }
    if (ratio >= 3) return { text: '仅大字号', tone: 'limit' }
    return { text: '仅装饰', tone: 'limit' }
  }

  // ── 挂载 ─────────────────────────────────────────────────────────────────

  function mount(root, ctx) {
    const screen = root.closest('.screen')
    const style = getComputedStyle(document.documentElement)
    const tokenValue = (name) => style.getPropertyValue(name).trim()

    // 令牌回填：色值
    root.querySelectorAll('[data-sys-hex]').forEach((el) => {
      el.textContent = tokenValue(el.getAttribute('data-sys-hex')) || '—'
    })

    // 令牌回填：阴影 / 曲线 / 时长等原始字符串
    root.querySelectorAll('[data-sys-val]').forEach((el) => {
      const value = tokenValue(el.getAttribute('data-sys-val'))
      if (value) el.textContent = value
    })

    // 对比度：数值 + 等级
    root.querySelectorAll('[data-sys-ratio]').forEach((el) => {
      const fg = parseColor(tokenValue(el.getAttribute('data-fg')))
      const bg = parseColor(tokenValue(el.getAttribute('data-bg')))
      if (!fg || !bg) {
        el.textContent = '—'
        return
      }
      el.textContent = contrastRatio(fg, bg).toFixed(1) + ':1'
    })

    root.querySelectorAll('[data-sys-grade]').forEach((el) => {
      const pairs = (el.getAttribute('data-pairs') || '').split(',').filter(Boolean)
      const nonText = el.getAttribute('data-non-text') === '1'
      let min = Infinity
      pairs.forEach((pair) => {
        const parts = pair.split('|')
        const fg = parseColor(tokenValue(parts[0]))
        const bg = parseColor(tokenValue(parts[1]))
        if (!fg || !bg) return
        min = Math.min(min, contrastRatio(fg, bg))
      })
      if (!Number.isFinite(min)) {
        el.textContent = '—'
        return
      }
      const grade = gradeFor(min, nonText)
      el.textContent = grade.text
      el.classList.add('sys-grade--' + grade.tone)
    })

    // 实测高度与字号：offsetHeight 不受设备框 scale 影响
    const heights = {}
    root.querySelectorAll('[data-sys-measure]').forEach((el) => {
      heights[el.getAttribute('data-sys-measure')] = Math.round(el.offsetHeight) + 'px'
    })
    root.querySelectorAll('[data-sys-out]').forEach((el) => {
      const value = heights[el.getAttribute('data-sys-out')]
      if (value) el.textContent = value
    })

    const fonts = {}
    root.querySelectorAll('[data-sys-font]').forEach((el) => {
      const computed = getComputedStyle(el)
      const size = computed.fontSize.replace('px', '')
      fonts[el.getAttribute('data-sys-font')] = size + ' / ' + computed.lineHeight
    })
    root.querySelectorAll('[data-sys-out-font]').forEach((el) => {
      const value = fonts[el.getAttribute('data-sys-out-font')]
      if (value) el.textContent = value
    })

    // 演示：点击反馈
    root.querySelectorAll('[data-sys-toast]').forEach((el) => {
      el.addEventListener('click', () => ctx.toast(el.getAttribute('data-sys-toast') || '', 'info'))
    })
    root.querySelectorAll('[data-sys-swatch]').forEach((el) => {
      el.addEventListener('click', () => {
        const token = el.getAttribute('data-sys-swatch')
        const use = el.getAttribute('data-sys-swatch-use') || ''
        ctx.toast(token + ' · ' + use, 'info')
      })
    })
    root.querySelectorAll('[data-sys-icon]').forEach((el) => {
      el.addEventListener('click', () => {
        const name = el.getAttribute('data-sys-icon')
        ctx.toast('ctx.icon(\'' + name + '\')', 'info')
      })
    })

    // 多行文本字数：演示中的数字也是活的
    root.querySelectorAll('[data-sys-count]').forEach((el) => {
      const target = root.querySelector('#' + el.getAttribute('data-sys-count'))
      if (!target) return
      const update = () => {
        el.textContent = String(target.value.length)
      }
      target.addEventListener('input', update)
      update()
    })

    // 分段控件：点击切换
    root.querySelectorAll('.sys-status .seg').forEach((seg) => {
      seg.addEventListener('click', (event) => {
        const item = event.target.closest('.seg__item')
        if (!item) return
        seg.querySelectorAll('.seg__item').forEach((btn) => {
          const active = btn === item
          btn.classList.toggle('is-active', active)
          btn.setAttribute('aria-pressed', active ? 'true' : 'false')
        })
      })
    })

    // 聚焦示例：进入本屏时让「聚焦」输入框真的拿到焦点，展示原生的 focus 样式
    const focusInput = root.querySelector('[data-sys-autofocus]')
    let rafId = 0
    if (focusInput) {
      rafId = requestAnimationFrame(() => {
        try {
          focusInput.focus({ preventScroll: true })
        } catch (error) {
          focusInput.focus()
        }
      })
    }

    // 动效：重播 + reduced-motion 提示
    const motionDemo = root.querySelector('.sys-motion__demo')
    const prefNote = root.querySelector('[data-sys-pref]')
    const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    const updatePref = () => {
      if (!prefNote) return
      prefNote.textContent = motionQuery && motionQuery.matches
        ? '当前系统偏好：减少动态 · 演示已禁用'
        : '当前系统偏好：无限制 · 点「重播」按真实时长与曲线跑一次'
    }
    const replay = root.querySelector('[data-sys-replay]')
    const onReplay = () => {
      if (!motionDemo) return
      if (motionQuery && motionQuery.matches) {
        ctx.toast('系统已开启「减少动态」，演示跳过', 'warn')
        return
      }
      motionDemo.classList.remove('is-run')
      void motionDemo.offsetWidth
      motionDemo.classList.add('is-run')
    }
    if (replay) replay.addEventListener('click', onReplay)
    updatePref()
    if (motionQuery) {
      if (motionQuery.addEventListener) motionQuery.addEventListener('change', updatePref)
      else if (motionQuery.addListener) motionQuery.addListener(updatePref)
    }

    // 左目录：点击滚动 + 滚动时高亮
    root.querySelectorAll('[data-sys-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = root.querySelector('#' + btn.getAttribute('data-sys-nav'))
        if (!target) return
        const reduced = motionQuery && motionQuery.matches
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
      })
    })

    let observer = null
    const sections = Array.from(root.querySelectorAll('.sys-sec'))
    const navItems = Array.from(root.querySelectorAll('[data-sys-nav]'))
    if (screen && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            const id = entry.target.id
            navItems.forEach((item) => {
              const active = item.getAttribute('data-sys-nav') === id
              item.classList.toggle('is-active', active)
              if (active) item.setAttribute('aria-current', 'true')
              else item.removeAttribute('aria-current')
            })
          })
        },
        { root: screen, rootMargin: '0px 0px -72% 0px', threshold: 0 },
      )
      sections.forEach((sectionEl) => observer.observe(sectionEl))
    }

    return function cleanup() {
      if (rafId) cancelAnimationFrame(rafId)
      if (observer) observer.disconnect()
      if (motionQuery) {
        if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', updatePref)
        else if (motionQuery.removeListener) motionQuery.removeListener(updatePref)
      }
    }
  }

  // ── 注册 ─────────────────────────────────────────────────────────────────

  Proto.register('system', {
    group: 'admin',
    label: '设计系统',
    note: '活的令牌 / 组件规范：色值、字阶、间距、对比度运行时从 tokens.css 读取',
    render,
    mount,
  })
})()
