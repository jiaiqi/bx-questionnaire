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
  MY_BATCHES: `${PREFIX}my_batches`,
  /** 「记住我」只记账号，**绝不记密码 */
  REMEMBERED_USER: `${PREFIX}remembered_user`,
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

/** 本机在某个活动下产生过的批次号集合（按活动号分组） */
type MyBatchMap = Record<string, string[]>

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

/**
 * 记住「这条作答记录是本机产生的」
 *
 * 为什么需要：`record_reply_select` **未登录时不带 user_no 条件**，会返回该活动的
 * 全部记录（含他人批次号，点进去还能看到他人作答）。而按 `user_no` 查询又要求
 * 调用者的平台会话，前端拿不到别的身份来源 ——
 * 所以未登录时只能靠「本机记过哪些批次号」来判定归属。
 *
 * 只记批次号，不记答案内容。
 */
export function rememberMyBatch(activityNo: string, batchNo: string): void {
  if (!activityNo || !batchNo) {
    return
  }
  const map = storage.get<MyBatchMap>(STORAGE_KEYS.MY_BATCHES, {})
  const existing = map[activityNo]
  // 必须校验是数组：存储被写坏时 `[...'abc']` 会展开成字符，之后
  // `includes(batchNo)` 变成子串匹配 —— 会让不属于自己的记录被认领。
  const list = Array.isArray(existing) ? existing.filter(item => typeof item === 'string') : []
  if (list.includes(batchNo)) {
    return
  }
  // 上限 200 条：长期使用不至于把 storage 撑爆，同时远大于任何正常作答量
  map[activityNo] = [...list, batchNo].slice(-200)
  storage.set(STORAGE_KEYS.MY_BATCHES, map)
}

/** 取本机在某个活动下产生过的批次号 */
export function getMyBatches(activityNo: string): string[] {
  const map = storage.get<MyBatchMap>(STORAGE_KEYS.MY_BATCHES, {})
  const list = map?.[activityNo]
  // 同样必须校验：返回字符串会让 `myBatches.includes(x)` 退化成子串匹配
  return Array.isArray(list) ? list.filter(item => typeof item === 'string') : []
}
