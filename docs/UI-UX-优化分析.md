# bx-questionnaire UI/UX 优化分析

> 分析对象：`G:\bx-gitee\bx-questionnaire`（uni-app + Vue 3 + TypeScript + UnoCSS）
> 覆盖端：H5（PC / 移动 / 公众号）、微信小程序（竖屏 / PC 横屏）、iframe 嵌入老门户
> 方法：全量源码走查 + 真实浏览器实证（CDP 截图、`a11y`、`smoke`，dev server 跑在 5173）
> 日期：2026-10-12

---

## 一、总体判断

这个工程的 UI 底座比多数重构产物扎实：设计令牌、`:focus-visible`、键盘激活、错误态与空态区分、危险操作二次确认、跨端 `px` 约束（`test/style-units.spec.ts`），都有真实投入和踩坑记录，注释里保留了「为什么这么做」的实测依据。

问题不在「没做」，而集中在三处：

1. **质量的自动化保障目前不可信** —— 六个 UI 守门脚本的默认端口与 `pnpm dev h5` 不一致，默认执行得到的是「假绿」（第二节，最高优先）；
2. **异常分支的界面没有出口** —— 加载失败、数据源失败、题目配置异常这些路径会把使用者带进死路（第三节）；
3. **一致性缺口集中在「小控件」** —— 图标按钮、选项组、进度条、禁用态、文字对比度（第四、五节）。

阅读约定：`[P0]` = 影响使用者完成任务；`[P1]` = 明显损害体验或存在数据风险；`[P2]` = 一致性与打磨。所有结论均给出 `文件:行号`，可在源码中直接核对。

---

## 二、元问题：现有 UI 审计的「全绿」不能作为验收依据

这一节排在功能缺陷之前，因为它决定了「其他结论有多可信」。

### 2.1 六个守门脚本默认端口 ≠ dev server 端口，默认跑出来是假绿

`pnpm dev h5` 默认监听 **5173**（README 第 42 行也这么写），但：

| 脚本 | 默认 BASE | 行号 |
| --- | --- | --- |
| `scripts/a11y.mjs` | `http://localhost:5174` | `a11y.mjs:23` |
| `scripts/smoke.mjs` | `http://localhost:5174` | `smoke.mjs:18` |
| `scripts/e2e.mjs` | `http://localhost:5174` | `e2e.mjs:21` |
| `scripts/embed.mjs` | `http://localhost:5174` | `embed.mjs:26` |
| `scripts/special-e2e.mjs` | `http://localhost:5174` | `special-e2e.mjs:37` |
| `scripts/check-overflow.mjs` | `http://localhost:5174` | `check-overflow.mjs:14` |
| `scripts/editor-e2e.mjs` | `http://localhost:5173` ✓ | `editor-e2e.mjs:22` |
| `scripts/screenshot.mjs` | `http://localhost:5173` ✓ | `screenshot.mjs:21` |

**实测对比**（本轮在 5173 起 dev server 后）：

```text
# pnpm a11y（默认 5174，无人监听）
封面页（可交互 3 个）… 问卷作答页（可交互 3 个）… 可视化设计器（可交互 3 个）
== 汇总：无名称 0 项 / 缺 alt 0 项 / 键盘到不了 0 项 / 焦点不可见 0 项 ==

# node scripts/a11y.mjs http://localhost:5173（真实）
封面页（可交互 0 个）… 问卷作答页（可交互 15 个）… 登记信息页（可交互 5 个）
作答记录页（可交互 1 个）… 问卷列表页（可交互 9 个）… 可视化设计器（可交互 3 个）
== 平台限制：名称只挂在 uni-input / uni-textarea 壳上 1 项 ==
```

默认端口下**每个页面都恰好「可交互 3 个」且全绿**——那是 Chrome 错误页被审计了 9 次。真端口下数据才有意义（作答页 15 个、列表页 9 个）。

**使用者影响**：任何依赖这些脚本判断「UI 没问题」的结论都不可信。docs/验收清单.md 第 1880-1888 行曾记录 a11y 输出「名称只挂在壳上 1 个」，与本次 5174 下的 `0 项` 不一致，正是这个端口错位的旁证。

**建议改法**（任选，推荐 1+2）：
1. 把六个脚本的默认 BASE 统一改为 `5173`，或抽一个 `scripts/_base.mjs` 读取 `process.env.BX_BASE || 'http://localhost:5173'`；
2. 脚本启动时先探测 BASE 可达性，**不可达直接退出并报错**（现在的行为是静默在错误页上「通过」，这比报错危险得多）；
3. 在 `package.json` 的 `a11y` / `smoke` / `e2e` 里显式传 `http://localhost:5173`。

### 2.2 审计只覆盖 4 个维度，且选择器有结构性盲区

`a11y.mjs:50-139` 的检查项是：可读名称、图片 alt、`tabIndex >= 0`、焦点是否可见。

**盲区一（最危险）：选择器不包含「没有 `role`/`tabindex` 的可点击元素」**。`a11y.mjs:71-75` 的 `sel` 只有：

```js
const sel = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'uni-button',
  'uni-input',
  'uni-textarea',
  'uni-picker',
  '[role]',
  '[tabindex]',
]
```

一个只写 `@click` 的 `<view>`（H5 上是 `<uni-view>`）**既不进「可交互」计数，也不算「键盘到不了」**——它从审计里彻底消失。实测落在这个盲区里的关键控件：

- `BxRefSelector.vue:146-154`（打开选择面板的壳）、`:156`（遮罩）、`:160`（关闭）、`:170`（重试）、`:175-193`（选项、确定）——**全是只有 `@click` 的 `<view>`/`<text>`，无 `role`、无 `tabindex`、无 `@keydown`**；
- `EditorItemRow.vue:89`（点击选中题目）、`EditorTypePicker.vue:22-31`（取消、题型格子）。

后果：引用题键盘用户**打不开面板**，设计器键盘用户**选不中题目、选不了题型**。而 `pnpm a11y` 输出「键盘可达：✓ / 键盘到不了 0 项」，看起来像键盘可用性的证明。

**盲区二：不检查「有 `role="button"` + `tabindex` 的元素是否真的绑了键盘激活处理器」**：

- `BxImageField.vue:308-310`（移除图片）、`:334-337`（上传）、`:348-350`（清空）都是 `role="button" tabindex="0"`，但**没有任何 `@keydown`** → 键盘能 Tab 到，按 Enter/Space 毫无反应；
- `EditorActivityForm.vue:274`（上传封面图）同样只有 `@click`；
- `EditorItemRow.vue:76-85`（拖拽把手）有 `role`/`tabindex`，但只绑了 `@touchstart`/`@mousedown`。

**盲区三：图片 alt 检查恒真**。`a11y.mjs:127-130` 只查 `<img>`，而 `src` 下**没有任何 `<img>` 标签**（图片题用 `<image>` → H5 渲染为 `<uni-image>`），所以「图片 alt：全部有 ✓」是无意义的绿。

**盲区四：不检查对比度、不检查动态播报**（无 `aria-live`/`role="alert"` 校验）、**不检查语义正确性**（tab 用 `role="button"`、单选组无方向键、禁用按钮仍 `tabindex="0"` 都算 ✓）、**不检查 `lang`/`title`/缩放**。第 4.3 节的对比度问题与 3.7 的弹窗问题都因此测不出。

