import { describe, expect, it } from 'vitest'

import { resolveImageDisplay } from '@/domain/questionnaire/images'

describe('resolveImageDisplay', () => {
  it('服务端列表可用时用服务端列表', () => {
    const result = resolveImageDisplay({
      serverUrls: ['https://gw/file/download?filePath=a.jpg'],
      localUrls: ['blob:local-1'],
    })
    expect(result.images).toEqual(['https://gw/file/download?filePath=a.jpg'])
    expect(result.localOnly).toBe(false)
  })

  it('服务端列表读不到时退回本地预览', () => {
    const result = resolveImageDisplay({
      serverUrls: [],
      localUrls: ['blob:local-1', 'blob:local-2'],
    })
    expect(result.images).toEqual(['blob:local-1', 'blob:local-2'])
    expect(result.localOnly).toBe(true)
  })

  it('退回本地预览时必须标记 localOnly（界面据此给出解释，而不是显示「暂无图片」）', () => {
    // 这条是防回归的核心：把 localOnly 去掉，界面就会在「已上传成功」时显示「暂无图片」
    const result = resolveImageDisplay({ serverUrls: [], localUrls: ['blob:x'] })
    expect(result.localOnly).toBe(true)
  })

  it('两边都空时是真正的空态，不算降级', () => {
    const result = resolveImageDisplay({ serverUrls: [], localUrls: [] })
    expect(result.images).toEqual([])
    expect(result.localOnly).toBe(false)
  })

  it('过滤掉空字符串，避免渲染出空地址的图片', () => {
    const result = resolveImageDisplay({
      serverUrls: ['', 'https://gw/a.jpg'],
      localUrls: [''],
    })
    expect(result.images).toEqual(['https://gw/a.jpg'])
    expect(result.localOnly).toBe(false)
  })

  it('服务端只返回空串时不算可用，仍应退回本地预览', () => {
    const result = resolveImageDisplay({ serverUrls: [''], localUrls: ['blob:x'] })
    expect(result.images).toEqual(['blob:x'])
    expect(result.localOnly).toBe(true)
  })

  it('服务端可用时忽略本地预览，避免同一张图重复渲染', () => {
    const result = resolveImageDisplay({
      serverUrls: ['https://gw/a.jpg'],
      localUrls: ['blob:local-1'],
    })
    expect(result.images).toHaveLength(1)
  })
})
