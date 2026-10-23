# 问卷与健康测评（bx-questionnaire）

园区问卷 / 健康测评的前端工程，迁移自旧工程 `questionnaire/`。后端接口**保持不变**，逻辑与 UI/UX 重新实现。

## 技术栈

| 项 | 选择 |
| --- | --- |
| 框架 | uni-app（Vue 3 + TypeScript + Vite） |
| 状态 | Pinia |
| 样式 | UnoCSS + 原生 SCSS（设计令牌驱动） |
| 脚手架 | `@uni-helper/unh`（create-uni `custom` 模板） |
| 测试 | Vitest（783 项自洽用例 + 7 项真实网关集成，后者单独跑） |
| 校验 | vue-tsc + ESLint |

`pages.json` 与 `manifest.json` 是**构建产物**，由根目录的 `pages.config.ts` / `manifest.config.ts` 生成；
页面路由由 `@uni-helper/vite-plugin-uni-pages` 扫描 `src/pages/**` 自动生成，**不要手改产物**。

## 目录结构

```
├── src/
│   ├── api/                 # 按应用分组的接口封装（daq / file / config / sso 登录）
│   ├── components/          # base（基础组件）/ form（题型）/ questionnaire（业务）/ auth（登录界面）
│   ├── composables/         # useQuestionnaire / useDraft / useSubmit / useLogin 等
│   ├── domain/questionnaire # 纯逻辑：题型映射、序列化、校验、计分
│   ├── pages/questionnaire/ # 10 个作答侧页面
│   ├── pages/editor/        # 3 个管理侧页面（问卷列表＝**启动页** / 可视化设计器 / 问卷统计）
│   ├── pages/login/         # 1 个登录页（会话过期后 reLaunch 到这里）
│   ├── stores/              # session 等
│   └── utils/               # request（请求层）/ crypto（RSA）/ storage / query（页面参数解析）
├── scripts/                 # 探测与联调脚本 + mutation.mjs（变异测试）+ smoke.mjs（页面冒烟）+ e2e.mjs（端到端交互）+ editor-e2e.mjs（设计器界面级保存链路）+ perf.mjs（首屏性能基线）+ a11y.mjs（可访问性审计）+ scan-dist.mjs（产物安全扫描）+ check-mp.mjs（小程序产物校验）+ check-conditional.mjs（条件编译剥离验证）+ find-dead-exports.mjs（死代码扫描）+ a11y.mjs（可访问性审计）+ check-overflow.mjs（验证冒烟溢出检测有效），均不参与打包
├── test/                    # 单元测试 + 集成测试（含 env-config.spec.ts：环境变量配置回归防护、directives/aria-label.spec.ts：可访问性指令）
├── pages.config.ts          # 路由配置源
├── manifest.config.ts       # 应用配置源
└── vite.config.ts           # 含 H5 子路径 base
```

## 功能一览

- **作答端**：封面（分享 / 答题记录 / 字号主题）、全部与逐个两种展示方式、9 种题型、逐题自动保存、提交、结果页（分数 / 逐题回顾 / 分享结果 / 海报）、记录与历史。
- **管理端**：问卷列表（搜索 / 状态筛选 / 统计入口）、可视化设计器（三栏、拖拽排序、内嵌手机实时预览）、**问卷统计**（回收与完成率、提交趋势、成绩分布、逐题分布、答卷明细、CSV 导出）。
- **体验**：H5 深色主题与字号放大（跟随系统 / 手动切换，偏好持久化；小程序端跟随系统）、全局网络状态提示、长列表分片渲染、图片懒加载。
- **跨端**：H5 / 微信公众号 / 微信小程序（管理端页面共用同一份模板与逻辑）。

## 开发

```bash
pnpm install
pnpm dev h5          # H5 开发服务（默认 http://localhost:5173/）
pnpm dev mp-weixin   # 微信小程序，产物在 dist/dev/mp-weixin
```

常用校验：