**建议改法**：
1. 选择器覆盖「所有可点击元素」：追加 `cursor: pointer` 的元素，并对模板源码做一次「有 `@click` 的可聚焦性」检查；
2. 加一条源码级单测（与 `test/style-units.spec.ts` 同思路）：凡模板出现 `role="button"`，同一元素必须同时出现 `@keydown`；
3. 图片检查同时覆盖 `uni-image` 与 `background-image`；
4. 把「对比度」纳入静态单测（直接读 `tokens.scss` 计算），成本最低、收益最大。

### 2.3 审计只跑一个视口，PC 布局与设计器右栏从未被测

`a11y.mjs:199` 固定 `375×812`。而设计器在 <900px 下另一个面板是 `display:none`（`design/index.vue:477-491`），所以**PC 双栏布局里的输入框从未进入审计**。docs/验收清单.md 第 1891-1892 行已经承认这一点（「没测到，不是没问题」）。

**建议改法**：`a11y.mjs` 增加 1440×900 视口各跑一遍，或在设计器页面上先切到「问卷信息」标签再审计。

### 2.4 真机验证清单全部未执行

docs/验收清单.md 第 1894-1929 行的「七、真机验证清单（待执行）」中，微信小程序（竖屏 + PC 横屏）、公众号 H5、iframe 嵌入、键盘弹起遮挡、原生 picker 行为等**全部是未勾选状态**。

**风险**：本项目大量依赖 `position: sticky`（`BxNavBar.vue:76`）、CSS 变量、`env(safe-area-inset-*)`、`:focus-visible`、`hover-class`，这些在微信小程序与公众号 H5 上的行为差异恰好是最容易出问题的部分，而它们目前只有 H5 桌面 Chrome 的验证。

**建议**：在完成本轮修复后，把真机清单作为**发布门槛**执行一次，并把结果回写 docs。

---

## 三、P0：影响使用者完成任务的缺陷

### 3.1 [P0] 管理侧「加载失败」态是一处死路：标题退化为「新建问卷」、保存按钮仍可点、无重试

**实测**（`node scripts/smoke.mjs http://localhost:5173`，PC 与移动视口一致）：

```text
可视化设计器（编辑已有问卷）（文本 46 字）
  首屏：‹ / 新建问卷 / 保存 / srvdaq_activity_cfg_select无权限访问 / 返回列表
```

URL 里明确带了 `activity_no`（用户想**编辑已有问卷**），但页面显示的是「新建问卷」，错误区只有「返回列表」，**没有重试**。

代码链条：
- `useEditorDocument.ts:216-225`：加载失败时 `loadError` 置值，且 `doc.value = emptyDocument()`；
- `useEditorDocument.ts:172`：`isNew = computed(() => !doc.value.activity.activityNo)` → 空文档 ⇒ **`isNew` 为真** → 导航栏标题变「新建问卷」；
- `design/index.vue:338-348`：**保存按钮在 `BxNavBar` 的 `#extra` 插槽里，不在 `v-if="loadError"` 的条件内**，所以错误态下依然渲染、依然可点；
- `design/index.vue:277-311`：`onSave()` 只判断 `saving`，不判断 `loadError` / `loaded`；
- `validation.ts:86-116`：空文档必然产出 ≥7 条必填 issue（标题、分类、关键字、封面图、起止时间、描述）＋「至少需要一道题目」；
- `design/index.vue:353-365`：错误态下 body 被 `v-else` 隐藏 ⇒ `focusFirstIssue` 切到「问卷信息」标签也**没有表单可看**。

**使用者影响**（三层叠加）：
1. 用户以为自己在新建，其实想编辑，**页面自我描述与实际意图矛盾**；
2. 点「保存」→ 收到 toast「请填写问卷标题（共 8 项待修正）」，但**页面上根本没有可填的地方** → 彻底卡死；
3. 更危险的是：一旦空文档通过校验（例如未来默认值补齐），`save()` 会走 `plan.activityCreate` 分支（`useEditorDocument.ts:256-257`）**在服务端创建一条新的空问卷**，而用户以为在保存已有问卷。

**建议改法**：
1. 错误态下**隐藏或禁用保存按钮**（`v-if="!loadError"` 或 `:aria-disabled` + `tabindex="-1"`）；
2. 标题不要基于 `isNew` 推断，改为基于「是否请求过 activity_no」——请求过就显示「问卷设计」，避免误导；
3. 错误区补「重新加载」按钮（调 `load(activityNo)`），与列表页 `editor/list/index.vue:224-233` 的重试保持同构；
4. `onSave()` 首行加 `if (loadError.value || !loaded.value) return`。

### 3.2 [P0] 新建问卷页一打开就满屏必填错误

**实测**（同一份 smoke 输出，设计器「新建」态首屏文本）：

```text
新建问卷 / 保存 / 问卷标题 / * / 例如：员工满意度调查 / 请填写问卷标题
/ 分类 / * / 暂无可用分类 / ▼ / 请选择分类 / 关键字 / * / 例如：满意度 / 请填写关键字
/ 封面图 / * / ＋ / 点击上传 / 请上传封面图 / 启用时间 / * / …
```

用户**尚未输入任何内容**，表单已经用红字报出全部 7 条必填错误。

代码链条：
- `design/index.vue:39` 解构出 `issues`，`:156` 透传给 `EditorActivityForm`；
- `useEditorDocument.ts` 中 `issues` 是 `computed(() => validateDocument(doc.value))`，**无条件计算**；
- `EditorActivityForm.vue:221` `ownIssues = computed(() => activityIssues(props.issues))`，`:230` `:error="errorFor('title')"` —— 只要有 issue 就渲染错误。

**使用者影响**：错误提示失去信号价值（用户分不清哪些是「我刚犯的错」），首次进入即被「你错了 7 处」施压；对不熟悉的运营人员是明显的劝退。

**建议改法**：引入「已交互 / 已提交过一次」门槛——`touched` 变量在 `useEditorDocument.ts` 已存在（`load` 时置 false），把它提升为「是否尝试过保存」标记：首次点击保存前，`errorFor()` 一律返回空串；点击保存后（或字段 blur 后）才显示错误。

### 3.3 [P0] 必填题落在「无可作答控件」的分支时，校验会永久阻塞提交

**三条触发路径，落到同一个死锁**：

| 触发条件 | 代码位置 | 界面表现 |
| --- | --- | --- |
| 题型未覆盖 | `domain/questionnaire/mapper.ts:72-74` → `widget: 'unknown'`；`BxFieldRenderer.vue:106-110` | 只显示「该题型暂未支持」，无作答入口 |
| 选项为空 | `mapper.ts:79-82` → `options: []`；`BxOptionList.vue:84-86` | 「该题暂无可选项」 |
| 数据源失败 | `BxAddressPicker.vue:226,243`（禁用 + 「暂无地区数据」）；`BxRefSelector.vue:74-77,172-174` | 控件被禁用，无重试 |

而校验与进度统计把它们**算作「可作答但未答」**：

```ts
// domain/questionnaire/validator.ts:31-33
if (!field.required || isFieldAnswered(field, answers))
  continue
// validator.ts:59-60 countAnswered 只排除 section
```

于是 `QuestionnaireRunner.vue:276-288` 每次都得到 `issues.length > 0`，滚动到该题、toast「还有 N 道必填题未作答」——**用户答完全部能答的题，依然提交不了**。

