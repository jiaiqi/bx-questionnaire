# bx-questionnaire UI/UX 设计原型 v2

本目录是整站 UI/UX 重设计的**可交互 HTML 原型**，用于在动代码之前确认视觉方向、信息层级与交互细节。

- 原型入口：[`index.html`](index.html)（单文件、零依赖，双击即可打开）
- 截图：[`screenshots/`](screenshots/)
- 设计系统唯一真源：[`../../design-system/bx-questionnaire/MASTER.md`](../../design-system/bx-questionnaire/MASTER.md)

---

## 1. 怎么用这个原型

打开 `index.html` 后：

| 操作 | 说明 |
| --- | --- |
| 左侧场景列表 | 13 个屏，覆盖作答侧 / 记录与测评 / 账户 / 管理侧 / 设计系统 |
| 顶部「移动 390 / 桌面 1440」 | 切换画布宽度；**页面按画布宽度响应式**（不是按浏览器窗口），所以同一屏可对比两端 |
| 顶部「品牌蓝 / 健康青」 | 切换主题，验证主色令牌化（业务侧将来可由宿主门户下发） |
| 直接操作 | 选项、输入框、复选框都是**真实控件**，可点击、可 Tab 键聚焦、可键盘操作 |
| URL hash | `index.html#survey` 直达某屏，便于贴链接给他人 |

> 原型里的黄色虚线框是**设计说明**，不是界面的一部分，落地时不实现。

---

## 2. 设计方向与取舍

**风格**：Minimalism & Swiss Style + Micro-interactions（`ui-ux-pro-max` 对 Survey / Form Builder 类产品的推荐风格）。

问卷产品的第一原则是**让作答者专注于问题本身**，所以定了四条：

1. **内容优先**——没有纯装饰元素，所有视觉都在服务"看懂题、快速答、知道进度"。
2. **一个记忆点**——品牌蓝只出现在三处：进度、选中态、主行动；其余一律中性灰。
3. **安静的运动**——动效只表达状态变化，120/180/280ms 三档，不做入场编排。
4. **手机优先**——先在 375px 定形态，再向桌面扩展。

### 对 skill 骨架的两处刻意偏离

| 骨架推荐 | 实际采纳 | 理由 |
| --- | --- | --- |
| 主色 `#0D9488`（teal） | **品牌蓝 `#0067DB`** 作默认主色，teal 降级为「健康测评」语义色 `--bx-health` | 园区多系统共用品牌蓝，作答者已有认知；`#0067DB` 白字对比 5.30:1 已过 AA。teal 更适合承载"健康分数"这一独立语义，而不是全站主色 |
| Atkinson Hyperlegible / Figtree | **中文系统字体栈** + 数字 `tabular-nums` | 内容 99% 是中文；微信小程序**不能**加载外链字体，引入 Google Fonts 会造成端间不一致。可访问性改用「字号阶梯 + 1.7 行高 + 对比度」达成 |

---

## 3. 这一版要修的现网缺陷

逐条都有截图证据（`docs/screenshots/`）：

