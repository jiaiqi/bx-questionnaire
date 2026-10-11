// @vitest-environment node

/**
 * 上传接口的单测
 *
 * 真实端到端已在浏览器里验证过（`scripts/_upload-cdp.mjs` 的探查结论）：
 * H5 的 uni.uploadFile 能成型 multipart、票据 header 被采信（响应 create_user=jq）、
 * 响应是裸对象且以 fileurl 非空为成功判据。
 *
 * 这里锁的是**本工程自己那部分逻辑**：请求参数怎么组、响应怎么判成败。
 * 这两块出错的表现分别是「服务端收到畸形请求」和「失败被当成成功」，
 * 而端到端跑一次不一定覆盖得到（比如 fileurl 为空的分支）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { uploadAttachment } from '@/api/file/upload'

/** 捕获 uni.uploadFile 收到的参数，并按需回放响应 */
let captured: Record<string, unknown> | null = null
let reply: { kind: 'success', data: string } | { kind: 'fail', errMsg?: string } = { kind: 'success', data: '' }

beforeEach(() => {
  captured = null
  reply = { kind: 'success', data: '' }
  vi.stubGlobal('uni', {
    uploadFile: (options: Record<string, unknown>) => {
      captured = options
      const success = options.success as (res: { statusCode: number, data: string }) => void
      const fail = options.fail as (err: { errMsg?: string }) => void
      if (reply.kind === 'success') {
        success({ statusCode: 200, data: reply.data })
      }
      else {
        fail({ errMsg: reply.errMsg })
      }
    },
  })
})

const OK_BODY = JSON.stringify({
  file_no: '20261011101104913100',
  fileurl: '/20261011/20261011101104913100/20261011101104913101.jpg',
  src_name: 'x.png',
  file_size: 70,
  file_type: 'png',
})

describe('uploadAttachment · 请求组装', () => {
  it('首次上传不传 file_no —— 传不存在的值会被服务端静默忽略，等于白传', async () => {
    reply = { kind: 'success', data: OK_BODY }
    await uploadAttachment({ filePath: 'blob:abc' })
    const formData = captured?.formData as Record<string, string>
    expect(formData.serviceName).toBe('srv_bxfile_service')
    expect(formData.interfaceName).toBe('add')
    expect(formData.app_no).toBeTruthy()
    expect('file_no' in formData).toBe(false)
  })

  it('追加到已有批次时带上 file_no —— 多张图要落在同一个批次下', async () => {
    reply = { kind: 'success', data: OK_BODY }
    await uploadAttachment({ filePath: 'blob:abc', fileNo: '20261011101104913100' })
    const formData = captured?.formData as Record<string, string>
    expect(formData.file_no).toBe('20261011101104913100')
  })

  it('走专用路径 /file/upload，不是标准 {app}/{action}/{service}', async () => {
    reply = { kind: 'success', data: OK_BODY }
    await uploadAttachment({ filePath: 'blob:abc' })
    expect(String(captured?.url)).toMatch(/\/file\/upload$/)
    expect(String(captured?.url)).not.toContain('/operate/')
  })

  it('表单字段名是 file，与契约一致', async () => {
    reply = { kind: 'success', data: OK_BODY }
    await uploadAttachment({ filePath: 'blob:abc' })
    expect(captured?.name).toBe('file')
    expect(captured?.filePath).toBe('blob:abc')
  })

  it('header 不带 Content-Type —— 手写会把 multipart 的 boundary 覆盖掉', async () => {
    reply = { kind: 'success', data: OK_BODY }
    await uploadAttachment({ filePath: 'blob:abc' })
    const header = captured?.header as Record<string, string>
    expect(header['Content-Type']).toBeUndefined()
  })
})

describe('uploadAttachment · 成败判定', () => {
  it('fileurl 非空即成功，并原样回传服务端生成的 file_no', async () => {
    reply = { kind: 'success', data: OK_BODY }
    const result = await uploadAttachment({ filePath: 'blob:abc' })
    expect(result.file_no).toBe('20261011101104913100')
    expect(result.fileurl).toBe('/20261011/20261011101104913100/20261011101104913101.jpg')
  })

  it('fileurl 为空必须报错 —— 服务端失败时不给 resultCode，这是唯一判据', async () => {
    reply = { kind: 'success', data: JSON.stringify({ file_no: 'x', fileurl: '' }) }
    await expect(uploadAttachment({ filePath: 'blob:abc' })).rejects.toThrow(/未返回文件地址/)
  })

  it('响应缺 fileurl 字段同样报错', async () => {
    reply = { kind: 'success', data: JSON.stringify({ file_no: 'x' }) }
    await expect(uploadAttachment({ filePath: 'blob:abc' })).rejects.toThrow(/未返回文件地址/)
  })

  it('响应不是 JSON 时报错，不能静默当成成功', async () => {
    reply = { kind: 'success', data: '<html>502 Bad Gateway</html>' }
    await expect(uploadAttachment({ filePath: 'blob:abc' })).rejects.toThrow(/不是合法 JSON/)
  })

  it('响应是 JSON 数组（信封形状）时报错 —— 这个端点不返回信封', async () => {
    reply = { kind: 'success', data: JSON.stringify([{ fileurl: '/x.png' }]) }
    await expect(uploadAttachment({ filePath: 'blob:abc' })).rejects.toThrow(/未返回文件地址/)
  })

  it('空响应体报错', async () => {
    reply = { kind: 'success', data: '' }
    await expect(uploadAttachment({ filePath: 'blob:abc' })).rejects.toThrow(/不是合法 JSON/)
  })

  it('传输失败时带上原始 errMsg', async () => {
    reply = { kind: 'fail', errMsg: 'uploadFile:fail timeout' }
    await expect(uploadAttachment({ filePath: 'blob:abc' })).rejects.toThrow(/timeout/)
  })

  it('传输失败且无 errMsg 时给出兜底文案', async () => {
    reply = { kind: 'fail' }
    await expect(uploadAttachment({ filePath: 'blob:abc' })).rejects.toThrow(/请检查网络/)
  })
})
