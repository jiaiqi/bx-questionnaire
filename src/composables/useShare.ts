/**
 * H5 分享（复制链接 / 系统分享 / 微信引导）
 *
 * ## 边界
 *
 * - 只在 H5 提供分享面板：小程序端由页面用条件编译隐藏入口，本文件的平台相关分支
 *   也只在 `#ifdef H5` 里访问 `window` / `navigator`；
 * - **分享链接不带票据**：链接由「当前 origin + pathname + hash 路由」重新拼出来，
 *   不复用地址栏里的其他查询参数 —— 票据一旦进链接就是一次泄露（粘贴到群里、
 *   发给同事、被日志采集）。路由本身只带 activity_no / status 这类业务参数。
 * - 不引入第三方 SDK，也不加载微信 JSSDK：微信内只能引导用户用右上角菜单。
 */

import { ref } from 'vue'

import { toast } from '@/utils/ui'

export interface ShareLocation {
  origin: string
  pathname: string
}

/**
 * 拼绝对分享链接
 *
 * `routeWithQuery` 是应用内的 hash 路由（如 `/pages/questionnaire/cover/index?activity_no=x`），
 * 最终形如 `https://host/app/#/pages/...`。
 */
export function buildShareUrl(routeWithQuery: string, location: ShareLocation): string {
  const route = routeWithQuery.startsWith('/') ? routeWithQuery : `/${routeWithQuery}`
  const pathname = location.pathname || '/'
  return `${location.origin}${pathname}#${route}`
}

/** 微信内置浏览器识别（UA 判定；小程序端不经过这里） */
export function isWechatUA(userAgent: string): boolean {
  return /MicroMessenger/i.test(String(userAgent ?? ''))
}

export interface SystemSharePayload {
  title: string
  text?: string
  url: string
}

/** 系统分享结果：取消不算失败，不该弹错误提示 */
export type SystemShareResult = 'ok' | 'cancel' | 'unsupported' | 'fail'

export function useShare() {
  const isWechat = ref(false)
  const canNativeShare = ref(false)

  // #ifdef H5
  if (typeof navigator !== 'undefined') {
    isWechat.value = isWechatUA(navigator.userAgent || '')
    canNativeShare.value = typeof navigator.share === 'function'
  }
  // #endif

  /** 生成绝对分享链接；非 H5 环境返回空串 */
  function shareLink(routeWithQuery: string): string {
    // #ifdef H5
    if (typeof window !== 'undefined' && window.location) {
      return buildShareUrl(routeWithQuery, {
        origin: window.location.origin,
        pathname: window.location.pathname,
      })
    }
    // #endif
    return ''
  }

  /** 复制链接：uni 的剪贴板 API 两端一致；失败时给可操作的提示 */
  function copyLink(url: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!url) {
        toast('分享链接生成失败，请稍后重试')
        resolve(false)
        return
      }
      uni.setClipboardData({
        data: url,
        success: () => {
          toast('链接已复制')
          resolve(true)
        },
        fail: () => {
          toast('复制失败，请手动复制地址栏链接')
          resolve(false)
        },
      })
    })
  }

  /**
   * 系统分享（Web Share API）
   *
   * 取消（AbortError）与失败必须分开：用户主动关掉系统面板不是错误，
   * 弹「分享失败」会让人以为功能坏了。
   */
  async function systemShare(payload: SystemSharePayload): Promise<SystemShareResult> {
    if (!canNativeShare.value) {
      return 'unsupported'
    }
    // #ifdef H5
    try {
      await navigator.share({
        title: payload.title,
        ...(payload.text ? { text: payload.text } : {}),
        url: payload.url,
      })
      return 'ok'
    }
    catch (error) {
      const name = String((error as { name?: string } | null)?.name ?? '')
      return name === 'AbortError' ? 'cancel' : 'fail'
    }
    // #endif
    // #ifndef H5
    return 'unsupported'
    // #endif
  }

  return {
    isWechat,
    canNativeShare,
    shareLink,
    copyLink,
    systemShare,
  }
}
