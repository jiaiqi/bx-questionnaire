# bx-questionnaire 设计系统（唯一真源）

> ⚠️ **2026-10-21 起本文件为 V1 归档，勿照抄其中的色值与动效数值。**
> V2（墨蓝 · 静卷）的唯一规范是 **`docs/UI-UX-V2-设计系统.md`**，
> 令牌的唯一真源仍是 `src/styles/tokens.scss`（并与 `uno.config.ts` 双向守护）。
> 本文件保留下来是为了记录 V1 的决策过程（尤其是"为什么不加载 Web Font"这类
> 有据可查的取舍），§1 的色值表已同步为 V2，其余章节仍是 V1 口径。

> **LOGIC:** 构建具体页面时，先检查 `design-system/bx-questionnaire/pages/[page-name].md`。
> 该文件存在则**覆盖**本文件；不存在则严格遵循本文件。
>
> 骨架由 `ui-ux-pro-max` 的 `--design-system --persist` 生成（Category = Survey / Form Builder，
> Dials = Variance 3 / Motion 3 / Density 4），随后按本工程真实约束重写。骨架中的 teal 主色
> 与 Atkinson Hyperlegible 字体**未采纳**，原因见「对骨架的两处偏离」。

---

**Project:** bx-questionnaire（园区问卷 / 健康测评）
**Stack:** uni-app（Vue 3 + TS + Vite）+ UnoCSS + SCSS 令牌；端 = H5（PC/移动/公众号）+ 微信小程序
**Design Dials:** Variance 3/10（居中克制） | Motion 3/10（微交互） | Density 4/10（标准）

---

## 0. 设计立场（先读这一节）

问卷产品的第一原则是**让作答者专注于问题本身**。界面越少存在感越好：

1. **内容优先**：所有装饰都必须为「理解题目、快速作答、知道进度」服务。
2. **一个记忆点**：品牌主色只用在三处——进度、选中态、主行动；其余一律中性灰。
3. **安静的运动**：动效只表达状态变化，120/180/280ms 三档，不做入场编排。
4. **不惊吓**：不用大面积色块、不用重阴影。健康测评可能触及用户情绪，界面必须沉稳。
5. **手机优先**：先在 375px 定形态，再向桌面扩展。

### 对骨架的两处偏离（有据）

| 骨架推荐 | 本工程采纳 | 理由 |
| --- | --- | --- |
| Primary `#0D9488`（teal） | **品牌蓝 `#0067DB`** 为默认主色，teal 保留为「健康测评」语义色 `--bx-health` | 园区多系统共用品牌蓝，作答者已有认知；`#0067DB` 白字对比 5.30:1 已过 AA。teal 更适合承载「健康分数」这一独立语义，而不是全站主色 |
| Atkinson Hyperlegible / Figtree | **中文系统字体栈** + 数字 `tabular-nums` | 内容 99% 为中文；微信小程序**不能**加载外链字体，引入 Google Fonts 会造成端间不一致。可访问性目标改用「字号阶梯 + 行高 + 对比度」达成 |

---

## 1. 颜色令牌

命名沿用工程既有 `--bx-*` 前缀。**每个色值必须同时改 `src/styles/tokens.scss` 与 `uno.config.ts`**
（由 `test/design-tokens.spec.ts` 双向守护）。

### 1.1 品牌墨蓝（主色，V2）

| Token | Hex | 对比度 | 用途 |
| --- | --- | --- | --- |
| `--bx-blue-soft` | `#EEF0FD` | — | 选中态浅底、强调浅底 |
| `--bx-primary-line` | `#D7DCF8` | — | 选中态 / 悬停描边 |
| `--bx-blue` | `#2C46C8` | 白字 **7.5:1** ✅ | 主按钮底、进度条、选中描边、链接 |
| `--bx-blue-hover` | `#2439A4` | 白字 9.4:1 ✅ | hover |
| `--bx-blue-active` | `#1D2F86` | 白字 12.6:1 ✅ | active / 按下 |

