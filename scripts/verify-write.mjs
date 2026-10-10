/**
 * 写入链路联调（开发辅助）
 *
 * 用现有测试活动验证「草稿保存 → 读回 → 提交 → 读回」的完整契约：
 * - 草稿写 option_no（老工程方案）
 * - 提交写 option_value + option_flag(option_view_no)
 *
 * 用法：node scripts/verify-write.mjs [activityNo]
 */

import { readFileSync } from 'node:fs'

const GATEWAY = process.env.BX_GATEWAY ?? 'http://192.168.0.214/bxapi'
const TICKET = readFileSync('.env.local', 'utf8').match(/^VITE_BX_TICKET=(.*)$/m)?.[1]?.trim()
const ACTIVITY = process.argv[2] ?? '20260513164606000006'

const headers = {
  'Content-Type': 'application/json',
  'bx_auth_ticket': TICKET,
  'bx-auth-ticket': TICKET,
}

async function call(action, serviceName, body) {
  const response = await fetch(`${GATEWAY}/daq/${action}/${serviceName}${action === 'select' ? `?${serviceName}` : ''}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  }
  catch {
    return { state: 'PARSE_ERROR', resultMessage: text.slice(0, 200) }
  }
}

const select = (serviceName, body = {}) => call('select', serviceName, { serviceName, colNames: ['*'], page: { pageNo: 1, rownumber: 100 }, ...body })
const write = (serviceName, data) => call('operate', serviceName, [{ serviceName, data: [data] }])

function summarize(label, res) {
  const item = res.response?.[0]
  console.log(`${label}: state=${res.state} code=${res.resultCode ?? '-'} msg=${res.resultMessage ?? '-'}${item ? ` | item.state=${item.state ?? 'null'} ${item.resultMessage ?? ''}` : ''}`)
  return res
}

// ---------- 1. 取真实题目与选项 ----------
const itemsRes = await select('srvdaq_item_cfg_select')
const items = (itemsRes.data ?? []).filter(row => row.activity_no === ACTIVITY).sort((a, b) => Number(a.item_seq ?? 0) - Number(b.item_seq ?? 0))
const optionsRes = await select('srvdaq_option_cfg_select')
const optionRows = optionsRes.data ?? []

const radio = items.find(row => row.item_type === '单选')
const number = items.find(row => row.item_type === '数字')
const radioOptions = optionRows.filter(row => row.item_no === radio?.item_no)

console.log(`活动 ${ACTIVITY}：${items.length} 道题，单选 ${radioOptions.length} 个选项`)
if (!radio || !number || radioOptions.length === 0) {
  console.log('缺少可联调的题目，终止')
  process.exit(1)
}

const picked = radioOptions[0]

// ---------- 2. 草稿保存（写 option_no） ----------
console.log('\n=== 草稿保存 ===')
const draft = summarize('保存', await write('srvdaq_activity_result_save', {
  activity_no: ACTIVITY,
  item_data: [
    { item_no: radio.item_no, option_data: [picked.option_no] },
    { item_no: number.item_no, option_data: ['2026'] },
  ],
}))
// 实测：草稿保存不回传批次号，需从「未完成」记录里取回，否则提交会新建一条记录
let batchNo = draft.response?.[0]?.response?.fill_batch_no ?? null
if (!batchNo) {
  const pending = await select('srvdaq_record_reply_select', {
    condition: [
      { colName: 'activity_no', ruleType: 'eq', value: ACTIVITY },
      { colName: 'state', ruleType: 'eq', value: '未完成' },
    ],
  })
  batchNo = pending.data?.[0]?.fill_batch_no ?? null
}
console.log(`fill_batch_no = ${batchNo ?? '(未回传)'}`)

// ---------- 3. 读回草稿 ----------
console.log('\n=== 读回答题记录 ===')
const afterDraft = summarize('查询', await select('srvdaq_record_reply_select', {
  condition: [{ colName: 'activity_no', ruleType: 'eq', value: ACTIVITY }],
}))
if (Array.isArray(afterDraft.data)) {
  console.log(`记录行数 ${afterDraft.data.length}`)
  console.log(JSON.stringify(afterDraft.data.slice(0, 3), null, 1).slice(0, 900))
}

// ---------- 4. 提交（写 option_value + option_flag） ----------
console.log('\n=== 提交 ===')
const submit = summarize('提交', await write('srvdaq_activity_result_submit', {
  activity_no: ACTIVITY,
  ...(batchNo ? { fill_batch_no: batchNo } : {}),
  item_data: [
    { item_no: radio.item_no, option_data: [picked.option_value], option_flag: [picked.option_view_no] },
    { item_no: number.item_no, option_data: ['2026'] },
  ],
}))
console.log(JSON.stringify(submit).slice(0, 500))
