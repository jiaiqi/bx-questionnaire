# V6「清简」原型验收记录

| 项 | 值 |
| --- | --- |
| 验收时间 | 2026-10-22 |
| 对象 | `design/prototype-v6/index.html` 与 `standalone.html` |
| 浏览器 | 本机 Chrome（headless，CDP 驱动） |
| 视口 | 1440×900（桌面）、430×900（窄屏外壳） |
| 结论 | 13 屏无控制台错误；三条主流程 20/20 断言通过；对比度全部达标 |

---

## 1. 逐屏渲染

命令：`node design/prototype-v6/scripts/qa.mjs`

13 屏全部通过（无 console.error / 无未捕获异常），截图在 `_shots/`：

`cover` `survey` `survey-invalid` `submit` `result` `records` `couple` `login-m`
`list` `list-loading` `designer` `login-d` `system`

窄屏外壳：`node design/prototype-v6/scripts/qa.mjs --width 430 --height 900`，
顶栏收成图标、设备框等比缩放、说明文字纵向堆叠，无横向滚动。

## 2. 交互回归

命令：`node design/prototype-v6/scripts/flow.mjs`

```
✓ 封面 → 作答
✓ 空提交出现错误摘要            — 还有 4 道必答没完成…
✓ 空提交不跳转
✓ 进度随作答更新                — answered=4, aria-valuenow=4
✓ 必答补齐后进入提交信息
✓ 提交 → 结果页
✓ 结果页有分数                  — score=20
✓ 列表初始 5 行
✓ 搜索过滤生效                  — 「健康」→ 2 行
✓ 重置搜索恢复
✓ 新建弹层打开
✓ 新建后弹层关闭且新行入列
✓ 新建后总数增加                — 共 7 份
✓ 设计器改标题即时同步纸面
✓ 保存出现反馈
✓ 预览打开
✓ Esc 关闭预览
✓ 登录表单可填写
✓ 登录错误态可见                — 账号或密码不正确，请重试
✓ 登录成功回列表

20/20 通过
```

## 3. 对比度（WCAG 2.1，实测）

| 组合 | 比值 | 结论 |
| --- | --- | --- |
| 主文字 `#14161A` / 白面 | 18.11 | AAA |
| 主文字 / 画布 `#F5F6F8` | 16.75 | AAA |
| 次要文字 `#4B5563` / 白面 | 7.56 | AAA |
| 元信息 `#667080` / 白面 | 5.01 | AA |
| 元信息 / 画布 | 4.63 | AA |
| 白字 / 主色 `#3B4EDB` | 6.37 | AA |
| 强调文字 `#2939C4` / 强调浅底 `#EEF1FD` | 7.52 | AAA |
| 成功 `#0F7A5A` / 白面 | 5.31 | AA |
| 警告 `#A34A08` / 白面 | 5.93 | AA |
| 危险 `#C22F24` / 白面 | 5.64 | AA |
| 危险 / 危险浅底 `#FEF3F2` | 5.18 | AA |
| 占位 `#9CA3AF` / 白面 | 2.54 | 仅占位，不承载信息 |

初版 `--c-danger` `#D92D20` 在浅底上只有 4.44:1，未过 AA，已改为 `#C22F24`（5.18:1）。

## 4. 可访问性人工检查

- [x] Tab 可走完作答、列表、设计器主流程，焦点环 2px 靛蓝 + 2px offset 可见；
- [x] 错误摘要 `role="alert"`，可点击条目跳到对应题；
- [x] 弹层 `role="dialog" aria-modal="true"`，Tab 循环、Esc 关闭、焦点归还；
- [x] 开关、选项均绑定真实 `input`，可用键盘操作；
- [x] 管理端行内操作在 `focus-within` 时同样显形；
- [x] `prefers-reduced-motion: reduce` 下动效降为瞬时（base.css 全局规则）；
- [x] 状态不只靠颜色：状态点 + 文字、错误描边 + 文案 + 图标；
- [x] 交互目标 ≥44×44（移动端选项行 ≥48）。

## 5. 已知问题与边界

1. 窄窗口（<900px）下管理端设备框等比缩小，文字不易阅读——这是设备框的表现方式，
   建议在 ≥1200px 窗口评审管理端；如需可在外壳加「1:1 查看」开关（未做）。
2. 原型数据为本地种子数据，不连网关；图片上传仅本地预览。
3. 未覆盖微信小程序真机、公众号 webview 的真实键盘与安全区差异。
4. 未实现暗色主题、国际化、多租户换肤。
5. `file://` 下 localStorage 在部分浏览器受限，仅影响「刷新后保留数据」，不影响演示。

## 6. 产物清单

- 入口：`design/prototype-v6/index.html`
- 单文件：`design/prototype-v6/standalone.html`（347.7 KB，构建于本次验收）
- 截图：`design/prototype-v6/_shots/*.png`（13 屏）
- 规范：`docs/UI-UX-V6-设计系统.md`
- 使用说明：`design/prototype-v6/README.md`