> V2 取偏紫的深靛而非系统蓝：系统蓝「任何 App 都这样」，且会与微信 / 支付宝的
> 原生控件撞色；偏紫的深靛在企业工具里显专业，又与「健康语义绿」明确区分。
> V1 的 `#0067DB` 保留为 V1 口径的对照值，**代码里已不再使用**。

### 1.2 语义主色别名（**主题切换的唯一入口**）

```scss
--bx-primary: var(--bx-blue);
--bx-primary-hover: var(--bx-blue-hover);
--bx-primary-active: var(--bx-blue-active);
--bx-primary-soft: var(--bx-blue-soft);
--bx-primary-line: #dce9ff;
```

组件一律引用 `--bx-primary*`。别名不写十六进制，所以不需要同步 `uno.config.ts`
（一致性守卫只比对「以 `#` 开头的颜色令牌」）。

### 1.3 中性色（当前值）

| Token | Hex | 白底对比度 | 用途 |
| --- | --- | --- | --- |
| `--bx-bg` | `#F2F4F7` | — | 页面底 |
| `--bx-surface` | `#FFFFFF` | — | 卡片、导航栏、吸底栏 |
| `--bx-surface-2` | `#FAFBFC` | — | 输入框底、只读区 |
| `--bx-text` | `#1F2329` | 15.6:1 ✅ | 题干、标题、分数 |
| `--bx-text-2` | `#646A73` | 5.45:1 ✅ | 正文、选项文案、辅助说明 |
| `--bx-text-3` | `#667085` | 4.97:1 ✅ | 元信息（题号、计数、时间），**下限 12px** |
| `--bx-text-4` | `#98A2B3` | 2.9:1 ❌ | **仅**用于占位、禁用、装饰；不得承载信息 |
| `--bx-line` | `#E5E6EB` | — | 描边、分割线、导航栏下沿 |
| `--bx-line-2` | `#F0F1F3` | — | 同组元素内的细分隔、进度槽 |

> 旧值（`#F5F7FA` / `#101828` / `#475467` / `#E4E7EC`）与当前值的差异都在一档以内，
> 刻意**没有**为「更现代」而改动：这批值已经过对比度复核与真机验证，改动的收益远小于回归风险。

### 1.4 语义色（文字 / 浅底 / 描边 三件套）

| 语义 | 文字 | 浅底 | 描边 | 场景 |
| --- | --- | --- | --- | --- |
| danger | `#D92C2C` (5.13:1) | `#FEF1F1` | `#F5C2C2` | 校验失败、删除、必答缺失 |
| success | `#0F7B2F` (5.55:1) | `#EAF7EE` | `#B7E0C2` | 提交成功、已暂存 |
| warn | `#C2410C` (5.30:1) | `#FDF3E7` | `#F0D0AE` | 草稿未提交、时限提醒 |
| health | `#0D9488` (4.54:1) | `#ECFDF5` | `#99F6E4` | 健康分数环、测评等级徽章 |

### 1.5 主题覆盖层（`src/styles/themes.scss`）

```scss
page[data-theme='health'],
:root[data-theme='health'] {
  --bx-blue: #0d9488;
  --bx-blue-hover: #0b7f75;
  --bx-blue-active: #096a62;
  --bx-blue-soft: #ecfdf5;
  --bx-primary-line: #99f6e4;
}
```

**为什么单独一个文件，而不是写在 `tokens.scss` 末尾**：`design-tokens.spec.ts` 用全局正则扫描
`tokens.scss`，**同名变量第二次出现时后者覆盖前者** —— 主题块里的 `--bx-blue` 会被当成令牌真值，
与 `uno.config.ts` 比对必然失败。拆分后 `tokens.scss` 保持「每个变量只声明一次」。

---

## 2. 字体与字阶

### 2.1 字体栈

```scss
font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei',
             'Helvetica Neue', Helvetica, Arial, sans-serif;
```

- 中文正文行高 **1.6**（`15/24`）。再松会让长问卷的滚动距离显著变长。
- 所有数字（题号、分数、计数、倒计时）加 `font-variant-numeric: tabular-nums`，避免跳动。
- 字重只用 **400 / 500 / 600**：中文细体在低分屏会糊，超粗在 15px 会挤。

