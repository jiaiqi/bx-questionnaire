# UI/UX V2 设计系统规范（墨蓝 · 静卷）

> 本文件是 V2 改造的**唯一共享依据**。三位实现者（core-ui / survey / editor）都按它执行。
> 改动视觉前先读本文件；需要超出本文件的令牌，**先在协作消息里提出**，不要自造。

## 0. 为什么重做

现状（`docs/screenshots/before-v2/`）：蓝白灰 + 等距白卡 + 同款圆角阴影 + 几乎无动效。
问题不在"不干净"，而在**没有属于这个产品的东西**——把 logo 换掉就能给任何系统用，
所以它既不美也不通用。V2 的目标不是"更花"，是**把问卷这件具体的事**表达出来：

- 一份问卷 = **一张连续的卷**（不是 11 个盒子）
- 一次选择 = **一次明确的落笔**（墨蓝色的标记 + 纸面上的着色）
- 一次完成 = **一次可感知的推进**（进度、分数、维度条都在动）

## 1. 设计定位

| 维度 | 结论 |
| --- | --- |
| 产品 | 园区问卷 / 健康测评（作答侧 + 设计侧） |
| 用户 | 员工（移动端为主，微信/小程序/公众号）· 行政设计者（PC 为主） |
| 首要任务 | 快速、低摩擦地答完一份问卷 / 高效地编辑问卷结构 |
| 气质 | 沉静、专业、克制；像一份印得很好的问卷，而不是一个后台管理系统 |
| 记忆点 | **一张纸**（连续卷面）+ **墨蓝的落笔**（选中态） |

**明确排除**：暖奶油底 + 衬线大字、近黑底 + 荧光绿、报纸栏、渐变 hero、
圆角一致的卡片墙、居中大按钮 + 副标题的落地页套路、满屏 ALL CAPS eyebrow。

## 2. 色彩（真源：`src/styles/tokens.scss`）

### 2.1 中性（近中性石墨，带一点点冷，不偏暖也不偏紫）

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--bx-bg` | `#F4F5F7` | 页面底 |
| `--bx-surface` | `#FFFFFF` | 纸面 / 卡片 |
| `--bx-surface-2` | `#F7F8FA` | 内嵌区（输入框底、只读区、骨架） |
| `--bx-text` | `#15181C` | 主文字（墨色） |
| `--bx-text-2` | `#4E555E` | 次要文字 / 选项文案 |
| `--bx-text-3` | `#6B7280` | 元信息（4.8:1，AA） |
| `--bx-text-4` | `#9AA1A9` | **仅**占位符与装饰，不得承载信息 |
| `--bx-line` | `#E4E7EC` | 默认描边 |
| `--bx-line-2` | `#F0F2F5` | 更淡的分隔线 |
| `--bx-line-strong` | `#D3D8DE` | 强描边（输入框、聚焦前） |

### 2.2 品牌色：墨蓝（Indigo Ink）

避开 iOS 系统蓝（#007AFF）与常见 SaaS 靛紫，取**偏紫的深靛**：
沉稳、克制、企业工具里不显廉价，又与"健康绿"明确区分。

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--bx-blue` | `#2C46C8` | 主色（白字 7.5:1） |
| `--bx-blue-hover` | `#2439A4` | 悬停 |
| `--bx-blue-active` | `#1D2F86` | 按下 |
| `--bx-blue-soft` | `#EEF0FD` | 选中底、强调浅底 |
| `--bx-primary-line` | `#D7DCF8` | 主色描边 |

`--bx-primary / --bx-primary-hover / --bx-primary-active / --bx-primary-soft / --bx-primary-line`
是 `--bx-blue*` 的别名，主题块只覆盖 `--bx-blue*`（保持现状机制）。

### 2.3 语义色（文字 / 浅底 / 描边 三件套，缺一不可）

| 语义 | 文字 | 浅底 | 描边 |
| --- | --- | --- | --- |
| 危险 | `#C42B1F` | `#FDF1EF` | `#F3C9C3` |
| 成功 | `#17784A` | `#EDF7F1` | `#BFE3CE` |
| 警告 | `#A85A0A` | `#FDF3E7` | `#F0D3AE` |
| 健康（测评语义） | `#0F766E` | `#F0F9F7` | `#A7E3DB` |

### 2.4 用色纪律

- **一屏最多两处主色**：一个主操作 + 一个状态。选项全选蓝是灾难。
- 主色只出现在：主按钮、选中态、焦点环、链接、进度条、图表数据。
- 描边优先于阴影：**纸感来自 1px 描边 + 极轻阴影**，不是大阴影。
- 语义色只在真的表达语义时用；不要拿"红色=删除"以外的场景涂红。