**使用者影响**：这是最容易被投诉成「系统坏了」的失败。用户看到「第 N 题必填」但那一题没有任何可点的东西。

**建议改法**：
1. `validator.ts` 增加「不可作答」判定：`widget === 'unknown'`、选项题为空、picker 类数据源加载失败时，从必填校验与 `progress.total` 中排除；
2. 或在加载完成后扫描出这类题，在页顶给一条**可行动横幅**：「第 3、7 题因题目配置异常无法作答，已跳过，可正常提交；如需作答请联系发起人」；
3. `BxAddressPicker` 的错误态补齐「重新加载」（`BxRefSelector.vue:167-174` 已有正确范式，直接复用）。

### 3.4 [P0] 内部服务名与原始 `resultMessage` 直接暴露给最终用户

**实测**（smoke，PC 与移动，列表页与设计器）：

```text
srvdaq_activity_cfg_select无权限访问
```

代码链条：`utils/request/index.ts:132` `const message = envelope.resultMessage || '请求失败'` → 服务端原文进入 `BxError.message` → 页面直接渲染（`editor/list/index.vue:222-223`、`design/index.vue:353-354`）。

**说明**：这条错误在本环境由「浏览器无平台会话 / 票据缺少服务权限」触发（docs/验收清单.md 第 161-163 行有记录），属环境限制；**但把服务名原样透给用户是代码问题**，且文案完全不可行动。

**使用者影响**：用户看到一串英文服务名，不知道是自己没登录、没权限，还是系统故障；也没有任何「该怎么做」的指引。同时这属于不必要的信息泄露（暴露后端服务命名与内部结构）。

**建议改法**：
1. 在请求层做一次文案清洗：剥掉 `srvXXX_` 前缀与 `[service]` 片段，只保留业务语义（如「无权限访问」）；
2. 按 `resultCode` 分档给用户话术：`0011` → 「登录状态已过期，请重新进入」；`FAILURE` + 权限类 → 「当前账号没有查看该内容的权限」；网络类 → 「网络不稳定，请重试」；
3. 技术细节（服务名、resultCode）只写 `console` 或调试开关，不上屏。

### 3.5 [P0] 核心操作在键盘下不可用：图片题、引用题、编辑器拖拽

已核实（`grep @keydown` 与逐文件阅读）：

| 位置 | 现状 | 后果 |
| --- | --- | --- |
| `BxImageField.vue:308-310 / 334-337 / 348-350` | `role="button" tabindex="0"`，**无 `@keydown`** | 图片上传/移除/清空键盘全不可用 |
| `BxRefSelector.vue:146-154` | 控件**无 `role`、无 `tabindex`、无 `@keydown`** | 引用题键盘用户打不开选择面板 |
| `EditorActivityForm.vue:274` | `role="button" tabindex="0"`，无 `@keydown` | 封面上传键盘不可用（封面是必填项，见 `validation.ts:93`） |
| `EditorItemRow.vue:76-85` | 拖拽把手只绑 `touchstart`/`mousedown` | 键盘无法拖拽（有上移/下移替代，但把手本身是死焦点） |

另有**一致性缺口**：`EditorItemRow.vue:102/113/123`、`EditorOptionEditor.vue:119/140/151/161/187`、`editor/list/index.vue:165/190/200/216/230/266/280`、`design/index.vue:334/345/361/378/389/415/469` 等大量位置只处理 `@keydown.enter`，**不支持 Space**；而 `BxButton.vue:43-50`、`BxOptionList.vue:49-55`、`BxNavBar.vue:43-49` 是 Enter + Space。同一个产品里，按钮有的认 Space 有的不认。

**建议改法**：抽一个 `useActivatable()`（Enter + Space + `preventDefault`），替换现在 6 处各写一遍的实现，并补齐上述缺失位置；`BxRefSelector` 的控件补 `role="button"`、`:tabindex="disabled ? -1 : 0"`、`aria-haspopup="dialog"`。

### 3.6 [P0] 移动端设计器：全屏浮层遮住保存按钮，保存后还会丢掉「正在编辑哪一题」

**浮层层级**：
- `design/index.vue:477-491`：`.design__pane--right` 在窄屏是 `position: fixed; inset: 0; z-index: 40`；
- `BxNavBar.vue:75-85`：导航栏 `position: sticky; z-index: 10`。

`z-index: 40 > 10` ⇒ 手机上打开「题目设置」浮层后，**导航栏（含保存/放弃按钮）被完全覆盖**，必须先点浮层里的「返回题目列表」（`design/index.vue:465-469`）才能保存。

**叠加问题**：`useEditorDocument.ts:211-212` 保存成功后整体 `load()` 重建文档，`clientKey` 全部重新生成（`types.ts:29-34`），而 `design/index.vue:89` 的 `selectedKey` 不跟随 ⇒ **每次保存后右栏都变成「未选择题目」**。

**使用者影响**：手机上「改一题 → 保存 → 面板空了 → 关浮层 → 保存」是一段断裂的流程；保存后连「刚才在编辑哪一题」都找不回来。

**建议改法**：
1. 浮层顶部固定一条操作条（保存 + 关闭），或把浮层 `top` 改为导航栏高度以下；
2. 保存后按 `item_no`（而非 `clientKey`）恢复 `selectedKey`，或在 `load()` 后重新映射选中项。

### 3.7 [P0] H5 上「确认弹窗」键盘完全不可操作 —— 键盘用户填完问卷也提交不了

**实测源码**（`node_modules/@dcloudio/uni-h5/dist/uni-h5.es.js:22499-22513`，uni-app H5 的 `uni.showModal` 实现）：

```js
createVNode('div', { class: 'uni-modal__ft' }, [
  showCancel && createVNode('div', {
    class: 'uni-modal__btn uni-modal__btn_default',
    onClick: cancel
  }, [props2.cancelText], 12, ['onClick']),
  createVNode('div', {
    class: 'uni-modal__btn uni-modal__btn_primary',
    onClick: confirm
  }, [confirmText], 12, ['onClick'])
])
```

「取消 / 确定」是**只有 `onClick` 的 `<div>`**：无 `role`、无 `tabindex`、无键盘处理、无 `aria-modal`、无焦点陷阱、无 Esc。

而提交被拦在它后面：`QuestionnaireRunner.vue:290` `const confirmed = await confirmDialog('提交后无法修改，确认提交吗？', '提交确认')`，`utils/ui.ts:10-19` 的 `confirmDialog` 直接包 `uni.showModal`。

**使用者影响**（键盘/开关控制用户）：
1. 焦点在「提交问卷」上（`BxButton.vue:43-50` 支持 Enter），按 Enter → 弹窗出现，但**焦点仍停在按钮上**；
2. 再按 Enter → 又触发一次 `onSubmit`（`:275-293` **无重入保护**）→ 确认框叠加；
3. 「确定」按钮永远无法聚焦、无法激活 ⇒ **问卷永远提交不出去**。

**同一根因波及所有危险操作确认**：`editor/list/index.vue:133-135`（删除问卷）、`design/index.vue:285-291`（保存时删除题目摘要）、`:313-319`（放弃修改）—— 键盘用户在这些地方同样只能卡住。

