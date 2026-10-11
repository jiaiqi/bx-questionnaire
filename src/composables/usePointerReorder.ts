/**
 * 指针拖拽重排（H5 触屏 / H5 鼠标 / 微信小程序）
 *
 * ## 为什么不用 HTML5 拖放（`draggable` + `dragstart`）
 *
 * 微信小程序**没有** HTML5 拖放 API。若 H5 用一套、小程序用另一套，就会出现
 * 「PC 上能拖、手机上不能拖」这种一半好用的状态，而两套逻辑的分歧只在真机上暴露。
 * 这里统一走**指针事件**：小程序只有触摸事件，H5 上触摸与鼠标都支持。
 *
 * ## 为什么用「指针位移 ÷ 行高」而不是量列表位置
 *
 * 第一版是「量一次列表顶部位置，再用 `floor((指针Y - 列表顶) / 行高)` 算落点」。
 * 那条路有两个坑，都实测过：
 *
 * 1. **量位置要 `uni.createSelectorQuery().in(instance)`**，而 `getCurrentInstance()`
 *    在事件回调里返回 `null`（它只在 `setup` 期间有值）——于是 `.in()` 拿到空值，
 *    查询静默失败、返回 `null`；
 * 2. 量不到位置时若退化成 0，落点会算错、把行搬到用户没指的位置，
 *    那是**静默改错数据**，比「这次拖不动」严重得多。
 *
 * 改为只用**相对位移**：
 *
 *     listTop := 按下点Y - 起始下标 × 行高
 *     落点     = dropIndexAt(当前Y, listTop, 行高, 行数)
 *
 * 等价的直观含义是「把按下点当作被拖行的上边缘」，于是：
 *
 * - 完全不需要查询 DOM，H5 与小程序同一条代码路径；
 * - 没有「量不到位置」这种失败态，也就不需要为它设计降级；
 * - 落点只取决于用户拖了多远，手指移回原处就回到原位（可撤销的手感）。
 *
 * 代价是「必须拖满一行才换位」（`dropIndexAt` 用的是 `floor` 而不是 `round`），
 * 这是可预测的：拖动量小于一行时松手即原位。
 */

import type { Ref } from 'vue'

import { ref } from 'vue'

import { dropIndexAt } from '@/domain/editor'

export interface PointerReorderOptions {
  /** 行高（px），必须与实际渲染高度一致 */
  rowHeight: number
  /** 当前行数 */
  count: () => number
  /** 落点确定后回调（`from === to` 时不会调用） */
  onDrop: (from: number, to: number) => void
}

export interface PointerReorderController {
  /** 是否正在拖拽 */
  dragging: Ref<boolean>
  /** 被拖起的行下标，-1 表示没有 */
  fromIndex: Ref<number>
  /** 当前落点下标，-1 表示没有 */
  overIndex: Ref<number>
  begin: (index: number, event: unknown) => void
  onMove: (event: unknown) => void
  onEnd: () => void
  onCancel: () => void
}

/**
 * 从触摸/鼠标事件里读纵坐标
 *
 * 读不到返回 `null` 而不是 0：0 是视口顶部的合法坐标，
 * 用它会让落点突然跳到第一行 —— 又一次静默改错数据。
 */
function readClientY(event: unknown): number | null {
  if (!event || typeof event !== 'object') {
    return null
  }
  const source = event as {
    touches?: Array<{ clientY?: number }>
    changedTouches?: Array<{ clientY?: number }>
    clientY?: number
  }
  // `touchend` 的 `touches` 是空数组，坐标在 `changedTouches` 里
  const touch = source.touches?.[0] ?? source.changedTouches?.[0]
  const value = touch?.clientY ?? source.clientY
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function usePointerReorder(options: PointerReorderOptions): PointerReorderController {
  const dragging = ref(false)
  const fromIndex = ref(-1)
  const overIndex = ref(-1)

  /** 按下时的纵坐标；用它反推「虚拟列表顶部」，避免查询 DOM */
  let startY = 0

  function begin(index: number, event: unknown): void {
    if (dragging.value) {
      return
    }
    const y = readClientY(event)
    if (y === null) {
      // 读不到按下坐标就不进入拖拽态：静默进入会得到一个算不准的落点
      return
    }
    startY = y
    dragging.value = true
    fromIndex.value = index
    overIndex.value = index
  }

  function onMove(event: unknown): void {
    if (!dragging.value) {
      return
    }
    const y = readClientY(event)
    if (y === null) {
      return
    }
    const listTop = startY - fromIndex.value * options.rowHeight
    overIndex.value = dropIndexAt(y, listTop, options.rowHeight, options.count())
  }

  function onEnd(): void {
    if (!dragging.value) {
      return
    }
    const from = fromIndex.value
    const to = overIndex.value
    dragging.value = false
    fromIndex.value = -1
    overIndex.value = -1
    if (from >= 0 && to >= 0 && from !== to) {
      options.onDrop(from, to)
    }
  }

  /** 取消（`touchcancel`）：不触发落点回调，顺序原样保留 */
  function onCancel(): void {
    dragging.value = false
    fromIndex.value = -1
    overIndex.value = -1
  }

  return { dragging, fromIndex, overIndex, begin, onMove, onEnd, onCancel }
}
