/**
 * 创建测试问卷（开发辅助）
 *
 * 在 parkDev 环境创建一份覆盖「单选 / 多选 / 文本 / 数字」的测试问卷，
 * 用于联调草稿保存、提交与结果回显。字段结构照搬真实数据模板。
 *
 * 用法：node scripts/create-test-data.mjs
 */

import { readFileSync } from 'node:fs'

const GATEWAY = process.env.BX_GATEWAY ?? 'http://192.168.0.214/bxapi'
const TICKET = readFileSync('.env.local', 'utf8').match(/^VITE_BX_TICKET=(.*)$/m)?.[1]?.trim()

const pad = (value, len = 2) => String(value).padStart(len, '0')
const now = new Date()
const STAMP = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
let seq = 0
const nextNo = () => `${STAMP}${pad(++seq, 6)}`

async function write(serviceName, data) {
  const response = await fetch(`${GATEWAY}/daq/operate/${serviceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'bx_auth_ticket': TICKET,
      'bx-auth-ticket': TICKET,
    },
    // operate 契约：请求体是数组，元素为 { serviceName, data: [...] }
    body: JSON.stringify([{ serviceName, data: [data] }]),
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  }
  catch {
    return { state: 'PARSE_ERROR', resultMessage: text.slice(0, 300) }
  }
}

async function select(serviceName, body = {}) {
  const response = await fetch(`${GATEWAY}/daq/select/${serviceName}?${serviceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'bx_auth_ticket': TICKET,
      'bx-auth-ticket': TICKET,
    },
    body: JSON.stringify({ serviceName, colNames: ['*'], page: { pageNo: 1, rownumber: 500 }, ...body }),
  })
  return JSON.parse(await response.text())
}

function report(label, res) {
  const first = res.response?.[0]
  const ok = res.state === 'SUCCESS' && (first?.state === null || first?.state === undefined || first?.state === 'SUCCESS')
  console.log(`${ok ? '✅' : '❌'} ${label}  state=${res.state} resultCode=${res.resultCode ?? '-'} msg=${res.resultMessage ?? '-'}${first ? ` item=${first.state ?? '-'} ${first.resultMessage ?? ''}` : ''}`)
  return ok
}

const base = {
  classify: 'DAQ202409230006',
  classify_path: '自测',
  classify_name: '自测',
  del_flag: '否',
  is_public: '否',
  item_ori: '自定义',
  score_strategy: '完全正确',
}

// ---------- 1. 活动 ----------
const activityNo = nextNo()
const activityOk = report('创建活动', await write('srvdaq_activity_cfg_add', {
  // 注意：不能展开 base —— 它含 is_public / item_ori / score_strategy，这三列只存在于题目/选项表
  del_flag: '否',
  activity_no: activityNo,
  title: `bxq 自动化测试问卷 ${STAMP}`,
  status: '进行中',
  // 复用现有活动的图片文件编号：该字段不允许为空，平台侧存的是文件编号而非 URL
  activity_image: '20260609112107116100',
  logo: null,
  summary: 'bxq 自动化测试问卷',
  remark: 'bxq 自动化测试问卷（联调用，可随时删除）',
  store_no: null,
  para_cfg: null,
  period_days: null,
  positions: '栏目首页',
  keyword: 'bxq,测试,联调',
  act_option: null,
  uid: null,
  biz_path: null,
  passing_mark: null,
  classify: 'DAQ202409230006',
  classify_path: '自测',
  classify_name: '自测',
  info_collect_type: '自测',
  item_count: 4,
  total_points: '40',
  perm_type: '匿名访问',
  answer_times: '1次',
  modify_periond: '一次',
  item_disp_way: '全部',
  is_putlic: '否',
  enable_comments: '否',
  column_recommendation: '否',
  modify_after_submit: '否',
  start_time: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 00:00:00`,
  end_time: '2027-12-31 00:00:00',
  submitted_tip: '感谢你的参与！',
  start_remark: '这是一份用于联调的测试问卷，可放心作答。',
  summary: 'bxq 自动化测试问卷',
}))
console.log(`   活动号：${activityNo}`)

if (!activityOk) {
  console.log('\n活动创建失败，终止。')
  process.exit(1)
}

// ---------- 2. 题目 ----------
const questions = [
  {
    title: '1. 单选题：你更喜欢哪种沟通方式？',
    type: '单选',
    attr: { radioType: 'single' },
    require: '是',
    answer: null,
    options: [
      { value: '1', label: 'A', correct: '是' },
      { value: '2', label: 'B', correct: '否' },
      { value: '3', label: 'C', correct: '否' },
      { value: '4', label: 'D', correct: '否' },
    ],
  },
  {
    title: '2. 多选题：你使用过以下哪些功能？',
    type: '多选',
    attr: { radioType: 'multi' },
    require: '是',
    answer: null,
    options: [
      { value: '1', label: 'A', correct: '是' },
      { value: '2', label: 'B', correct: '是' },
      { value: '3', label: 'C', correct: '否' },
    ],
  },
  {
    title: '3. 填空题：请留下你的建议',
    type: '文本',
    attr: null,
    require: '是',
    answer: null,
    options: [],
  },
  {
    title: '4. 数字题：今年是哪一年？',
    type: '数字',
    attr: null,
    require: '是',
    answer: '2026',
    options: [],
  },
]

for (const [index, question] of questions.entries()) {
  const itemNo = nextNo()
  const ok = report(`创建题目 ${index + 1}（${question.type}）`, await write('srvdaq_item_cfg_add', {
    ...base,
    item_no: itemNo,
    activity_no: activityNo,
    item_title: question.title,
    item_type: question.type,
    item_type_attr: question.attr ? JSON.stringify(question.attr) : null,
    item_seq: index + 1,
    is_require: question.require,
    points: 10,
    answer: question.answer,
    show_cfg: null,
    srv_app: null,
    biz_path: null,
  }))
  if (!ok) {
    continue
  }

  for (const option of question.options) {
    report(`  选项 ${option.label}`, await write('srvdaq_option_cfg_add', {
      option_no: nextNo(),
      item_no: itemNo,
      option_value: option.value,
      option_view_no: option.label,
      option_seq: Number(option.value),
      answer: option.correct,
      points: null,
      del_flag: '否',
    }))
  }
}

// ---------- 3. 回读校验 ----------
console.log('\n=== 回读校验 ===')
const items = await select('srvdaq_item_cfg_select')
const created = (items.data ?? []).filter(row => row.activity_no === activityNo)
console.log(`item_cfg 中该活动题目数：${created.length}（期望 4）`)
const options = await select('srvdaq_option_cfg_select')
const itemNos = new Set(created.map(row => row.item_no))
const createdOptions = (options.data ?? []).filter(row => itemNos.has(row.item_no))
console.log(`option_cfg 中该活动选项数：${createdOptions.length}（期望 7）`)

console.log(`\n测试活动号：${activityNo}`)
console.log(`作答地址：http://localhost:5173/#/pages/questionnaire/index/index?activity_no=${activityNo}`)
