/**
 * 生产 dist 冒烟：
 * 1) index.html 引用完整
 * 2) 无 .map
 * 3) 带 export 的 ESM chunk 可在超时内 import
 * 4) 入口体积与基本完整性
 *
 * 用法：node scripts/verify-dist.mjs [distDir]
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const distDir = path.resolve(process.argv[2] || 'dist')
const indexHtml = path.join(distDir, 'index.html')
const assetsDir = path.join(distDir, 'assets')

function fail(msg) {
  console.error('[verify-dist] FAIL:', msg)
  process.exit(1)
}

function ok(msg) {
  console.log('[verify-dist]', msg)
}

if (!fs.existsSync(indexHtml)) fail('缺少 index.html')
const html = fs.readFileSync(indexHtml, 'utf8')
const scriptMatch = html.match(/src="(\.\/assets\/[^"]+\.js)"/)
if (!scriptMatch) fail('index.html 未引用 assets/*.js')

const entryRel = scriptMatch[1].replace(/^\.\//, '')
const entryName = path.basename(entryRel)
const entryAbs = path.join(distDir, entryRel)
if (!fs.existsSync(entryAbs)) fail('入口脚本不存在: ' + entryRel)
ok('entry ' + entryRel)

const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
if (!jsFiles.length) fail('assets 下无 JS')

for (const f of fs.readdirSync(assetsDir)) {
  if (f.endsWith('.map')) fail('不应存在 sourcemap: ' + f)
}

for (const f of jsFiles) {
  const sz = fs.statSync(path.join(assetsDir, f)).size
  ok(`${f}  ${(sz / 1024).toFixed(1)}KB`)
  if (sz > 2.5 * 1024 * 1024) {
    console.warn('[verify-dist] WARN: 单文件超过 2.5MB')
  }
}

async function importWithTimeout(fileAbs, ms) {
  const url = pathToFileURL(fileAbs).href + `?t=${Date.now()}`
  let timer
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`import timeout ${ms}ms: ${path.basename(fileAbs)}`)), ms)
  })
  try {
    return await Promise.race([import(url), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** 真正的命名导出 chunk（排除入口侧效模块误伤） */
const exportChunkRe = /\bexport\s*\{[^}]+\}/

for (const f of jsFiles) {
  if (f === entryName) continue
  const abs = path.join(assetsDir, f)
  const code = fs.readFileSync(abs, 'utf8')
  if (!exportChunkRe.test(code)) {
    ok(`skip non-export chunk ${f}`)
    continue
  }
  try {
    const mod = await importWithTimeout(abs, 4000)
    const keys = Object.keys(mod)
    ok(`chunk OK ${f} exports=[${keys.join(',')}]`)
    if (!keys.length) fail(`chunk ${f} 无导出`)
  } catch (e) {
    fail(String(e && e.message ? e.message : e))
  }
}

const entryCode = fs.readFileSync(entryAbs, 'utf8')
if (entryCode.length < 1000) fail('入口脚本过短，可能损坏')
if (entryCode.includes('sourceMappingURL')) {
  console.warn('[verify-dist] WARN: 入口仍含 sourceMappingURL')
}
// 入口应引用动态 chunk（防逆向模块）或至少是有效打包结果
if (!entryCode.includes('import(') && !entryCode.includes('import (')) {
  console.warn('[verify-dist] WARN: 入口未见动态 import（antiReverse 可能未拆包）')
}

ok('PASS')