| # | 现网缺陷 | 证据 | 本版做法 |
| --- | --- | --- | --- |
| 1 | 吸底操作栏压住题目内容（第 4 题被"暂存草稿/提交问卷"覆盖） | `演示问卷-移动竖屏.png` | 滚动区补 `padding-bottom`，吸底栏走 `env(safe-area-inset-bottom)` |
| 2 | 11 张同权重白卡堆叠，长问卷沉重、层级弱 | `视觉优化后-作答页-PC.png` | 题目收进**一个容器**，题间用细分隔线；只有题组与信息卡是卡片 |
| 3 | 选项是裸 radio，没有选中态设计 | 同上 | 选项升级为**整行可点按钮**（≥48px）：未选=白底描边，hover=蓝浅底，选中=蓝浅底+蓝描边+实心圆点 |
| 4 | 作答页没有任何进度提示（骨架明确列为反模式 weak progress cues） | 同上 | 吸顶 2px 进度条 + 「第 N 题 / 共 M 题」+ 已答计数 |
| 5 | 操作图标用文字符号（`×` `↑` `↓`） | `编辑器-设计器-PC.png` | 统一 1.75 描边线性 SVG 图标，禁止 emoji 与文字符号 |
| 6 | 管理侧两栏拥挤、右侧大片空白、无预览 | 同上 | 改**三栏**：左 320 属性+题目列表 / 中 1fr 题目编辑 / 右 360 手机实时预览 |
| 7 | 校验失败只有行内红字 + toast，长问卷里找不到出错位置 | `QuestionnaireRunner` 源码 | 顶部**错误摘要**（`role="alert" tabindex="-1"`，逐条锚点到题）+ 保留行内错误 |
| 8 | 空态是一个文字符号 `∅`；加载态是一行"正在加载…" | `BxEmpty.vue` 源码 | 空态给自制几何插画 + 主文案 + 可行动作；加载给骨架屏 |
| 9 | 主色残留旧蓝 `rgba(0,122,255,…)`、状态徽章硬编码 `rgba(0,180,42,.1)` 等 | 组件源码 | 全部收敛到语义令牌（`--bx-primary*` / `--bx-*-soft`） |
| 10 | 12 种字号、11 档间距并存 | `tokens.scss` 注释 | 字阶收敛为 6 档、间距收敛为 7 档，且**不再允许裸值** |

---

## 4. 屏目录

| 屏 | 对应页面 | 关键设计点 |
| --- | --- | --- |
| 10.1 问卷封面 | `pages/questionnaire/cover` | 主视觉 → 标题描述 → 信息网格（题量/耗时/作答次数）→ 答题说明 → 主行动 |
| 10.2 作答页 | `QuestionnaireRunner`（`index/index`、`survey/survey`） | 吸顶进度 + 序号胶囊 + 整行选项 + 吸底双按钮 |
| 10.3 校验失败 | `Runner.validateRequired` | 错误摘要 + 锚点跳转 + 行内错误 + 题块标红 |
| 10.4 提交信息 | `pages/questionnaire/index/submitInfo` | 说明"这一步为什么存在"，字段与校验规则不变 |
| 10.5 提交结果 | `pages/questionnaire/index/result` | 分数 → 确认 → 逐题回顾 → 后续动作 |
| 11.1 作答记录 | `RecordList` | 状态/分数/时间/批次号压成一条信息带；未完成给「继续作答」 |
| 11.2 测评结果 | `assessmentResult` + `SuggestionPanel` | 分数环（tabular 数字，900ms 一次到位）+ 等级徽章 + 建议卡 + 逐题明细 |
| 11.3 我的测评 | `pages/questionnaire/couple` | 同活动取最近一次聚合，避免刷屏 |
| 12.1 登录 | `LoginScreen` | 锁屏式空间感保留，氛围光收敛；失败抖动 420ms + `role="alert"` |
| 13.1 问卷列表 | `pages/editor/list` | 卡片流改**可扫读数据表**；操作 hover 才显形 |
| 13.2 可视化设计器 | `pages/editor/design` | 两栏改**三栏 + 手机实时预览**；拖拽/上下移/删除用 SVG 图标 |
| 14.1 设计系统 | — | 色板 / 字阶 / 形状 / 间距 / 动效 / 组件 / 图标总览，即可落地的清单 |
| 14.2 状态与边界 | — | 空态 / 骨架 / 页面级错误 / 会话过期 / 底部弹层 / toast |

---

## 5. 后端接口零变更

原型只是界面，**没有引入任何新的数据依赖**，也没有改变既有调用的语义。原型中出现的服务全部来自现有 `src/api`：

- 作答链路：`srvdaq_init_view_select`、`srvdaq_activity_result_save`、`srvdaq_activity_result_submit`
- 结果链路：`srvdaq_record_reply_select`、`srvdaq_record_reply_merge_select`、`srvdaq_activity_sug_select`
- 编辑链路：`srvdaq_activity_cfg_select/_add/_update/_delete`、`srvdaq_item_cfg_*`、`srvdaq_option_cfg_*`、`srvdaq_classify_select`
- 附件与地区：`srvfile_attachment_select`、`srvconfig_area_adj_select`
- 登录：`srvsso_user_pwd_sign_select`、`srvuser_login`

原型里刻意体现的既有约束（落地时必须继续保持）：

