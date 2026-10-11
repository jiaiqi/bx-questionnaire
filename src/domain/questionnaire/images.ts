/**
 * 图片题的显示决策
 *
 * 单独抽出来是因为这条规则**踩过一次坑**：上传端点与附件查询端点的权限是分开的，
 * 实测本环境 `/file/upload` 可用、`srvfile_attachment_select` 返回「无权限访问」。
 * 早期实现里查询失败被 `catch { rows = [] }` 吞掉，于是「传上去了」被渲染成
 * 「暂无图片」—— 用户会以为没传上而反复重传，而作答值其实早就写对了。
 *
 * 规则：**服务端列表优先；读不到时退回本地预览，并且必须让调用方知道这是退回**，
 * 以便界面给出解释，而不是伪装成「没有图片」。
 */

export interface ImageDisplayInput {
  /** 服务端附件表查到的图片地址 */
  serverUrls: string[]
  /** 本次会话刚上传成功的本地预览地址（blob URL） */
  localUrls: string[]
}

export interface ImageDisplay {
  /** 实际渲染的地址列表 */
  images: string[]
  /** 是否处于「只有本地预览、读不到服务端列表」的降级状态 */
  localOnly: boolean
}

export function resolveImageDisplay(input: ImageDisplayInput): ImageDisplay {
  const serverUrls = input.serverUrls.filter(Boolean)
  const localUrls = input.localUrls.filter(Boolean)

  if (serverUrls.length) {
    return { images: serverUrls, localOnly: false }
  }
  return { images: localUrls, localOnly: localUrls.length > 0 }
}
