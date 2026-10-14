/**
 * RSA 加密（PKCS#1 v1.5）—— 跨端纯实现
 *
 * 为什么自己实现而不引 `jsencrypt`：
 * - jsencrypt 依赖 `window` / `navigator` / `document`，**小程序端跑不起来**；
 * - 登录要在 H5 与微信小程序两端都能用，所以这里只用 `BigInt` 做模幂，
 *   不碰任何宿主 API（base64 编解码也自己写，因为小程序没有 `atob` / `btoa`）。
 *
 * 契约与 `scripts/bx-login.mjs` 的 Node 实现一致（PKCS#1 v1.5 填充 + base64 输出），
 * 两边产物都能被平台解开 —— 单测用 `node:crypto` 的私钥解密来证明这一点。
 *
 * ⚠️ 刻意**不写 BigInt 字面量**（`1n` / `0xffn`）：`vite.config.ts` 的
 * `build.target` 是 `es6`，esbuild 遇到 BigInt 字面量会直接报错终止构建。
 * 统一用 `BigInt(...)` 构造，运行时能力不足时由 `assertBigInt()` 给出明确报错。
 */

/** 用 BigInt() 构造而不是字面量，避免 esbuild 在 es6 target 下报错 */
const ZERO = BigInt(0)
const ONE = BigInt(1)
const BYTE_MAX = BigInt(255)

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** RSA 公钥的数值形式 */
export interface RsaPublicKey {
  /** 模数 */
  n: bigint
  /** 公开指数（平台下发的一般是 65537） */
  e: bigint
}

function assertBigInt(): void {
  if (typeof BigInt === 'undefined') {
    throw new Error('当前运行环境不支持 BigInt，无法加密登录密码')
  }
}

/** base64 → 字节数组（忽略换行与 PEM 之外的非字母数字字符） */
function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Z0-9+/]/gi, '')
  const bytes: number[] = []

  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i] ?? '')
    const c1 = BASE64_CHARS.indexOf(clean[i + 1] ?? '')
    const c2 = BASE64_CHARS.indexOf(clean[i + 2] ?? '')
    const c3 = BASE64_CHARS.indexOf(clean[i + 3] ?? '')
    if (c0 < 0 || c1 < 0) {
      throw new Error('公钥不是合法的 base64 内容')
    }

    bytes.push(((c0 << 2) | (c1 >> 4)) & 0xFF)
    if (clean[i + 2] !== undefined) {
      if (c2 < 0) {
        throw new Error('公钥不是合法的 base64 内容')
      }
      bytes.push((((c1 & 0x0F) << 4) | (c2 >> 2)) & 0xFF)
    }
    if (clean[i + 3] !== undefined) {
      if (c3 < 0) {
        throw new Error('公钥不是合法的 base64 内容')
      }
      bytes.push((((c2 & 0x03) << 6) | c3) & 0xFF)
    }
  }

  return new Uint8Array(bytes)
}

/** 字节数组 → base64（带 `=` 补齐） */
function bytesToBase64(bytes: Uint8Array): string {
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]

    out += BASE64_CHARS[b0 >> 2]
    out += BASE64_CHARS[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 0x0F) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : BASE64_CHARS[b2 & 0x3F]
  }

  return out
}

/** 字节数组 → 大整数（大端） */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex === '' ? ZERO : BigInt(`0x${hex}`)
}

/** 大整数 → 固定长度字节数组（大端，左侧补零） */
function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length)
  let rest = value

  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(rest & BYTE_MAX)
    rest >>= BigInt(8)
  }

  return out
}

/** UTF-8 编码（不依赖 TextEncoder —— 小程序端不保证存在） */
function utf8ToBytes(text: string): Uint8Array {
  const out: number[] = []

  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i)

    if (code < 0x80) {
      out.push(code)
    }
    else if (code < 0x800) {
      out.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F))
    }
    else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
      // 代理对：合成为一个码点再按 4 字节编码
      const low = text.charCodeAt(i + 1)
      i += 1
      code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
      out.push(
        0xF0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3F),
        0x80 | ((code >> 6) & 0x3F),
        0x80 | (code & 0x3F),
      )
    }
    else {
      out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
    }
  }

  return new Uint8Array(out)
}

interface DerCursor {
  bytes: Uint8Array
  pos: number
}

function readLength(cursor: DerCursor): number {
  const first = cursor.bytes[cursor.pos]
  if (first === undefined) {
    throw new Error('公钥 DER 结构不完整')
  }
  cursor.pos += 1

  if ((first & 0x80) === 0) {
    return first
  }

  const count = first & 0x7F
  let length = 0
  for (let i = 0; i < count; i += 1) {
    const byte = cursor.bytes[cursor.pos]
    if (byte === undefined) {
      throw new Error('公钥 DER 结构不完整')
    }
    cursor.pos += 1
    length = (length << 8) | byte
  }

  return length
}

