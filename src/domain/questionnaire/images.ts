/**
 * 图片题的显示决策
 *
 * 单独抽出来是因为这条规则**踩过一次坑**：上传端点与附件查询端点的权限是分开的，
 * 实测本环境 `/file/upload` 可用、`srvfile_attachment_select` 返回「无权限访问」。
 * 早期实现里查询失败被 `catch { rows = [] }` 吞掉，于是「传上去了」被渲染成
 * 「暂无图片」—— 用户会以为没传上而反复重传，而作答值其实早就写对了。
 *
 * > **更正**：上面那句「`srvfile_attachment_select` 返回无权限访问」是**错的**，
 * > 真因是请求打到了 `daq` 应用而该服务在 `file` 下（见验收清单限制 2）。
 * > 已修好。但「读不到」这个分支仍然保留 —— 网络抖动、真实权限变更都会走到它。
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

/** 结果页/回顾页里的一条作答，只要够挑出图片题即可 */
export interface AnswerSlot {
  key: string
  /** 题型（`mapper` 里的 `field.widget`） */
  widget: string
  /** 作答原值；图片题存的是文件批次号 */
  value: unknown
}

/**
 * 挑出「需要解析成图片」的题目
 *
 * 为什么需要：图片题的作答值是**文件批次号**（实测 `20261011121039186100` 这种），
 * 回顾页直接展示它就是给用户看一串内部 ID —— 用户上传的是照片，看到的却是编号。
 * 所以结果页必须先拿这个值去 `srvfile_attachment_select` 换出真实图片地址。
 *
 * 只认 `widget === 'image'` 且值非空的题；多值（`array`）逐个返回，去重且保持顺序。
 */
export function imageAnswerTargets(slots: AnswerSlot[]): Array<{ key: string, fileNo: string }> {
  const targets: Array<{ key: string, fileNo: string }> = []
  const seen = new Set<string>()

  for (const slot of slots) {
    if (slot.widget !== 'image') {
      continue
    }
    const values = Array.isArray(slot.value) ? slot.value : [slot.value]
    for (const value of values) {
      const fileNo = typeof value === 'string' ? value.trim() : ''
      if (!fileNo || seen.has(`${slot.key}:${fileNo}`)) {
        continue
      }
      seen.add(`${slot.key}:${fileNo}`)
      targets.push({ key: slot.key, fileNo })
    }
  }

  return targets
}
