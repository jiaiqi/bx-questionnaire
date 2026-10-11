/**
 * 问卷列表页的数据逻辑
 *
 * ## 分页放在服务端
 *
 * 实测 `srvdaq_activity_cfg_select` 的分页是**真的**（`pageNo=1/2/3` 各返回 5 行、
 * 两两重叠 0 行，`page.total` 与实际总数一致），所以不需要「一次拉 500 条再前端切页」
 * 这种把数据量赌在总数上的做法。
 *
 * ## 排序只能靠服务端的默认顺序
 *
 * 三张配置表都**不接受 `order`**（传任何排序都返回 `FAILURE 系统繁忙，请稍后再试`），
 * 所以「最新在前」只能依赖平台默认顺序 —— 实测空条件返回的行确实是
 * `activity_no` 递减（即创建时间倒序）。这是**观测到的行为而不是文档承诺**，
 * 因此这里不去二次排序：若哪天平台换了默认顺序，界面顺序会变，但不会出错；
 * 若我们自己在客户端按 `create_time` 排序，就会把服务端分页切碎
 * （第 1 页和第 2 页各自排序后再拼起来，整体并不是有序的）。
 */

import type { ComputedRef, Ref } from 'vue'
import type { DaqActivityRow } from '@/api/daq/types'

import { computed, ref } from 'vue'

import { activityDelete, activityListSelect } from '@/api/daq/editor'
import { BxError } from '@/utils/request'

/** 每页条数 */
export const EDITOR_LIST_PAGE_SIZE = 10

/** 状态下拉选项（枚举实测值） */
export const ACTIVITY_STATUS_OPTIONS = ['未开始', '进行中', '已结束'] as const

export interface EditorListController {
  rows: Ref<DaqActivityRow[]>
  total: Ref<number>
  pageNo: Ref<number>
  pageCount: ComputedRef<number>
  hasPrev: ComputedRef<boolean>
  hasNext: ComputedRef<boolean>
  keyword: Ref<string>
  status: Ref<string>
  loading: Ref<boolean>
  loaded: Ref<boolean>
  errorMessage: Ref<string>
  load: (target?: number) => Promise<void>
  search: () => Promise<void>
  reset: () => Promise<void>
  goPrev: () => Promise<void>
  goNext: () => Promise<void>
  remove: (activityNo: string) => Promise<void>
}

export function useEditorList(): EditorListController {
  const rows = ref<DaqActivityRow[]>([])
  const total = ref(0)
  const pageNo = ref(1)
  const keyword = ref('')
  const status = ref('')
  const loading = ref(false)
  const loaded = ref(false)
  const errorMessage = ref('')

  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / EDITOR_LIST_PAGE_SIZE)))
  const hasPrev = computed(() => pageNo.value > 1)
  const hasNext = computed(() => pageNo.value < pageCount.value)

  /**
   * 拉取某一页
   *
   * 失败时**清空列表**而不是保留上一次的结果：留着旧行再配一条错误提示，
   * 用户会把旧行当成搜索结果。同时把 `pageNo` 提前设为目标页，
   * 让分页器显示的是「你想去的那一页失败了」，而不是一个自相矛盾的状态。
   */
  async function load(target = 1): Promise<void> {
    loading.value = true
    errorMessage.value = ''
    pageNo.value = target

    try {
      const envelope = await activityListSelect({
        title: keyword.value.trim() || undefined,
        status: status.value || undefined,
        pageNo: target,
        rownumber: EDITOR_LIST_PAGE_SIZE,
      })
      rows.value = envelope.data ?? []
      const pageTotal = envelope.page?.total
      // `page.total` 实测存在；缺失时退化成「只有一页」，宁可少翻页也不要算出假页数
      total.value = typeof pageTotal === 'number' ? pageTotal : rows.value.length
    }
    catch (error) {
      rows.value = []
      total.value = 0
      errorMessage.value = error instanceof BxError ? error.message : '问卷列表加载失败'
    }
    finally {
      loading.value = false
      loaded.value = true
    }
  }

  /** 重新从第一页查（搜索条件变化时用） */
  async function search(): Promise<void> {
    await load(1)
  }

  /** 清空搜索条件并回到第一页 */
  async function reset(): Promise<void> {
    keyword.value = ''
    status.value = ''
    await load(1)
  }

  async function goPrev(): Promise<void> {
    if (hasPrev.value) {
      await load(pageNo.value - 1)
    }
  }

  async function goNext(): Promise<void> {
    if (hasNext.value) {
      await load(pageNo.value + 1)
    }
  }

  /**
   * 删除一份问卷
   *
   * 删完**重新拉当前页**而不是本地摘掉一行：本地摘掉会让「共 N 条」与实际不符，
   * 而且当前页最后一条被删后本页就空了。若删的正好是本页最后一条且不在第一页，
   * 则退到上一页。
   *
   * 删除失败**不吞异常**：调用方要能提示「删除失败」，而不是界面照旧显示那一行。
   */
  async function remove(activityNo: string): Promise<void> {
    await activityDelete([activityNo])
    const target = rows.value.length <= 1 && pageNo.value > 1 ? pageNo.value - 1 : pageNo.value
    await load(target)
  }

  return {
    rows,
    total,
    pageNo,
    pageCount,
    hasPrev,
    hasNext,
    keyword,
    status,
    loading,
    loaded,
    errorMessage,
    load,
    search,
    reset,
    goPrev,
    goNext,
    remove,
  }
}