## 3. 排版

### 3.1 字体

`"PingFang SC", "Microsoft YaHei", ...` 系统栈 —— **不加载 Web Font**。
理由（工程约束，勿推翻）：微信小程序需 `wx.loadFontFace` + 域名白名单，
H5 侧要额外 ~100KB 与首屏阻塞；中文字体子集化在当前工期不可控。
**个性靠权重、字距、尺度与结构建立，不靠字体家族。**

### 3.2 字阶（`--bx-font-*` / `--bx-leading-*`，改值时两处同改）

| 级别 | 字号/行高 | 字重 | 用途 |
| --- | --- | --- | --- |
| hero | 40/48 | 600 | 登录时钟、结果页分数 |
| display | 28/38 | 600 | 封面大标题、页面主标题 |
| title | 20/28 | 600 | 卡片主标题 |
| h2 | 17/26 | 600 | 题干、小节标题 |
| body | 15/26 | 400 | 选项、正文 |
| sub | 13/20 | 400 | 辅助说明 |
| caption | 12/18 | 400 | 元信息（下限 12px） |

补充规则：
- 中文正文行高 1.72（比西文松），标题 1.35–1.5。
- **≥20px 的标题加 `letter-spacing: -0.01em`**；28px 以上 `-0.02em`。
- **所有数字用 `font-variant-numeric: tabular-nums`**（题号、计数、分数、时间），
  否则等宽数字跳动，页面显得廉价。
- 禁止：给标题里单个词加色/加粗、ALL CAPS 标签、中点连接 meta（`A · B · C`）。

## 4. 形状 · 层次 · 间距

- 圆角：`--bx-radius-xs 6 / sm 10 / md 14 / lg 20 / pill 999`；
  控件 12（沿用 `--bx-radius`）、卡片 16（`--bx-radius-card`）、纸面容器 20。
- 阴影三档：
  - `--bx-elev-1`：`0 1px 2px rgba(21,24,28,.04), 0 8px 24px rgba(21,24,28,.05)`（纸面）
  - `--bx-elev-2`：`0 4px 12px rgba(21,24,28,.08)`（浮层/吸顶）
  - `--bx-elev-3`：`0 16px 40px rgba(21,24,28,.14)`（弹窗）
- 间距沿用 4 基数（4/8/16/24/32），新增 `--bx-space-2xl: 48px`。
- 内容列宽：作答侧 `--bx-content-width: 720px`（保持），设计侧 `--bx-content-width-wide: 1180px`。

## 5. 动效（这是本次的重点之一）

### 5.1 缓动与时长

```
--bx-duration-fast: 120ms   悬停、按下、颜色
--bx-duration-base: 200ms   选中态、展开
--bx-duration-slow: 320ms   进度条、抽屉
--bx-duration-slower: 480ms 进场编排
--bx-ease-out: cubic-bezier(0.22, 1, 0.36, 1)      强减速：入场、展开
--bx-ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)   对称
--bx-ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1) 轻微回弹：选中、点赞
--bx-ease-linear: linear                          仅循环动画
```

### 5.2 动效清单（照表实现，不要自由发挥）

| # | 场景 | 实现 | 时长/缓动 |
| --- | --- | --- | --- |
| 1 | 首屏进场编排 | 题块淡入 + `translateY(8px→0)`，逐块 delay 24ms，**只播一次** | 480ms ease-out |
| 2 | 选项选中 | 标记 `scale(.7→1)`，行底色淡入 | 200ms spring / 120ms |
| 3 | 选项取消 | 反向，无位移 | 120ms |
| 4 | 选项悬停 | 底色 + 描边变主色浅调 | 120ms ease-out |
| 5 | 题目报错 | 错误条淡入，左侧色条 `scaleY(0→1)` | 200ms ease-out |
| 6 | 进度条推进 | 宽度过渡 | 320ms ease-out |
| 7 | 按钮按下 | `scale(.985)` | 90ms；抬起 160ms ease-out |
| 8 | 吸底操作栏首次出现 | `translateY(10px→0)` + 淡入 | 240ms ease-out |
| 9 | 骨架屏 | shimmer 扫光 | 1.4s linear infinite |
| 10 | 结果页分数 | 数字 0→目标值计数 | 900ms ease-out |
| 11 | 结果页维度条 | 宽度 0→目标，**逐条 delay 60ms** | 700ms ease-out |
| 12 | 列表行进场 | 淡入 + `translateY(6px→0)`，delay 30ms，**最多前 12 项** | 360ms ease-out |