### 2.2 字阶（六档，任何新字号都必须落到其中一档）

| Token | 字号 / 行高 | 字重 | 用途 |
| --- | --- | --- | --- |
| `--bx-font-hero` | 40 / 48 | 600 | 结果页分数、登录页时钟（全站仅这两处：数值本身就是主角） |
| `--bx-font-display` | 28 / 36 | 600 | 封面主标题、区块强调 |
| `--bx-font-title` | 20 / 28 | 600 | 页面主标题、卡片组标题 |
| `--bx-font-h2` | 17 / 26 | 600 | 题干、区块标题、导航栏标题 |
| `--bx-font-body` | 15 / 24 | 400 | 正文、选项、说明 |
| `--bx-font-sub` | 13 / 20 | 400 | 辅助说明、行内错误 |
| `--bx-font-caption` | 12 / 18 | 400 | 元信息、标签、计数（下限） |

---

## 3. 间距 · 圆角 · 形状 · 层级

### 3.1 间距（4 基数，**档位保持 5 档不变**）

`--bx-space-xs 4` / `sm 8` / `md 16` / `lg 24` / `xl 32`

语义用法（这是设计约束，不是建议）：

| 位置 | 值 |
| --- | --- |
| 题目卡内边距 | `20px 16px` |
| 题干与作答区间距 | `16px` |
| 选项之间 | `8px`（相邻兄弟 `margin-top`，满足触摸间距 ≥8px） |
| 题目卡之间 | `16px`（`--bx-space-md`） |
| 页面左右内边距 | `16px`（`.bx-container`）；`≥760px` 时 `24px` |
| 底部吸底栏预留 | `calc(72px + env(safe-area-inset-bottom))` |

> 曾考虑把 `--bx-space-md` 由 16 改成 12 以贴合原型里的卡片间距，**评估后放弃**：
> 该令牌有数十处调用，改语义会波及所有页面，收益只是 4px。

### 3.2 圆角（按语义分档）

| Token | 值 | 用途 |
| --- | --- | --- |
| `--bx-radius-card` | `16px` | 卡片、抽屉、弹层 |
| `--bx-radius` | `12px` | 输入框、按钮、选项行、选项卡 |
| `--bx-radius-sm` | `8px` | 序号胶囊、标签、缩略图 |
| `--bx-radius-chip` | `999px` | 胶囊、进度槽、徽章 |
| `--bx-radius-mark` | `4px` | 复选标记、进度条端点 |

### 3.3 阴影（Swiss 风格：优先描边，阴影只表达「浮起」）

| Token | 值 | 用途 |
| --- | --- | --- |
| `--bx-elev-1` | `0 1px 2px rgba(31,35,41,.05), 0 2px 8px rgba(31,35,41,.05)` | 卡片（几乎不可见，主要靠描边） |
| `--bx-elev-2` | `0 4px 14px rgba(31,35,41,.08)` | 下拉、悬浮元素 |
| `--bx-elev-3` | `0 12px 32px rgba(31,35,41,.14)` | 弹层、抽屉 |
| `--bx-elev-sticky` | `0 -1px 0 var(--bx-line)` | 吸底栏（向上的一条分割线，不用阴影） |

### 3.4 尺寸与层级

| Token | 值 |
| --- | --- |
| `--bx-control-height` | `48px`（**原 44px**：44 是 iOS 下限，安卓是 48dp，问卷的选项与按钮统一到 48，拇指容错更大） |
| `--bx-control-height-sm` | `32px` |
| `--bx-navbar-height` | `48px` |
| `--bx-z-sticky 10` / `fixed 40` / `overlay 60` / `modal 900` |
| `--bx-content-width` | `720px`（**原 860px**：作答页是单列表单，720px ≈ 42 个汉字的舒适阅读宽度） |

> 触摸目标：Web 端交互元素**视觉高度 ≥44px**，相邻目标间距 ≥8px；纯图标按钮的点击区用
> padding 补足到 44×44，不放大图标本身。

---

## 4. 运动

