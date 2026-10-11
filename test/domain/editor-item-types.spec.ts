import { describe, expect, it } from 'vitest'

import {
  isKnownItemType,
  ITEM_TYPE_SPECS,
  ITEM_TYPES,
  itemTypeSpec,
  MAX_OPTIONS,
  optionViewNo,
  typeHasOptions,
} from '@/domain/editor/itemTypes'

describe('itemTypes · ITEM_TYPES 本部署支持的题型', () => {
  it('恰好 9 个值，且整份列表与题型面板顺序一致', () => {
    // 写死 9 与整份列表：取值来自元数据逐值探测，多一个（服务端新开枚举）或少一个
    // 都意味着编辑器与平台枚举脱节，必须显式改这条测试而不是被自动带上
    expect(ITEM_TYPES).toHaveLength(9)
    expect([...ITEM_TYPES]).toEqual([
      '单选',
      '多选',
      '文本',
      '数字',
      '时间日期',
      '图片',
      '选项',
      '地址',
      '引用',
    ])
  })

  it('不包含「分节符」：本部署逐值写入探测时它被拒，编辑器因此不提供', () => {
    // 防回归：老工程用过分节符，若有人「顺手加回来」，用户一保存就会在平台侧失败
    expect(ITEM_TYPES).not.toContain('分节符')
    expect(isKnownItemType('分节符')).toBe(false)
  })

  it('每个题型都有对应 spec，且 spec 顺序与 ITEM_TYPES 一致', () => {
    // 两份列表分叉时，题型面板会漏项或错位
    expect(ITEM_TYPE_SPECS).toHaveLength(9)
    expect(ITEM_TYPE_SPECS.map(spec => spec.type)).toEqual([...ITEM_TYPES])
  })
})

describe('optionViewNo · 选项展示标识', () => {
  it('0 → A、1 → B、25 → Z，正好覆盖平台 A..Z 的枚举边界', () => {
    expect(optionViewNo(0)).toBe('A')
    expect(optionViewNo(1)).toBe('B')
    expect(optionViewNo(25)).toBe('Z')
  })

  it('越界返回空串，而不是造一个平台枚举里没有的值', () => {
    // 第 27 个选项（下标 26）没有可用标识：返回空串交给校验层报「不能超过 26 个」，
    // 比生成 '[' 这种会被平台拒绝的字符安全
    expect(optionViewNo(26)).toBe('')
    expect(optionViewNo(-1)).toBe('')
    // 上限写死 26：它就是 A..Z 的枚举边界，不是前端随手定的
    expect(MAX_OPTIONS).toBe(26)
  })
})

describe('typeHasOptions · 哪些题型带选项列表', () => {
  it('只有单选 / 多选 / 选项为 true', () => {
    for (const type of ['单选', '多选', '选项']) {
      expect(typeHasOptions(type), `${type} 应带选项列表`).toBe(true)
    }
    for (const type of ['文本', '数字', '时间日期', '图片', '地址', '引用']) {
      expect(typeHasOptions(type), `${type} 不应带选项列表`).toBe(false)
    }
  })

  it('未知题型按「没有选项」处理，而不是抛错或默认给选项', () => {
    // 默认 true 会让未知题型渲染出选项编辑器并写出无意义的 option_data
    expect(typeHasOptions('分节符')).toBe(false)
    expect(typeHasOptions('')).toBe(false)
  })
})

describe('isKnownItemType / itemTypeSpec · 未知题型必须可识别', () => {
  it('已知题型为 true，未知为 false', () => {
    expect(isKnownItemType('单选')).toBe(true)
    expect(isKnownItemType('引用')).toBe(true)
    expect(isKnownItemType('分节符')).toBe(false)
    expect(isKnownItemType('未知题型')).toBe(false)
  })

  it('未知题型查不到 spec（调用方应报错而不是静默降级）', () => {
    expect(itemTypeSpec('未知题型')).toBeUndefined()
    expect(itemTypeSpec('分节符')).toBeUndefined()
    expect(itemTypeSpec('单选')?.hasOptions).toBe(true)
  })
})
