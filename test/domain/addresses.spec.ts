import { describe, expect, it } from 'vitest'

import { addressAnswerTargets, pickAreaLabel } from '@/domain/questionnaire/addresses'

describe('pickAreaLabel', () => {
  it('优先取 path_name', () => {
    expect(pickAreaLabel([{ no: 'bxq99', name: 'bxq测试省', path_name: '省/市/区' }], 'bxq99'))
      .toBe('省/市/区')
  })

  it('path_name 为空时回退到 name（实测本环境 path_name 为 null，这层是必需的）', () => {
    expect(pickAreaLabel([{ no: 'bxq99', name: 'bxq测试省', path_name: null }], 'bxq99'))
      .toBe('bxq测试省')
    expect(pickAreaLabel([{ no: 'bxq99', name: 'bxq测试省' }], 'bxq99'))
      .toBe('bxq测试省')
  })

  it('只按 no 匹配，不匹配的行不参与', () => {
    expect(pickAreaLabel([
      { no: 'other', name: '别的' },
      { no: 'bxq99', name: 'bxq测试省' },
    ], 'bxq99')).toBe('bxq测试省')
  })

  it('查不到或名称全空时回退到编号（不显示空白，空白会被当成未作答）', () => {
    expect(pickAreaLabel([], 'bxq99')).toBe('bxq99')
    expect(pickAreaLabel([{ no: 'bxq99', name: '   ', path_name: '' }], 'bxq99')).toBe('bxq99')
  })
})

describe('addressAnswerTargets', () => {
  it('只挑地址题，非地址题一律忽略', () => {
    const targets = addressAnswerTargets([
      { key: 'a', widget: 'radio', value: '1' },
      { key: 'b', widget: 'address', value: 'bxq99' },
      { key: 'c', widget: 'image', value: 'batch-1' },
    ])
    expect(targets).toEqual([{ key: 'b', no: 'bxq99' }])
  })

  it('没作答时不产生目标（不该白查一次地区服务）', () => {
    expect(addressAnswerTargets([
      { key: 'b', widget: 'address', value: '' },
      { key: 'c', widget: 'address', value: null },
      { key: 'd', widget: 'address', value: [] },
      { key: 'e', widget: 'address', value: '   ' },
    ])).toEqual([])
  })

  it('多值去重且去掉首尾空白', () => {
    expect(addressAnswerTargets([
      { key: 'b', widget: 'address', value: [' bxq99 ', 'bxq9901', 'bxq99'] },
    ])).toEqual([
      { key: 'b', no: 'bxq99' },
      { key: 'b', no: 'bxq9901' },
    ])
  })
})