| Token | 值 | 用途 |
| --- | --- | --- |
| `--bx-duration-fast` | `120ms` | 选中、hover、描边变化 |
| `--bx-duration-base` | `180ms` | 展开、切换、按钮态 |
| `--bx-duration-slow` | `280ms` | 抽屉、弹层、进度条推进 |
| `--bx-ease-out` | `cubic-bezier(.22,.61,.36,1)` | 入场 |

规则：只动 `background-color` / `border-color` / `color` / `opacity` / `transform`，不动
`width/height/margin`（避免布局抖动）；`prefers-reduced-motion: reduce` 下全部降为 `0ms`
并保留最终状态；不做页面入场编排。

---

## 5. 组件规范（已落地的部分）

### 5.1 选项行（`BxOptionList`）—— 全站最重要的控件

```
┌───────────────────────────────────────────────┐
│  ◉   产品部                                    │  ← 选中：蓝浅底 + 蓝描边 + 蓝底白点
├───────────────────────────────────────────────┤
│  ○   技术部                                    │  ← 未选：白底 + 1px 描边（整行可点，≥48px）
└───────────────────────────────────────────────┘
```

- **整行可点**：`min-height: 48px`，`cursor: pointer`。
- **三重选中表达**：底色（`--bx-primary-soft`）+ 描边（`--bx-primary` + inset 1px）+ 标记
  （实心蓝底 + 白色圆点/对勾）。不只靠颜色，色觉障碍用户也能分辨。
- **单选**：20px 圆，选中为蓝底 + 8px 白点；**再次点击不取消**（避免空作答）。
- **多选**：20px 圆角方（6px），白色对勾用两条边框旋转绘制 —— 小程序不支持 `<svg>`。
- 选项间距 8px，用 `.bx-option + .bx-option` 相邻选择器，不用 `:last-child` 收尾。
- 选中文案**不变蓝**，只提字重到 500：长选项整行变蓝会显得吵。

### 5.2 题目头（`BxQuestionItem`）

- **序号胶囊**：22px，浅蓝底 + 主色数字，`--bx-radius-sm`。长问卷里它是「答到第几题」的锚点。
- 题干 17px/600；序**不**拼进文案（后端 `item_title` 常自带「1. 」前缀，先由
  `stripQuestionTitleIndex()` 剥掉，否则会出现「① 1. 您的姓名」）。
- 必答：紧贴题干的红色 `*`；选填：`--bx-text-4` 的「选填」；多选：提示「多选题 · 可选择多项」。
- 错误态：卡片底变 `--bx-danger-soft` + 左侧 3px danger 色条 + 行内 13px 文案。

### 5.3 按钮（`BxButton`）

| 变体 | 样式 | 用途 |
| --- | --- | --- |
| `primary` | `--bx-primary` 底 + 白字 | 提交问卷、登录、保存 |
| `ghost` | 白底 + `--bx-line` 描边 + `--bx-text-2` | 暂存草稿、上一题 |
| `text` | 透明底 + 主色文字 | 次要动作、返回 |
| `danger` | 白底 + `--bx-danger-line` 描边 + danger 文字 | 删除 |

- 高度 `var(--bx-control-height)`（48px）；小号 `--bx-control-height-sm`（32px）。
- 所有变体带同宽透明边框，并排时盒模型一致，不差 1px。
- loading 使用真 spinner（16px 环），**文案保留**，按钮宽度不跳。
- 按下反馈按变体分别改背景/描边，不用整体 opacity（半透明白字压蓝底会显脏）。

### 5.4 导航栏（`BxNavBar`）

高 `var(--bx-navbar-height)`（48px），白底 + 1px `--bx-line` 下沿。返回键点击区 44×44，
箭头用**两条边框旋转**绘制（不用「‹」文字符号：字形随系统字体变化；也不用 `<svg>`：小程序不支持）。
标题 17px/600 单行省略。右侧插槽 `.bx-navbar__side--right` 保留 `min-width: 60px`。

### 5.5 空态（`BxEmpty`）

自制几何插画：一张「还没写内容的纸」（border 描边 + 伪元素画三条占位线）+ 右下角品牌色
感叹号圆点。颜色只用 `--bx-line` / `--bx-line-2` 加一点 `--bx-primary` —— 空态不该比真正的内容抢眼。
**禁止 emoji 与文字符号充当插画**。

