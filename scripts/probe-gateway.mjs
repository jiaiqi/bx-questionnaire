/**
 * 网关只读探测脚本（开发辅助，不参与构建）
 *
 * 票据从 .env.local 读取，避免出现在命令行历史里。
 * 用法：node scripts/probe-gateway.mjs [activity_no]
 */

import { readFileSync } from 'node:fs'

const GATEWAY = process.env.BX_GATEWAY ?? 'http://192.168.0.214/bxapi'
const APP = 'daq'

function readTicket() {
  for (const file of ['.env.local', '.env.development']) {
    try {
      const matched = readFileSync(file, 'utf8').match(/^VITE_BX_TICKET=(.*)$/m)
      if (matched && matched[1].trim()) {
        return matched[1].trim()
      }
    }
    catch {
      // 文件不存在则继续
    }
  }
  throw new Error('未找到票据：请在 .env.local 配置 VITE_BX_TICKET')
}

const TICKET = readTicket()

async function call(serviceName, body, action = 'select') {
  const url = `${GATEWAY}/${APP}/${action}/${serviceName}${action === 'select' ? `?${serviceName}` : ''}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'bx_auth_ticket': TICKET,
      'bx-auth-ticket': TICKET,
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  }
  catch {
    return { raw: text, statusCode: response.status }
  }
}

const activityNo = process.argv[2] ?? '20260513185113000009'

console.log('=== srvdaq_activity_cfg_select（colNames: *）===')
const cfg = await call('srvdaq_activity_cfg_select', {
  serviceName: 'srvdaq_activity_cfg_select',
  colNames: ['*'],
  condition: [{ colName: 'activity_no', ruleType: 'eq', value: activityNo }],
})
console.log('state:', cfg.state, '| resultCode:', cfg.resultCode, '| rows:', cfg.data?.length, '|', cfg.resultMessage ?? '')

console.log('\n=== srvdaq_init_view_select ===')
const view = await call('srvdaq_init_view_select', {
  serviceName: 'srvdaq_init_view_select',
  colNames: ['*'],
  order: [{ colName: 'item_seq', ruleType: 'asc' }],
  condition: [{ colName: 'activity_no', ruleType: 'eq', value: activityNo }],
})
console.log('state:', view.state, '| rows:', view.data?.length, '|', view.resultMessage ?? '')

const items = view.data?.[0]?.item_data ?? []
console.log(`\n题目数：${items.length}`)
for (const item of items) {
  const attr = item.item_type_attr ? JSON.stringify(item.item_type_attr) : '-'
  const options = item.option_data ?? []
  console.log(
    `  seq=${item.item_seq} type=${item.item_type} require=${item.is_require} opts=${options.length} attr=${attr} :: ${item.item_title}`,
  )
  for (const option of options.slice(0, 4)) {
    console.log(`      - no=${option.option_no} value=${option.option_value} view=${option.option_view_no} label=${option.answer}`)
  }
}

console.log('\n=== 活动行可用字段 ===')
console.log(Object.keys(view.data?.[0] ?? {}).join(', '))