**建议改法**：
1. H5 端改自绘确认弹窗（或对 `uni.showModal` 做一层封装）：`role="alertdialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby`，打开时把焦点移到「确定」，Tab 循环限制在弹窗内，Esc 关闭，关闭后焦点归还触发元素；
2. `onSubmit()` 加进行中标记，防止确认框叠加（现在只有 `submitting` 在提交阶段才置位）；
3. 同理给 `uni.showToast` 兜一层 `aria-live`（H5 产物同样是无 ARIA 的裸节点，`:22634-22651`）。

### 3.8 [P0] 页面级可访问性元数据缺失：禁止缩放、无 `lang`、空 `title`

**实测** `index.html`：

```html
2:  <html>                          ← 无 lang
10:   ... user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0 ...
13:   <title></title>               ← 空
```

**使用者影响**：
- `user-scalable=no` + `maximum-scale=1.0`：Android Chrome 与微信 Android 内核仍遵守，**低视力用户无法双指放大**（WCAG 1.4.4 失败）；问卷是小字号密集场景，这条影响面很大；
- 无 `lang="zh-CN"`：读屏语言可能按系统默认走英文发音规则，中文被读成乱码式音节；
- 空 `<title>`：标签页、分享卡片在运行时注入前是空白（`manifest.config.ts:40` 的 `h5.title` 不生成静态 title）。

**建议改法**：删除 `maximum-scale=1.0` 与 `user-scalable=no`；`<html lang="zh-CN">`；静态 `<title>问卷</title>` 兜底。

---

## 四、P1：明显损害体验或存在数据风险

### 4.1 错误与恢复

| # | 问题 | 位置 | 使用者影响 | 建议 |
| --- | --- | --- | --- | --- |
| P1-1 | **四个失败态没有重试入口** | `QuestionnaireRunner.vue:402-406`、`index/result.vue:399-403`、`cover/index.vue:52-56`、`SuggestionPanel.vue:90-94` | 弱网下只能「返回再进来」；iframe 嵌入时连刷新都没有，直接卡死 | `BxEmpty` **已有默认插槽**（`BxEmpty.vue:20`），在四处塞「重新加载」即可；并按错误来源分档文案（网络类 vs 链接无效类） |
| P1-2 | **地址题把「加载失败」显示成「暂无地区数据」** | `BxAddressPicker.vue:104,123` 赋值 `errorMessage`，但模板 `:229-249` **从未渲染它**；`:240-246` 失败与无数据共用同一句占位 | 用户以为「问卷没配地区」，而不是「加载失败可以重试」；叠加必填即 3.3 的死锁 | 模板补 `!hasOptions && errorMessage` 分支 + 「重新加载」（复用 `init()`） |
| P1-3 | **提交/离开页面无任何拦截** | 全工程 `grep onUnload\|onBackPress\|beforeunload` **零命中**；仅靠 `useDraft` 自动保存兜底 | 答到一半点返回，页面直接消失，没有「已保存」确认；若草稿请求恰好失败，答案真的丢了而用户不知情 | `onBackPress`（小程序/App）+ H5 `beforeunload`：有未提交答案时 `confirmDialog('答案已自动保存，确认离开吗？')`；自动保存失败升级为可见提示 |
| P1-4 | **toast 固定 2 秒，长文案记不住** | `utils/ui.ts:5-7` `duration: 2000` | 「还有 5 道必填题未作答」这类需要行动的信息 2 秒消失 | 错误类 ≥3000ms，或改为页内持久提示条 |
| P1-5 | **保存失败只在「问卷信息」区可见** | `design/index.vue:402`（位于 `--hidden` 分支）、`useEditorDocument.ts:314` | 用户在「题目」标签下保存失败，只剩 2 秒 toast，回头看不到原因 | 保存失败改为导航栏下方常驻错误条（含「重试」） |
| P1-6 | **列表页禁用态分页按钮仍可聚焦可点击** | `editor/list/index.vue:259-284`（`--off` 只改样式，`role`/`tabindex`/`@keydown` 保留）；`useEditorList.ts:115-125` 内部 guard 静默 return | 键盘用户 Tab 到「上一页」按下无反应，以为坏了 | 禁用态 `:tabindex="-1"` + `aria-disabled="true"`（与 `BxButton.vue:62-63` 的正确做法对齐） |

### 4.2 数据正确性风险

| # | 问题 | 位置 | 使用者影响 | 建议 |
| --- | --- | --- | --- | --- |
| P1-7 | **只读查看会写本地草稿，可能把 A 记录的答案带进 B 的续答** | 草稿落盘 watcher `QuestionnaireRunner.vue:215-230` **没有 `readOnly` 守卫**；而只读进入时会 `replace(backfill)`（`:114-116`） | 用户点开一条旧记录看一眼，本机正在续答的草稿被覆盖成被查看记录的答案 | watcher 与 `restoreDraftBatch()`（`:151-172`）在 `readOnly` 时跳过；落盘统一用 `props.fillBatchNo`，不要用可能被改写的 `session.fillBatchNo` |
| P1-8 | **新建问卷保存中途失败会重复创建** | `useEditorDocument.ts:256-261`：`activityAdd` 拿到的编号只存**局部变量**，失败时 `doc.activity.activityNo` 仍为空 → 重试再次走 `activityCreate`（`diff.ts:85-87` 在 `raw === null` 时恒生成） | 服务端出现两份同名问卷，用户无从察觉 | `activityAdd` 成功后立即把 `activityNo` 写回 `doc.value.activity`，并置 `isNew = false` |
| P1-9 | **切换题型清空已填选项且无提示** | `useEditorDocument.ts:406-421`（重置 `attr`、非选项类清空 `options`）；触发点 `EditorItemPanel.vue:129-132,170-172`、`design/index.vue:193-198` 均无确认 | 填了 6 个选项后换题型全丢，且无撤销 | 切换前若有已填内容，`confirmDialog` 明确告知；或保留选项数据（不显示也不删）直到保存 |
| P1-10 | **图片移除按钮 22×22 且按「显示下标」删「数据下标」** | `BxImageField.vue:384-395`（22px）；`:269-286` 用 `index` 同时索引 `fileNos` 与 `localPreviews`，而 `serverUrls`（`:155-164`）`filter(Boolean)` 会塌陷下标 | 点第 N 张的 × 可能移除**另一张**的 `fileNo`；用户会认为「图片丢了」 | 热区扩到 ≥44px；`onRemove` 改为按图片地址/`fileNo` 定位；`serverUrls` 保留占位不 `filter` |
| P1-11 | **越界点「上移/下移」会被误标为「有改动」** | `EditorItemRow.vue:95-116`（`--off` 只改文字色，`@click` 无条件 emit）；`useEditorDocument.ts:393-396,439-445` 无条件 `touched = true` | 首行点「上移」：无位移、无反馈，但返回列表时被问「放弃未保存的修改吗？」 | `moveItem`/`moveOption` 比较 `moveInArray` 返回值引用（`reorder.ts:13-33` 已支持 `result === list` 判断）；`--off` 时 `pointer-events: none` + `aria-disabled` |
| P1-12 | **结果页「重新测试」可能带出上一条记录的答案** | `result.vue:385-387` 只带 `status`；`QuestionnaireRunner.vue:93` 会读持久化的 `session.fillBatchNo` | 从记录页进结果页再点「重新测试」，可能带着旧记录的回填 | `restart()` 显式清理会话批次号 |

### 4.3 信息表达与可读性