```bash
pnpm test            # 783 项自洽用例（不依赖网络与票据，可直接进 CI）
pnpm test:integration # 7 项真实网关集成（只读，需有效联调票据；过期会直接提示换票命令）
pnpm type-check      # vue-tsc
pnpm lint            # eslint（lint:fix 自动修复）
pnpm mutation        # 变异测试：验证单测是否真的在守着逻辑（当前 210 变异 / 存活 0）
pnpm perf            # 首屏性能基线（需先在 --mode test 下构建并起产物服务）
pnpm smoke           # 页面冒烟：CDP 真实浏览器遍历全部页面 × PC/移动竖屏/移动横屏/公众号H5（需先 pnpm dev h5）
pnpm a11y            # 可访问性审计：可读名称 / 图片 alt / 真实 Tab 键焦点可见性（需先 pnpm dev h5）
pnpm e2e             # 端到端交互：真实作答 → 逐题自动保存 → 提交（默认不提交，加 --submit）
pnpm embed           # iframe 嵌入通信：跨域父页面真嵌一次，断言 FORM_READY/RESIZE/ADD_SUCCESS 到达（默认不提交，加 --submit）
pnpm editor:e2e      # 可视化设计器界面级保存链路：改标题 → 点保存 → 服务端查回来确认（会真写服务端，跑完还原）
pnpm login:e2e       # 登录链路端到端：真实账号登录 → 校验票据写入与回跳（凭据走环境变量，需先 pnpm dev h5）
pnpm build h5        # 产物 dist/build/h5
pnpm build mp-weixin # 产物 dist/build/mp-weixin
```

### 持续集成

`.github/workflows/ci.yml` 在 push / PR 时依次执行：`build h5` → `type-check` → `lint` → `test`。

- **必须先构建**：`pages.json`、`manifest.json`、`auto-imports.d.ts`、`components.d.ts` 都是构建期生成物且被 gitignore，干净检出时并不存在，而 `tsconfig` 依赖 `auto-imports.d.ts` 提供自动导入（`ref` / `computed` / `uni.*` / `defineStore`）的类型 —— 不先构建，`vue-tsc` 会报满屏 `Cannot find name`。
- **真实网关集成测试刻意不进 CI**：`pnpm test:integration` 需要内网网关可达与有效票据，属人工联调动作。默认 `pnpm test` 的 783 项不依赖网络与票据。
- CI 只跑**不需要浏览器**的部分。`smoke` / `e2e` / `a11y` / `perf` 等 CDP 脚本依赖本机 Chrome 与 dev server，仍在本地执行。

### CDP 脚本的目标地址

`smoke` / `e2e` / `a11y` / `embed` / `special-e2e` / `check-overflow` / `screenshot` / `editor:e2e` / `login:e2e`
九个连 dev server 的脚本共用 `scripts/lib/base-url.mjs` 解析目标地址，优先级：

1. 命令行里的完整地址：`node scripts/smoke.mjs http://localhost:5173`
2. 环境变量 `BX_BASE`
3. 默认 `http://localhost:5173`（**与 `pnpm dev h5` 一致**）

两点值得说明：

- 此前六个脚本各自写死 `5174`，与 dev server 默认的 `5173` 不一致 —— 默认执行时连不上，
  最坏的情况是**在浏览器错误页上「通过」**。统一到 5173 后，默认执行才有意义。
- 脚本启动时先探测地址可达性，**不可达直接退出并给出启动命令**，不再让浏览器去渲染错误页。
  （`perf` 连的是 `pnpm serve:dist` 的产物服务，默认 `4180`，属另一条链路，未并入。）

### CDP 脚本的 Chrome 路径

十个脚本共用 `scripts/lib/chrome.mjs` 定位浏览器，按 Windows / macOS / Linux 的常见路径依次探测（Windows 上含 Edge 兜底）。
装在非默认位置时用环境变量显式指定，找不到时会直接给出设置示例而不是 `spawn ENOENT`：

```bash
# PowerShell
$env:BX_CHROME_PATH = "D:\Chrome\chrome.exe"
# bash
export BX_CHROME_PATH=/opt/google/chrome/chrome
```

## 环境变量

见 `.env.example`。分层：

