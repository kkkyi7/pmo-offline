import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const htmlPath = join(process.cwd(), 'dist', 'index.html')
let html = readFileSync(htmlPath, 'utf8')

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => {
  const js = readFileSync(join(process.cwd(), 'dist', src.replace(/^\.\//, '')), 'utf8')
  return `<script type="module">${js}</script>`
})

html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/, (_, href) => {
  const css = readFileSync(join(process.cwd(), 'dist', href.replace(/^\.\//, '')), 'utf8')
  return `<style>${css}</style>`
})

const out = join(process.cwd(), 'dist', '项目实施计划.html')
writeFileSync(out, html)
const desktop = join(homedir(), 'Desktop', '项目实施计划.html')
copyFileSync(out, desktop)
console.log(`单文件已生成：${desktop}`)