- `srvdaq_record_reply_select` **不接受 `order`**，且必须带 `condition`
- `srvdaq_activity_cfg_select` **不接受 `order`**
- `srvdaq_option_cfg_select` **没有 `activity_no` 列**
- `srvdaq_record_reply_merge_select` **没有 `activity_no` / `item_no` 列**，题目维度用 `item_seq`
- `srvfile_attachment_select` 必须在 `file` 应用下调用；上传 `/file/upload` 返回**裸对象**，判据是 `fileurl` 非空
- `srvuser_login` 连续失败**锁号 1 小时** → 不做自动重登、不重试
- 会话过期（`0011`）只清登录态，**不动** `bxq:fill_batch_no`

---

## 6. 从原型落到 uni-app 的映射

### 6.1 令牌（`src/styles/tokens.scss` + `src/styles/themes.scss`，并同步 `uno.config.ts`）

**已落地**（括号内为原值）：

```
--bx-primary / -hover / -active / -soft / -line   语义主色别名（var(--bx-blue*)），主题切换的唯一入口
--bx-primary-line      #DCE9FF   选中态/悬停描边
--bx-surface-2         #FAFBFC   输入框底
--bx-text-4            #98A2B3   仅占位与装饰，不得承载信息
--bx-health / -soft / -line      健康测评语义色（#0D9488 / #ECFDF5 / #99F6E4）
--bx-elev-sticky       0 -1px 0 var(--bx-line)
--bx-navbar-height     48px
--bx-radius           10px → 12px
--bx-radius-card      12px → 16px
--bx-control-height   44px → 48px
--bx-content-width    860px → 720px
```

**刻意没改**：`--bx-bg` / `--bx-text` / `--bx-text-2` / `--bx-line` 等中性色（与原型稿差在一档以内，
但这批值已过对比度复核与真机验证，改动收益小于回归风险），以及 `--bx-space-*` 五档间距
（`--bx-space-md` 有数十处调用，把它从 16 改成 12 会波及所有页面，只为 4px 不值得）。

两条硬约束：

- `test/design-tokens.spec.ts` 双向校验 `tokens.scss` 与 `uno.config.ts`，**新增颜色必须同时改两处**；
  语义别名（`var(...)`）与尺寸类令牌不在校验范围内。
- `tokens.scss` 里每个变量**只能声明一次** —— 该测试用全局正则取值，同名第二次出现会覆盖前者。
  因此主题覆盖层单独放在 `themes.scss`，由 `App.vue` 引入。


### 6.2 组件改动清单

| 组件 | 改动 | 类型 |
| --- | --- | --- |
| `base/BxNavBar.vue` | 高度 44→48px；返回箭头换 SVG；右侧插槽不再固定 60px 占位 | 视觉 |
| `base/BxButton.vue` | loading 用真 spinner（不再是 `···`）；禁用态统一 opacity .45；新增 `danger` 变体 | 视觉 |
| `base/BxEmpty.vue` | 去掉文字符号 `∅`，改为 SVG 插画插槽 + 主文案 + 动作插槽 | 视觉 |
| `base/BxProgressBar.vue` | 支持吸顶布局与 `prefers-reduced-motion`；transition 改走令牌 | 视觉 |
| `form/BxQuestionItem.vue` | 序号胶囊、必答/选填标记、错误块 `role="alert"` | 视觉 |
| `form/BxOptionList.vue` | 选项整行可点、选中态、`min-height:48px`、间距 8px | 视觉 + 交互 |
| `questionnaire/QuestionnaireRunner.vue` | **新增进度区**、**新增错误摘要**、修正吸底栏遮挡 | 交互增强 |
| `questionnaire/RecordList.vue` | 列表项信息带重构；未完成项给「继续作答」 | 视觉 |
| `editor/EditorItemRow.vue` | 行高常量 `ITEM_ROW_HEIGHT = 56` **必须保持不变**（`test/components/editor-layout.spec.ts` 读源码比对） | 视觉 |
| `editor/EditorOptionEditor.vue` | 行高常量 `OPTION_ROW_HEIGHT = 44` 同样不可擅改 | 视觉 |
| `editor/*` 新增右栏预览 | 设计器改三栏，预览复用题目渲染组件 | 交互增强 |

