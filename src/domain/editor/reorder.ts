/**
 * 数组重排（纯函数）
 *
 * 拖拽与上下移动按钮共用同一套语义：**都是「把某个位置搬到另一个位置」**。
 * 上下移动只是 `from = index`、`to = index ± 1` 的特例，所以只有一份实现 ——
 * 两套实现最容易出现的分歧是「越界时一个静默不动、一个抛错」。
 *
 * 一律返回**新数组**（不原地改）：编辑器把文档放在响应式状态里，
 * 原地 `splice` 在 Vue 3 的 `reactive` 下能触发更新，但在 `ref` 包裹的普通数组上
 * 有时会漏掉深层依赖；统一换成新数组最稳。
 */

/**
 * 把 `from` 位置的元素搬到 `to` 位置
 *
 * 越界或原地移动时**原样返回**（同一个引用），调用方可以用 `result === list`
 * 判断「这次拖拽没有产生变化」，从而跳过无意义的保存。
 */
export function moveInArray<T>(list: T[], from: number, to: number): T[] {
  if (from === to) {
    return list
  }
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) {
    return list
  }
  const next = [...list]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) {
    return list
  }
  next.splice(to, 0, moved)
  return next
}

/** 上移一位（已在首位时原样返回） */
export function moveUp<T>(list: T[], index: number): T[] {
  return moveInArray(list, index, index - 1)
}

/** 下移一位（已在末位时原样返回） */
export function moveDown<T>(list: T[], index: number): T[] {
  return moveInArray(list, index, index + 1)
}

/**
 * 指针纵坐标 → 目标下标
 *
 * 编辑器用**等高行**渲染题目列表与选项列表（标题单行省略），
 * 于是「指针在第几行」可以精确算出来，不需要逐行测量 DOM 矩形 ——
 * 后者在拖拽过程中要反复查询布局，既卡顿又在跨端（H5 / 小程序）行为不一致。
 *
 * 之所以能用等高行：行高固定、行间用 `border-bottom` 而不是 `margin`，
 * 所以第 `n` 行的区间是 `[n * rowHeight, (n + 1) * rowHeight)`。
 *
 * 调用方（`usePointerReorder`）**不量真实列表位置**，而是用
 * `listTop = 按下点Y - 起始下标 × 行高` 合成一个「虚拟列表顶部」，
 * 把按下点当作被拖行的上边缘。这样落点只取决于相对位移，
 * 彻底去掉了「查 DOM 失败 → 落点算错」这条静默失败路径。
 *
 * 用 `floor` 而不是 `round`：必须拖满一行才换位，手感可预测
 * （拖不满一行时松手即回到原位）。
 */
export function dropIndexAt(
  pointerY: number,
  listTop: number,
  rowHeight: number,
  count: number,
): number {
  if (rowHeight <= 0 || count <= 0) {
    return 0
  }
  const raw = Math.floor((pointerY - listTop) / rowHeight)
  return Math.min(Math.max(raw, 0), count - 1)
}