### 5.3 纪律

- 只动 `transform` 与 `opacity`（外加 `width` 用于进度条/维度条）。
- **非用户触发的动效只播一次**；hover 反馈只给指针设备（小程序走 `hover-class`）。
- 循环动画只允许骨架屏与 spinner。
- `@media (prefers-reduced-motion: reduce)` 下全部动效降级为"无位移的淡入或直接出现"。
  该降级写在 `src/styles/global.scss` 的统一块里（由 Lead 落地），组件自身不要重复写。
- 进场编排只在 H5 端做（小程序端长列表逐项动画会掉帧）——用条件编译 `/* #ifdef H5 */`。

## 6. 组件规范

### 6.1 基础组件（`src/components/base/`）

**BxButton**
- 变体：`primary`（墨蓝实心）/ `secondary`（白底 + 描边）/ `ghost`（无底）/ `danger`（危险描边或实心红）
- 尺寸：`small 32 / normal 44 / large 52`；`block` 撑满
- 按下：`transform: scale(.985)`，90ms；`hover-class` 只改底色不改透明度（半透明会让白字发脏）
- 焦点：`outline: 2px solid var(--bx-primary); outline-offset: 2px`
- 加载：16px 环形 spinner（不改变按钮宽度），浅底按钮的 spinner 用 `currentColor`
- **保留现有 role/tabindex/keydown 语义，不要改**

**BxNavBar**
- 高 48px + 状态栏占位；底部分隔线 `--bx-line`
- 标题 17/600 居中；返回键点击区 44×44
- H5 可用半透明背景（`#FFFFFFE6` + `backdrop-filter: blur(12px)`），**小程序端不用 backdrop-filter**

**BxProgressBar**
- 3px 高、圆角、底色 `--bx-line-2`、填充主色；宽度过渡 320ms

**BxEmpty**
- 纯 CSS 图形（小程序不支持 `<svg>`，也不引入图片资源）
- 图形 + 一句说明 + 可选的操作

**BxSkeleton（新增）**
- `src/components/base/BxSkeleton.vue`：props `lines?`、`height?`、`radius?`
- shimmer 用 `linear-gradient` 平移动画，底色 `--bx-surface-2`

### 6.2 表单组件（`src/components/form/`）

**BxQuestionItem**
- 题号：中性色（`--bx-text-3`）+ tabular-nums，**不再是蓝色药丸**
- 题干 17/600；必填星号紧跟题干、红色
- 题目与题目之间由**纸面容器**统一分隔（`--bx-line-2` 细线），题目自身不画卡片
- 错误态：浅红底 + 左侧 3px 红条 + 行内红字

**BxOptionList**
- 整行可点（min-height 48），行间距 6px
- 标记：单选 = 18px 圆环，选中时环内填实心点；多选 = 18px 圆角方框，选中时白色对勾
- 选中态：`--bx-primary-soft` 底 + 1px `--bx-primary` 描边 + 标记实心 + 文字 `font-weight:500` + `--bx-text`
- **不要**给整行文字上色，也不要加左侧色条（与错误态冲突）
- 悬停：底色 `--bx-surface-2` → 选中态保持不变

**输入类（TextField / DatePicker / RefSelector / AddressPicker / ImageField）**
- 输入框：`--bx-surface-2` 底 + 1px `--bx-line-strong` 描边 + 12px 圆角 + 44px 高
- 聚焦：描边变 `--bx-primary` + `box-shadow: 0 0 0 3px var(--bx-blue-soft)`（不用 outline，保证小程序一致）
- 占位符 `--bx-text-4`；字数统计 `--bx-text-3` + tabular-nums
- 只读态：底色 `--bx-surface-2` + 无描边

## 7. 页面规范

### 7.1 封面页 `pages/questionnaire/cover/index`

```
┌───────────────────────────────┐
│ 员工满意度调查                  │  ← display 28/600，-0.02em
│ 这是一份演示问卷，用于…          │  ← body 15/26，--bx-text-2
│ ───────────────────────────    │  ← 细线，不是大色块
│ 11 题 │ 截止 12/31               │  ← caption，元信息（竖细线分隔，**不用中点字符**）
│                               │
│ [ 开始作答 ]                   │  ← primary large，左对齐
│                               │
│ ┌───────────────────────────┐ │
│ │ 问卷说明 / 注意事项        │ │  ← 次级卡片，surface + 1px 描边
│ └───────────────────────────┘ │
└───────────────────────────────┘
```