| # | 问题 | 位置 | 使用者影响 | 建议 |
| --- | --- | --- | --- | --- |
| P1-13 | **结果页「0 / 20 分」与「0 答对 / 0 答错 / 2 未答」自相矛盾** | `result.vue:409-431`：只有配置了 `points` 的题参与统计，但页面未说明；演示问卷 11 题里只有 2 题计分（实测截图） | 用户看到「0/20」以为全错，实际其他 9 题不计分 | 分数卡补一行「本问卷 2 道题计分」；或在逐题列表里对不计分题给中性徽标（见 P1-14） |
| P1-14 | **「不计分」徽标是死代码，不计分题没有任何标记** | `result.vue:341-344` 生成 `verdictText: '不计分'`，但模板 `:444-450` 用 `v-if="row.verdict !== 'unjudged'"` 把它挡掉；`:472` 同理挡掉得分行 | 一题有「回答正确/错误」，另一题什么都没有，用户怀疑漏渲染 | 把 `unjudged` 渲染成中性灰底「不计分」徽标，并在页顶加图例说明 |
| P1-15 | **「我的作答 暂无法获取」出现 11 次，无解释无重试** | `result.vue`（实测截图，匿名/无会话时 `merge_select` 取不到值）；docs/验收清单.md 第 1936-1937 行确认匿名用户看不到自己的作答 | 用户以为系统坏了，或以为自己的答案没保存 | 文案改为「未登录，无法回看本题作答（不影响已提交的结果）」，并给出登录入口或说明 |
| P1-16 | **批次号（20 位内部 ID）直接展示给用户** | `result.vue:433`、`RecordList.vue:245`、`couple.vue:150` | 用户误以为是订单号/凭证，反复询问客服 | 默认隐藏（或缩小到 12px 次要色 + 长按复制），客服排障场景再显示 |
| P1-17 | **记录列表「已隐藏 N 条其他账号记录」在最需要时不显示** | `RecordList.vue:67-75` 的 `loginHint` 在 `visibleRows.length === 0` 时返回空串，而渲染它的 `:204-208` 位于 `v-else` 内 | 恰在「返回的记录一条都不是我的」时，用户只看到「暂无作答记录」，以为自己的记录丢了 | `loginHint` 只看 `session.isLogin` 与 `hidden > 0`，并在空态里也渲染（`BxEmpty` 有默认插槽） |
| P1-18 | **主色与三级灰作为文字色均不达 WCAG AA** | 见下表 | 占位符、错误提示、题号、元信息全部处于「灰到看不见」的区间；主按钮文字在强光下发糊 | 调整令牌值（见下表） |

**对比度实测（按 WCAG 2.1 相对亮度公式由令牌原值计算）**：

| 令牌 | 原值 | 白底 | `--bx-bg #f5f6f8` 底 | AA(4.5:1) | 建议值 |
| --- | --- | --- | --- | --- | --- |
| `--bx-text-3` | `#8f959e` | **3.02:1** | **2.79:1** | ✗ | `#667085`（白底 4.97:1 / 灰底 4.60:1） |
| `--bx-text-2` | `#646a73` | 5.45:1 | — | ✓ | 保持 |
| `--bx-blue`（白字按钮底） | `#007aff` | **4.02:1** | — | ✗ | 按钮填充改 `--bx-blue-hover #0067db`（5.30:1） |
| `--bx-danger` | `#f53f3f` | **3.71:1** | 错误底 `#fff5f5` 上 3.47:1 | ✗ | `#d92c2c`（4.83:1） |
| `--bx-warn` | `#ff7d00` | **2.57:1** | — | ✗ | 文字用 `#c2410c`（5.18:1），`#ff7d00` 仅用于图标/描边 |
| `--bx-success` | `#00b42a` | **2.78:1** | — | ✗ | 文字用 `#0f7b2f`（5.39:1） |

`--bx-text-3` 用在至少 30 处 12–14px 文字上（占位符 `BxTextField.vue:90-92`、字数计数 `:119-120`、「多选题」提示 `BxQuestionItem.vue:92-97`、空态 tip `BxEmpty.vue:54-58`、题号 `EditorItemRow.vue:177-182`、列表元信息 `EditorListCard.vue:160,167` 等）。**只改令牌值即可一次性获益**，是投入产出比最高的一项。

`--bx-warn` 尤其值得注意：它用在「只读提示」（`QuestionnaireRunner.vue:537-542`，12px）与「附件读不到」（`BxImageField.vue:440-446`，12px）——**最需要被读到的那两句，恰恰是页面上最看不清的文字**。

### 4.4 表单可用性

| # | 问题 | 位置 | 使用者影响 | 建议 |
| --- | --- | --- | --- | --- |
| P1-19 | **只读模式下文本框、日期框看起来仍可编辑** | `BxTextField.vue:39-61`、`BxDatePicker.vue:76-123` 只透传 `:disabled`，**没有 `:disabled` 样式**；而选项/地址/引用都有（`BxOptionList.vue:108-111` 等） | 用户点进去没反应，以为页面卡了；同页不同题型表现还不一致 | 统一补 `--disabled` 修饰类；并区分语义：只读回看用 `readonly`（保留正常文字色），不要复用 `disabled` 的半透明（合成后约 4.25:1，仍不达 AA） |
| P1-20 | **图片上传无进度、失败不能重试、不能点击预览** | `BxImageField.vue:218-259`（`uploading` 是布尔）、`:237-251`（失败只累加计数）、`:303-317`（`<image>` 无 `@click`） | 选 9 张图不知进度；失败一张要全部重选；传完不能点开确认 | `uploading` 改 `{done,total}`；失败项保留临时路径并给「重试」；`<image>` 加 `@click` → `uni.previewImage` |
| P1-21 | **单选组每个选项都可 Tab，无方向键** | `BxOptionList.vue:64-77` 每个选项 `:tabindex="disabled ? -1 : 0"`，`onKeydown` 只认 Enter/Space | 一道 10 选项的题要按 10 次 Tab 才能走到下一题 | 采用 ARIA APG 的 roving tabindex：组内仅一项 `tabindex=0`，Arrow 键移动 |
| P1-22 | **「暂存草稿」无 loading，且空内容时弹空白 toast** | `QuestionnaireRunner.vue:441-443` 未使用 `useDraft` 的 `saving`；`:272` `toast(savedTip.value)`，而 `useDraft.ts:143-146` 在无内容时提前 return 不设 `savedTip` | 连点会并发两次全卷保存；没答题时点暂存出现一个空白提示框 | 按钮接 `:loading="saving"`；无内容时提示「还没有可暂存的内容」 |
| P1-23 | **必填星号被 flex 推到卡片最右侧，与标题关联弱** | `BxQuestionItem.vue:70-73`（`__head` 是 flex，标题 `flex: 1`），星号 `:84-90` 被推到最右；PC 上跨度可达 700px | 用户难以把「*」与哪一题对应；移动端更明显 | 星号紧跟标题文字（把 `flex: 1` 移到外层容器或让星号与标题同在一个内联块里） |
| P1-24 | **「（选填）」文字与「*」两种必填表达并存** | 演示问卷第 1 题标题自带「（选填）」（题目配置），其余题用星号 | 同一份问卷里两种表达，认知负担 | 统一为星号 + 顶部图例，或在所有选填题标题后统一加「（选填）」 |
| P1-25 | **多处触控目标 < 44px** | `BxNavBar.vue:101-109`（36×36 返回）、`QuestionnaireRunner.vue:462-469`（36px「记录」）、`EditorItemRow.vue:217-224`（32×32）、`EditorOptionEditor.vue:322-329`（22×28）、`BxImageField.vue:384-395`（22×22）、`couple.vue:261-268`（约 24px 的卡片操作）、`editor/list/index.vue:296-304/354-364/382-392`（30/38/30px） | 单手、行走中、老年用户误触率高；编辑器选项行三个 22px 按钮并排，误触删除代价大 | 视觉尺寸可保留，热区用 `padding` 或 `::after{inset:-11px}` 扩到 44px；并排按钮间距 ≥8px；抽 `--bx-control-height: 44px` |

