import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'dist')
const port = Number(process.env.PMO_PORT || 4173)
const host = process.env.PMO_HOST || '0.0.0.0'
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function lanIPv4() {
  const out = []
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) out.push(item.address)
    }
  }
  return out
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/') rel = '/index.html'
  const file = normalize(join(root, rel))
  if (!file.startsWith(root)) {
    res.writeHead(403)
    res.end()
    return
  }
  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a file')
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    const index = await readFile(join(root, 'index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(index)
  }
})

server.listen(port, host, () => {
  console.log(`本机打开：http://127.0.0.1:${port}/`)
  for (const ip of lanIPv4()) {
    console.log(`同一 WiFi 的朋友打开：http://${ip}:${port}/`)
  }
})