| 文件 | 用途 |
| --- | --- |
| `.env` | 各环境共用的应用标识（`VITE_BX_APP` / `VITE_BX_APP_NO` / 微信 appid / 超时） |
| `.env.development` | 开发网关 `http://192.168.0.214/bxapi`，`VITE_H5_BASE=/` |
| `.env.production` | 生产网关 `https://www.gxqcxkj.com/bxapi`（**仅兜底**，运行时优先读 `/js/server.js`），`VITE_H5_BASE=/quest/` |
| `.env.test` | 测试网关（运行时已无兜底默认值，测试必须显式提供） |
| `.env.local` | **仅本地**联调票据，已在 `.gitignore` 中，**绝不提交** |

**网关没有内置默认值**：`VITE_BX_GATEWAY` 缺失时 `resolveGateway()` 直接抛错。
这是刻意的 —— 避免生产环境静默请求内网开发网关。

### 联调票据

票据有效期约 1.5 小时（滑动续期），过期表现为 `resultCode=0011` + `请求服务[<service>]需要登录访问`。
登录接口有频次限制（连续失败锁号 1 小时），所以**只换票、不做自动重登**：

```bash
BX_USER=<账号> BX_PWD=<密码> node scripts/bx-login.mjs --write
```

脚本会取 RSA 公钥、调 `srvuser_login`，并把票据写入 `.env.local`。

**票据失效（`0011`）时的标准动作就是换票，不是重登**：

```bash
BX_USER=<账号> BX_PWD=<密码> node scripts/bx-login.mjs --write   # 重新登录并写回 .env.local
```

- 凭据只从环境变量读，**绝不写入仓库**（`.env.local` 已在 `.gitignore` 中）；
- 登录接口有频次限制，连续失败会锁号 1 小时，所以**只试一次**，失败就停下报告；
- 前端**不做自动重登**：收到 `0011` 只清登录态并跳登录页（见下节）。

## 部署

### H5（公众号 / 浏览器）

生产部署在站点根目录下的 **`/quest/`**，与网关 `/bxapi/`、运行时配置 `/js/` **同域**（这一点很重要，见下）。

```bash
pnpm build h5   # 产物 dist/build/h5，资源路径自带 /quest/ 前缀
```

部署后的目录结构（`js/` 与 vpages、dataview 等 H5 子站同级，由平台统一维护）：

```text
<站点根>/
├── js/
│   └── server.js        # 运行时配置：把接口前缀写到 window.top.pathConfig
├── vpages/              # 其它 H5
├── dataview/            # 其它 H5
└── quest/               # 本工程（hash 路由）
    ├── index.html
    └── assets/...
```

Nginx 参考：

