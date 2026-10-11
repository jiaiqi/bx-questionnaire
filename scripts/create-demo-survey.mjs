/**
 * 创建一份**演示问卷**（覆盖全部已支持题型）
 *
 * 用途：给业务方在浏览器里直接看效果，同时作为人工验收的固定样本。
 *
 * 与 `create-test-data.mjs` 的区别：那个造的是自动化断言用的数据（题目固定、被
 * e2e/smoke 断言「共 4 题」），**不能改**；这个是可以随时重建给人看的演示数据。
 *
 * 实测契约（parkDev，2026-10-11）：
 *
 * | 事实 | 依据 |
 * | --- | --- |
 * | 选项**不在**题目表里，走 `srvdaq_option_cfg_select/_add` | `srvdaq_item_cfg_select` 不返回 `option_data` |
 * | 选项按 `item_no` 关联，不按 `activity_no` | 用 `activity_no` 查选项报「条件列信息不存在」 |
 * | `option_value` 是**选项文案**，`option_no` 是内部编号 | 实测 `{option_value:'1', option_no:'20261010100256000003', option_view_no:'A'}` |
 * | 分节符的 `item_type` 是中文 `分节符` | `mapper.ts` 的 `SECTION_TYPE = '分节符'` |
 * | 活动新增必填 `classify` / `classify_path` / `activity_image` | 缺一个就报 `4445 xxx为必填信息` |
 *
 * ## 本环境**没有** `分节符`（逐值探测的结论）
 *
 * `bxdaq_item_cfg` 的 `item_type` 是 `Enum` 列，`option_list` 为 null，
 * 真实取值在元数据的 **`option_list_v2`** 里（端点：
 * `srvsys_service_columnex_v2_select?colsel_v2=srvdaq_item_cfg_add` + `use_type=add`）：
 *
 * ```text
 * 单选 / 多选 / 文本 / 数字 / 时间日期 / 图片 / 选项 / 地址 / 引用
 * ```
 *
 * **共 9 个值，不含 `分节符`。** 逐值写入探测同样确认：`分节符`、`分节`、`分段`、
 * `段落`、`标题`、`SECTION_TYPE` 等 18 个候选**全部**被拒（`[问题条目类型]字段值数据类型不匹配`），
 * 而同一次探测里 `文本`/`单选`/`数字`/`图片`/`地址`/`引用`/`多选`/`时间日期`/`选项`
 * 全部接受 —— **对照组通过，所以「全拒」是真的，不是探测坏了**。
 *
 * 老工程也用 `'分节符'` 这个值（`index.vue` L313/L697/L818），所以值本身没错，
 * 是**本部署的枚举没这一项**。因此这份演示问卷不含分节符；
 * `mapper` 的 `section` 分支只能靠伪造字段的用例覆盖（见验收清单）。
 *
 * 用法：`node scripts/create-demo-survey.mjs`
 */

const ticket = (await import('node:fs')).readFileSync('.env.local', 'utf8')
  .match(/VITE_BX_TICKET=(.*)/)[1].trim()
const H = { 'Content-Type': 'application/json', 'bx_auth_ticket': ticket, 'bx-auth-ticket': ticket }
const GATE = 'http://192.168.0.214/bxapi'

/** 新建活动要借用的分类与封面（实测本环境可用值） */
const CLASSIFY = 'DAQ202409230006'
const CLASSIFY_PATH = '自测'
const ACTIVITY_IMAGE = '20260609112107116100'

async function operate(serviceName, rows) {
  const res = await fetch(`${GATE}/daq/operate/${serviceName}`, {
    method: 'POST', headers: H, body: JSON.stringify([{ serviceName, data: rows }]),
  })
  return res.json()
}

async function select(serviceName, condition, rownumber = 100) {
  const res = await fetch(`${GATE}/daq/select/${serviceName}`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ serviceName, colNames: ['*'], condition, page: { pageNo: 1, rownumber } }),
  })
  return res.json()
}

/** 把 operate 的失败原因完整打出来，不猜 */
function assertOk(label, json) {
  const inner = json.response?.[0]
  if (json.state !== 'SUCCESS' || inner?.state === 'FAILURE') {
    console.error(`  ✗ ${label} 失败：${json.resultMessage || inner?.resultMessage || JSON.stringify(json).slice(0, 300)}`)
    process.exit(1)
  }
}

// ── 演示问卷内容 ──────────────────────────────────────────────
/**
 * `type` 用平台的 `item_type` 原文（**必须是上表 9 个值之一**）；
 * `attr` 是 `item_type_attr`（**必须是 JSON 字符串**，传对象会报 `Incorrect string value`）。
 */