### 5.6 进度区与错误摘要（`QuestionnaireRunner`）

**进度区**吸顶在导航栏下沿（`top: calc(var(--bx-navbar-height) + var(--status-bar-height))`），
由 `BxProgressBar`（高 2px，槽 `--bx-line-2`，条 `--bx-primary`，右端圆角，280ms）加一行元信息组成：

- 左：「共 N 题 · 已答 M」；
- 右：「还差 K 题必答」（`--bx-warn`）/「必答题已答完」（`--bx-success`）。
  进度条只说「答了几题」，不区分必答与选填 —— 用户答完所有选填题后进度接近满格，提交时却仍被拦下。

`BxProgressBar` 刻意**不给** `role="progressbar"`：进度由这行可见文字承载，给纯矩形加 role 反而会被
可访问性审计要求可读名称与 tabindex（一个不该被 Tab 到的装饰元素）。

**错误摘要**在提交校验失败时出现，位于卷首信息卡之后：

- 容器用 `aria-live="assertive"` 而**不是** `role="alert"` —— `scripts/a11y.mjs` 的选择器包含
  `[role]`，会给命中元素加上「必须可聚焦」的要求，而纯文本容器不该进 Tab 序列；
- 每条是 `role="button" tabindex="0"` 的可点项（题号用 `--bx-text-3`，题干是主色下划线链接），
  点击/回车滚动到该题；
- 提交失败后**滚动到摘要**而不是第一道错题：老做法直接滚到错题，用户看到那道题却不知道一共几处要改，
  摘要刚渲染就被滚出视口。摘要随 `errors` 一起渲染，所以要先 `await nextTick()` 再找它。

### 5.7 输入控件与选择器（`BxTextField` / `BxDatePicker` / `BxAddressPicker` / `BxRefSelector` / `BxImageField`）

五者共用同一套外观，落差只体现在高度上：

| 项 | 规范 |
| --- | --- |
| 高度 | `var(--bx-control-height)`（48px）；文本域 `min-height: 96px`，底部留 26px 给计数器 |
| 底色 | `--bx-bg`（比卡片深一档）。只靠描边时，白卡片里的输入区在低亮度屏上几乎看不到边界 |
| 描边 / 圆角 | 1px `--bx-line` / `var(--bx-radius)` |
| 占位文字 | `--bx-text-4` |
| 禁用 | `opacity: var(--bx-disabled-opacity)` + `cursor: not-allowed` |
| 右向箭头 | 8×8 边框旋转 45°（`border-top` + `border-right`），**不用「›」文字符号** |
| 焦点 | 内层原生控件的 `:focus-visible` 加 2px 主色 outline。**不能**改画到外层 `:focus-within` 光晕上 —— 审计读的是 `document.activeElement` 自身的 outline / box-shadow |

引用选择器的底部弹层：遮罩 `rgba(16,24,40,.45)` + `var(--bx-z-modal)`，面板圆角
`var(--bx-radius-card) var(--bx-radius-card) 0 0`，选项行 ≥48px、选中项浅蓝底 + CSS 对勾。
组件内三处可点击的 `<view>`（选择入口 / 选项行 / 确定）统一走 `keyboardActivate()` 补键盘可达性。

图片字段：缩略图 88×88，移除按钮 24px 深色圆 + CSS 交叉线（不用「×」），上传 / 清空为 36px 描边按钮。

### 5.8 图标策略（硬约束）

项目**没有**引入图标字体或图标库，也**不能**用 `<svg>` 标签（微信小程序不支持）。
所有图形只有三种实现方式：

1. 纯 CSS（边框 + 伪元素 + 旋转）—— 如返回箭头、多选对勾、空态插画；
2. 文字（仅在语义本身就是文字时，如「选填」「第 3 题」）；
3. 位图资源（仅用于业务图片，如封面、上传的图片）。

**编辑器里现有的 `×` `↑` `↓` 文字符号属于待替换项**，替换方案同上（第 1 条）。

---

## 6. 无障碍硬性要求

