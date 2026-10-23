/**
 * 编辑器页面地址（纯函数）
 *
 * 与 `domain/questionnaire/routes` 同样的理由：地址字符串散落手写时，
 * 漏一个 `activity_no` 就会把用户送进「缺少活动编号」的空白页。
 * 集中到一处后，参数由函数签名强制。
 */

import { withQuery } from '@/domain/questionnaire/routes'

/** 编辑器页面路径（不含参数） */
export const EDITOR_ROUTES = {
  /** 问卷列表（活动清单） */
  list: '/pages/editor/list/index',
  /** 可视化问卷设计器 */
  design: '/pages/editor/design/index',
  /** 问卷统计 */
  stats: '/pages/editor/stats/index',
} as const

/** 问卷列表地址 */
export function editorListUrl(): string {
  return EDITOR_ROUTES.list
}

/** 新建问卷：设计器不带 `activity_no`，保存时先建活动 */
export function editorCreateUrl(): string {
  return EDITOR_ROUTES.design
}

/** 编辑已有问卷（`activity_no` 必填） */
export function editorDesignUrl(activityNo: string): string {
  return withQuery(EDITOR_ROUTES.design, { activity_no: activityNo })
}

/** 问卷统计页（`activity_no` 必填） */
export function editorStatsUrl(activityNo: string): string {
  return withQuery(EDITOR_ROUTES.stats, { activity_no: activityNo })
}