### 6.3 小程序端的四条硬约束（原型里做不到同等约束，落地必须改）

1. **不能用 `:has()`**——原型用 `:has(input:checked)` 表达选中态是为了单文件可预览；落地改为
   class 绑定（`BxOptionList` 已有 `--on` 修饰类）。
2. **不能用 `<svg>` 标签**——微信小程序不支持。所有图形只有三条实现路径：纯 CSS（边框 + 伪元素
   + 旋转，如返回箭头、多选对勾、空态插画）、文字（仅当语义本身就是文字）、位图资源（仅业务图片）。
   项目没有引入图标字体或图标库，这是刻意的（主包体积 ≤2MB）。
3. **不能用 `backdrop-filter`**——吸底栏的毛玻璃在 mp-weixin 上无效，落地用不透明白底 + 上边框。
4. **不能加载外链字体**——只用系统字体栈；数字用 `font-variant-numeric: tabular-nums` 对齐。


### 6.4 落地进度

**第 1 批（已完成）**：令牌层 + base 组件 + 选项与题目头。

| 范围 | 改动 | 验证 |
| --- | --- | --- |
| 令牌 | 见 §6.1；新增 `themes.scss` 并在 `App.vue` 引入 | `pnpm test`（令牌守护绿） |
| `BxProgressBar` | 高度 2px、主色令牌、右端圆角、280ms | 单测 |
| `BxEmpty` | 去掉 `∅` 文字符号，改 CSS 几何插画（文档 + 感叹号圆点） | CDP 截图（couple 页空态） |
| `BxButton` | 48px、真 spinner、新增 `danger` 变体、按下反馈按变体分层、焦点环走主色 | 单测 + lint |
| `BxNavBar` | 48px、返回箭头改 CSS 绘制、标题 17/600、点击区 44×44 | CDP 截图 |
| `BxQuestionItem` | 序号胶囊、题干 17/600、选填与多选提示、错误态用语义令牌 | 组件复核页截图 |
| `BxOptionList` | 整行可点 48px、三重选中表达、8px 间距、CSS 对勾 | 组件复核页截图 |
| `format.ts` | 新增 `stripQuestionTitleIndex()`（剥掉后端标题自带的「1. 」前缀） | 单测 + 类型检查 |

命令结果：`pnpm test` 679 项通过、`pnpm lint` 干净、`pnpm type-check` 通过、
`pnpm build h5` 成功、`pnpm check:cond` 通过、CDP 实测 5 个路由横向溢出均为 0。

**第 2 批（已完成）**：作答链路 + 其余表单控件。

| 范围 | 改动 | 验证 |
| --- | --- | --- |
| `QuestionnaireRunner` | 吸顶进度区（「共 N 题 · 已答 M」+「还差 K 题必答」）、提交失败的可点击错误摘要、修掉吸底栏遮挡、题目容器化 + 题内分割线 | 真实网关数据下 CDP 实测：选中 → 进度 +1；空卷提交 → 摘要 3 条；滚到底最后一道题在吸底栏上方 84px；溢出 0 |
| `BxTextField` | 48px、字号 15、占位用 `--bx-text-4`、禁用态、textarea `min-height` | 组件复核页截图 |
| `BxDatePicker` | 48px、箭头改 CSS chevron、禁用态 | 组件复核页截图 |
| `BxAddressPicker` | 同上（含「暂无地区数据」禁用态） | 组件复核页截图 |
| `BxRefSelector` | 同上 + 弹层圆角走令牌、选项行 48px、勾改 CSS、三处可点元素补齐键盘可达性 | 组件复核页截图 |
| `BxImageField` | 移除按钮「×」改 CSS 交叉线、上传/清空按钮 36px、空态用 `--bx-surface-2` | 组件复核页截图 |

命令结果：`pnpm test` 679 项通过、`pnpm lint` 干净、`pnpm type-check` 通过、`pnpm build h5` 成功、
**`pnpm smoke` 64 次渲染（16 页 × 4 视口）异常 0 次**。

**第 3 批（已完成）**：页面级。

