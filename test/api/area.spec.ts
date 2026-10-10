/**
 * 地区级联接口契约测试
 *
 * 老工程「地址」题型走 `srvconfig_area_adj_select`，参数为
 * isTree / column=no / showCol=path_name —— 答案存 `no`，界面展示 `path_name`。
 *
 * 这里守住三件事：
 *   1. 走 config 应用（不是 daq），服务名不能写错；
 *   2. 不传 parentNo 时不带 condition（取顶层），传了就带 `parent_no` 的 eq 条件；
 *   3. `page` 必须是对象 `{ pageNo, rownumber }` —— 写成数字会 HTTP 400。
 *
 * 第 3 点是踩过的坑：`page: 1` 会得到
 * 「Cannot deserialize instance of java.util.LinkedHashMap out of VALUE_NUMBER_INT」。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bxSelect = vi.fn()

vi.mock('@/utils/request', () => ({
  bxSelect: (...args: unknown[]) => bxSelect(...args),
}))

const { areaAdjSelect } = await import('@/api/config/area')

describe('areaAdjSelect', () => {
  beforeEach(() => {
    bxSelect.mockReset()
    bxSelect.mockResolvedValue({ data: [] })
  })

  it('走 config 应用的 srvconfig_area_adj_select', () => {
    void areaAdjSelect()

    expect(bxSelect).toHaveBeenCalledTimes(1)
    const params = bxSelect.mock.calls[0][0]
    expect(params.serviceName).toBe('srvconfig_area_adj_select')
    expect(params.app).toBe('config')
  })

  it('page 是对象而非数字（写成数字会 HTTP 400）', () => {
    void areaAdjSelect()

    const { page } = bxSelect.mock.calls[0][0]
    expect(typeof page).toBe('object')
    expect(page).toEqual({ pageNo: 1, rownumber: 500 })
    // 字段名是 rownumber，不是 pageSize
    expect(page).toHaveProperty('rownumber')
    expect(page).not.toHaveProperty('pageSize')
  })

  it('不传 parentNo 时不带条件，取顶层', () => {
    void areaAdjSelect()

    expect(bxSelect.mock.calls[0][0].condition).toEqual([])
  })

  it('传 parentNo 时按 parent_no 等值过滤', () => {
    void areaAdjSelect('110000')

    expect(bxSelect.mock.calls[0][0].condition).toEqual([
      { colName: 'parent_no', ruleType: 'eq', value: '110000' },
    ])
  })

  it('空字符串 parentNo 视为不传（避免查出空结果）', () => {
    void areaAdjSelect('')

    expect(bxSelect.mock.calls[0][0].condition).toEqual([])
  })

  it('colNames 用 * 取全字段（no 与 path_name 都要）', () => {
    void areaAdjSelect()

    expect(bxSelect.mock.calls[0][0].colNames).toEqual(['*'])
  })
})
