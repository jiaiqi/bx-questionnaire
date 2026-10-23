# 原型 V6「清简」实现契约

> ⚠️ **方向修订（2026-10-22 10:50，以此为准）**
> 用户否决了「纸张感」：**不要暖纸背景、不要纸质感、不要衬线字体**。
> V6 定名为 **「清简」**：现代、干净、克制——冷白画布 + 白色纸面 + 墨黑文字 +
> 唯一一笔靛蓝。简约但不简陋：靠排版、间距、细节与状态设计撑质感，不靠纹理与装饰。
> 令牌已更新（`tokens.css`），`--font-serif` 已指向无衬线栈。下文凡提到「暖纸 / 纸墨 / 衬线」
> 的地方一律按本节改：画布用 `--c-paper`（冷白灰）、界面无衬线、大字用 `.display`
> （600 字重 + `--ls-tight`）。图表/数字仍用 `tabular-nums`。

> 所有参与者（Lead 与 teammate）只按本文件协作。**开工前先读完**。
> 本文件是接口与视觉的硬约束；与你的个人偏好冲突时，以本文件为准。

---

## 0. 一句话

把「一份认真排版的纸质问卷」搬到屏幕上：暖白纸面、墨色文字、**唯一一笔**深靛蓝。
作答端要安静、留白、可信；管理端要紧凑、可扫读、不花哨。两端共用同一套令牌。

产物是**可交互 HTML 原型**（不是展示页、不是截图拼贴）：能点、能答、能校验、能保存、
能切换场景。零依赖、可离线打开。

---

## 1. 目录与文件归属（严格）

```
design/prototype-v6/
├── index.html                 # Lead
├── CONTRACT.md                # Lead（本文件，只读）
├── README.md                  # teammate-C
├── assets/
│   ├── tokens.css             # Lead —— 唯一色值/字阶/间距来源
│   ├── base.css               # Lead —— 外壳 + 共享组件（类名契约见 §4）
│   ├── shell.js               # Lead —— 路由/状态/设备框/弹层/toast/图标/种子数据
│   ├── answer.css             # teammate-A
│   ├── answer.js              # teammate-A
│   ├── admin.css              # teammate-B
│   ├── admin.js               # teammate-B
│   ├── system.css             # teammate-C
│   └── system.js              # teammate-C
├── build.mjs                  # Lead —— 内联成单文件 standalone.html
├── standalone.html            # 构建产物（生成，不手改）
└── QA.md                      # 验收记录（Lead + verifier）
```

**只写你名下的文件。** 需要改共享文件（tokens/base/shell）时，停下来发消息给 lead，
不要直接改。不要动 `src/`、`docs/`（除 teammate-C 的文档）、`scripts/`。

---

## 2. 视觉语言（不可自由发挥的部分）

### 2.1 五个原则

1. **一张纸，不是一块屏**：页面底是暖纸，内容是纸面；chrome 尽量退场。
2. **字是第一设计**：靠字号/字重/行高/留白建立层级，不靠色块与阴影。
3. **一笔点睛**：深靛蓝只用于三件事 —— 进度、选中、主行动。语义色只在真需要时出现。
4. **安静的反馈**：动效只解释状态变化，120/180/260ms；不做入场编排、不做炫技。
5. **两端一脉**：作答端 airy（留白大、行高 1.7），管理端 compact（行高 1.5、密度高），
   但同一个按钮、同一个输入框、同一个状态点。

### 2.2 禁止

- ❌ emoji、Unicode 符号当图标（`× ↑ ✓ ⋯ ★ ∅`）；图标一律内联 SVG，1.75 描边，20×20。
- ❌ 硬编码颜色 / 字号 / 间距；只能引用 `var(--...)` 令牌。允许 `1px`、`0`、`100%`、`50%`。
- ❌ glassmorphism、渐变按钮、大面积色块、彩色阴影、重投影。
- ❌ 大圆角堆叠（卡片 14px、按钮/输入框 10px、标签 999px，别一律 20px+）。
- ❌ 外部字体/CDN/图片；一切可离线。图片位用 CSS 渐变或内联 SVG 占位。
- ❌ 入场动画编排（逐个 fade-up）。只允许：屏切换 180ms、状态变化 120/180ms、分数环 900ms 一次。

