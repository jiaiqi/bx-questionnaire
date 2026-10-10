/**
 * 环境变量配置的回归防护
 *
 * 起因：`.env.development` 里写过 `VITE_BX_TICKET=`（空值），本意是「票据不要
 * 写在本文件里」，但 Vite 的加载优先级是
 *
 *     .env.[mode].local > .env.[mode] > .env.local > .env
 *
 * 所以那个空值**覆盖**了 `.env.local` 里的真实票据，开发环境所有请求都不带
 * `bx_auth_ticket`。而且它**不报错** —— 按 activity_no 查询的接口匿名也有数据，
 * 只有按 user_no 查询的接口会静默返回 0 行，与「真的没有记录」无法区分。
 * 这个缺陷藏了很久才被 couple 的端到端测试发现。
 *
 * 反过来，`.env.production` 里的空值**是刻意的**：生产构建同样会加载
 * `.env.local`，正是这个空值把联调票据挡住，它才不会被打进产物。
 *
 * 两条规则方向相反，靠人记不住 —— 所以在这里固化下来。
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')

function readEnvFile(name: string): string | null {
  const path = resolve(ROOT, name)
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

/** 取某个 key 在本文件里的赋值（忽略注释行），未出现返回 undefined */
function valueOf(content: string, key: string): string | undefined {
  const re = new RegExp(`^${key}=(.*)$`, 'm')
  const m = content.match(re)
  return m ? m[1].trim() : undefined
}

describe('环境变量配置', () => {
  // 这两个文件优先级高于 .env.local，写空值会把联调票据覆盖掉
  for (const file of ['.env.development', '.env.test']) {
    it(`${file} 不得定义 VITE_BX_TICKET（空值会覆盖 .env.local）`, () => {
      const content = readEnvFile(file)
      expect(content, `${file} 应存在`).not.toBeNull()
      expect(
        valueOf(content as string, 'VITE_BX_TICKET'),
        `${file} 里出现 VITE_BX_TICKET 会覆盖 .env.local 的真实票据，导致开发环境所有请求不带票据且不报错`,
      ).toBeUndefined()
    })
  }

  it('.env.production 必须保留空的 VITE_BX_TICKET（挡住 .env.local 进产物）', () => {
    const content = readEnvFile('.env.production')
    expect(content, '.env.production 应存在').not.toBeNull()
    expect(
      valueOf(content as string, 'VITE_BX_TICKET'),
      '生产构建也会加载 .env.local；这一行必须是空值，否则联调票据会被打进产物',
    ).toBe('')
  })

  it('.env.local 存在时票据必须非空', () => {
    const content = readEnvFile('.env.local')
    if (content === null) {
      // 未配置本地票据是允许的（CI 上就没有），跳过即可
      return
    }
    const ticket = valueOf(content, 'VITE_BX_TICKET')
    if (ticket !== undefined) {
      expect(ticket, '.env.local 里的票据不应为空字符串').not.toBe('')
    }
  })

  it('网关地址不得为空（否则运行时直接报错）', () => {
    for (const file of ['.env.development', '.env.test', '.env.production']) {
      const content = readEnvFile(file)
      expect(content, `${file} 应存在`).not.toBeNull()
      const gateway = valueOf(content as string, 'VITE_BX_GATEWAY')
      expect(gateway, `${file} 必须显式配置 VITE_BX_GATEWAY`).toBeTruthy()
    }
  })
})