```nginx
# 问卷 H5
location /quest/ {
    alias /srv/bx-questionnaire/dist/build/h5/;
    try_files $uri $uri/ /quest/index.html;
}

# 网关反向代理，与前端同域（避免跨域，并与生产形态一致）
location /bxapi/ {
    proxy_pass http://<内网网关>/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

资源前缀由 `vite.config.ts` 的 `base` 读取 `VITE_H5_BASE` 注入。
**若部署路径变化，必须同步修改 `.env.production` 的 `VITE_H5_BASE`**，否则资源 404、整站白屏。

#### 接口前缀优先取服务器上的 `js/server.js`

构建产物会在 `</head>` 前插入 `<script src="/js/server.js"></script>`（地址可用 `VITE_SERVER_CONFIG_URL` 覆盖）。
该脚本是平台统一的运行时配置，把接口前缀写到 `window.top.pathConfig.gateway`。运行时的解析优先级：

1. `window.top.pathConfig.gateway` —— 被老门户 iframe 嵌入时，顶层窗口已由门户注入；
2. `window.pathConfig.gateway` —— 独立打开（公众号 H5 / 小程序 web-view）时，server.js 挂在当前窗口；
3. `sessionStorage.pathConfig` —— 跨域 iframe 读不到 top 时的同源副本兜底；
4. 构建期 `VITE_BX_GATEWAY` —— 最后兜底。

所以**换环境 / IP 时只需要改服务器上的 `js/server.js`，不需要重新构建前端**；
本地 dev 没有 `js/server.js`，自动回退到 `.env.development` 的 `VITE_BX_GATEWAY`（构建期才注入 script，dev 不会产生 404）。

路由使用 **hash 模式**，因此不需要服务端 rewrite 支持（`try_files` 只是保险）。

### 微信小程序

```bash
pnpm build mp-weixin   # 产物 dist/build/mp-weixin，用微信开发者工具导入
```

`manifest.config.ts` 里 `mp-weixin.appid` 沿用旧工程，后端 `app_no` 不变。

## 多端适配

同一套代码覆盖四种形态：

- 浏览器 PC / 移动端
- 微信小程序（竖屏）
- 微信小程序 PC 横屏窗口
- 公众号 H5

布局策略：`.bx-container` 固定最大宽度 `--bx-content-width`（720px）居中，窄屏自动铺满，
左右内边距 16px（≥760px 时 24px）；管理侧（问卷列表 / 设计器）用更宽的
`--bx-content-width-wide`（1180px），由 `.bx-container--wide` 切换。

设计语言见 `docs/UI-UX-V6-设计系统.md`（清简 · V6.1）：色彩 / 排版 / 形状 / 动效的
唯一规范，`src/styles/tokens.scss` 是令牌的唯一真源。V6 已于 2026-10-22 落到本仓库
（令牌、基础组件、表单控件、作答侧页面、管理端与登录全部按 V6 重做）；设计与交互原型见
`design/prototype-v6/`，改造前的 V2 规范保留在 `docs/UI-UX-V2-设计系统.md` 作为历史对照。

视觉令牌：

| 组 | 说明 |
| --- | --- |
| 中性 | `--bx-bg` / `--bx-surface` / `--bx-surface-2` + 四级文字 + 三级描边 |
| 品牌 | `--bx-blue*`（靛蓝 `#3B4EDB`），`--bx-primary*` 是它的别名，主题只覆盖前者 |
| 语义 | danger / success / warn / health，各带「文字 + 浅底 + 描边」三件套 |
| 动效 | 三档状态时长 120/180/260 + 一档进场 420（`--bx-duration-*` / `--bx-ease-*`） |

动效的**统一降级**写在 `src/styles/global.scss`（`prefers-reduced-motion: reduce`
时全部动效降为瞬时）；组件内不要重复写降级块。

## 登录

登录页（`/pages/login/index`）是整屏登录界面：V6 改为现代单列布局（品牌字 + 账号 /
密码明文切换 + 记住我 + 错误抖动 + 回车即提交），H5 宽屏（≥900px）左右分栏、小程序端
保持单列。会话过期时由请求层统一 `reLaunch` 到这里，并带上回跳地址。

契约与 `scripts/bx-login.mjs` 同源（已实测）：

| 步骤 | 请求 |
| --- | --- |
| 取公钥 | `POST {gateway}/sso/select/srvsso_user_pwd_sign_select` → `data.public_key` |
| 登录 | `POST {gateway}/sso/operate/srvuser_login`，body `[{ serviceName, data: [{ user_no, pwd: RSA(pwd), enc: 'RSA', terminal_type: 'PC' }] }]` |
| 取票据 | `response[0].response.bx_auth_ticket`，用户信息在同层的 `login_user_info` |

几处刻意的取舍：

- **RSA 自己实现**（`src/utils/crypto/rsa.ts`，PKCS#1 v1.5 + BigInt）：`jsencrypt` 依赖
  `window`，小程序端跑不起来。实现刻意**不写 BigInt 字面量** —— `vite.config.ts` 的
  `build.target` 是 `es6`，esbuild 遇到字面量会直接终止构建。正确性由单测保证：
  用 `node:crypto` 的私钥把前端密文解回来（不是断言「输出是个 base64」）。
- **不做自动重登**：登录接口连续失败会**锁号 1 小时**，所以只在收到 `0011` 时跳登录页，
  绝不静默重试；`useLogin` 另有结构性防重（提交中直接拒绝第二次调用，不只靠按钮 disabled）。