### 4.5 多端适配与性能

| # | 问题 | 位置 | 使用者影响 | 建议 |
| --- | --- | --- | --- | --- |
| P1-26 | **顶部安全区与小程序胶囊避让缺失** | `BxNavBar.vue:75-85` 只有 `padding-top: var(--status-bar-height, 0)`，无 `env(safe-area-inset-top)`；全仓无 `getMenuButtonBoundingClientRect`；而 `pages.config.ts:15` 全局 `navigationStyle: 'custom'`，右侧插槽放了「记录」「＋ 新建」「放弃/保存」 | 刘海屏/全屏 WebView 下导航栏可能被状态栏压住；微信小程序真机上右上角胶囊与自定义按钮重叠，**点不到「记录 / 新建 / 保存」** | `padding-top: calc(var(--status-bar-height, 0px) + env(safe-area-inset-top))`；小程序端用胶囊 API 预留右侧宽度；补进真机清单 |
| P1-27 | **iframe 高度自适应只覆盖 3 个组件，且加载失败时父页面永远收不到 `FORM_READY`** | `useEmbedResize()` 只在 `QuestionnaireRunner.vue:57`、`result.vue:39`、`SuggestionPanel.vue:37` 调用（封面页、记录页、登记页、couple、编辑器两页都没有）；`QuestionnaireRunner.vue:107-112` 仅 load 成功才发消息 | 嵌入老门户时其余页面内容变长被裁切；活动不存在/加载失败时宿主 loading 一直转，用户看到「永远在加载」而不是错误 | 页面级统一挂 `useEmbedResize()`；`FORM_READY` 成功/失败都发（失败带 `{ok:false, message}`） |
| P1-28 | **长问卷无虚拟化；地址题每实例拉 5000 行且无缓存；图片无懒加载** | `QuestionnaireRunner.vue:424-434` 一次性 `v-for` 渲染全部题目与选项；`BxAddressPicker.vue:45` `AREA_PAGE_SIZE = 5000`、`:98` 每个实例各发一次整表请求，`api/config/area.ts:21-34` 无缓存；全仓无 `lazy-load` | 几十题时低端机滚动卡顿；2 个地址题就发两次 5000 行查询，弱网下明显变慢；结果页多图同时下载 | 地址表加模块级缓存或按 `parent_no` 分级；长问卷分节渲染或非首屏题懒挂载；`<image>` 补 `lazy-load` |
| P1-29 | **票据过期（0011）没有给用户任何可行动出口** | `request/index.ts:135-142` 清票据并回调 `sessionExpiredHandler`，但 `App.vue:6-11` 的**回调体为空**（注释「登录回跳在接入登录链路后补上」） | 作答到一半掉线 → 提交失败却不知道要重新登录、也找不到入口；`couple`/`history` 静默降级显示「暂无记录」（docs/验收清单.md:1824-1835），用户以为数据丢了 | 回调里给全站可见提示 + 「重新登录」入口；`user_no` 类查询 0 行时区分「票据降级」与「确实没有记录」 |
| P1-30 | **手动「暂存草稿」提示成「草稿已自动保存」** | `QuestionnaireRunner.vue:262-273` → `useDraft.ts:155,168` 置 `savedTip = '草稿已自动保存'` → `:272` toast 出去 | 用户主动点的按钮却提示「自动保存」，会怀疑没点上 | 手动保存文案改「草稿已保存」 |

---

## 五、P2：一致性与打磨

### 5.1 设计令牌体系缺口（影响后续所有视觉收敛）

`styles/tokens.scss` 全文只有 16 个颜色 + 2 个圆角 + 1 个阴影 + 内容宽度，**没有字号阶梯、没有间距节奏、没有控件高度、没有动效时长、没有焦点环令牌**。后果直接体现在数值上：

- `font-size` 出现 **10 / 12 / 13 / 14 / 15 / 16 / 18 / 20 / 22 / 26 / 40px 共 11 级**，13px 与 14px 大量混用（`EditorItemRow.vue:179` 题号 13px vs `:197` 标题 14px）；
- 间距 `18px 16px`、`14px 16px`、`13px 16px`、`12px`、`10px`、`8px` 混排；
- `44px` 这个关键尺寸在 7 个组件里各写一遍（`BxButton.vue:80`、`BxNavBar.vue:82`、`BxOptionList.vue:99`、`BxTextField.vue:75`、`BxDatePicker.vue:140`、`BxAddressPicker.vue:262`、`BxRefSelector.vue:210`）；
- 存在 **10px 字号**（`EditorItemPanel.vue:394-397`、`EditorActivityForm.vue:524-528,584-588`），低于移动端可读下限，而它正是「这里可以点开」的唯一视觉线索。

**建议**：在 `tokens.scss` 增补 `--bx-font-xs/sm/md/lg/xl`、`--bx-space-1..6`、`--bx-control-height: 44px`、`--bx-radius-sm/pill`、`--bx-duration-fast/base`、`--bx-ease-out`、`--bx-focus-ring`。

### 5.2 双轨样式实际是「三份令牌 + 零 UnoCSS 使用」

- 颜色定义三遍：`tokens.scss:11-28`（CSS 变量）、`uni.scss:9-71`（`$uni-*` 与 `$bx-*`）、`uno.config.ts:23-40`（theme）；
- 实测 `$uni-*` / `$bx-*` 在 `.vue` 中 **0 引用**；UnoCSS 的 5 个 shortcuts 与 `presetIcons` **0 引用**；`main.ts:5` 的 `import 'uno.css'` 是唯一命中；
- 漂移已发生：`uni.scss:19` 的 `$uni-text-color-disable: #c0c0c0` 在 CSS 令牌里没有对应项。

**建议**：只保留 CSS 变量为唯一真源，删除未使用的 shortcuts 与重复色板；或在 CI 加断言：`uni.scss` / `uno.config.ts` 中出现的 hex 必须存在于 `tokens.scss`（与 `test/style-units.spec.ts` 同思路）。

### 5.3 其它一致性项

