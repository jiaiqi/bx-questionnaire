/**
 * 附件地址拼接测试
 *
 * 契约（实测）：srvfile_attachment_select 返回的 fileurl 是**相对路径**
 * （如 /bxdaq_activity_cfg/activity_image/20261009/20261009174231636100/xxx.png），
 * 直接当 src 用会 404，必须拼上网关前缀。
 *
 * 测试用的网关来自 .env.test（运行时已移除兜底默认值）。
 */

import { describe, expect, it } from 'vitest'

import { resolveFileUrl } from '@/api/file/attachment'

const GATEWAY = import.meta.env.VITE_BX_GATEWAY as string

describe('resolveFileUrl', () => {
  it('相对路径拼上网关前缀', () => {
    expect(resolveFileUrl('/bxdaq_activity_cfg/activity_image/20261009/abc/x.png'))
      .toBe(`${GATEWAY}/bxdaq_activity_cfg/activity_image/20261009/abc/x.png`)
  })

  it('缺少前导斜杠时补上分隔符', () => {
    expect(resolveFileUrl('bxdaq_activity_cfg/x.png')).toBe(`${GATEWAY}/bxdaq_activity_cfg/x.png`)
  })

  it('已是绝对地址时原样返回', () => {
    expect(resolveFileUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    expect(resolveFileUrl('http://cdn.example.com/a.png')).toBe('http://cdn.example.com/a.png')
  })

  it('空值返回空串（调用方据此过滤掉无效项）', () => {
    expect(resolveFileUrl(null)).toBe('')
    expect(resolveFileUrl(undefined)).toBe('')
    expect(resolveFileUrl('')).toBe('')
    expect(resolveFileUrl('   ')).toBe('')
  })
})