### 2.3 排版

- 正文 sans 栈，衬线只用于：封面大标题、登录品牌字、结果大分数、设计系统页的示例标题。
  衬线栈：`var(--font-serif)`；正文：`var(--font-sans)`；数字：`font-variant-numeric: tabular-nums`。
- 中文正文行高 1.7（作答端）/ 1.5（管理端）；段距 `--sp-3`。
- 字阶只用 `--fs-display / --fs-h1 / --fs-h2 / --fs-h3 / --fs-body / --fs-sub / --fs-cap / --fs-micro`。
- 小标签（`--fs-micro`，11px）仅用于元信息，必须加 `letter-spacing: .08em`。
- 不使用英文占位文案；示例数据用中文姓名/部门。

---

## 3. 令牌清单（以 `assets/tokens.css` 实际值为准）

命名一律 `--c-*`（颜色）、`--fs-*`（字号）、`--sp-*`（间距）、`--r-*`（圆角）、
`--sh-*`（阴影）、`--dur-*` / `--ease-*`（动效）、`--font-*`。

颜色（值见 tokens.css，**不要在本文件抄数值**）：
`--c-paper` `--c-sheet` `--c-sheet-2` `--c-ink` `--c-ink-2` `--c-ink-3` `--c-ink-4`
`--c-line` `--c-line-2` `--c-line-3`
`--c-accent` `--c-accent-hover` `--c-accent-press` `--c-accent-soft` `--c-accent-line`
`--c-ok` `--c-ok-soft` `--c-warn` `--c-warn-soft` `--c-danger` `--c-danger-soft`
`--c-focus`

字号：`--fs-display` 34/42、`--fs-h1` 26/34、`--fs-h2` 20/28、`--fs-h3` 17/25、
`--fs-body` 15/26、`--fs-sub` 13/21、`--fs-cap` 12/18、`--fs-micro` 11/16。
管理端可用 `--fs-body` 13（用 `.dense` 容器覆盖 `--fs-body` 变量，见 base.css）。

间距：`--sp-1` 4 / `--sp-2` 8 / `--sp-3` 12 / `--sp-4` 16 / `--sp-5` 20 /
`--sp-6` 24 / `--sp-8` 32 / `--sp-10` 40 / `--sp-12` 48 / `--sp-16` 64。

圆角：`--r-1` 4 / `--r-2` 8 / `--r-3` 10 / `--r-4` 14 / `--r-5` 20 / `--r-pill` 999。

阴影：`--sh-1` 纸面轻浮起 / `--sh-2` 浮层 / `--sh-3` 弹层。

动效：`--dur-fast` 120ms、`--dur` 180ms、`--dur-slow` 260ms、`--dur-hero` 900ms；
`--ease-out` `cubic-bezier(.22,1,.36,1)`、`--ease-inout` `cubic-bezier(.4,0,.2,1)`。

---

## 4. 共享组件类名契约（base.css，Lead 提供）

你可以直接用以下类，**不要重定义**；需要变体时加自己的前缀类（`.ans-*` / `.adm-*` / `.sys-*`）。