| # | 问题 | 位置 | 建议 |
| --- | --- | --- | --- |
| P2-1 | 全站几乎无动效：`transition/animation/@keyframes` 仅 1 处（`BxProgressBar.vue:32`），且**零 `prefers-reduced-motion`**；引用面板 `v-if` 硬切换无过渡（`BxRefSelector.vue:156-195`） | 弹层「啪」地出现消失，用户误以为跳页 | 遮罩/面板加 160–200ms 过渡；`global.scss` 加 `@media (prefers-reduced-motion: reduce)` 全局兜底 |
| P2-2 | 按下反馈两套写法：`hover-class` 仅 3 处，其余 11 处用 CSS `:active` | 小程序不支持 `:active` ⇒ **小程序端所有按钮没有按下反馈**，用户重复点击 | 全量改用 `hover-class` + `hover-stay-time="60"`（与 `BxButton.vue:65-66` 一致） |
| P2-3 | 焦点环 3 种 offset 写法（`2px` / `-2px` / `1px`），且 `BxRefSelector`、`BxDatePicker`、`BxAddressPicker`、`BxImageField`、`EditorItemRow`、`EditorListCard`、`EditorTypePicker`、`EditorSegmented` **一处 `:focus-visible` 都没有** | 键盘用户在不同控件上看到的焦点环不一致，部分控件 Tab 过去无任何指示 | 抽 `--bx-focus-ring` 与统一规则 |
| P2-4 | `BxButton` 缺 `danger` 类型，导致 4 处删除按钮各写一份红色样式（`EditorItemRow.vue:234-236`、`EditorListCard.vue:196-198`、`editor/list/index.vue:417`、`design/index.vue:578`） | 同语义按钮外观不一致 | 新增 `type: 'danger'` |
| P2-5 | `BxButton` 的 loading 用文本 `···`（`BxButton.vue:70`） | 读屏会念出「···提交问卷」；按钮宽度随状态跳动；loading 复用 disabled 的 `opacity: .45` 与 `tabindex="-1"`，用户不确定是「在提交」还是「被禁用」 | 改为固定尺寸旋转指示 + `aria-hidden`，loading 不改透明度 |
| P2-6 | `BxNavBar` 标题居中依赖左右各 `min-width: 60px`（`:91-95`），右侧塞两个按钮（放弃+保存）时标题明显偏左；`fallbackUrl` 为空时返回键**静默无效**（`:31-34`，`couple.vue:119` 就没传）；`:82-83` 用 `height: 44px` + `padding-top: var(--status-bar-height)`，在 `box-sizing: border-box !important`（`global.scss:23-34`）下会吃掉内容高度 | 标题偏左误导层级；从分享链接进入时返回键是死的，用户以为卡死 | 标题绝对定位居中；补 `title`/`left` 插槽；`fallbackUrl` 缺省时渲染为 `aria-disabled`；高度改 `calc(44px + var(--status-bar-height, 0px))` |
| P2-7 | `BxProgressBar` 无 `role="progressbar"` / `aria-valuenow`（`BxProgressBar.vue:16-20`），默认 3px 极细，滚走即不可见 | 读屏完全感知不到进度；作答时缺少「还剩多少」的反馈 | 补 ARIA；高度 4–6px + 圆角；考虑改为 sticky 并显示「第 x/N 题」 |
| P2-8 | 校验错误对读屏不可见：`BxQuestionItem.vue:103-108` 无 `role="alert"`，控件无 `aria-invalid`/`aria-describedby`（`:24` 生成的 `id` 无人引用） | 读屏用户不知道哪题错了 | 补 `role="alert"` 与 `aria-describedby` 关联 |
| P2-9 | 空态图标用文本字符 `∅`（`BxEmpty.vue:15-17`），各端字体回退不同 | 小程序上可能渲染成方框或字形差异明显 | 换内联 SVG 或图标字体；装饰元素加 `aria-hidden` |
| P2-10 | 响应式断点三套（600 / 760 / 900px），`--bx-content-width: 860px` 与设计器的 900px 分栏不联动 | 760–900px 区间（平板横屏、窄桌面窗口）作答页已居中定宽而编辑器还是移动浮层，像两个产品 | 定义断点令牌并把编辑器分栏对齐到 760px |
| P2-11 | 深色模式完全不存在（`prefers-color-scheme` 零命中），而 `tokens.scss:4` 注释承诺「便于运行时覆盖与宿主门户注入主题」——`src` 下没有任何 `addEventListener` 接收宿主消息的通道 | 系统深色模式下纯白卡片刺眼；被 iframe 嵌入时父页面跨域无法写入子文档样式，**注释承诺目前无法兑现** | 要么落地（深色覆盖块 + `bx:theme` postMessage 协议），要么修正注释为「预留」，并补 `index.html` 的 `theme-color` |
| P2-12 | 长文本溢出处理缺失：`BxRefSelector.vue:221-225`（多选值 `、` 拼接无截断）、`BxAddressPicker.vue:273-277`（` / ` 拼接）、`BxRefSelector.vue:315-319`（选项 label 无 `word-break`）、`couple.vue:228-233`（`flex: 1` 无 `min-width: 0`） | 选多项/四级地址会把右侧箭头挤出可视区或撑高控件 | 补 `min-width: 0` + 省略/换行（`EditorItemRow.vue:195-201` 是正确范式） |
| P2-13 | 列表页「加载中」与空态不互斥（`editor/list/index.vue:237-254`） | 加载瞬间可能同时显示「没有找到问卷」与「加载中…」 | 空态加 `&& !loading`（`:238` 已有部分条件，需补全） |
| P2-14 | 列表页「删除」与「作答」按钮并排且间距小（`EditorListCard.vue:71-102`，44×30） | 移动端误触删除（虽有二次确认兜底） | 提高间距；危险操作视觉降级或收入更多菜单 |
| P2-15 | 记录列表 `:key` 用可能重复的批次号（`RecordList.vue:212`）；图片列表 `:key="index"`（`BxImageField.vue:303`） | 列表复用错乱、删除中间一张后 DOM 短暂错位 | 用 `fileNo` / `fill_batch_no + start_time` 组合键 |
| P2-16 | 封面图上传后**没有删除/替换入口**（`EditorActivityForm.vue:273-281`），而封面是必填（`validation.ts:93`） | 传错图只能重传覆盖 | 补「替换」「移除」 |
| P2-17 | 记录页/结果页缺底部安全区（`RecordHistory.vue:64-67` 仅 24px、`result.vue:511-514` 仅 32px），只有 `QuestionnaireRunner.vue:562` 与 `BxRefSelector.vue:258` 处理了 `env(safe-area-inset-bottom)` | iPhone 全面屏最后一屏贴着 Home 指示条 | 页面级容器统一补安全区 padding |
| P2-18 | 12px 字号承载关键信息（结果页「答对/答错/未答」标签 `result.vue:601-605`、进度 `QuestionnaireRunner.vue:527-531`） | 小屏可读性差 | 统计类提到 13px |
| P2-19 | 作答页底部 sticky 操作栏（约 66px）滚动中途持续遮挡视口底部内容（`QuestionnaireRunner.vue:558-565`），而 `.runner__body` 底部内边距只有 16px（`:482-486`） | 长问卷下用户填到某题时该题可能正好被遮住 | body 补 `padding-bottom` ≥ 操作栏高度；或滚动时收起操作栏 |

---

## 六、做得好的地方（优化时不要顺手改掉）

