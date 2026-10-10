/**
 * 发布前验证：用静态服务器跑构建后的 H5 产物
 *
 * dev 模式与 build 产物可能行为不同（压缩、tree-shaking、环境变量替换都在构建期
 * 发生），所以冒烟必须对产物再跑一遍，不能只测 dev。
 *
 * 产物部署在子路径（manifest.config.ts 的 h5.router.base，当前是 /questionnaire/），
 * 所以服务器必须把这个前缀剥掉再映射到 dist 目录 —— 否则请求
 * /questionnaire/assets/x.js 找不到文件、回落成 index.html，
 * 浏览器会报「Expected a JavaScript-or-Wasm module script but the server
 * responded with a MIME type of text/html」。
 *
 * 用法：node scripts/serve-dist.mjs [port] [base]
 * base 省略时从 index.html 里 script src 的路径前缀自动推断（即 VITE_H5_BASE）。
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const ROOT = join(process.cwd(), 'dist', 'build', 'h5')
const PORT = Number(process.argv[2] || 4180)

/**
 * 推断部署前缀
 *
 * 从 index.html 里第一个 script 的 src 反推，例如
 *   src="/questionnaire/assets/index-xxx.js" -> /questionnaire/
 *   src="/assets/index-xxx.js"               -> /
 * 这样 base 改了也不用改本脚本。
 */
function detectBase() {
  if (process.argv[3]) {
    return process.argv[3].replace(/\/?$/, '/')
  }
  try {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    const m = html.match(/<script[^>]+src="([^"]+)"/)
    if (m && m[1]) {
      const idx = m[1].lastIndexOf('/assets/')
      if (idx >= 0) {
        return `${m[1].slice(0, idx)}/`.replace(/^\/\//, '/')
      }
    }
  }
  catch { /* 回落根路径 */ }
  return '/'
}

const BASE = detectBase()

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
}

if (!existsSync(ROOT)) {
  console.error(`产物目录不存在：${ROOT}，请先 pnpm build h5`)
  process.exit(1)
}

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  // 剥掉部署前缀：/questionnaire/assets/x.js -> /assets/x.js
  const stripped = url.startsWith(BASE) ? url.slice(BASE.length - 1) : url
  // hash 路由：所有非静态请求都回落到 index.html
  let filePath = normalize(join(ROOT, stripped))
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(ROOT, 'index.html')
  }
  try {
    const body = readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' })
    res.end(body)
  }
  catch (e) {
    res.writeHead(500).end(String(e.message))
  }
})

server.listen(PORT, () => {
  console.log(`静态产物服务器：http://localhost:${PORT}${BASE}`)
  console.log(`根目录：${ROOT}`)
  console.log(`部署前缀：${BASE}`)
})
