/**
 * 轻交互工具：toast 与确认弹窗
 */

export function toast(title: string, icon: 'none' | 'success' | 'error' = 'none'): void {
  uni.showToast({ title, icon, duration: 2000 })
}

export function toastSuccess(title: string): void {
  toast(title, 'success')
}

/** 确认弹窗，PC 与移动端由 uni.showModal 统一呈现 */
export function confirmDialog(content: string, title = '提示'): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title,
      content,
      success: res => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    })
  })
}

/** 平滑滚动到指定元素（小程序端用 uni.pageScrollTo，H5 用原生 scrollIntoView） */
export function scrollToSelector(selector: string): void {
  // #ifdef H5
  try {
    const element = document.querySelector(selector)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
  }
  catch {
    // 忽略 H5 查询异常
  }
  // #endif

  uni.pageScrollTo({ selector, duration: 260 })
}
