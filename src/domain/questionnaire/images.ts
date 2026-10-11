/**
 * 图片题的作答值解析
 *
 * ## 作答值是**批次号列表**，一个元素一张图
 *
 * 改造前作答值是**一个批次号**，同题多图共用它 —— **逐张移除不可表达**：
 * 只能新建批次把剩下的重传（本地没有文件字节），或者改作答值形状。
 *
 * 现在一张图一个批次号，逐张移除 = 去掉一个元素（引用移除，不动服务端文件），
 * 天然可表达。同时复用了平台自己的多值机制（`option_data` 本来就是数组，
 * 多选就是这么存的），没有发明新协议。
 *
 * 兼容性：旧数据是**一个**批次号，正好等于「长度为 1 的列表」，读法完全一致 ——
 * 改数据结构不需要迁移。
 *
 * ## 为什么作答值里**不能存文件路径**（实测，重要）
 *
 * 最直觉的做法是把路径存进作答值，但实测**存不进去**：
 *
 * | 提交给图片题的值 | 结果 |
 * | --- | --- |
 * | 路径 `/20261011/.../x.jpg`（55 字符） | `FAILURE Data truncation: Data too long for column 'option_value'` |
 * | 字母 ×50 | SUCCESS |
 * | 字母 ×52 | 同上失败 |
 * | 字母 ×64 | 同上失败 |
 * | 同样的 64 字符给**文本题** | SUCCESS |
 *
 * 也就是说**图片题的 `option_value` 上限约 50 字符**，比文本题短得多。
 * 批次号是 20 位数字，放得下；路径放不下。
 * 所以「作答值存路径」这条路在当前后端下是**走不通的**，不是设计取舍问题。
 *
 * 另一个实测结论：图片题的作答值**可以是多值** —— 提交两个批次号 → `SUCCESS`，
 * 回读 `srvdaq_record_reply_merge_select` 得到**两行**图片 `svalue`，
 * 与多选的存储方式一致。
 *
 * ## 单独抽出来的原因
 *
 * 这条规则**踩过一次坑**：查询失败曾被 `catch { rows = [] }` 吞掉，于是「传上去了」
 * 被渲染成「暂无图片」，用户会以为没传上而反复重传，而作答值其实早就写对了。
 *
 * > **更正**：早期注释把这件事归因为「`srvfile_attachment_select` 无权限」，
 * > 那是**错的** —— 真因是请求打到了 `daq` 应用而该服务在 `file` 下（见验收清单限制 2）。
 * > 已修好。但「读不到」这个分支仍然保留：网络抖动、真实权限变更都会走到它。
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

/** 结果页/回顾页/表单里的一条作答，只要够挑出图片题即可 */
export interface AnswerSlot {
  key: string
  /** 题型（`mapper` 里的 `field.widget`） */
  widget: string
  /** 作答原值 */
  value: unknown
}

/**
 * 挑出「需要解析成图片」的题目，并列出要查的批次号
 *
 * 只认 `widget === 'image'` 且值非空的题；逐值去重、保持顺序、裁掉首尾空白。
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
      if (typeof value !== 'string') {
        continue
      }
      // 兼容历史上可能用逗号分隔的多个批次号
      for (const piece of value.split(',')) {
        const fileNo = piece.trim()
        if (!fileNo || seen.has(`${slot.key}:${fileNo}`)) {
          continue
        }
        seen.add(`${slot.key}:${fileNo}`)
        targets.push({ key: slot.key, fileNo })
      }
    }
  }

  return targets
}
