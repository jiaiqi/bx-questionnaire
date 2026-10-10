/**
 * 服务可用性探测（开发辅助）
 *
 * 只调用 select，判断哪些服务在当前票据下有权限、表结构是否可取，
 * 为「创建测试活动 + 题目 + 选项」提供依据。
 *
 * 用法：node scripts/probe-services.mjs
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
    return { state: 'PARSE_ERROR', resultCode: String(response.status), resultMessage: text.slice(0, 200) }
  }
}

const candidates = [
  'srvdaq_activity_cfg_select',
  'srvdaq_item_cfg_select',
  'srvdaq_item_select',
  'srvdaq_option_cfg_select',
  'srvdaq_option_select',
  'srvdaq_record_reply_select',
  'srvdaq_record_merge_select',
  'srvdaq_record_reply_merge_select',
  'srvdaq_activity_sug_select',
  'srvdaq_record_share_select',
  'srvdaq_classify_cfg_select',
]

for (const serviceName of candidates) {
  const res = await call(serviceName, {
    serviceName,
    colNames: ['*'],
    page: { pageNo: 1, rownumber: 1 },
  })
  const rows = Array.isArray(res.data) ? res.data.length : '-'
  const total = res.page?.total ?? '-'
  console.log(
    `${serviceName.padEnd(34)} state=${String(res.state).padEnd(8)} code=${String(res.resultCode).padEnd(8)} rows=${rows} total=${total} ${res.resultMessage ?? ''}`,
  )
  if (Array.isArray(res.data) && res.data.length > 0) {
    console.log(`   字段: ${Object.keys(res.data[0]).join(', ')}`)
  }
}