- **左对齐**，不要居中；不要渐变背景、不要大插画。
- 移动端单栏；PC 端 `min(720px, 100%)` 居中即可，不要上双栏（问卷封面不需要）。

### 7.2 作答页 `QuestionnaireRunner`

- 顶部：导航栏 + 吸顶进度区（进度条 + `共 11 题 · 已答 4` + `还差 2 题必答`）
- 主体：**一张纸**（白底 + 1px 描边 + 圆角 20 + 轻阴影），所有题目在纸内用细线分隔
- 题组小节（`widget === 'section'`）在纸内作为**小节标题**：一条 24px 短横线 + 13/600 文字
- 底部吸底操作栏：暂存草稿（secondary）+ 提交问卷（primary，占满剩余宽度）
- 错误摘要：浅红卡 + 可点击清单（保持现有交互）

### 7.3 结果页 `result` / `assessmentResult`

- 头部：**分数是主角** —— hero 数字（tabular-nums）+ 等级标签（语义色 chip）+ 一句结论
- **逐题得分**：现有数据源里**没有真正的"维度"**（`srvdaq_record_reply_merge_select`
  返回的也是逐题汇总），所以这里渲染「题干 + 得分率细条 + 得分（earned/points）」，
  标题写「逐题得分」而不是「维度」——不要给不存在的东西起名字。
  不计分的题（无正确答案）不画条。进度条动画宽度，逐条 delay 60ms
- 建议：`SuggestionPanel` 用左侧 2px 主色条的引用块，不要整块上色
- 提交成功页：一枚主色对勾（CSS 绘制）+ 「已提交」+ 后续动作

### 7.4 记录页 `history` / `couple`

- 记录行：左侧时间 + 标题，右侧状态 chip + 分数；行分隔用细线，不要卡片墙
- 空态用 `BxEmpty` + 「去答一份问卷」的主操作

### 7.5 设计侧列表 `pages/editor/list`

- **表格化**：一行一问卷 —— 左：标题 + 摘要 + 时间；中：状态 chip；右：操作
- 状态 chip：进行中=主色浅底、已结束=中性、未开始=成功色（按现有 `status` 文案映射）
- 搜索区：一行内联（输入 + 搜索 + 重置 + 状态分段控件），不要三个堆叠的卡片
- 行 hover：底色 `--bx-surface-2`；删除用危险色但**不要**整行红

### 7.6 设计器 `pages/editor/design`

- 三栏（题纲 / 画布 / 属性）沿用现有结构，只改视觉：
  - 题纲行：题号 + 题干摘要 + 题型标签；选中态左侧 2px 主色条 + 浅主色底
  - 画布：题目以"纸面"呈现，题型用**右侧 chip 标记**（信息性标签，不是装饰色条 ——
    装饰性色条在十几道题里只会变成噪音）
  - 属性面板：分组标题 12/600 + 字段间距 16
- 拖拽反馈：拖起的行 `scale(.98)` + 阴影抬升 + 落点显示 2px 主色插入线

### 7.7 登录页 `components/auth/LoginScreen.vue`

- 保留锁屏式全屏 + 顶部时钟 + 药丸输入框 + 校验失败抖动 + 回车提交
- 视觉升级：背景改为 `--bx-bg` 上的**极浅墨蓝晕染**（径向渐变，`#2C46C8` 6% → 透明），主按钮墨蓝，输入框药丸改 `--bx-surface-2` + 焦点环
- 抖动幅度 6px、时长 400ms、只抖一次（不要循环）

## 8. 红线（不要碰）

1. 不改任何接口契约、不改 `src/api/**`、`src/domain/**`、`src/composables/**` 的行为
2. 不改 `aria-*` / `role` / `tabindex` 语义（可访问性审计脚本 `scripts/a11y.mjs` 会验）
3. 不删 `src/styles/tokens.scss` 里的既有令牌名（大量文件在用）；**只改值 + 新增**
4. 颜色令牌改动必须同步 `uno.config.ts`（有测试双向守护）
5. 不引入新的运行时依赖（无 UI 库、无图标库、无 Web Font）
6. 不用 `<svg>`（微信小程序不支持）、不用 `::part`、不用 `:has()`（小程序端支持不稳定）
7. 页面文案保持"说人话"：按钮写动作（"开始作答"而不是 "GO"）

## 9. 验收

- `pnpm test` 全绿（678 项）
- `pnpm type-check` / `pnpm lint` 全绿
- `pnpm a11y` 通过
- 截图对比：`docs/screenshots/before-v2/` ↔ `docs/screenshots/after-v2/`
- 真机形态：375 / 1440 两种视口都要看
