/**
 * 生产 dist 二次混淆（仅处理 assets/*.js）。
 *
 * 明确禁用会挂死/破坏 ESM 的选项：
 *  - selfDefending：格式化或某些环境下无限循环
 *  - debugProtection：加载期 debugger 陷阱，Node/CI 与正常预览易挂死
 *  - transformObjectKeys / renameGlobals：破坏 Vue 响应式与命名导出
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

/**
 * 可读性降低 + 体积可控。
 * 不做“打开页面就卡死调试器”的 runtime 陷阱（由 antiReverse 轻量处理）。
 */
const options = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.15,
  deadCodeInjection: false,
  // 以下两项在加载期会挂死或污染运行时，禁止开启：
  // selfDefending / debugProtection / disableConsoleOutput
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: false,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 12,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersType: 'variable',
  stringArrayThreshold: 0.5,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: 'browser',
  // 保留 export / import.meta（Vite ESM 产物必需）
  reservedNames: ['^enableAntiReverse$'],
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
  // 快速健康检查：混淆前若是 ESM chunk 应含 export 或入口 import
  const result = JavaScriptObfuscator.obfuscate(code, options)
  const out = result.getObfuscatedCode()

  // 混淆后若是原文件含 export，产物也必须仍含 export（否则动态 import 崩）
  if (/\bexport\b/.test(code) && !/\bexport\b/.test(out)) {
    console.error('[obfuscate] 失败：混淆后丢失 export →', path.basename(file))
    process.exit(1)
  }

  fs.writeFileSync(file, out, 'utf8')
  totalOut += out.length
  console.log(
    `[obfuscate] ${path.basename(file)}  ${(code.length / 1024).toFixed(1)}KB → ${(out.length / 1024).toFixed(1)}KB`,
  )
}

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