- 正文与背景对比 ≥4.5:1；非文本（描边、图标、进度）≥3:1。
- 可视焦点环：`outline: 2px solid var(--bx-primary); outline-offset: 2px`。**任何** `outline: none`
  都必须有替代（uni-app 内置样式会重置 outline，各组件用 `:focus-visible` 补回）。
- 表单：每个控件有 label；错误文案要可见（是否需要 `role="alert"` 取决于
  `scripts/a11y.mjs` 的可读名称判定，改动前先读该脚本）。
- 图标：装饰性加 `aria-hidden="true"`；独立图标按钮必须有 `aria-label`。
- 颜色不作为唯一指示（必答、选中、错误都要有形状或文字冗余）。
- 尊重 `prefers-reduced-motion`；滚动内容不被吸顶/吸底栏遮挡。

---

## 7. 反模式的**工程实现约束**（比设计规范更容易踩）

| 约束 | 说明 |
| --- | --- |
| `tokens.scss` 里每个变量**只能声明一次** | `design-tokens.spec.ts` 用全局正则取值，同名第二次出现即覆盖前者；主题覆盖必须放 `themes.scss` |
| 新增颜色必须**同时**改 `uno.config.ts` | 否则一致性用例红；别名（`var(...)`）与尺寸类令牌不需要 |
| `src/` 下**零 `rpx`** | `style-units.spec.ts` 守；小程序 PC 横屏会等比放大 |
| 不要用 UnoCSS 间距工具类（`p-4`/`m-2`） | 预设会把它们换算成 `rpx`，触发产物侧 rpx 白名单失败 |
| e2e 依赖的 class 名是**选择器 API** | `.bx-option`、`.bx-button`、`.bx-navbar__side--right`、`.records__notice`、`.bx-image__*`、`.bx-ref__*`、`.bx-address__*`、`.bx-editor-item-row`、`#q-<item_no>` —— 改名必须同步改脚本 |
| 编辑器行高是规格 | `ITEM_ROW_HEIGHT = 56`、`OPTION_ROW_HEIGHT = 44`：常量、CSS、内联样式三处必须一致 |
| 样式一律写 px，宽度靠 `max-width` 居中 | 宽屏适配依赖 `--bx-content-width` |
| `.scss` 不参与 lint | 样式没有 lint 兜底，改动只能靠测试与真机验证 |

---

## 8. 交付前检查清单

- [ ] 颜色、字号、间距全部来自令牌，无裸值
- [ ] 375 / 768 / 1024 / 1440 四个宽度均无横向滚动（`smoke.mjs` 判定 >1px 即失败）、无遮挡
- [ ] 触摸目标 ≥44px，选项之间 ≥8px
- [ ] 键盘 Tab 全链路可见焦点
- [ ] `prefers-reduced-motion` 下无动画且状态正确
- [ ] 空态 / 加载 / 错误 / 禁用 四态齐备
- [ ] 无 emoji、无文字符号充当图标
- [ ] 正文对比 ≥4.5:1（含浅底上的文字）
- [ ] 小程序端不依赖外链字体、`<svg>`、`backdrop-filter`
- [ ] 后端接口调用与服务名零变更

---

## 9. 落地状态

