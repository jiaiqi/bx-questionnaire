/**
 * 文件附件接口
 *
 * 关键：该服务在 **file 应用**下，不在 daq 下。
 * 用 daq 调用会返回「srvfile_attachment_select无权限访问」，
 * 这也是老工程 `getServiceUrl('file', serviceName, 'select')` 的写法。
 *
 * 实测（parkDev）返回字段：
 *   file_no / fileurl / src_name / file_type / file_size / img_width / img_height
 *   table_name / columns / app_no / _dl_auth
 *
 * `fileurl` 是**相对路径**（如 /bxdaq_activity_cfg/activity_image/2026.../xxx.png），
 * 访问时需要拼上网关前缀，见 `resolveFileUrl`。
 */

import { bxSelect } from '@/utils/request'
import { resolveGateway } from '@/utils/request/env'

/** 附件行（srvfile_attachment_select） */
export interface BxAttachmentRow {
  file_no?: string
  /** 相对路径，需拼网关前缀 */
  fileurl?: string | null
  fileurlsmall?: string | null
  src_name?: string | null
  file_type?: string | null
  file_size?: string | null
  img_width?: number | null
  img_height?: number | null
  table_name?: string | null
  columns?: string | null
  app_no?: string | null
  /** 是否具备下载权限 */
  _dl_auth?: boolean
  [k: string]: unknown
}

/**
 * 按文件号查询附件
 *
 * 只用 `eq` 条件：老工程也只用了 eq，`in` 的语法未经验证，不冒险。
 * 图片题通常只有一个附件；多附件时逐个查询即可。
 */
export function attachmentSelect(params: { fileNo: string }) {
  return bxSelect<BxAttachmentRow>({
    serviceName: 'srvfile_attachment_select',
    app: 'file',
    colNames: ['*'],
    condition: [{ colName: 'file_no', ruleType: 'eq', value: params.fileNo }],
  })
}

/**
 * 把附件的相对 fileurl 拼成可直接访问的地址
 *
 * **必须走 file 应用的下载接口**，不能直接访问 fileurl（实测）：
 *   ✅ {gateway}/file/download?filePath=/bxdaq_activity_cfg/.../x.png  → 200 image/png
 *   ❌ {gateway}/bxdaq_activity_cfg/.../x.png                          → 500（服务端转成 404 NOT_FOUND）
 *
 * 老工程同样如此：`$api.srvHost + '/file/download?filePath=' + data.fileurl`，
 * 其中 srvHost 即网关地址（含 /bxapi 前缀）。
 *
 * filePath 不做 URL 编码：老工程直接拼接，且路径里的 `/` 编码成 %2F 反而可能破坏解析。
 */
export function resolveFileUrl(fileurl: string | null | undefined): string {
  const path = (fileurl ?? '').trim()
  if (!path) {
    return ''
  }
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const normalized = path.startsWith('/') ? path : `/${path}`
  // 必须走 file 应用的下载接口，直接访问 fileurl 会 500（服务端转成 404 NOT_FOUND）
  return `${resolveGateway()}/file/download?filePath=${normalized}`
}
