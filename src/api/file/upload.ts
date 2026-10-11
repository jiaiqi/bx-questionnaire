/**
 * 附件上传
 *
 * **端点是专用路径** `{gateway}/file/upload`（multipart），不是标准
 * `{app}/{action}/{service}`。走标准路径 `/file/operate/srvfile_attachment_add`
 * 会返回「非法API[operate/srvfile_attachment_add]请求」——
 * 此前正是据此把「文件写入」误判成「无权限」，实际是**端点用错了**。
 *
 * 实测语义（parkDev，2026-10-11）：
 *
 * | 事实 | 实测依据 |
 * | --- | --- |
 * | 响应是**裸对象**，无 state/resultCode 信封 | 返回体只有业务字段，`state` 为 undefined |
 * | 成功判据是 `fileurl` 非空 | 契约同此；失败时 fileurl 为空 |
 * | `file_no` 是**批次号**：传已存在的值 → 追加到该批次 | 传已存在的 file_no，附件表下变成 2 个文件 |
 * | 传**不存在**的 file_no → 被静默忽略，服务端另生成 | 传 `batchno_custom123`，响应 file_no 是服务端生成的 |
 * | 票据**只放 header**，不进 URL/表单 | 契约同此 |
 * | `/file/delete` 体 `{fileurl}` 可用 | 返回 `resultCode: SUCCESS` |
 *
 * 因此：**首次上传不要传 file_no**，用响应里的 `file_no` 作为作答值；
 * 之后追加同批次文件时才传它。
 */

import type { BxAttachmentRow } from './attachment'

import { buildTicketHeaders, BxError } from '@/utils/request'
import { ENV, resolveGateway } from '@/utils/request/env'

/** 上传接口固定用的服务名（不是 srvfile_* 系列，是平台内置的文件服务） */
const FILE_UPLOAD_SERVICE = 'srv_bxfile_service'

export interface UploadAttachmentOptions {
  /** `uni.chooseImage` 返回的临时路径 */
  filePath: string
  /** 追加到已有批次时传；首次上传留空 */
  fileNo?: string
  /** 归属应用，默认当前业务应用 */
  appNo?: string
  tableName?: string
  columns?: string
}

/** 解析上传响应：裸对象，且必须带 fileurl 才算成功 */
function parseUploadResult(raw: string): BxAttachmentRow {
  let payload: BxAttachmentRow | null = null
  try {
    payload = JSON.parse(raw) as BxAttachmentRow
  }
  catch {
    payload = null
  }
  if (!payload || typeof payload !== 'object') {
    throw new BxError('图片上传失败：响应不是合法 JSON', 'UPLOAD')
  }
  if (!payload.fileurl) {
    // 服务端失败时不给 resultCode，只能按契约判 fileurl
    throw new BxError('图片上传失败：服务端未返回文件地址', 'UPLOAD')
  }
  return payload
}

/**
 * 上传一个文件
 *
 * 用 `uni.uploadFile` 而不是 `uni.request`：后者在 H5 端会把 FormData 当普通
 * body 序列化，小程序端更是完全不支持 multipart。`uploadFile` 三端都走原生上传。
 */
export function uploadAttachment(options: UploadAttachmentOptions): Promise<BxAttachmentRow> {
  const formData: Record<string, string> = {
    serviceName: FILE_UPLOAD_SERVICE,
    interfaceName: 'add',
    app_no: options.appNo ?? ENV.app,
  }
  if (options.fileNo) {
    formData.file_no = options.fileNo
  }
  if (options.tableName) {
    formData.table_name = options.tableName
  }
  if (options.columns) {
    formData.columns = options.columns
  }

  return new Promise<BxAttachmentRow>((resolve, reject) => {
    uni.uploadFile({
      url: `${resolveGateway()}/file/upload`,
      filePath: options.filePath,
      name: 'file',
      // 只带票据，不手写 Content-Type：boundary 必须由运行时生成
      header: buildTicketHeaders(),
      formData,
      success: (res) => {
        try {
          resolve(parseUploadResult(String(res.data ?? '')))
        }
        catch (error) {
          reject(error)
        }
      },
      fail: (err) => {
        reject(new BxError(err?.errMsg || '图片上传失败，请检查网络', 'UPLOAD'))
      },
    })
  })
}

/**
 * 删除附件（**当前无调用方，刻意保留说明**）
 *
 * `POST {gateway}/file/delete`，体 `{fileurl}`，返回标准信封（实测 `resultCode: SUCCESS`）。
 *
 * 没有实现调用入口是有意的：**同一 file_no 可能被多条记录引用**
 * （草稿与提交记录共用批次号），真删会让历史作答里的图一起消失。
 * 因此表单里移除图片只做「引用移除」（改作答值），服务端文件留着。
 * 需要真删时按上面的契约补一个带二次确认的入口。
 */
