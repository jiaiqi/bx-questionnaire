/**
 * 登录交互逻辑
 *
 * 只负责「校验 → 调接口 → 写会话 → 报错」这条链，界面表现交给 `LoginScreen`。
 * 单独抽出来是因为登录**有频次限制**（连续失败锁号 1 小时）：
 * 防重、校验、错误透传这三件事必须能被单测钉住，而不是散在组件的模板事件里。
 */

import { ref } from 'vue'

import { loginWithPassword } from '@/api/sso/login'
import { useSessionStore } from '@/stores/session'
import { BxError } from '@/utils/request'
import { storage, STORAGE_KEYS } from '@/utils/storage'

/** 密码最短长度（与参考工程一致，避免用户误输半截密码就把账号打到锁定） */
export const MIN_PASSWORD_LENGTH = 6

/** 登录字段：界面据此抖动对应的输入框 */
export type LoginField = 'userNo' | 'password'

export interface LoginAttempt {
  ok: boolean
  /** 校验失败时指出出错字段 */
  field?: LoginField
}

export function useLogin() {
  const session = useSessionStore()

  const submitting = ref(false)
  const errorMessage = ref('')
  /** 上次记住的账号（只记账号，不记密码） */
  const rememberedUser = ref(storage.getString(STORAGE_KEYS.REMEMBERED_USER))

  /** 校验入参；返回 null 表示通过 */
  function validate(userNo: string, password: string): { field: LoginField, message: string } | null {
    if (!userNo.trim()) {
      return { field: 'userNo', message: '请输入账号' }
    }
    if (!password) {
      return { field: 'password', message: '请输入密码' }
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { field: 'password', message: `密码至少 ${MIN_PASSWORD_LENGTH} 位` }
    }
    return null
  }

  function rememberUser(userNo: string): void {
    rememberedUser.value = userNo
    if (userNo) {
      storage.set(STORAGE_KEYS.REMEMBERED_USER, userNo)
    }
    else {
      storage.remove(STORAGE_KEYS.REMEMBERED_USER)
    }
  }

  /**
   * 提交登录
   *
   * 提交中直接返回失败（`submitting` 为真时不发第二次请求）——
   * 这是**结构性防重**，不能只靠按钮 disabled：连点、回车重复触发都会绕过 UI 层。
   */
  async function login(userNo: string, password: string, remember = false): Promise<LoginAttempt> {
    if (submitting.value) {
      return { ok: false }
    }

    const issue = validate(userNo, password)
    if (issue) {
      errorMessage.value = issue.message
      return { ok: false, field: issue.field }
    }

    submitting.value = true
    errorMessage.value = ''

    try {
      const result = await loginWithPassword({ userNo: userNo.trim(), password })
      session.setTicket(result.ticket)
      session.setUserInfo(result.userInfo)
      rememberUser(remember ? userNo.trim() : '')
      return { ok: true }
    }
    catch (error) {
      // 平台的失败原因（账号密码错误 / 锁定）要原样透出，不要翻译成「登录失败」
      errorMessage.value = error instanceof BxError ? error.message : '登录失败，请稍后重试'
      return { ok: false }
    }
    finally {
      submitting.value = false
    }
  }

  function clearError(): void {
    errorMessage.value = ''
  }

  return {
    submitting,
    errorMessage,
    rememberedUser,
    login,
    clearError,
  }
}