/** 读一个 TLV，校验 tag 并返回其值 */
function readTag(cursor: DerCursor, expected: number): Uint8Array {
  const tag = cursor.bytes[cursor.pos]
  if (tag === undefined) {
    throw new Error('公钥 DER 结构不完整')
  }
  if (tag !== expected) {
    throw new Error(`公钥 DER 结构异常：期望 0x${expected.toString(16)}，实际 0x${tag.toString(16)}`)
  }
  cursor.pos += 1

  const length = readLength(cursor)
  const value = cursor.bytes.subarray(cursor.pos, cursor.pos + length)
  if (value.length !== length) {
    throw new Error('公钥 DER 结构不完整')
  }
  cursor.pos += length

  return value
}

/** PKCS#1 `RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }` */
function readPkcs1(sequence: Uint8Array): RsaPublicKey {
  const cursor: DerCursor = { bytes: sequence, pos: 0 }
  const n = bytesToBigInt(readTag(cursor, 0x02))
  const e = bytesToBigInt(readTag(cursor, 0x02))

  if (n === ZERO || e === ZERO) {
    throw new Error('公钥内容无效（模数或指数为空）')
  }

  return { n, e }
}

/**
 * 解析平台下发的公钥
 *
 * 实测下发的 `public_key` 可能是三种形态，都要能吃：
 * - 带 `-----BEGIN PUBLIC KEY-----` 的 SubjectPublicKeyInfo（spki）
 * - 带 `-----BEGIN RSA PUBLIC KEY-----` 的 PKCS#1
 * - **裸 base64**（没有 PEM 头）
 */
export function parseRsaPublicKey(publicKey: string): RsaPublicKey {
  const body = String(publicKey ?? '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  if (!body) {
    throw new Error('登录公钥为空')
  }

  const bytes = base64ToBytes(body)
  const cursor: DerCursor = { bytes, pos: 0 }
  const top = readTag(cursor, 0x30)

  // SubjectPublicKeyInfo：SEQUENCE { AlgorithmIdentifier SEQUENCE, BIT STRING { RSAPublicKey } }
  if (top[0] === 0x30) {
    const inner: DerCursor = { bytes: top, pos: 0 }
    readTag(inner, 0x30)
    const bitString = readTag(inner, 0x03)
    // BIT STRING 首字节是「未使用位数」，RSA 公钥恒为 0
    const nested: DerCursor = { bytes: bitString.subarray(1), pos: 0 }
    return readPkcs1(readTag(nested, 0x30))
  }

  // PKCS#1：顶层 SEQUENCE 直接是 INTEGER n, INTEGER e
  return readPkcs1(top)
}

/** 模幂：平方-乘，避免依赖任何大数库 */
function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = ONE
  let squared = base % modulus
  let rest = exponent

  while (rest > ZERO) {
    if ((rest & ONE) === ONE) {
      result = (result * squared) % modulus
    }
    squared = (squared * squared) % modulus
    rest >>= ONE
  }

  return result
}

/** 模数占多少字节（RSA 密文长度） */
export function rsaKeySize(key: RsaPublicKey): number {
  return Math.ceil(key.n.toString(16).length / 2)
}

/**
 * PKCS#1 v1.5 加密，返回 base64
 *
 * 填充结构：`0x00 || 0x02 || PS(非零随机) || 0x00 || M`。
 * 随机填充用 `Math.random`（与 jsencrypt 的做法一致）：这里的目的是**避免同样的
 * 密码产生同样的密文**，而不是抵抗本地攻击者 —— 传输安全由 HTTPS 承担。
 */
export function rsaEncrypt(publicKey: string | RsaPublicKey, text: string): string {
  assertBigInt()

  const key = typeof publicKey === 'string' ? parseRsaPublicKey(publicKey) : publicKey
  const size = rsaKeySize(key)
  const message = utf8ToBytes(text)

  if (size < 12) {
    throw new Error('公钥长度异常，无法加密')
  }
  if (message.length > size - 11) {
    throw new Error('待加密内容过长，超出公钥可加密长度')
  }

  const paddingLength = size - message.length - 3
  const block = new Uint8Array(size)
  block[0] = 0x00
  block[1] = 0x02
  for (let i = 0; i < paddingLength; i += 1) {
    let byte = 0
    while (byte === 0) {
      byte = Math.floor(Math.random() * 256)
    }
    block[2 + i] = byte
  }
  block[2 + paddingLength] = 0x00
  block.set(message, 3 + paddingLength)

  const encrypted = modPow(bytesToBigInt(block), key.e, key.n)
  return bytesToBase64(bigIntToBytes(encrypted, size))
}
