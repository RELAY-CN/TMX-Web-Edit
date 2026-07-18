/**
 * 生产 dist 二次混淆（仅处理 assets/*.js）。
 * 设置偏保守：避免 transformObjectKeys / renameGlobals 破坏 Vue 运行时。
 *
 * 用法：node scripts/obfuscate-dist.mjs [distDir]
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import JavaScriptObfuscator from 'javascript-obfuscator'

const distDir = path.resolve(process.argv[2] || 'dist')
const assetsDir = path.join(distDir, 'assets')

if (!fs.existsSync(assetsDir)) {
  console.error('[obfuscate] assets 目录不存在:', assetsDir)
  process.exit(1)
}

// 强度与体积权衡：过高会导致 dist 膨胀数倍、首屏变慢
const options = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.2,
  deadCodeInjection: false,
  debugProtection: true,
  debugProtectionInterval: 3000,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: false,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersType: 'variable',
  stringArrayThreshold: 0.55,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  // 保留 ES module 结构（Vite 产物为 type=module）
  target: 'browser',
}

const files = fs
  .readdirSync(assetsDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => path.join(assetsDir, f))

if (!files.length) {
  console.warn('[obfuscate] 未找到 JS 资源，跳过')
  process.exit(0)
}

let totalIn = 0
let totalOut = 0
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8')
  totalIn += code.length
  const result = JavaScriptObfuscator.obfuscate(code, options)
  const out = result.getObfuscatedCode()
  fs.writeFileSync(file, out, 'utf8')
  totalOut += out.length
  console.log(
    `[obfuscate] ${path.basename(file)}  ${(code.length / 1024).toFixed(1)}KB → ${(out.length / 1024).toFixed(1)}KB`,
  )
}

// 清理可能残留的 source map 文件
function removeMaps(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) removeMaps(p)
    else if (name.endsWith('.map')) {
      fs.unlinkSync(p)
      console.log('[obfuscate] 删除 sourcemap', path.relative(distDir, p))
    }
  }
}
removeMaps(distDir)

// 去掉 index.html 里若有 sourceMappingURL 的痕迹（一般 vite 不会写）
const indexHtml = path.join(distDir, 'index.html')
if (fs.existsSync(indexHtml)) {
  let html = fs.readFileSync(indexHtml, 'utf8')
  const cleaned = html
    .replace(/\/\/# sourceMappingURL=.*$/gm, '')
    .replace(/\/\*# sourceMappingURL=.*?\*\//gm, '')
  if (cleaned !== html) {
    fs.writeFileSync(indexHtml, cleaned, 'utf8')
    console.log('[obfuscate] 清理 index.html sourceMappingURL')
  }
}

console.log(
  `[obfuscate] 完成 ${files.length} 个文件，合计 ${(totalIn / 1024).toFixed(1)}KB → ${(totalOut / 1024).toFixed(1)}KB`,
)