| 范围 | 改动 |
| --- | --- |
| `LoginScreen` | 氛围光与背景渐变改令牌（不再是旧蓝 `rgba(0,122,255,…)`）、时钟用 hero 档 + `tabular-nums`、药丸输入框改白底描边、勾选框改 CSS 对勾、「记住我」勾子跟主题 |
| 封面 | 加载态改骨架屏、徽章改胶囊、标题 22→20（字阶内）、信息网格改「分格 + 竖线」 |
| 提交信息 | 输入框 40→48px、标签降到 sub 档、表单与信息卡用描边区分层次 |
| 作答结果 | 分数用 hero 档（40/48）+ tabular、答对/答错/未答改分格、判定徽章改用语义令牌（修掉硬编码 `rgba(0,180,42,.1)`）、逐题回顾容器化、加载态改骨架 |
| `SuggestionPanel` | 建议卡改「左侧主色竖条 + 浅底」、加载态改骨架 |
| `RecordList` | 状态改胶囊徽章、列表容器化（分割线代替逐卡阴影）、加载态改骨架、分数 tabular |
| `couple` | 列表容器化、分数用 title 档 + tabular、动作改胶囊按钮、加载态改骨架 |
| 令牌 | 新增 `--bx-font-hero: 40px` / `--bx-leading-hero: 48px`：结果页分数与登录页时钟是全站仅有的两处「数值即主角」 |

命令结果：`pnpm test` 679 项通过、`pnpm lint` 干净、`pnpm type-check` 通过、
**`pnpm smoke` 64 次渲染（16 页 × 4 视口）异常 0 次**、CDP 实测 6 个路由横向溢出均为 0。
（验证时 `.env.local` 的联调票据已过期，作答结果页与设计器页会跳登录页；
这两页的渲染需换票后再复核一次。）

**第 4 批（已完成）**：管理侧文字符号与列表。

| 范围 | 改动 |
| --- | --- |
| `EditorItemRow` | 拖拽把手 `⋮⋮` → box-shadow 点阵、`↑`/`↓` → 边框旋转、`✕` → 交叉线；按钮点击区 32→36px；选中/落点色改令牌。**行高契约 56px 未动** |
| `EditorOptionEditor` | 同上四类图标 + `✓`（正确答案）→ CSS 对勾且用 opacity 切换；`＋ 添加选项` → CSS 加号 + 「添加选项」；拖拽浮层的旧蓝 `rgba(0,122,255,.04)` → 主色浅底。**`OPTION_ROW_HEIGHT = 44` 与 `rowHeightStyle` 三件套未动** |
| `EditorListCard` | 状态徽章改语义令牌（修掉 `rgba(0,180,42,.1)`/`rgba(255,125,0,.1)`）、按钮 30→32px 且等宽、间距改相邻选择器、补 `:focus-visible` |
| 编辑器列表页 | 「＋ 新建」→ CSS 加号 + 「新建」、加载态改骨架屏 |
| `EditorItemPanel` / `EditorSegmented` / `EditorTypePicker` | 旧主色引用 `var(--bx-blue*)` → `var(--bx-primary*)`；提示文案里的 `✓` 改成文字描述 |

命令结果：`pnpm test` 679 项通过（含 `editor-layout.spec.ts` 9 项布局契约）、`pnpm lint` 干净、
`pnpm type-check` 通过、`pnpm build h5` 成功；编辑器组件用独立复核页 2x 截图确认（该页需登录，
票据过期时无法在线复核）。

**两处明确没做**：

1. **设计器三栏 + 手机预览**：`pages/editor/design` 的布局重构（506 行）留到下一轮，它需要登录态才能验证渲染。
2. **问卷列表没有改成真表格**：移动端 375px 下表格必然横向溢出，而 `smoke.mjs` 把「横向溢出 >1px」判为失败。
   改用卡片行 + 宽屏自适应（卡片内信息已按「标题 / 分类·题量·作答次数 / 时间周期」分层，操作按钮独立成组）。

**第 5 批（已完成）**：设计器三栏 + 实时预览。

