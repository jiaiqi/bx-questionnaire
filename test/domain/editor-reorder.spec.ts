import { describe, expect, it } from 'vitest'

import { dropIndexAt, moveDown, moveInArray, moveUp } from '@/domain/editor/reorder'

describe('moveInArray · 把元素搬到目标位置', () => {
  it('前移与后移都把元素搬到目标位置，其余保持相对顺序', () => {
    expect(moveInArray(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveInArray(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('原地移动返回同一个引用', () => {
    // 调用方用 result === list 判断「这次拖拽没有产生变化」，从而跳过无意义的保存
    const list = ['a', 'b', 'c']
    expect(moveInArray(list, 0, 0)).toBe(list)
    expect(moveInArray(list, 1, 1)).toBe(list)
  })

  it('越界返回同一个引用，而不是抛错或产生错位的新数组', () => {
    const list = ['a', 'b', 'c']
    expect(moveInArray(list, -1, 1)).toBe(list)
    expect(moveInArray(list, 1, -1)).toBe(list)
    expect(moveInArray(list, 3, 1)).toBe(list)
    expect(moveInArray(list, 1, 3)).toBe(list)
  })

  it('返回新数组，不原地改', () => {
    // 编辑器把文档放在响应式状态里，就地 splice 在 ref 包裹的数组上可能漏掉深层依赖
    const list = ['a', 'b', 'c']
    const next = moveInArray(list, 0, 2)
    expect(next).toEqual(['b', 'c', 'a'])
    expect(next).not.toBe(list)
    expect(list).toEqual(['a', 'b', 'c'])
  })
})

describe('moveUp / moveDown · 上下移动一位', () => {
  it('moveUp 前移一位', () => {
    expect(moveUp(['a', 'b', 'c'], 2)).toEqual(['a', 'c', 'b'])
    expect(moveUp(['a', 'b', 'c'], 1)).toEqual(['b', 'a', 'c'])
  })

  it('已在首位时原样返回同一个引用', () => {
    const list = ['a', 'b', 'c']
    expect(moveUp(list, 0)).toBe(list)
  })

  it('moveDown 后移一位', () => {
    expect(moveDown(['a', 'b', 'c'], 0)).toEqual(['b', 'a', 'c'])
    expect(moveDown(['a', 'b', 'c'], 1)).toEqual(['a', 'c', 'b'])
  })

  it('已在末位时原样返回同一个引用', () => {
    const list = ['a', 'b', 'c']
    expect(moveDown(list, list.length - 1)).toBe(list)
  })
})

describe('dropIndexAt · 指针位置 → 目标下标', () => {
  it('指针落在第 2 行区间内返回 2（行区间是 [n*h, (n+1)*h)）', () => {
    // 行高 40、列表顶边 0：第 2 行是 [80, 120)
    expect(dropIndexAt(80, 0, 40, 5)).toBe(2)
    expect(dropIndexAt(85, 0, 40, 5)).toBe(2)
    expect(dropIndexAt(119, 0, 40, 5)).toBe(2)
    // 列表顶边不在 0 时按 listTop 平移
    expect(dropIndexAt(80 + 85, 80, 40, 5)).toBe(2)
    // 刚跨过第 2 行下边界就落到第 3 行
    expect(dropIndexAt(120, 0, 40, 5)).toBe(3)
  })

  it('负数钳到 0（指针在列表上方时落到第一行）', () => {
    expect(dropIndexAt(-100, 0, 40, 5)).toBe(0)
    expect(dropIndexAt(-1, 0, 40, 5)).toBe(0)
    expect(dropIndexAt(79, 80, 40, 5)).toBe(0)
  })

  it('超出末尾钳到 count - 1（指针在列表下方时落到最后一行）', () => {
    // 不钳的话会算出 >= count 的下标，splice 会把它插到末尾之外
    expect(dropIndexAt(40 * 99, 0, 40, 5)).toBe(4)
    expect(dropIndexAt(40 * 5, 0, 40, 5)).toBe(4)
  })

  it('count 为 0 或行高非法时返回 0，不做除零', () => {
    // 空列表没有任何可落点；除零会得到 Infinity / NaN 再传给 splice
    expect(dropIndexAt(0, 0, 0, 5)).toBe(0)
    expect(dropIndexAt(100, 0, 0, 5)).toBe(0)
    expect(dropIndexAt(100, 0, -10, 5)).toBe(0)
    expect(dropIndexAt(100, 0, 40, 0)).toBe(0)
    expect(dropIndexAt(100, 0, 40, -3)).toBe(0)
  })
})
