/**
 * 题型统计（开发辅助）：列出 item_cfg 中出现过的 item_type 与 item_type_attr 组合
 *
 * 用法：node scripts/probe-types.mjs
 */

import { readFileSync } from 'node:fs'

const GATEWAY = process.env.BX_GATEWAY ?? 'http://192.168.0.214/bxapi'
const TICKET = readFileSync('.env.local', 'utf8').match(/^VITE_BX_TICKET=(.*)$/m)?.[1]?.trim()

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

const items = await select('srvdaq_item_cfg_select')
const rows = items.data ?? []
const seen = new Map()
for (const row of rows) {
  const key = `${row.item_type} | ${row.item_type_attr ?? 'null'}`
  if (!seen.has(key)) {
    seen.set(key, row.item_title)
  }
}
console.log(`item_cfg 共 ${rows.length} 行，题型组合：`)
for (const [key, title] of seen) {
  console.log(`  ${key}    例：${title}`)
}

const activities = await select('srvdaq_activity_cfg_select')
console.log(`\nactivity_cfg 共 ${(activities.data ?? []).length} 行`)
for (const row of activities.data ?? []) {
  console.log(`  ${row.activity_no} | ${row.status} | ${row.title} | item_count=${row.item_count} | info_collect_type=${row.info_collect_type}`)
}
