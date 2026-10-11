import { describe, expect, it } from 'vitest'

import { imageAnswerTargets, resolveImageDisplay } from '@/domain/questionnaire/images'

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

describe('imageAnswerTargets', () => {
  it('只挑图片题，非图片题一律忽略', () => {
    const targets = imageAnswerTargets([
      { key: 'a', widget: 'radio', value: '1' },
      { key: 'b', widget: 'image', value: 'batch-1' },
      { key: 'c', widget: 'text', value: '备注' },
      { key: 'd', widget: 'address', value: 'bxq99' },
    ])
    expect(targets).toEqual([{ key: 'b', fileNo: 'batch-1' }])
  })

  it('图片题没作答时不产生目标（不该白查一次附件）', () => {
    expect(imageAnswerTargets([
      { key: 'b', widget: 'image', value: '' },
      { key: 'c', widget: 'image', value: null },
      { key: 'd', widget: 'image', value: undefined },
      { key: 'e', widget: 'image', value: [] },
      { key: 'f', widget: 'image', value: '   ' },
    ])).toEqual([])
  })

  it('多值逐个返回，同一题同一批次号去重', () => {
    const targets = imageAnswerTargets([
      { key: 'b', widget: 'image', value: ['batch-1', 'batch-2', 'batch-1'] },
    ])
    expect(targets).toEqual([
      { key: 'b', fileNo: 'batch-1' },
      { key: 'b', fileNo: 'batch-2' },
    ])
  })

  it('不同题目的同一个批次号各自保留（key 不同就是两处展示）', () => {
    const targets = imageAnswerTargets([
      { key: 'b', widget: 'image', value: 'batch-1' },
      { key: 'c', widget: 'image', value: 'batch-1' },
    ])
    expect(targets).toEqual([
      { key: 'b', fileNo: 'batch-1' },
      { key: 'c', fileNo: 'batch-1' },
    ])
  })

  it('值两边的空白会被去掉', () => {
    expect(imageAnswerTargets([{ key: 'b', widget: 'image', value: '  batch-1  ' }]))
      .toEqual([{ key: 'b', fileNo: 'batch-1' }])
  })
})
