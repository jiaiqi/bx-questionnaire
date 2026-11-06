/**
 * 二维码生成（纯 JS，不依赖 canvas）
 *
 * ## 为什么不直接画 canvas
 *
 * 小程序端的 canvas 有两套 API（旧版 `createCanvasContext` 与新版 2D），
 * 与 H5 的 `CanvasRenderingContext2D` 并不一致，按坐标逐格画三方要写三份。
 * `qrcode-generator` 的 `createDataURL()` 直接产出 **GIF data URL**，
 * H5 与小程序都能交给 `<image>` 渲染 —— 一套代码两端可用。
 *
 * 另一个被排除的方案是 SVG：小程序不支持 `<image src="data:image/svg+xml,...">`。
 */

import qrcode from 'qrcode-generator'

export interface QrCodeOptions {
  /** 每个模块的像素数，默认 4。越大越清晰，生成的图片也越大 */
  cellSize?: number
  /** 静区宽度（模块数），默认 2。低于 2 时部分扫码器识别率会下降 */
  margin?: number
  /** 纠错级别，默认 M（约 15% 冗余，在容量与容错之间取平衡） */
  level?: 'L' | 'M' | 'Q' | 'H'
}

/**
 * 生成二维码的 GIF data URL
 *
 * @returns 内容为空、或内容超出版本容量时返回**空串**，调用方据此不渲染，
 *          而不是渲染一个空白方块
 */
export function toQrCodeDataUrl(text: string, options: QrCodeOptions = {}): string {
  const value = String(text ?? '').trim()
  if (!value) {
    return ''
  }

  const { cellSize = 4, margin = 2, level = 'M' } = options

  try {
    // typeNumber 传 0：按内容长度自动选版本（1..40）
    const qr = qrcode(0, level)
    qr.addData(value)
    qr.make()
    return qr.createDataURL(cellSize, margin)
  }
  catch {
    // 超长内容会抛 "code length overflow"，这里降级为不渲染
    return ''
  }
}