1. **设计令牌用 CSS 自定义属性**（`tokens.scss:1-6`），`page, :root` 双选择器已考虑小程序根节点——方向正确，是运行时换肤的必要前提。
2. **`box-sizing: border-box !important` 同时覆盖标签名与 `uni-*` 元素名**（`global.scss:21-34`），注释写明了「通配重置优先级可能被 uni-app 内置规则盖掉」的实测结论。
3. **`:focus-visible` 选择器落到 `.uni-input-input`**（`BxTextField.vue:94-113`、`editor/list/index.vue:338-352`、`submitInfo.vue:226-237`），并记录了「`input:focus-visible` 永不触发」的原因。这类注释应保留并推广。
4. **键盘激活的既有实现**（`BxButton.vue:31-50`、`BxOptionList.vue:40-55`、`BxNavBar.vue:37-49`）：`role`、`tabindex`、`aria-disabled`、`aria-busy`、Space 的 `preventDefault` 都处理了。
5. **`BxNavBar.fallbackUrl` 必须由调用方显式给出**（`:7-15`、`:31-34`）：注释记录了「曾写死封面页却因缺 `activity_no` 把用户送进错误页」，宁可不跳也不猜。
6. **`hover-class` + `hover-stay-time="60"`**（`BxButton.vue:65-66` 等 3 处）是跨端按下反馈的正确写法，只是覆盖面不够（P2-2）。
7. **编辑器固定行高 + `border-bottom` 而非 `margin`**（`EditorItemRow.vue:132-142`、`EditorOptionEditor.vue:232-244`），并用 `test/components/editor-layout.spec.ts` 守护样式与常量一致——把「指针 Y → 落点下标」变成纯算术，彻底去掉查 DOM 的静默失败路径。
8. **`moveInArray` 越界返回同一引用**（`reorder.ts:13-33`）：调用方可用 `result === list` 判断无变化。P1-11 的修复正好可以复用这个已有约定。
9. **失败态与空态严格区分**（`BxAddressPicker.vue:101-106`、`BxRefSelector.vue:167-174`、`BxImageField.vue:118-122`），注释反复强调「权限/网络错误不能被『暂无可选项』掩盖」。
10. **危险操作二次确认且说清后果**（`design/index.vue:165-183` 区分「已保存会被真删」与「未保存仅本地移除」；`editor/list/index.vue:133-135`；`QuestionnaireRunner.vue:290`）。
11. **图片题「引用移除」而非真删**（`BxImageField.vue:262-286`），避免破坏草稿/历史引用。
12. **只读提示区分「活动已结束」与「查看历史作答」**（`QuestionnaireRunner.vue:77-83`）。
13. **校验失败给「计数 + 定位第一处 + 逐题红框/左红条」三层反馈**（`QuestionnaireRunner.vue:276-288`、`BxQuestionItem.vue:65-68,103-108`）——优于常见的「只弹一句 toast」，P1 的改进应在其之上追加。
14. **自动保存的可见状态与可行动文案**（`useDraft.ts:64,84,89` 渲染在 `QuestionnaireRunner.vue:439`），其中「草稿保存失败，提交时仍会一并上传」同时安抚并说明了数据不会丢。
15. **提交前 `await waitIdle()` 防批次割裂**（`QuestionnaireRunner.vue:297`、`useDraft.ts:130-137`）+ 双层防重复提交（`BxButton.vue:22-29` 与 `useSubmit.ts:45-47`）。
16. **跨端 `px` 约束由测试固化**（`test/style-units.spec.ts`），并用 `--bx-content-width` + 居中覆盖四种形态，而不是靠 UA 判断。
17. **服务端分页 + 删除后重拉当前页**（`useEditorList.ts:75-101,136-140`），注释说明了「本地摘行会让总数与实际不符」。
18. **读取走三张原始表而非 `init_view_select`**（`useEditorDocument.ts:3-14`），避免 `show_cfg` 过滤导致「看不见的题被当真删」。

---

## 七、建议的修复顺序

按「投入产出比 × 风险」排序，前 7 项建议本轮完成：

| 序 | 事项 | 对应条目 | 理由 |
| --- | --- | --- | --- |
| 1 | **修掉守门脚本的端口错位，并让不可达时直接报错** | 2.1 | 不修则后续所有「验证通过」都不可信；改动量极小 |
| 2 | **只改令牌值修正对比度 + 补页面级元数据** | P1-18 / 3.8 | 两处都只改几行：6 个色值 + `index.html` 的 viewport/lang/title，收益覆盖全站 |
| 3 | **H5 确认弹窗改为键盘可用** | 3.7 | 键盘用户当前**完全无法提交问卷**；删除/放弃等危险操作确认同源，一并修 |
| 4 | **管理侧错误态收口**：隐藏保存、标题不再误报「新建」、补重试 | 3.1 / 3.2 | 消除「满屏报错」「死路」「可能误建问卷」三个问题，集中在 `design/index.vue` 与 `useEditorDocument.ts` |
| 5 | **错误文案分档 + 剥离服务名 + 票据过期出口** | 3.4 / P1-29 | 请求层一处改动，改善所有失败场景的可理解性 |
| 6 | **解开「答不了的必填题」死锁** | 3.3 | 唯一会让用户彻底放弃的缺陷 |
| 7 | **补齐键盘激活覆盖 + 禁用态语义** | 3.5 / P1-6 / P1-11 | 抽 `useActivatable()` 后批量接线，顺带修掉「点无效按钮被标脏」 |
| 8 | 只读模式草稿守卫 + 图片删除按 `fileNo` 定位 | P1-7 / P1-10 | 数据正确性风险 |
| 9 | 移动端设计器浮层内可保存 + 保存后恢复选中题 | 3.6 | 手机是设计器的主要形态之一 |
| 10 | 四处失败态补「重新加载」+ 地址题错误态 | P1-1 / P1-2 | 消除「弱网即卡死」 |
| 11 | 顶部安全区与小程序胶囊避让 | P1-26 | 决定小程序真机上「保存 / 新建 / 记录」是否点得到 |
| 12 | 长问卷定位能力 + 地址表缓存 / 图片懒加载 | P1-13 / P1-28 | 纯展示层与请求层增强，数据（`field.index`、`progress`、`section`）已就绪 |
| 13 | 补齐设计令牌（字号 / 间距 / 控件高度 / 动效 / 焦点环） | 5.1 | 后续所有视觉收敛的前提 |
| 14 | 真机验证清单执行一次 | 2.4 | 发布门槛 |

---

## 附录：本轮实证方法与可复现命令

```powershell
# 1) 启动 dev server（注意端口 5173）
pnpm dev h5

# 2) 可访问性审计——必须显式传 5173，否则会跑在 Chrome 错误页上「假绿」
node scripts/a11y.mjs http://localhost:5173

# 3) 多视口页面冒烟（14 页 × 4 视口）
node scripts/smoke.mjs http://localhost:5173

# 4) 关键页面真实截图（输出到临时目录，不污染仓库）
node scripts/screenshot.mjs "/pages/questionnaire/index/index?activity_no=<活动号>&formType=form&status=进行中" --out $env:TEMP\bx-ux-audit --name 作答页
node scripts/screenshot.mjs "/pages/editor/list/index" --out $env:TEMP\bx-ux-audit --name 问卷列表
node scripts/screenshot.mjs "/pages/editor/design/index?activity_no=<活动号>" --out $env:TEMP\bx-ux-audit --name 设计器
node scripts/screenshot.mjs "/pages/questionnaire/index/result?activity_no=<活动号>" --out $env:TEMP\bx-ux-audit --name 结果页
```

**环境说明**：本机浏览器没有平台会话/票据，因此管理侧接口返回「无权限访问」、结果页显示「暂无法获取」、我的测评页显示「未获取到登录信息」。这些是**环境限制**（docs/验收清单.md 第 161-170 行有完整记录），但它们在界面上暴露出的**表现方式**（服务名上屏、无重试、文案不可行动）属于代码问题，已在 3.1 / 3.4 / P1-1 / P1-15 中单列。