const SURVEY = {
  title: '员工满意度调查（演示问卷）',
  summary: '覆盖全部题型的演示问卷，用于人工验收',
  remark: '由 scripts/create-demo-survey.mjs 生成，可随时删除重建',
  startRemark: '这是一份演示问卷，用于查看各题型的实际效果，作答不会用于统计。',
  submittedTip: '感谢参与！你的反馈已记录。',
  items: [
    { type: '文本', title: '您的姓名（选填）', require: false, attr: { view_model: 'text' } },
    {
      type: '单选',
      title: '您所在的部门',
      require: true,
      attr: { radioType: 'single' },
      options: [
        { value: '技术部', answer: false },
        { value: '产品部', answer: false },
        { value: '市场部', answer: false },
        { value: '职能部', answer: false },
      ],
    },
    { type: '数字', title: '您在本公司的工作年限（年）', require: true },
    { type: '时间日期', title: '您的入职日期', require: false, attr: { dateType: 'date' } },
    {
      type: '单选',
      title: '您对当前工作的整体满意度',
      require: true,
      points: 10,
      attr: { radioType: 'single' },
      options: [
        { value: '非常满意', answer: true },
        { value: '比较满意', answer: false },
        { value: '一般', answer: false },
        { value: '不太满意', answer: false },
      ],
    },
    {
      type: '多选',
      title: '您认为公司在哪些方面做得好？（可多选）',
      require: true,
      points: 10,
      attr: { radioType: 'multi' },
      options: [
        { value: '团队氛围', answer: true },
        { value: '薪酬福利', answer: true },
        { value: '成长空间', answer: false },
        { value: '工作生活平衡', answer: false },
      ],
    },
    {
      // 「选项」是独立题型（与「单选/多选」并列），靠 radioType 决定单选还是多选
      type: '选项',
      title: '您愿意推荐朋友来本公司工作吗？',
      require: false,
      attr: { radioType: 'single' },
      options: [
        { value: '非常愿意', answer: false },
        { value: '比较愿意', answer: false },
        { value: '说不好', answer: false },
        { value: '不愿意', answer: false },
      ],
    },
    {
      type: '地址',
      title: '您的工作地点所在地区',
      require: false,
      attr: { servicename: 'srvconfig_area_adj_select', srv_app: 'config', refed_col: 'area_no', key_disp_col: 'area_name' },
    },
    { type: '图片', title: '上传一张您的工作环境照片', require: false, attr: { fileNum: 3 } },
    {
      type: '引用',
      title: '请选择一份您参与过的问卷',
      require: false,
      attr: { servicename: 'srvdaq_activity_cfg_select', srv_app: 'daq', refed_col: 'activity_no', key_disp_col: 'title' },
    },
    { type: '文本', title: '您对公司的建议', require: false, attr: { view_model: 'textarea' } },
  ],
}

// ── 执行 ──────────────────────────────────────────────────────
console.log('=== 1. 新建活动 ===')
const addActivity = await operate('srvdaq_activity_cfg_add', [{
  title: SURVEY.title,
  summary: SURVEY.summary,
  remark: SURVEY.remark,
  start_remark: SURVEY.startRemark,
  submitted_tip: SURVEY.submittedTip,
  classify: CLASSIFY,
  classify_path: CLASSIFY_PATH,
  activity_image: ACTIVITY_IMAGE,
  info_collect_type: '自测',
  perm_type: '匿名访问',
  status: '进行中',
  start_time: '2026-10-11 00:00:00',
  end_time: '2027-12-31 00:00:00',
  item_disp_way: '全部',
  answer_times: '1次',
  is_putlic: '否',
  modify_after_submit: '否',
  enable_comments: '否',
  keyword: '演示,员工满意度',
}])
assertOk('新建活动', addActivity)

// 活动编号：新增响应不一定回传，回查一次最稳
const found = await select('srvdaq_activity_cfg_select', [
  { colName: 'title', ruleType: 'eq', value: SURVEY.title },
])
const activity = (found.data ?? []).sort((a, b) => String(b.create_time).localeCompare(String(a.create_time)))[0]
if (!activity) {
  console.error('  ✗ 新增后查不到该活动，无法继续')
  process.exit(1)
}
const ACTIVITY_NO = activity.activity_no
console.log(`  ✓ activity_no = ${ACTIVITY_NO}`)

console.log('\n=== 2. 新建题目 ===')
const planned = SURVEY.items.map(item => ({ ...item, options: item.options ?? [] }))

for (const [index, item] of planned.entries()) {
  const row = {
    activity_no: ACTIVITY_NO,
    item_title: item.title,
    item_type: item.type,
    item_seq: index + 1,
    is_require: item.require ? '是' : '否',
    points: item.points ?? 0,
    score_strategy: '完全正确',
    item_ori: '自定义',
    classify: CLASSIFY,
    classify_path: CLASSIFY_PATH,
    is_public: '否',
  }
  if (item.attr) {
    row.item_type_attr = JSON.stringify(item.attr)
  }
  const json = await operate('srvdaq_item_cfg_add', [row])
  assertOk(`第 ${index + 1} 题「${item.title}」`, json)
  console.log(`  ✓ seq=${index + 1} ${item.type.padEnd(4)} ${item.title}`)
}

console.log('\n=== 3. 回查 item_no 并建选项 ===')
const itemRows = await select('srvdaq_item_cfg_select', [
  { colName: 'activity_no', ruleType: 'eq', value: ACTIVITY_NO },
])
const bySeq = new Map((itemRows.data ?? []).map(row => [Number(row.item_seq), row]))
let optionTotal = 0

for (const [index, item] of planned.entries()) {
  if (!item.options.length) {
    continue
  }
  const itemRow = bySeq.get(index + 1)
  if (!itemRow) {
    console.error(`  ✗ 找不到 seq=${index + 1} 的题目行`)
    process.exit(1)
  }
  const rows = item.options.map((option, optionIndex) => ({
    item_no: itemRow.item_no,
    option_value: option.value,
    option_seq: optionIndex + 1,
    option_view_no: String.fromCharCode(65 + optionIndex),
    answer: option.answer ? '是' : '否',
  }))
  const json = await operate('srvdaq_option_cfg_add', rows)
  assertOk(`「${item.title}」的 ${rows.length} 个选项`, json)
  optionTotal += rows.length
  console.log(`  ✓ ${item.title}：${rows.length} 个选项`)
}

console.log('\n=== 完成 ===')
console.log(`  活动编号：${ACTIVITY_NO}`)
console.log(`  题目 ${planned.length} 道、选项 ${optionTotal} 个`)
console.log(`  入口：http://localhost:5173/#/pages/questionnaire/index/index?activity_no=${ACTIVITY_NO}&formType=form&status=进行中`)
