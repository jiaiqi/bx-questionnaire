/**
 * 作答记录归属判定（纯函数）
 *
 * **要解决的问题**：`srvdaq_record_reply_select` 在**未登录**（不带 `user_no` 条件）时
 * 会返回该活动的**全部**记录 —— 包括别人的批次号。而记录卡片点进去会带上
 * `fill_batch_no`，`init_view_select` 的 `type=use` 会**如实返回该批次的 user_data**，
 * 也就是**能看到别人的作答内容**。
 *
 * 平台侧的权限没配，前端拿不到「调用者是谁」的第二个来源：
 * - 已登录：`login_user_info.user_no` 可作为条件下推给服务端；
 * - 未登录：`record_reply_select` 按 `user_no` 查询要求**调用者的平台会话**，
 *   而匿名提交每次都会生成新的 32 位随机 `user_no`，无法把同一台设备的历史归到一起 ——
 *   只能靠本机记录过的批次号判定。
 *
 * 所以这里是一个**体验层门槛**，不是安全边界：真正要挡住越权读取，
 * 必须由平台按调用者身份过滤（已在验收清单里记为待办）。
 */

/** 一条记录的归属判定所需上下文 */
export interface RecordOwnershipContext {
  /** 当前登录用户的 user_no；未登录为空 */
  userNo: string
  /** 本机在本次活动中产生过的批次号 */
  myBatches: string[]
}

/** 判断某条记录是否属于当前用户 */
export function isMyRecord(
  row: { user_no?: string | null, fill_batch_no?: string | null },
  context: RecordOwnershipContext,
): boolean {
  const batchNo = String(row.fill_batch_no ?? '')
  // 本机产生过就是自己的 —— 这条优先，因为匿名提交拿不到稳定的 user_no
  if (batchNo && context.myBatches.includes(batchNo)) {
    return true
  }
  const userNo = String(row.user_no ?? '')
  // 已登录且记录带 user_no 时按账号比对
  if (context.userNo && userNo) {
    return userNo === context.userNo
  }
  return false
}

/** 过滤出属于当前用户的记录，同时回传被隐藏的条数（用于如实告知用户） */
export function filterMyRecords<T extends { user_no?: string | null, fill_batch_no?: string | null }>(
  rows: T[],
  context: RecordOwnershipContext,
): { mine: T[], hidden: number } {
  const mine = rows.filter(row => isMyRecord(row, context))
  return { mine, hidden: rows.length - mine.length }
}
