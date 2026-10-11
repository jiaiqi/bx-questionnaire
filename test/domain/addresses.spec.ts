import { describe, expect, it } from 'vitest'

import {
  addressAnswerTargets,
  buildAreaColumns,
  buildAreaTree,
  pickAreaLabel,
} from '@/domain/questionnaire/addresses'

/**
 * 一棵小树：
 *   bxq99（省）→ bxq9901（市A）→ bxq990101（区A1）
 *                             → bxq990102（区A2）
 *              → bxq9902（市B）
 *   bxq98（另一个省，孤立）
 */
const ROWS = [
  { no: 'bxq99', name: 'bxq测试省', parent_no: '0' },
  { no: 'bxq9901', name: 'bxq测试市A', parent_no: 'bxq99' },
  { no: 'bxq9902', name: 'bxq测试市B', parent_no: 'bxq99' },
  { no: 'bxq990101', name: 'bxq测试区A1', parent_no: 'bxq9901' },
  { no: 'bxq990102', name: 'bxq测试区A2', parent_no: 'bxq9901' },
  { no: 'bxq98', name: 'bxq另一个省', parent_no: '0' },
]

describe('buildAreaTree', () => {
  it('顶层只包含根，不把整张表都当第一列', () => {
    const tree = buildAreaTree(ROWS)
    // 这条是防回归的核心：第一版把无条件查询的整张表当第一列，省/市/区全混在一起
    expect(tree.roots.map(n => n.no)).toEqual(['bxq99', 'bxq98'])
  })

  it('按 parent_no 建出下级', () => {
    const tree = buildAreaTree(ROWS)
    expect(tree.childrenOf('bxq99').map(n => n.no)).toEqual(['bxq9901', 'bxq9902'])
    expect(tree.childrenOf('bxq9901').map(n => n.no)).toEqual(['bxq990101', 'bxq990102'])
    expect(tree.childrenOf('bxq990101')).toEqual([])
  })

  it('根标记不写死：parent_no 为空或指向不存在的节点都算根', () => {
    // 生产用什么标记无从得知，所以两种约定都要能命中
    const tree = buildAreaTree([
      { no: 'a', name: 'A', parent_no: '0' },
      { no: 'b', name: 'B', parent_no: null },
      { no: 'c', name: 'C', parent_no: '' },
      { no: 'd', name: 'D', parent_no: '不存在' },
      { no: 'a1', name: 'A1', parent_no: 'a' },
    ])
    expect(tree.roots.map(n => n.no)).toEqual(['a', 'b', 'c', 'd'])
    expect(tree.childrenOf('a').map(n => n.no)).toEqual(['a1'])
  })

  it('标签优先 path_name，回退 name，最后才是编号', () => {
    const tree = buildAreaTree([
      { no: 'a', name: '甲', path_name: '省/市', parent_no: '0' },
      { no: 'b', name: '乙', parent_no: '0' },
      { no: 'c', parent_no: '0' },
    ])
    expect(tree.roots.map(n => n.label)).toEqual(['省/市', '乙', 'c'])
  })

  it('丢掉没有编号的行', () => {
    const tree = buildAreaTree([
      { no: '', name: '没编号' },
      { no: 'a', name: 'A', parent_no: '0' },
    ])
    expect(tree.roots.map(n => n.no)).toEqual(['a'])
  })
})

describe('buildAreaColumns', () => {
  const tree = buildAreaTree(ROWS)

  it('路径为空时只有顶层一列', () => {
    const columns = buildAreaColumns(tree, [])
    expect(columns).toHaveLength(1)
    expect(columns[0]!.map(n => n.no)).toEqual(['bxq99', 'bxq98'])
  })

  it('沿路径逐级展开', () => {
    const columns = buildAreaColumns(tree, ['bxq99', 'bxq9901'])
    expect(columns.map(col => col.map(n => n.no))).toEqual([
      ['bxq99', 'bxq98'],
      ['bxq9901', 'bxq9902'],
      ['bxq990101', 'bxq990102'],
    ])
  })

  it('路径走到叶子时不再产生新列', () => {
    const columns = buildAreaColumns(tree, ['bxq99', 'bxq9901', 'bxq990101'])
    expect(columns).toHaveLength(3)
  })

  it('路径中途遇到不存在的节点就停在那一级', () => {
    const columns = buildAreaColumns(tree, ['bxq98'])
    expect(columns).toHaveLength(1)
  })
})

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