| 范围 | 状态 | 说明 |
| --- | --- | --- |
| 令牌层 | ✅ 已落地 | `tokens.scss` 新增语义别名/中性补充/健康色/吸底线/导航高；`radius 12→16`、`control 44→48`、`content 860→720`；`themes.scss` 新建并在 `App.vue` 引入；`uno.config.ts` 同步 5 个新色值 |
| `BxProgressBar` | ✅ 已落地 | 2px、主色令牌、右端圆角、280ms |
| `BxEmpty` | ✅ 已落地 | 去掉 `∅` 文字符号，改 CSS 几何插画 |
| `BxButton` | ✅ 已落地 | 48px、真 spinner、新增 `danger`、按下反馈按变体、焦点环走主色 |
| `BxNavBar` | ✅ 已落地 | 48px、CSS chevron、标题 17/600、返回点击区 44×44 |
| `BxQuestionItem` | ✅ 已落地 | 序号胶囊、题干 17/600、选填与多选提示、错误态用令牌；新增 `stripQuestionTitleIndex()` |
| `BxOptionList` | ✅ 已落地 | 整行可点 48px、三重选中表达、8px 间距、CSS 对勾 |
| `QuestionnaireRunner` | ✅ 已落地 | 吸顶进度区（「共 N 题 · 已答 M」+「还差 K 题必答」）、提交失败的可点击错误摘要（滚动到摘要而非第一道错题）、`padding-bottom` 修掉吸底栏遮挡、题目容器化 + 题内分割线 |
| 其余 form 组件 | ✅ 已落地 | `BxTextField` / `BxDatePicker` / `BxAddressPicker` / `BxRefSelector` / `BxImageField` 统一到 48px 输入与选择器规范；「›」「✓」「×」文字符号全部换 CSS 绘制；引用弹层三处可点元素补齐键盘可达性 |
| 页面级 | 🔄 大部分完成 | 登录（`LoginScreen`：氛围光与背景改令牌、时钟 hero 档 + tabular、药丸输入框、勾选框改 CSS 对勾）、封面（骨架屏 + 信息网格分格）、提交信息（48px 输入 + 标签 sub 档）、作答结果（hero 分数 + 统计分格 + 判定徽章改语义令牌 + 逐题容器化）、测评建议（`SuggestionPanel` 左边条建议卡 + 骨架）、作答记录（`RecordList` 状态徽章 + 容器化 + 骨架）、我的测评（`couple` 容器化 + 分数 tabular）；`assessmentResult` 是 `SuggestionPanel` 的壳，随之生效 |
| 管理侧 | ✅ 已落地 | ① 文字符号全部替换（`⋮⋮`→box-shadow 点阵、`↑` `↓`→边框旋转、`✕`→交叉线、`＋`→加号、`✓`→对勾）；② 列表卡片令牌与密度优化；③ **设计器改三栏**：左 320（属性+题目列表）/ 中 `flex:1`（题目编辑）/ 右 360（实时预览），预览栏 `≥1280px` 才出现（窄屏放不下三栏）；预览只做**结构示意**，刻意不复用 `BxFieldRenderer`（编辑器吃的是 `EditorItem`，作答侧吃 `QuestionField`，为预览再造一条转换等于把 mapper 抄第二遍）。问卷列表**未改真表格**：移动端 375px 下表格必然横向溢出（`smoke.mjs` 判 >1px 即失败），改用卡片行 + 宽屏自适应 |
| a11y 增强 | ✅ 已落地 | 错误摘要用 `aria-live="assertive"`（避开 `[role]` 的「必须可聚焦」要求）；静态扫描确认全站 `[role]` 元素都带 `tabindex`、`<image>` 都带 `alt`（补齐 3 处）；`BxEmpty` 插画与全部 CSS 图标加 `aria-hidden`；`scripts/a11y.mjs` 的分组例外清单（radiogroup/group/presentation/none/list/listbox）无需扩充 |

---

## 10. 本次重设计要修的现网缺陷（对照 `docs/screenshots/`）

| # | 缺陷 | 证据 | 修法 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 吸底操作栏压住题目内容 | `演示问卷-移动竖屏.png` 第 4 题被遮 | 滚动区补 `padding-bottom`（实测滚到底时最后一道题在吸底栏上方 84px） | ✅ |
| 2 | 题卡堆叠、层级弱，长问卷沉重 | `视觉优化后-作答页-PC.png` 11 张同权重白卡 | 题目容器化 + 题内分割线 | ✅ |
| 3 | 选项为裸 radio，无选中态设计 | 同上 | 整行按钮化选项 | ✅ |
| 4 | 缺进度提示 | 作答页无任何进度 | 吸顶进度区 + 必答剩余提示 | ✅ |
| 5 | 图标用文字符号 | `编辑器-设计器-PC.png` 的 `×` `↑` `↓` | 换纯 CSS 图形 | ✅ 作答侧 + 编辑器侧全部替换 |
| 6 | 管理侧两栏拥挤、预览缺失 | 同上 | 改三栏 + 手机预览 | ✅ 三栏（左 320 / 中 `flex:1` / 右 360）已落地，预览栏 `≥1280px` 出现；布局用 CDP 精确视口验证（1440 三栏、1000 两栏） |
| 7 | 校验失败只有行内提示、无汇总 | `BxQuestionItem` 仅行内 | 顶部可点击错误摘要 + 锚点跳转 | ✅ |
| 8 | 空态是文字符号 `∅` | `BxEmpty.vue` | CSS 几何插画 | ✅ |
| 9 | 硬编码色值残留 | 组件源码 | 收敛到语义令牌 | ✅ 编辑器侧与页面侧均已清（`rgba(0,122,255,…)`、`rgba(180,42…)`、`var(--bx-blue*)` 全部收敛） |

