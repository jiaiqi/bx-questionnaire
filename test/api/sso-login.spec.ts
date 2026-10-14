// @vitest-environment node

/**
 * 平台登录接口层
 *
 * 锁定的是**请求契约**：
 * - 应用必须是 `sso`（不是问卷的 `daq`）；
 * - body 必须是 `[{ serviceName, data: [{ user_no, pwd, enc, terminal_type }] }]`；
 * - 票据必须从 `response[0].response.bx_auth_ticket` 取。
 *
 * 这几条任何一条写错，登录都会失败，而平台的失败信息通常指向「账号密码错误」——
 * 排查成本极高（还会消耗尝试额度），所以在这里钉死。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchLoginPublicKey, loginWithPassword } from '@/api/sso/login'

const mocks = vi.hoisted(() => ({
  bxSelect: vi.fn(),
  bxWrite: vi.fn(),
  extractResponsePayload: vi.fn(),
  rsaEncrypt: vi.fn(),
}))

/** 保留真实的 BxError：抛错断言依赖它的类型 */
vi.mock('@/utils/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/request')>()
  return {
    ...actual,
    bxSelect: mocks.bxSelect,
    bxWrite: mocks.bxWrite,
    extractResponsePayload: mocks.extractResponsePayload,
  }
})

vi.mock('@/utils/crypto/rsa', () => ({ rsaEncrypt: mocks.rsaEncrypt }))

beforeEach(() => {
  for (const fn of Object.values(mocks)) {
    fn.mockReset()
  }
})

describe('取登录公钥', () => {
  it('按 sso 应用请求，并从对象形态的 data 取 public_key', async () => {
    mocks.bxSelect.mockResolvedValue({ data: { public_key: 'KEY-1' } })

    await expect(fetchLoginPublicKey()).resolves.toBe('KEY-1')
    expect(mocks.bxSelect).toHaveBeenCalledWith(
      { serviceName: 'srvsso_user_pwd_sign_select', colNames: ['*'], condition: [] },
      { app: 'sso' },
    )
  })

  it('data 为数组时取第一条（平台两种形态都出现过）', async () => {
    mocks.bxSelect.mockResolvedValue({ data: [{ public_key: 'KEY-2' }] })

    await expect(fetchLoginPublicKey()).resolves.toBe('KEY-2')
  })

  it('拿不到公钥时抛错，而不是拿空串去加密', async () => {
    mocks.bxSelect.mockResolvedValue({ data: [] })

    await expect(fetchLoginPublicKey()).rejects.toThrow('未取到登录公钥')
  })
})

describe('账号密码登录', () => {
  it('密码经 RSA 加密后提交，请求契约与实测一致', async () => {
    mocks.bxSelect.mockResolvedValue({ data: { public_key: 'KEY' } })
    mocks.rsaEncrypt.mockReturnValue('CIPHER')
    mocks.bxWrite.mockResolvedValue({})
    mocks.extractResponsePayload.mockReturnValue({
      bx_auth_ticket: 'TICKET',
      login_user_info: { user_no: 'jq' },
    })

    const result = await loginWithPassword({ userNo: 'jq', password: 'secret123' })

    // 明文绝不能出现在请求里
    expect(mocks.rsaEncrypt).toHaveBeenCalledWith('KEY', 'secret123')
    expect(mocks.bxWrite).toHaveBeenCalledWith(
      'operate',
      [
        {
          serviceName: 'srvuser_login',
          data: [{ user_no: 'jq', pwd: 'CIPHER', enc: 'RSA', terminal_type: 'PC' }],
        },
      ],
      { app: 'sso' },
    )
    expect(result).toEqual({ ticket: 'TICKET', userInfo: { user_no: 'jq' } })
  })

  it('响应里没有票据时抛错，避免写入空会话', async () => {
    mocks.bxSelect.mockResolvedValue({ data: { public_key: 'KEY' } })
    mocks.rsaEncrypt.mockReturnValue('CIPHER')
    mocks.bxWrite.mockResolvedValue({})
    mocks.extractResponsePayload.mockReturnValue({})

    await expect(loginWithPassword({ userNo: 'jq', password: 'secret123' })).rejects.toThrow('未返回票据')
  })

  it('公钥取不到时不会发起登录请求（少一次无谓的尝试额度消耗）', async () => {
    mocks.bxSelect.mockResolvedValue({ data: [] })

    await expect(loginWithPassword({ userNo: 'jq', password: 'secret123' })).rejects.toThrow('未取到登录公钥')
    expect(mocks.bxWrite).not.toHaveBeenCalled()
  })
})
