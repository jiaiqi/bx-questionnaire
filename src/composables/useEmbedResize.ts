/**
 * 嵌入场景下同步 iframe 高度
 *
 * 嵌入页面不知道父页面给多高，内容变长会被裁掉，所以按平台契约发
 * `RESIZE`（`data.height`）让父页面调整 `iframe.style.height`。
 *
 * 老工程是在 `survey/result.vue` 里 `watch` 建议列表后发
 * `{type:'height', value: scrollHeight}` —— 只覆盖一个页面、且消息类型不在契约内。
 * 这里改成通用 composable：任何可能变高的页面接一行即可。
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
