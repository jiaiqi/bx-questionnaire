/**
 * 入口可见性判定（纯函数）
 *
 * 这些判定原先写在页面里，无法单测；抽出来后可覆盖各分支。
 */

/** `info_collect_type` 中会**排除**报告入口的两个取值（评估类反而是要显示的） */
export const COLLECT_TYPE_SELF_TEST = '自测'
export const COLLECT_TYPE_FEEDBACK = '反馈'

/**
 * 结果页是否显示「查看评估结果」入口
 *
 * 依据来自老工程的两处逻辑：
 * 1. 详情页在 `info_collect_type === '评估'` 时显示「查看评估结果」按钮；
 * 2. 提交成功后，**评估类活动直接 redirect 到评估结果页**。
 *
 * 新工程提交后统一进结果页（能看分数与逐题回顾），若这里不给入口，
 * 评估类活动的建议报告就彻底无法到达 —— 那是功能缺失，不是重构。
 *
 * 判定取「非自测/反馈即显示」：
 * - 自测类老工程是**内联显示分数**，新结果页已经给了分数与逐题对错，不需要报告入口；
 * - 反馈类老工程没有该按钮；
 * - `info_collect_type` 缺失时**放开**。宁可多一个入口（面板自身有空态），
 *   也不要让用户拿不到报告 —— 两种误判的代价不对称。
 */
export function shouldShowSuggestionEntry(
  infoCollectType: string | null | undefined,
  fillBatchNo: string,
): boolean {
  // 没有批次号就没有报告可看（面板也会拒绝加载）
  if (!fillBatchNo) {
    return false
  }
  return infoCollectType !== COLLECT_TYPE_SELF_TEST && infoCollectType !== COLLECT_TYPE_FEEDBACK
}
