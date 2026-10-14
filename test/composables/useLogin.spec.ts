// @vitest-environment node

/**
 * 登录交互逻辑（useLogin）
 *
 * 覆盖：入参校验、提交防重、成功写会话、失败原因透传、「记住我」。
 * **不覆盖真实登录请求**：接口层一律打桩 —— 登录有频次限制（连续失败锁号 1 小时），
 * 单测绝不能打真接口，否则跑几次测试就把联调账号锁了。
 */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MIN_PASSWORD_LENGTH, useLogin } from '@/composables/useLogin'
import { useSessionStore } from '@/stores/session'
import { BxError } from '@/utils/request'
import { SHARED_KEYS, STORAGE_KEYS } from '@/utils/storage'

const mocks = vi.hoisted(() => ({ loginWithPassword: vi.fn() }))

vi.mock('@/api/sso/login', () => ({ loginWithPassword: mocks.loginWithPassword }))

/** 内存版 storage 桩：登录要写票据、用户信息与「记住我」 */
const memory = new Map<string, unknown>()

beforeEach(() => {
  memory.clear()
  mocks.loginWithPassword.mockReset()
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => memory.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => {
      memory.set(key, value)
    },
    removeStorageSync: (key: string) => {
      memory.delete(key)
    },
  })
  setActivePinia(createPinia())
})

describe('登录入参校验', () => {
  it('账号为空时指出账号问题，且不发请求', async () => {
    const { login, errorMessage } = useLogin()

    const result = await login('   ', 'password')

    expect(result).toEqual({ ok: false, field: 'userNo' })
    expect(errorMessage.value).toBe('请输入账号')
    expect(mocks.loginWithPassword).not.toHaveBeenCalled()
  })

  it('密码为空时指出密码问题', async () => {
    const { login } = useLogin()

    expect(await login('jq', '')).toEqual({ ok: false, field: 'password' })
    expect(mocks.loginWithPassword).not.toHaveBeenCalled()
  })

  it('密码短于最短长度就拦下 —— 半截密码提交只会白费一次尝试额度', async () => {
    const { login, errorMessage } = useLogin()

    const result = await login('jq', 'a'.repeat(MIN_PASSWORD_LENGTH - 1))

    expect(result).toEqual({ ok: false, field: 'password' })
    expect(errorMessage.value).toContain(String(MIN_PASSWORD_LENGTH))
    expect(mocks.loginWithPassword).not.toHaveBeenCalled()
  })
})

describe('登录成功', () => {
  it('写入票据与用户信息，并清空错误', async () => {
    mocks.loginWithPassword.mockResolvedValue({ ticket: 'T-1', userInfo: { user_no: 'jq' } })
    const { login, errorMessage } = useLogin()
    const session = useSessionStore()

    const result = await login('jq', 'secret123')

    expect(result).toEqual({ ok: true })
    expect(errorMessage.value).toBe('')
    expect(session.ticket).toBe('T-1')
    expect(session.isLogin).toBe(true)
    expect(session.userInfo).toEqual({ user_no: 'jq' })
    // 票据必须落到与宿主共享的 key 上（H5 嵌入老门户时要互通）
    expect(memory.get(SHARED_KEYS.TICKET)).toBe('T-1')
  })

  it('账号两边的空白会被去掉后再提交', async () => {
    mocks.loginWithPassword.mockResolvedValue({ ticket: 'T', userInfo: {} })
    const { login } = useLogin()

    await login('  jq  ', 'secret123')

    expect(mocks.loginWithPassword).toHaveBeenCalledWith({ userNo: 'jq', password: 'secret123' })
  })

  it('勾选记住我时只记账号，绝不落密码', async () => {
    mocks.loginWithPassword.mockResolvedValue({ ticket: 'T', userInfo: {} })
    const { login, rememberedUser } = useLogin()

    await login('jq', 'secret123', true)

    expect(rememberedUser.value).toBe('jq')
    expect(memory.get(STORAGE_KEYS.REMEMBERED_USER)).toBe('jq')
    // 任何 key 里都不该出现密码
    expect([...memory.values()].some(value => String(value).includes('secret123'))).toBe(false)
  })

  it('不勾记住我时清掉上次记住的账号', async () => {
    memory.set(STORAGE_KEYS.REMEMBERED_USER, 'old-user')
    mocks.loginWithPassword.mockResolvedValue({ ticket: 'T', userInfo: {} })
    const { login, rememberedUser } = useLogin()

    await login('jq', 'secret123', false)

    expect(rememberedUser.value).toBe('')
    expect(memory.has(STORAGE_KEYS.REMEMBERED_USER)).toBe(false)
  })
})

describe('登录失败', () => {
  it('平台的失败原因原样透出，不翻译成「登录失败」', async () => {
    mocks.loginWithPassword.mockRejectedValue(new BxError('账号或密码错误', 'FAILURE'))
    const { login, errorMessage } = useLogin()

    const result = await login('jq', 'wrong-password')

    expect(result).toEqual({ ok: false })
    expect(errorMessage.value).toBe('账号或密码错误')
  })

  it('非 BxError 才用通用文案兜底', async () => {
    mocks.loginWithPassword.mockRejectedValue(new Error('boom'))
    const { login, errorMessage } = useLogin()

    await login('jq', 'secret123')

    expect(errorMessage.value).toBe('登录失败，请稍后重试')
  })

  it('失败时不写会话（票据保持为空）', async () => {
    mocks.loginWithPassword.mockRejectedValue(new BxError('账号或密码错误', 'FAILURE'))
    const { login } = useLogin()
    const session = useSessionStore()

    await login('jq', 'wrong-password')

    expect(session.isLogin).toBe(false)
    expect(memory.has(SHARED_KEYS.TICKET)).toBe(false)
  })
})

/**
 * 提交防重
 *
 * 这条是**结构性的**：登录接口连续失败会锁号 1 小时，
 * 而连点、回车重复触发都能绕过按钮的 disabled 状态。
 * 红了 = 防重被拿掉，线上会出现「点两下把账号锁了」。
 */
describe('提交防重', () => {
  it('上一次请求未返回时，第二次提交直接失败且不发请求', async () => {
    // 用「默认空函数」而不是 `let release = null`：后者在 TS 的控制流分析里
    // 会被判成 never（赋值发生在 Promise 回调内），调用处直接报「不可调用」
    let release: () => void = () => {}
    mocks.loginWithPassword.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ ticket: 'T', userInfo: {} })
    }))

    const { login, submitting } = useLogin()
    const first = login('jq', 'secret123')

    expect(submitting.value).toBe(true)

    const second = await login('jq', 'secret123')
    expect(second).toEqual({ ok: false })
    expect(mocks.loginWithPassword).toHaveBeenCalledTimes(1)

    release()
    expect(await first).toEqual({ ok: true })
    expect(submitting.value).toBe(false)
  })
})

describe('错误清理', () => {
  it('clearError 清掉上一次的失败提示', async () => {
    mocks.loginWithPassword.mockRejectedValue(new BxError('账号或密码错误', 'FAILURE'))
    const { login, errorMessage, clearError } = useLogin()

    await login('jq', 'wrong-password')
    expect(errorMessage.value).not.toBe('')

    clearError()
    expect(errorMessage.value).toBe('')
  })
})
