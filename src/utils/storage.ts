/**
 * 统一本地存储
 *
 * 设计要点：
 * - 票据 key 保持与老工程一致（`bx_auth_ticket`），保证 H5 嵌入老门户时能互通；
 * - 其余内部 key 统一加 `bxq:` 前缀，避免与宿主页面冲突；
 * - 老工程 `persistData` blob 与顶层 key 双写的缺陷在此消解：**一个 key 只有一份真值**。
 */

const PREFIX = 'bxq:'

/** 与宿主/老工程共享的 key，不加前缀 */
export const SHARED_KEYS = {
  TICKET: 'bx_auth_ticket',
  LOGIN_USER_INFO: 'login_user_info',
} as const

/** 本工程内部 key */
export const STORAGE_KEYS = {
  FILL_BATCH_NO: `${PREFIX}fill_batch_no`,
  ACTIVITY_SNAPSHOT: `${PREFIX}activity_snapshot`,
  DRAFT_ANSWERS: `${PREFIX}draft_answers`,
  ENTRY_PARAMS: `${PREFIX}entry_params`,
  SUBMIT_INFO: `${PREFIX}submit_info`,
} as const

/**
 * 本地草稿答案的存储 key
 *
 * 必须按 activity_no 隔离：同一个用户在多个问卷里各存一份草稿，
 * 共用一个 key 会让后进入的问卷读到前一份的答案。
 */
export function draftAnswersKey(activityNo: string): string {
  return `${STORAGE_KEYS.DRAFT_ANSWERS}:${activityNo}`
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const value = uni.getStorageSync(key)
      if (value === '' || value === null || value === undefined) {
        return fallback
      }
      return value as T
    }
    catch {
      return fallback
    }
  },

  getString(key: string, fallback = ''): string {
    const value = storage.get<unknown>(key, fallback)
    return typeof value === 'string' ? value : fallback
  },

  set(key: string, value: unknown): void {
    try {
      uni.setStorageSync(key, value)
    }
    catch {
      // 存储写失败不应中断业务流程
    }
  },

  remove(key: string): void {
    try {
      uni.removeStorageSync(key)
    }
    catch {
      // 同上
    }
  },
}
