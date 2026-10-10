/**
 * 详情探测（开发辅助）：打印指定活动的活动行、题目行与选项行完整 JSON
 *
 * 用途：作为「创建测试活动」的字段模板，并核对真实数据结构。
 *
 * 用法：node scripts/probe-detail.mjs [activityNo]
 */

import { readFileSync } from 'node:fs'

const GATEWAY = process.env.BX_GATEWAY ?? 'http://192.168.0.214/bxapi'
const APP = 'daq'
const ACTIVITY_NO = process.argv[2] ?? '20260513185113000009'

function readTicket() {
  for (const file of ['.env.local', '.env.development']) {
    try {
      const matched = readFileSync(file, 'utf8').match(/^VITE_BX_TICKET=(.*)$/m)
      if (matched && matched[1].trim()) {
        return matched[1].trim()
      }
    }
    catch {
      // 继续
    }
  }
  throw new Error('未找到票据：请在 .env.local 配置 VITE_BX_TICKET')
}

const TICKET = readTicket()

async function select(serviceName, body) {
  const url = `${GATEWAY}/${APP}/select/${serviceName}?${serviceName}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'bx_auth_ticket': TICKET,
      'bx-auth-ticket': TICKET,
    },
    body: JSON.stringify({ serviceName, colNames: ['*'], ...body }),
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  }
  catch {
    return { state: 'PARSE_ERROR', resultMessage: text.slice(0, 300) }
  }
}

const eq = (colName, value) => ({ colName, ruleType: 'eq', value })

console.log(`=== 活动 ${ACTIVITY_NO} ===`)
const activity = await select('srvdaq_activity_cfg_select', {
  condition: [eq('activity_no', ACTIVITY_NO)],
})
console.log(JSON.stringify(activity.data?.[0] ?? activity, null, 2))

console.log('\n=== 题目 ===')
// 注意：item_cfg_select 传 condition 会返回空（服务侧过滤不生效），改为全量取回后本地过滤
const items = await select('srvdaq_item_cfg_select', {
  page: { pageNo: 1, rownumber: 500 },
})
const itemRows = (items.data ?? [])
  .filter(row => row.activity_no === ACTIVITY_NO)
  .sort((a, b) => Number(a.item_seq ?? 0) - Number(b.item_seq ?? 0))
console.log(`共 ${itemRows.length} 道`)
for (const row of itemRows) {
  console.log(JSON.stringify(row))
}

console.log('全表共 ' + (items.data ?? []).length + ' 行')

console.log('\n=== 选项 ===')
const options = await select('srvdaq_option_cfg_select', {
  colNames: ['*'],
  page: { pageNo: 1, rownumber: 500 },
})
const itemNos = new Set(itemRows.map(row => row.item_no))
const optionRows = (options.data ?? []).filter(row => itemNos.has(row.item_no))
console.log(`共 ${optionRows.length} 个`)
for (const row of optionRows) {
  console.log(JSON.stringify(row))
}