---

## 11. 验收记录（重设计收口时实跑）

| 命令 | 结果 |
| --- | --- |
| `pnpm test` | **679 项通过**（54 个文件，含 `design-tokens` / `style-units` / `editor-layout` / `dead-code` 等守卫） |
| `pnpm lint` | 干净（0 error / 0 warning） |
| `pnpm type-check`（vue-tsc） | 通过 |
| `pnpm build h5` | 成功 |
| `pnpm build mp-weixin --mode test` | 成功 |
| `pnpm check:mp` | **校验通过**：13 页、209 文件 / 355.3 KB（主包上限 2MB）、rpx 白名单无越界、网关模式正确 |
| `pnpm check:cond` | 通过（H5 分支保留、小程序端剥离） |
| `pnpm smoke` | **64 次渲染（16 页 × 4 视口）异常 0 次** |
| a11y 静态扫描 | 通过（`[role]` 均带 `tabindex`、`<image>` 均带 `alt`） |
| CDP 实测（作答页） | 真实网关数据：4 题渲染、选中 → 进度 +1、空卷提交 → 错误摘要 3 条、滚到底最后一道题在吸底栏上方 84px、横向溢出 0 |
| CDP 实测（设计器布局） | 1440px：左栏 `flex-basis:320px` + 预览栏 `display:flex`；1000px：预览栏 `display:none` |
| `pnpm a11y`（parkDev 票据） | **9 页全部通过**：无名称 0 / 缺 alt 0 / 键盘到不了 0 / 焦点不可见 0；另有 1 项平台限制（名称只挂在 `uni-input` 壳上，不计失败） |
| `pnpm e2e`（parkDev 票据） | **59 项检查全部通过**（默认不提交，只作答到暂存点） |
| CDP 实测（结果页 / 设计器页，已登录） | 结果页：分数与逐题回顾正常渲染、溢出 0；设计器页：三栏 + 预览栏 `display:flex`、`dvScreen` 渲染、溢出 0 |

### 收口后补的三处修复（都是本轮验收暴露出来的）

| 问题 | 修法 |
| --- | --- |
| 吸底栏里「草稿已自动保存」按需出现，会把栏顶高 24px 并盖住贴边选项（实测多选第 2 项距栏只剩 3px） | footer 加 `min-height`（92px + 安全区）让高度恒定；滚动区 `padding-bottom` 84→100px |
| 设计器题目行把后端自带的「1. 」前缀与左侧序号列同时显示 | 标题改用 `stripQuestionTitleIndex()`，与作答页同一个函数 |
| 端到端脚本的 `clickSelector` 不滚动就按 rect 派发鼠标事件，且两处断言依赖「页面文本前 400 字」 | `centerOf()` 先 `scrollIntoView({block:'center'})`；两处「有没有跳走」改用 hash 判断 |

### 已知限制

1. **小程序端只做了产物级校验**（`pnpm check:mp`），未在微信开发者工具里真机/模拟器目视核对。
2. **e2e 只覆盖到暂存草稿为止**（脚本默认不加 `--submit`，避免往服务端写正式作答记录）；提交成功后的结果页跳转由 CDP 实测单独覆盖。
3. **`a11y` 审计有 1 项平台限制**：`uni-app` 把 `aria-label` 留在 `uni-input` / `uni-textarea` 壳上，不转发给内层原生控件 —— 已由 `useAriaLabel` 尽量补齐，项数从历史值降到 1，但未归零。
