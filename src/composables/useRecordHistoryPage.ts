/**
 * 作答记录页的页面级适配
 *
 * `history/history` 与 `survey/history` 是两个入口，路由即文件路径，所以必须是两个
 * 页面文件；但页面逻辑（读参数、触底加载、下拉刷新）完全一样，放在这里共用。
 *
 * 页面级生命周期（`onLoad` / `onReachBottom` / `onPullDownRefresh`）只能在页面里调用，
 * 但可以在 `setup()` 期间经由 composable 注册 —— 这正是把它抽出来的理由：
 * 两个页面各自抄一遍，改动时必然漏一处。
 */

import type { Ref } from 'vue'

import type RecordHistory from '@/components/questionnaire/RecordHistory.vue'
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'

import { ref } from 'vue'

import { readQuery } from '@/utils/query'

export interface RecordHistoryPage {
  activityNo: Ref<string>
  title: Ref<string>
  pageRef: Ref<InstanceType<typeof RecordHistory> | undefined>
}

/**
 * 本 composable 依赖的页面级配置
 *
 * `onPullDownRefresh` 只有在页面声明了 `enablePullDownRefresh` 时才会触发，而声明必须
 * 写在页面文件的 `definePage` 宏里（编译期），composable 运行时改不了它。导出这份常量
 * 给单测做一致性校验：页面漏声明时测试变红，而不是运行时静默失效。
 *
 * **`definePage` 必须用 `style` 嵌套**：写成扁平键能通过类型检查、也会写进 pages.json，
 * 但 uni-app 只读 `style`，小程序端 page json 拿不到 —— 是彻底的静默失效（实测踩过）。
 *
 * **H5 端加完这条配置要重启 dev server**：uni-app 把
 * `__UNI_FEATURE_PULL_DOWN_REFRESH__` 做成**编译期特性开关**，由 pages.json 里有没有
 * `style.enablePullDownRefresh` 推导，并在 dev server 启动时烘进 bundle。不重启的话
 * 整段下拉刷新会被 tree-shake 掉，表现是「手势没反应」而不是报错 —— 实测踩过：
 * 重启前手势 0 反应，重启后正常触发重新拉取。
 */
export const RECORD_HISTORY_PAGE_STYLE = { enablePullDownRefresh: true } as const

export function useRecordHistoryPage(defaultTitle = '作答记录'): RecordHistoryPage {
  const activityNo = ref('')
  const title = ref(defaultTitle)
  const pageRef = ref<InstanceType<typeof RecordHistory>>()

  onLoad((query) => {
    activityNo.value = readQuery(query, 'activity_no')
    title.value = readQuery(query, 'title', defaultTitle)
  })

  onReachBottom(() => {
    void pageRef.value?.loadMore()
  })

  /**
   * 下拉刷新
   *
   * 老工程 history.vue 有 `onPullDownRefresh`：重置分页后重新拉第一页。
   * 新工程此前只有触底加载 —— 列表出错、或想看到最新记录时，用户没有手动刷新的入口。
   *
   * `stopPullDownRefresh` 必须调用，否则原生下拉指示器一直转；等刷新真正结束再停，
   * 否则用户看到的是「转一下就说好了」，而数据其实还在路上。
   *
   * 用 `finally` 而不是 `catch`：指示器一定要收，但异常**刻意不吞** —— 真正坏掉的刷新
   * 应该可见，而不是被静默掩盖。实际不会走到：`RecordList.fetchPage` 内部已 catch 并
   * 转成页面错误态，所以 `refresh()` 正常不 reject。
   */
  onPullDownRefresh(async () => {
    try {
      await pageRef.value?.refresh()
    }
    finally {
      uni.stopPullDownRefresh()
    }
  })

  return { activityNo, title, pageRef }
}