| 类 | 说明 |
| --- | --- |
| `.btn` + `--primary` `--ghost` `--quiet` `--danger` `--sm` `--block` `--icon` | 按钮，高 44（mobile）/40（desktop `.dense`），主按钮深靛蓝 |
| `.input` `.textarea` `.select` | 输入控件，高 44/40，focus 时 accent 描边 + 柔光环 |
| `.field` `.field__label` `.field__req` `.field__hint` `.field__error` | 字段容器与标注 |
| `.card` `.card--flush` `.card__head` `.card__title` `.card__sub` | 纸面卡片（白底、1px 描边、`--r-4`、`--sh-1`） |
| `.chip` + `--accent` `--ok` `--warn` `--muted` | 小标签 |
| `.tag` `.tag__dot` + `--ok` `--warn` `--muted` `--accent` | 状态点 + 文本（管理端状态列） |
| `.switch`（内含 `<input type="checkbox">`） | 开关 |
| `.seg` `.seg__item` + `.is-active` | 分段控件 |
| `.progress` `.progress__fill` | 进度条（细，2–3px） |
| `.empty` `.empty__art` `.empty__title` `.empty__tip` | 空态 |
| `.skeleton` | 骨架块 |
| `.divider` | 1px 分隔线 |
| `.appbar` `.appbar__back` `.appbar__title` `.appbar__action` | 移动端顶栏（48px，吸顶） |
| `.sticky-bar` `.sticky-bar__hint` | 吸底操作栏（含 safe-area padding） |
| `.tnum` `.muted` `.serif` `.micro` `.h1` `.h2` `.h3` `.body` `.sub` `.cap` | 文字工具 |
| `.sr-only` | 仅供读屏 |
| `.list` `.list__row` `.list__main` `.list__meta` `.list__aside` | 通用移动端列表行 |

图标：`ctx.icon(name, size?)` 返回 SVG 字符串。可用名称：
`back` `forward` `down` `plus` `minus` `search` `close` `check` `edit` `trash` `copy`
`drag` `eye` `eye-off` `calendar` `clock` `image` `pin` `link` `user` `users` `chart`
`list` `save` `send` `refresh` `more` `filter` `lock` `spark` `arrow-up` `arrow-down` `download` `share`。

---

## 5. 运行时 API（shell.js）

```js
// 注册一屏（在你的 js 文件末尾调用；shell 会先加载，见 index.html 顺序）
Proto.register('survey', {
  group: 'answer',            // 'answer' | 'admin' | 'login'
  label: '作答页',             // 屏幕目录里的名字
  note: '吸顶进度 + 整行选项 + 自动暂存',   // 设备框下方的一句话设计说明
  render(ctx) { return '<html string>' },  // 纯函数，返回字符串，不要在此绑定事件
  mount(root, ctx) { /* 绑定事件；返回 cleanup 函数（可选） */ },
})

// ctx
ctx.state        // 全局状态（见 §7，可读写，写后需要刷新时自行重渲染局部）
ctx.params       // 路由参数对象
ctx.go(id, params?)   // 切到另一屏（同端或跨端自动切换顶部端）
ctx.back()            // 返回上一屏
ctx.toast(text, type) // type: 'ok' | 'info' | 'warn'
ctx.modal({ title, body, actions, wide })  // 返回 Promise<'confirm'|'cancel'>；body 可为 HTML
ctx.confirm({ title, body, confirmText, danger }) // 返回 Promise<boolean>
ctx.icon(name, size)  // 返回 SVG 字符串
ctx.esc(str)          // HTML 转义
ctx.fmt(n)            // 数字千分位
ctx.answerScreen()    // 便捷：go('survey')
```

路由：`#/answer/cover`、`#/admin/list`。直接打开 hash 能到达对应屏（目录里给的链接要可用）。
切屏时外壳做 180ms 的淡出/淡入（reduced-motion 下瞬时）。

事件绑定用 `root.querySelector` + `addEventListener`；如需整屏重渲染，调用
`Proto.rerender()`（会重新调用当前屏的 render/mount，并保留滚动位置）。

---

## 6. 种子数据（shell.js 提供，真源）

`ctx.state.survey`：

