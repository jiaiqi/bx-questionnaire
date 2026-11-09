/**
 * 嵌入场景下同步 iframe 高度
 *
 * 嵌入页面不知道父页面给多高，内容变长会被裁掉，所以按平台契约发
 * `RESIZE`（`data.height`）让父页面调整 `iframe.style.height`。
 *
 * 老工程是在 `survey/result.vue` 里 `watch` 建议列表后发
 * `{type:'height', value: scrollHeight}` —— 只覆盖一个页面、且消息类型不在契约内。
 * 这里改成通用 composable：任何可能变高的页面接一行即可。
 *
 * ⚠️ 作答页**不要**让宿主按这个高度撑高 iframe。
 *
 * 本页是「iframe 内部自己滚动」的整页应用，吸底操作栏（`.runner__footer`）用
 * `position: fixed` 相对 **iframe 视口**贴底。宿主若把 iframe 撑到内容全高
 * （这里报的是整页 `scrollHeight`，常见 8000+ px），`fixed` 就会贴到内容末端，
 * 按钮跑到页面最下方、滚动时才偶尔露面。
 *
 * 正确的宿主做法是：iframe 高度固定等于「屏幕可视区 - 宿主自己的标题栏」
 * （H5 宿主用 `calc(100vh - var(--window-top) - var(--window-bottom))`），
 * 让子页自己滚。`RESIZE` 只用于**非吸底**的长内容页（结果页、建议页）。
 */

import { onMounted, onUnmounted } from 'vue'

import { isEmbedded, notifyParent } from '@/utils/embed'

/**
 * 同时只允许一个观察者
 *
 * uni-app H5 的页面销毁时机与 `onUnmounted` 不完全对齐，若只依赖组件卸载来
 * `disconnect`，多次进出页面会累积观察者。这里用模块级单例兜底：
 * 新页面接管时先断开旧的。
 */
let activeObserver: ResizeObserver | null = null
let lastReportedHeight = 0

function stopObserving(): void {
  activeObserver?.disconnect()
  activeObserver = null
}

/** 读取当前文档高度（取 html 与 body 的较大值） */
function readDocumentHeight(): number {
  const html = document.documentElement?.scrollHeight ?? 0
  const body = document.body?.scrollHeight ?? 0
  return Math.max(html, body)
}

export function useEmbedResize(): void {
  // #ifdef H5
  if (typeof window === 'undefined' || !isEmbedded()) {
    return
  }
  // 老浏览器 / 单测桩里可能没有 ResizeObserver
  if (typeof ResizeObserver === 'undefined') {
    return
  }

  onMounted(() => {
    stopObserving()
    lastReportedHeight = 0

    const report = (): void => {
      const height = readDocumentHeight()
      // 高度为 0 说明还没渲染完；高度没变就不发，避免图片加载抖动时刷屏
      if (height > 0 && height !== lastReportedHeight) {
        lastReportedHeight = height
        notifyParent('RESIZE', { height })
      }
    }

    activeObserver = new ResizeObserver(report)
    // 观察 documentElement：body 高度由内容撑开，html 会跟着变
    activeObserver.observe(document.documentElement)
    // 首次进入时 ResizeObserver 会回调一次，但内容异步加载后再补一次更稳
    report()
  })

  onUnmounted(() => {
    stopObserving()
  })
  // #endif
}
