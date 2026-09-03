import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const owner = 'kkkyi7'
const repo = 'pmo-offline'
const remote = `https://github.com/${owner}/${repo}.git`

function run(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' })
}

function runOut(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit' })
}

const exists = (() => {
  try {
    run(`gh repo view ${owner}/${repo}`)
    return true
  } catch {
    return false
  }
})()

if (!exists) {
  runOut(`gh repo create ${repo} --public --description "项目实施主计划，打开即用" --disable-wiki`)
}

const dir = mkdtempSync(join(tmpdir(), 'pmo-pages-'))
cpSync(join(process.cwd(), 'dist'), dir, { recursive: true })
writeFileSync(join(dir, '.nojekyll'), '')

run('git init', dir)
run('git checkout -b gh-pages', dir)
run('git add -A', dir)
run('git -c user.name=kkkyi7 -c user.email=kkkyi7@users.noreply.github.com commit -m "publish pmo site"', dir)
run(`git remote add origin ${remote}`, dir)
runOut('git push -u origin gh-pages --force', dir)

try {
  run(`gh api repos/${owner}/${repo}/pages`)
} catch {
  try {
    runOut(
      `gh api --method POST repos/${owner}/${repo}/pages -f source[branch]=gh-pages -f source[path]=/`,
    )
  } catch {
    console.log('Pages 可能已开启，或请在仓库 Settings → Pages 选 gh-pages 分支。')
  }
}

const url = `https://${owner}.github.io/${repo}/`
console.log(`\n发给朋友这个链接（刷新即最新）：\n${url}\n`)