```js
{
  no: 'ACT202610220001',
  title: '员工满意度调查',
  subtitle: '2026 年度 · 园区员工体验调研',
  intro: '这是一份匿名问卷，约 3 分钟完成。你的回答只用于改善园区服务与工作体验，不会用于绩效评估。',
  deadline: '2026-12-31',
  submittedCount: 128,
  questions: [
    { id: 'q1',  type: 'text',     title: '你的姓名（选填）', required: false },
    { id: 'q2',  type: 'radio',    title: '你所在的部门', required: true,
      options: ['技术部','产品部','市场部','职能部'] },
    { id: 'q3',  type: 'number',   title: '你在本公司的工作年限（年）', required: true },
    { id: 'q4',  type: 'date',     title: '你的入职日期', required: false },
    { id: 'q5',  type: 'radio',    title: '你对当前工作的整体满意度', required: true,
      points: 10, options: ['非常满意','比较满意','一般','不太满意'], correct: '非常满意' },
    { id: 'q6',  type: 'checkbox', title: '你认为公司在哪些方面做得好？（可多选）', required: true,
      points: 10, options: ['团队氛围','薪酬福利','成长空间','工作生活平衡'],
      correct: ['团队氛围','薪酬福利'] },
    { id: 'q7',  type: 'radio',    title: '你愿意推荐朋友来本公司工作吗？', required: false,
      options: ['非常愿意','比较愿意','说不好','不愿意'] },
    { id: 'q8',  type: 'address',  title: '你的工作地点所在地区', required: false },
    { id: 'q9',  type: 'image',    title: '上传一张你的工作环境照片', required: false },
    { id: 'q10', type: 'ref',      title: '请选择一份你参与过的问卷', required: false,
      options: ['2026 年度健康体检自评','园区食堂服务满意度','新员工入职体验调研'] },
    { id: 'q11', type: 'textarea', title: '你对公司的建议', required: false, maxLength: 200 },
  ],
}
```

`ctx.state.answers`：`{ [qid]: string | string[] }`。`ctx.state.submitted`：bool。
`ctx.state.result`：提交后由作答端计算并写入 `{ score, total, correct, wrong, unanswered, submittedAt, batchNo }`。
计分：q5 10 分 + q6 10 分，共 20；q6 全对才得分。

`ctx.state.activities`（管理端列表，6 条，字段：`no, title, desc, status('进行中'|'未开始'|'已结束'),
items, replies, deadline, updatedAt, owner`），种子由 shell 提供，B 可增删改并写回。

`ctx.state.designer`：`{ activityNo, selectedId, dirty, items }`，items 与 `survey.questions`
同构（B 管理；初始化从 survey 深拷贝）。保存时同步回 activity 并 `ctx.toast('已保存')`。

`ctx.state.session`：`{ loggedIn, name, dept }`。登录成功后置 `loggedIn: true`。

---

## 7. 屏清单与交互要求

### 作答端（phone 390×800，teammate-A）

| id | 屏 | 必须做到 |
| --- | --- | --- |
| `cover` | 问卷封面 | 衬线大标题 + 副标题 + 引言；信息行（11 题 · 约 3 分钟 · 截止 12-31 · 128 人已答）；主按钮「开始作答」→ survey；次按钮「看看我的记录」→ records；「作答说明」可展开；已提交过则显示「你已完成本次问卷」并给「查看结果」 |
| `survey` | 作答页 | 吸顶 appbar + 进度（`已答 3/11` + 必答剩余）；11 题全可交互；整行选项 ≥48px，单选/多选/文本/数字/日期/地址/图片/引用/多行文本各有可用交互；选项选中即更新进度，**1.2s 后自动暂存**并显示「已暂存 HH:MM」；底部吸底栏「暂存草稿 / 提交问卷」；提交时校验必答，失败则顶部错误摘要（可点跳题）+ 题块标红 + 滚动到第一题 + toast；成功后 → submit |
| `submit` | 提交信息 | 说明「为什么还要填这一步」；姓名（必填）、部门（必填）、手机号（选填，11 位校验）；隐私说明；提交 → loading 600ms → result；返回可回 survey |
| `result` | 作答结果 | 「已提交」状态条；分数环 13/20（CSS conic/ SVG，900ms 动画，reduced-motion 直接到位）；答对/答错/未答三栏；逐题回顾（我的作答 / 正确答案 / 得分，可折叠）；建议卡；动作：再测一次 / 查看记录 / 分享（toast） |
| `records` | 作答记录 | 2–3 条记录（本次未提交/已提交/历史），状态点 + 分数 + 时间 + 批次号；「继续作答」→ survey；空态可切换演示（可选）；顶部 appbar 返回 cover |
| `couple` | 我的测评 | 未登录态提示「登录后查看全部测评」+ 登录按钮 → login；登录后显示 2 条已完成测评卡片（分数、完成时间、维度），点进查看 → result |
| `login-m` | 移动登录 | 品牌字 + 账号/密码（可切换明文）+ 记住我 + 错误抖动 + 回车提交；成功后回 couple |