| 范围 | 改动 |
| --- | --- |
| `pages/editor/design` | 三栏布局：左 320px（问卷属性 + 题目列表）/ 中 `flex:1`（题目设置）/ 右 360px（实时预览）；`≥1280px` 才显示预览栏，`900–1280px` 保持两栏，`<900px` 保持「左栏 + 右栏全屏浮层」不变 |
| 实时预览 | 新增预览栏：序号胶囊 + 题干 + 必答星 + 按题型渲染控件形态（单选圆点 / 多选方框 / 输入框 / 选择器），空态给引导文案；`＋ 添加题目` 同时换成 CSS 加号 |

**预览刻意不复用作答侧的 `BxFieldRenderer`**：那边吃的是 `QuestionField`（平台行经 mapper 归一化后的作答模型），
编辑器手里是 `EditorItem`（改动未保存的编辑模型）。为预览再造一条 `EditorItem → QuestionField` 的转换，
等于把 mapper 抄第二遍 —— 那份逻辑一旦分叉，预览就会「看起来很对、实际不对」。所以预览只做结构示意：
回答「这道题在手机上长什么样、选项够不够」，不承担像素级还原。

命令结果：`pnpm test` 679 项通过、`pnpm lint` 干净、`pnpm type-check` 通过、`pnpm build h5` 成功；
三栏与预览用独立复核页 + CDP 精确视口验证：1440px 下左栏 `flex-basis:320px`、预览栏 `display:flex`（三栏），
1000px 下预览栏 `display:none`（两栏），1440×900 截图确认布局与预览卡。

**第 6 批（已完成）**：a11y 补齐与全量验收。

| 范围 | 改动 |
| --- | --- |
| 图片替代文本 | 3 处 `<image>` 补 `alt`（编辑器封面预览、图片题缩略图、结果页作答图片） |
| 图标收尾 | `EditorActivityForm` 封面空态的 `＋` → CSS 加号；设计器空态提示文案同步改成「添加题目」 |
| 无障碍确认 | 静态扫描：全站 `[role]` 元素均带 `tabindex`、`<image>` 均带 `alt`；`BxEmpty` 插画与全部 CSS 图标已加 `aria-hidden`；`scripts/a11y.mjs` 的分组例外清单（radiogroup/group/…）无需扩充 |

**全量验收（重设计收口时实跑）**

| 命令 | 结果 |
| --- | --- |
| `pnpm test` | **679 项通过** |
| `pnpm lint` | 干净 |
| `pnpm type-check` | 通过 |
| `pnpm build h5` | 成功 |
| `pnpm build mp-weixin --mode test` | 成功 |
| `pnpm check:mp` | **校验通过**：13 页、209 文件 / 355.3 KB、rpx 白名单无越界、网关模式正确 |
| `pnpm check:cond` | 通过 |
| `pnpm smoke` | **64 次渲染（16 页 × 4 视口）异常 0 次** |
| a11y 静态扫描 | 通过 |
| CDP 实测 | 作答页（真实数据）：选中 → 进度 +1、空卷提交 → 摘要 3 条、滚到底不遮挡、溢出 0；设计器布局：1440 三栏 / 1000 两栏 |

**已知限制**

- **作答结果页与设计器页未在真实登录态下渲染验证**：验证期间 `.env.local` 的联调票据已过期（有效期约 1.5 小时），
  这两页会跳登录页。替代验证是编译 / 类型检查 / `check:mp` / 独立复核页截图 / 静态扫描。
  补验方式：`BX_USER=<账号> BX_PWD=<密码> node scripts/bx-login.mjs --write` 后重跑 CDP 检查。
- `pnpm a11y` 与 `pnpm e2e` 未跑，同属「需要 dev server 且票据有效」这一依赖。
- 小程序端只做了产物级校验，未在微信开发者工具里目视核对。


---

## 7. 已知取舍

- 原型为单文件、纯静态，**没有接真实数据**；文案与字段名取自现有代码与演示问卷，数值（86 分、3.5 年等）是示意。
- 「预计耗时」是**前端按题量估算**的展示，不是后端字段；若不想引入估算逻辑，可从信息网格中去掉这一格。
- 测评结果页的「逐题明细」依赖 `record_reply_merge_select` 返回的 `points` / `score`，而这两列**只有部分环境有**；缺失时应退化为只展示作答值，不要显示空白分数。
- 深色模式本轮未做：作答场景在白天/室内为主，且小程序端主题切换成本高。若后续需要，令牌层已具备整体替换的条件。
