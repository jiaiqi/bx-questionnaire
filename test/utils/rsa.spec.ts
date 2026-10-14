// @vitest-environment node

/**
 * RSA 加密（PKCS#1 v1.5）跨端实现
 *
 * 关键验证方式：**用 Node 的私钥把前端加密结果解回来**。
 * 只断言「输出是个 base64 字符串」毫无意义 —— 平台要的是能被它解开的密文，
 * 所以这里用 `node:crypto` 做真实往返；长度、随机性、异常输入一并固定住。
 */

import { Buffer } from 'node:buffer'
import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { parseRsaPublicKey, rsaEncrypt, rsaKeySize } from '@/utils/crypto/rsa'

/** spki 公钥（平台下发的常见形态） */
const spki = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
})

/** PKCS#1 公钥（另一种可能的形态） */
const pkcs1 = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
})

function decrypt(cipherBase64: string, privateKey: string): string {
  return privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(cipherBase64, 'base64'),
  ).toString('utf8')
}

/** 去掉 PEM 头尾只留正文：实测平台下发过裸 base64 */
function toBareBase64(pem: string): string {
  return pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
}

describe('加密结果能被 Node 私钥解回', () => {
  it('spki PEM 公钥：密文能被私钥解回原文', () => {
    expect(decrypt(rsaEncrypt(spki.publicKey, 'p@ssw0rd'), spki.privateKey)).toBe('p@ssw0rd')
  })

  it('另一种公钥形态（PKCS#1）同样可解析', () => {
    expect(decrypt(rsaEncrypt(pkcs1.publicKey, 'another-pass'), pkcs1.privateKey)).toBe('another-pass')
  })

  it('裸 base64 公钥（无 PEM 头）同样可解析', () => {
    expect(decrypt(rsaEncrypt(toBareBase64(spki.publicKey), 'bare-key'), spki.privateKey)).toBe('bare-key')
  })

  it('中文与多字节字符按 UTF-8 编码', () => {
    const password = '密码含中文·emoji🚀'
    expect(decrypt(rsaEncrypt(spki.publicKey, password), spki.privateKey)).toBe(password)
  })

  it('密文长度等于模数字节数（2048 位 → 256 字节）', () => {
    const encrypted = rsaEncrypt(spki.publicKey, 'x')
    expect(Buffer.from(encrypted, 'base64').length).toBe(256)
    expect(rsaKeySize(parseRsaPublicKey(spki.publicKey))).toBe(256)
  })

  it('同一明文两次加密结果不同（随机填充生效），但都能解回', () => {
    const first = rsaEncrypt(spki.publicKey, 'same-password')
    const second = rsaEncrypt(spki.publicKey, 'same-password')

    expect(first).not.toBe(second)
    expect(decrypt(first, spki.privateKey)).toBe('same-password')
    expect(decrypt(second, spki.privateKey)).toBe('same-password')
  })
})

describe('异常输入', () => {
  it('空公钥直接报错，不产生无意义的密文', () => {
    expect(() => rsaEncrypt('', 'x')).toThrow('登录公钥为空')
  })

  it('内容不是公钥时报错，而不是算出垃圾密文', () => {
    expect(() => parseRsaPublicKey('这不是公钥')).toThrow()
  })

  it('超出可加密长度时报错，而不是静默截断', () => {
    // 2048 位密钥最多加密 245 字节
    expect(() => rsaEncrypt(spki.publicKey, 'a'.repeat(300))).toThrow('超出公钥可加密长度')
  })
})
