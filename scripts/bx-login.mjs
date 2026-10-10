/**
 * 平台账号登录换票（开发辅助）
 *
 * 契约（取自 bx skill 的 probe.mjs，已实测）：
 * 1. 取 RSA 公钥：POST /sso/select/srvsso_user_pwd_sign_select
 * 2. 登录：POST /sso/operate/srvuser_login
 *    body = [{ serviceName: 'srvuser_login', data: [{ user_no, pwd: RSA(pwd), enc: 'RSA', terminal_type: 'PC' }] }]
 * 3. 票据在 response[0].response.bx_auth_ticket
 *
 * ⚠️ 登录有频次限制，连续失败会锁号 1 小时。因此：
 * - 票据一律复用，只有收到 0011（会话过期）才重新登录；
 * - 凭据只走环境变量，绝不写入仓库；票据只写进 gitignored 的 .env.local。
 *
 * 用法：
 *   BX_USER=jq BX_PWD=*** node scripts/bx-login.mjs          # 只打印票据
 *   BX_USER=jq BX_PWD=*** node scripts/bx-login.mjs --write  # 同时更新 .env.local
 */

import crypto from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const GATEWAY = process.env.BX_GATEWAY ?? 'http://192.168.0.214/bxapi'
const USER = process.env.BX_USER
const PWD = process.env.BX_PWD

function wrapPem(base64, type) {
  const body = String(base64).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g).join('\n')
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`
}

function rsaEncrypt(publicKey, text) {
  // 密钥可能是 SubjectPublicKeyInfo 或 PKCS#1 两种 PEM，逐个尝试
  for (const type of ['PUBLIC KEY', 'RSA PUBLIC KEY']) {
    try {
      return crypto
        .publicEncrypt({ key: wrapPem(publicKey, type), padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(text))
        .toString('base64')
    }
    catch {
      // 试下一种封装
    }
  }
  throw new Error('公钥格式无法解析')
}

async function call(path, body) {
  const res = await fetch(`${GATEWAY}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function main() {
  if (!USER || !PWD) {
    throw new Error('未提供 BX_USER / BX_PWD')
  }

  const keyRes = await call('/sso/select/srvsso_user_pwd_sign_select', {
    serviceName: 'srvsso_user_pwd_sign_select',
    colNames: ['*'],
    condition: [],
  })
  const keyData = keyRes?.data
  const publicKey = keyData?.public_key || (Array.isArray(keyData) ? keyData[0]?.public_key : null)
  if (!publicKey) {
    throw new Error(`获取登录公钥失败: ${JSON.stringify(keyRes).slice(0, 200)}`)
  }

  const res = await call('/sso/operate/srvuser_login', [
    {
      serviceName: 'srvuser_login',
      data: [{ user_no: USER, pwd: rsaEncrypt(publicKey, PWD), enc: 'RSA', terminal_type: 'PC' }],
    },
  ])

  if (res?.state !== 'SUCCESS') {
    throw new Error(`登录失败: ${res?.resultMessage || JSON.stringify(res).slice(0, 200)}`)
  }

  const payload = res.response?.[0]?.response
  const ticket = payload?.bx_auth_ticket
  if (!ticket) {
    throw new Error('登录响应无票据')
  }

  const info = payload.login_user_info || {}
  console.log(`✅ 登录成功: ${info.real_name || info.user_no || '?'} (user_no=${info.user_no})`)
  console.log(`ticket=${ticket}`)

  if (process.argv.includes('--write')) {
    const envPath = '.env.local'
    let content = ''
    try {
      content = readFileSync(envPath, 'utf8')
    }
    catch {
      content = ''
    }

    const line = `VITE_BX_TICKET=${ticket}`
    content = /^VITE_BX_TICKET=.*$/m.test(content)
      ? content.replace(/^VITE_BX_TICKET=.*$/m, line)
      : `${content.trimEnd()}\n${line}\n`

    writeFileSync(envPath, content, 'utf8')
    console.log(`已写入 ${envPath}（该文件在 .gitignore 中）`)
  }
}

await main()
