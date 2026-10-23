/**
 * 长列表分片渲染（前缀窗口）
 *
 * ## 解决什么
 *
 * 题纲、作答记录这类列表一次可能加载上百条。全部渲染时 DOM 节点数与条数成正比：
 * 每道题纲约 20 个节点、每条记录约 15 个，100 条就是 1500–2000 个节点 ——
 * 小程序端首屏渲染会明显掉帧，H5 滚动也会变钝。
 *
 * 这里**只渲染前 `renderedCount` 条**，滚动到底 / 点「加载更多」再追加一屏。
 * 刻意**不做虚拟滚动**：虚拟滚动要求行高固定 + 滚动容器由组件自己接管，
 * 而记录列表挂在页面级滚动上（`onReachBottom` / 下拉刷新）、题纲行还带拖拽重排
 * （落点按固定行高反算）。未经真机验证的虚拟滚动会把这两件事一起弄坏，
 * 收益却只是省掉几十个节点 —— 分片已经足够。
 *
 * ## 为什么是「前缀」而不是滑动窗口
 *
 * 渲染 0..N-1 这一段前缀时，**下标与原数组完全一致**：
 * - 题纲的拖拽落点按 `index × 行高` 反算，前缀渲染不改变行位置；
 * - 选中态、上下移、删除都直接用原下标，不需要做「窗口偏移」换算。
 * 滑动窗口（只渲染中间一段）会同时破坏这两点，除非把拖拽与选中逻辑整体重写。
 *
 * ## 与数据分页的关系
 *
 * 本 composable 只管**渲染条数**，不管请求。列表自己决定什么时候拉下一页：
 * 通常是「本地还有未渲染的条数就先放出来，放完了再请求下一页」。
 * `total` 传响应式取值函数，数据增长后 `hasMore` 自动跟上。
 */

import type { ComputedRef, Ref } from 'vue'

import { computed, ref } from 'vue'

/** 首屏渲染条数：20 条已能填满一屏，再多用户也看不到 */
export const CHUNK_INITIAL = 20

/** 每次追加条数 */
export const CHUNK_STEP = 20

export interface ChunkedListOptions {
  /** 数据总量（响应式取值函数，内部读 ref/computed 即可自动跟踪） */
  total: () => number
  /** 首屏渲染条数，默认 {@link CHUNK_INITIAL} */
  initial?: number
  /** 每次追加条数，默认 {@link CHUNK_STEP} */
  step?: number
}

export interface ChunkedListController {
  /** 当前渲染窗口的上界（可能大于总量，读取时用 renderedCount 更安全） */
  visibleCount: Ref<number>
  /** 实际可渲染条数：`min(visibleCount, total)` */
  renderedCount: ComputedRef<number>
  /** 是否还有未渲染的数据 */
  hasMore: ComputedRef<boolean>
  /** 还有多少条未渲染（用于「加载更多（还有 N 条）」文案） */
  remaining: ComputedRef<number>
  /** 追加一屏；真的追加了才返回 true */
  loadMore: () => boolean
  /** 展开到至少包含第 index 条（选中 / 拖拽落点 / 校验定位用）；展开返回 true */
  ensureVisible: (index: number) => boolean
  /** 回到首屏条数（筛选变化、刷新、切换数据集时用） */
  reset: () => void
}

function positiveInt(value: number | undefined, fallback: number): number {
  const normalized = Math.floor(Number(value))
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback
}

export function useChunkedList(options: ChunkedListOptions): ChunkedListController {
  const initial = positiveInt(options.initial, CHUNK_INITIAL)
  const step = positiveInt(options.step, CHUNK_STEP)

  /** 渲染窗口上界；只增不减，数据变少时由 renderedCount 夹住 */
  const visibleCount = ref(initial)

  const total = computed(() => Math.max(0, Math.floor(Number(options.total())) || 0))

  const renderedCount = computed(() => Math.min(visibleCount.value, total.value))
  const hasMore = computed(() => renderedCount.value < total.value)
  const remaining = computed(() => Math.max(0, total.value - renderedCount.value))

  /**
   * 追加一屏
   *
   * 基于 `renderedCount` 而不是 `visibleCount` 推进：数据从 100 条变成 3 条再变回
   * 100 条时，从当前实际渲染位置继续追加，不会一次放出旧的窗口大小。
   */
  function loadMore(): boolean {
    if (!hasMore.value) {
      return false
    }
    visibleCount.value = Math.min(renderedCount.value + step, total.value)
    return true
  }

  /**
   * 展开到包含第 index 条
   *
   * 越界与负数一律忽略：调用方可能拿着「已删除题目」的旧下标。
   * 只展开不收缩 —— 用户已经看过的行不该因为选中了靠前的一题而消失。
   */
  function ensureVisible(index: number): boolean {
    const target = Math.floor(Number(index)) + 1
    if (!Number.isFinite(target) || target <= 0) {
      return false
    }
    const before = renderedCount.value
    if (target <= before) {
      return false
    }
    visibleCount.value = Math.min(Math.max(target, before), total.value)
    return renderedCount.value > before
  }

  function reset(): void {
    visibleCount.value = initial
  }

  return { visibleCount, renderedCount, hasMore, remaining, loadMore, ensureVisible, reset }
}
