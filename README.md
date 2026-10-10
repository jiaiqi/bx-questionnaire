# 问卷与健康测评（bx-questionnaire）

园区问卷 / 健康测评的前端工程，迁移自旧工程 `questionnaire/`。后端接口**保持不变**，逻辑与 UI/UX 重新实现。

## 技术栈

| 项 | 选择 |
| --- | --- |
| 框架 | uni-app（Vue 3 + TypeScript + Vite） |
| 状态 | Pinia |
| 样式 | UnoCSS + 原生 SCSS（设计令牌驱动） |
| 脚手架 | `@uni-helper/unh`（create-uni `custom` 模板） |
| 测试 | Vitest（259 项） |
| 校验 | vue-tsc + ESLint |

`pages.json` 与 `manifest.json` 是**构建产物**，由根目录的 `pages.config.ts` / `manifest.config.ts` 生成；
页面路由由 `@uni-helper/vite-plugin-uni-pages` 扫描 `src/pages/**` 自动生成，**不要手改产物**。

## 目录结构

```
├── src/
│   ├── api/                 # 按应用分组的接口封装（daq / file / config）
│   ├── components/          # base（基础组件）/ form（题型）/ questionnaire（业务组件）
│   ├── composables/         # useQuestionnaire / useDraft / useSubmit 等
│   ├── domain/questionnaire # 纯逻辑：题型映射、序列化、校验、计分
│   ├── pages/questionnaire/ # 10 个页面
│   ├── stores/              # session 等
│   └── utils/               # request（请求层）/ storage / query（页面参数解析）
├── scripts/                 # 探测与联调脚本 + mutation.mjs（变异测试）+ smoke.mjs（页面冒烟）+ e2e.mjs（端到端交互）+ perf.mjs（首屏性能基线）+ a11y.mjs（可访问性审计）+ check-overflow.mjs（验证冒烟溢出检测有效），均不参与打包
├── test/                    # 单元测试 + 集成测试（含 env-config.spec.ts：环境变量配置回归防护、directives/aria-label.spec.ts：可访问性指令）
├── pages.config.ts          # 路由配置源
├── manifest.config.ts       # 应用配置源
└── vite.config.ts           # 含 H5 子路径 base
```

## 开发

```bash
pnpm install
pnpm dev h5          # H5 开发服务（默认 http://localhost:5173/）
pnpm dev mp-weixin   # 微信小程序，产物在 dist/dev/mp-weixin
```

常用校验：

```bash
pnpm test            # 259 项测试
pnpm type-check      # vue-tsc
pnpm lint            # eslint（lint:fix 自动修复）
pnpm mutation        # 变异测试：验证单测是否真的在守着逻辑（当前 197 变异 / 存活 0）
pnpm perf            # 首屏性能基线（需先在 --mode test 下构建并起产物服务）
pnpm smoke           # 页面冒烟：CDP 真实浏览器遍历全部页面 × PC/移动竖屏/移动横屏/公众号H5（需先 pnpm dev h5）
pnpm a11y            # 可访问性审计：可读名称 / 图片 alt / 真实 Tab 键焦点可见性（需先 pnpm dev h5）
pnpm e2e             # 端到端交互：真实作答 → 暂存草稿 → 提交（默认不提交，加 --submit）
pnpm build h5        # 产物 dist/build/h5
pnpm build mp-weixin # 产物 dist/build/mp-weixin
```

## 环境变量

见 `.env.example`。分层：

| 文件 | 用途 |
| --- | --- |
| `.env` | 各环境共用的应用标识（`VITE_BX_APP` / `VITE_BX_APP_NO` / 微信 appid / 超时） |
| `.env.development` | 开发网关 `http://192.168.0.214/bxapi`，`VITE_H5_BASE=/` |
| `.env.production` | 生产网关 `https://www.gxqcxkj.com/bxapi`，`VITE_H5_BASE=/questionnaire/` |
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

## 部署

### H5（公众号 / 浏览器）

生产部署在子路径 `/questionnaire/`，且与网关 `/bxapi/` **同域**（这一点很重要，见下）。

```bash
pnpm build h5   # 产物 dist/build/h5，资源路径自带 /questionnaire/ 前缀
```

Nginx 参考：

```nginx
# 前端静态资源
location /questionnaire/ {
    alias /srv/bx-questionnaire/dist/build/h5/;
    try_files $uri $uri/ /questionnaire/index.html;
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

布局策略：`.bx-container` 固定最大宽度 `--bx-content-width`（860px）居中，窄屏自动铺满，
左右内边距 16px（≥760px 时 24px）。

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

迁移方案与决策记录见 `bx-health` 仓库的 `docs/questionnaire-migration/`：

- `方案文档.md` —— 方案、真实契约基线、决策记录
- `prototype.html` —— 可交互原型
