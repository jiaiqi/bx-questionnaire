/**
 * 地区级联数据（config 应用）
 *
 * 老工程「地址」题型走 `srvconfig_area_adj_select`，
 * 组件侧参数为 isTree / column=no / showCol=path_name，
 * 即：答案存 `no`，界面展示 `path_name`。
 */

import type { BxCondition } from '@/utils/request/types'

import { bxSelect } from '@/utils/request'

export interface AreaRow {
  no?: string | null
  path_name?: string | null
  parent_no?: string | null
  [key: string]: unknown
}

/** 拉取某一级的地区列表；不传 parentNo 时取顶层 */
export function areaAdjSelect(parentNo?: string) {
  const condition: BxCondition[] = []
  if (parentNo) {
    condition.push({ colName: 'parent_no', ruleType: 'eq', value: parentNo })
  }

  return bxSelect<AreaRow>({
    serviceName: 'srvconfig_area_adj_select',
    app: 'config',
    colNames: ['*'],
    condition,
    page: { pageNo: 1, rownumber: 500 },
  })
}

/**
 * 按地区编号精确查询（回顾页把作答值换回名称时用）
 *
 * 与 `areaAdjSelect` 的区别是条件不同，不是重复实现 —— 级联要「某一级的列表」，
 * 回顾页只要「这一个编号是什么」。
 */
export function areaAdjSelectByNo(no: string) {
  return bxSelect<AreaRow>({
    serviceName: 'srvconfig_area_adj_select',
    app: 'config',
    colNames: ['*'],
    condition: [{ colName: 'no', ruleType: 'eq', value: no }],
    page: { pageNo: 1, rownumber: 20 },
  })
}