- **会话过期只清登录态，不动批次号**：用户可能正在答题，清掉 `fill_batch_no`
  会让已经答了一半的内容变成一条新记录。
- **回跳地址做白名单校验**：`redirect` 来自 URL，只接受本应用内的相对路径，
  挡掉 `//evil.com` 这类开放重定向。

### 端到端验证

```bash
BX_USER=<账号> BX_PWD=<密码> pnpm login:e2e   # 需先 pnpm dev h5
```

真实浏览器打开登录页 → 输入账号密码 → 点登录，然后校验**票据是否写入本地存储**
与**回跳地址是否生效**。凭据只从环境变量读、脚本只打印票据长度不打印内容；
失败时打印页面上的错误原文，且**不做任何重试** —— 登录接口连续失败会锁号 1 小时。

## 接口约定

- 网关形态：`{gateway}/{app}/{action}/{service}`，`select` 类需在 URL 追加 `?{serviceName}`
- 响应信封：`{ state, resultCode, resultMessage, data, page, response }`
- 写入（`operate`）请求体是**顶层数组**：`[{ serviceName, data: [...] }]`
- 鉴权头同时带 `bx_auth_ticket` 与 `bx-auth-ticket`

已知的接口行为差异（实测）。完整记录见 `bx-health` 仓库的 `docs/questionnaire-migration/方案文档.md` §10–§11，以及本工程 `docs/验收清单.md` 的「平台行为实测」一节：

- `srvdaq_record_reply_merge_select` **没有 `activity_no` / `item_no` 列**，题目维度用 `item_seq`，作答值在 `svalue`
- `srvdaq_record_reply_select` **不接受 `order`**：传任何排序字段（asc / desc 皆然）都会静默返回 0 条，而不是报错
- `srvdaq_record_reply_select` **必须带 `condition`**，空数组会直接 FAILURE
- 服务按**票据**鉴权，但**按用户维度查询**（`condition` 带 `user_no`）时，
  平台还要求**调用者的会话身份**，无会话时**静默返回空结果**（`state=SUCCESS`、`data` 为空），
  **不报错** —— 同一条件在 Node 直连返回 11 条、浏览器（无平台会话）返回 0 条。
  各服务的差异来自自身的**权限与业务校验**，不是「跨域」：
  - `srvdaq_record_reply_select`：只按 `activity_no` 查时无需登录，成功；
    带 `user_no` 过滤时需会话身份，否则静默返回空
  - `srvdaq_init_view_select`（无 `type`）：成功；带 `type=use` 时报
    「非活动创建人」——这是**业务校验**（调用者须为活动创建人），不是鉴权失败
  - `srvdaq_record_reply_merge_select`：需要登录态，请求层已自动带票据
  - `srvdaq_item_cfg_select`：报「无权限访问」，是票据身份**缺少该服务的权限**

  > 排查提示一：手写 `uni.request` 探测时**必须自己带票据头**（业务请求层会自动加）。
  > 漏带会得到 `0011 需要登录访问`，极易误判成「服务需要会话」。
  >
  > 排查提示二：本机用 `localhost` 访问时，该域下**没有**网关域的会话 cookie，
  > 因此无法模拟真实用户的登录态 —— `couple`（我的测评）与 `history` 在带
  > `user_no` 过滤时会显示空列表，属环境限制，不是缺陷。做结论前请**同条件多路径对照**
  > （不同调用方式、Node 与浏览器）。

## 相关文档

- `docs/UI-UX-V6-设计系统.md` —— V6「清简」设计系统、令牌、组件与落地记录
- `docs/问卷统计分析-设计.md` —— 统计页信息架构、取数口径与覆盖范围
- `docs/技术优化建议.md` —— 产品 / 工程 / 依赖 / 测试的优化清单与路线图
- `design/prototype-v6/index.html` —— V6 可交互原型

迁移方案与决策记录见 `bx-health` 仓库的 `docs/questionnaire-migration/`：

- `方案文档.md` —— 方案、真实契约基线、决策记录
- `prototype.html` —— 可交互原型