**作答端交互细节**：数字输入只允许数字；日期用原生 `input[type=date]`（样式统一）；
地址用底部弹层三级选择（省/市/区，示例数据即可）；图片用「点击上传」显示渐变缩略图 +
删除；引用题型用底部弹层单选。所有弹层可 Esc / 点遮罩关闭，焦点回到触发元素。

### 管理端（desktop 1320×860，teammate-B）

| id | 屏 | 必须做到 |
| --- | --- | --- |
| `list` | 问卷列表 | 页头：标题 + 说明 + 主按钮「新建问卷」；工具行：搜索框（真实过滤）、状态分段（全部/未开始/进行中/已结束）、重置；表格：标题+描述、状态、题量、回收份数、截止、更新时间、操作（编辑 / 作答 / 更多）；行 hover 才显操作；空态（搜索无结果时）；新建弹层（标题/说明/截止/模板）→ 插入行 + toast；删除二次确认；分页（演示 1/2 页）；加载骨架可在目录里作为独立屏 `list-loading` 展示 |
| `designer` | 可视化设计器 | 顶栏：返回、活动名（可编辑）、未保存状态、预览、保存、发布；三栏：左目录（题目列表，可拖拽/上下移、选中、必填点、添加题目，底部「问卷信息」）+ 中纸面（题目卡，点选高亮，实时反映右侧修改）+ 右属性（题型切换、标题、必填、计分、选项增删改与排序、说明）；实时预览（点击「预览」弹出手机宽度预览层，可滚动，Esc 关闭）；保存 → dirty=false + toast + 顶栏状态；发布 → 状态改「进行中」+ toast；未保存离开时确认 |
| `system` | 设计系统 | teammate-C |

设计器要**真的能改**：右侧改标题/选项，纸面即时更新；添加/删除题目；切换题型
（如切到「多选」后纸面变多选）；保存后列表页数据同步。

### 登录桌面端（teammate-B）

`login-d`：左右分栏。左侧纸面品牌区（品牌字、一句主张、细线、页脚版权），
右侧表单（账号/密码/记住我/登录/错误态）。成功 → admin list。

---

## 8. 内容与语气

- 产品名：**园区问卷**；副标：`健康与体验调研`。
- 文案：短句、动词开头、无感叹号、无营销词。示例：
  - 封面引言：`约 3 分钟 · 匿名作答 · 仅用于整体分析`
  - 提交按钮：`提交问卷`；暂存：`暂存草稿`
  - 结果：`已提交` / `你的得分` / `逐题回顾`
  - 列表空态：`没有匹配的问卷` / `换个关键字，或点右上角新建一份`
- 数字一律 `tnum`；日期格式 `2026-12-31`；时间 `10:32`。

---

## 9. 自检清单（提交前逐条过）

- [ ] 只用令牌，没有裸色值/裸字号（`grep -n "#[0-9a-fA-F]\{3,6\}"` 应只出现在 tokens.css）
- [ ] 无 emoji、无文字符号图标、无外链资源
- [ ] 键盘可走完主流程：Tab 有可见焦点，Enter 提交，Esc 关弹层
- [ ] 移动端点击目标 ≥44×44；管理端行高 ≥56
- [ ] 390 宽无横向滚动；1440 下管理端无溢出、无挤压
- [ ] `prefers-reduced-motion: reduce` 下无动画
- [ ] 屏幕目录能到达你写的每一屏；刷新后 hash 仍指向同一屏
- [ ] 你写的事件都有 `aria-*` 或可见文本，不靠颜色单独表达状态

---

## 10. 与旧版本的关系

- V5 `design/prototype-v5` 是**展示页**，可取用其配色思路与文案，但**不要复制其类名结构**。
- V2 `docs/UI-UX-V2-设计系统.md` 是实现侧的历史规范；V6 若落地需同步改令牌，
  不在本次范围。原型里也不要引用 V2 的 `--bx-*` 变量名。
