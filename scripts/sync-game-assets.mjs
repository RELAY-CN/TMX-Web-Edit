/**
 * 从游戏官方地块资源目录同步图片到 public/tilesets/bitmaps，
 * 并解析全部 .tsx 外部地块集，生成内置资源清单 src/game/builtin-tilesets.json。
 *
 * 用法: node scripts/sync-game-assets.mjs [资源目录]
 * 默认资源目录: ../../tilesets （TmxConvertImage 工作区内的游戏官方拷贝）
 *
 * 游戏规则（源自反编译源码 TileSet.java / TiledMap.java）:
 *  - 地块集图片统一按"文件名"在游戏 assets 的 tilesets/bitmaps/ 下查找
 *    (GameEngine.k() 会剥掉路径只留文件名)，因此内置图片只需按文件名登记。
 *  - <tileset source="xxx.tsx"> 在 tilesets/ 下查找，支持去掉前导目录的
 *    1/2/3 段回退匹配 (TiledMap.d + TiledMap.a)。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const srcRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(repoRoot, '..', '..', 'tilesets')

const outBitmaps = path.join(repoRoot, 'public', 'tilesets', 'bitmaps')
const outManifest = path.join(repoRoot, 'src', 'game', 'builtin-tilesets.json')

if (!fs.existsSync(srcRoot)) {
  console.error('资源目录不存在: ' + srcRoot)
  process.exit(1)
}

fs.mkdirSync(outBitmaps, { recursive: true })
fs.mkdirSync(path.dirname(outManifest), { recursive: true })

/** @type {Record<string,string>} 文件名(小写) -> 源路径 */
const images = {}
/** @type {any[]} */
const tsxList = []

function walk(dir, rel) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const relPath = rel ? rel + '/' + name : name
    const st = fs.statSync(full)
    if (st.isDirectory()) {
      walk(full, relPath)
    } else if (/\.png$/i.test(name)) {
      const key = name.toLowerCase()
      // 顶层 bitmaps 优先（与游戏 assets 一致）
      if (!(key in images) || relPath.toLowerCase() === 'bitmaps/' + key) {
        images[key] = full
      }
    } else if (/\.tsx$/i.test(name)) {
      tsxList.push({ relPath, full })
    }
  }
}
walk(srcRoot, '')

// ---------- 极简 XML 解析（够用即可, .tsx 结构固定） ----------
function parseAttrs(tag) {
  const attrs = {}
  const re = /([\w-]+)\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(tag))) attrs[m[1]] = m[2]
  return attrs
}

function parseTsx(xml) {
  const tilesetMatch = xml.match(/<tileset\b[^>]*>/)
  if (!tilesetMatch) return null
  const ts = parseAttrs(tilesetMatch[0])
  const imageMatch = xml.match(/<image\b[^>]*>/)
  const image = imageMatch ? parseAttrs(imageMatch[0]) : null
  const tiles = {}
  const tileRe = /<tile\b[^>]*id\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/tile>/g
  let tm
  while ((tm = tileRe.exec(xml))) {
    const id = Number(tm[1])
    const props = {}
    const propRe = /<property\b[^>]*>/g
    let pm
    while ((pm = propRe.exec(tm[2]))) {
      const a = parseAttrs(pm[0])
      if (a.name !== undefined) props[a.name] = a.value ?? ''
    }
    if (Object.keys(props).length) tiles[id] = props
  }
  return { ts, image, tiles }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  /** 内置图片文件名列表（判断"是否官方地块"的依据） */
  images: [],
  /** 外部 .tsx 地块集: 相对路径 -> 定义 */
  tsx: {},
}

for (const { relPath, full } of tsxList) {
  const xml = fs.readFileSync(full, 'utf8')
  const parsed = parseTsx(xml)
  if (!parsed || !parsed.image) continue
  const imgFile = path.basename(parsed.image.source || '')
  manifest.tsx[relPath.replace(/\\/g, '/')] = {
    name: parsed.ts.name || path.basename(relPath, '.tsx'),
    tilewidth: Number(parsed.ts.tilewidth || 20),
    tileheight: Number(parsed.ts.tileheight || 20),
    spacing: Number(parsed.ts.spacing || 0),
    margin: Number(parsed.ts.margin || 0),
    tilecount: Number(parsed.ts.tilecount || 0),
    columns: Number(parsed.ts.columns || 0),
    image: imgFile,
    imagewidth: Number(parsed.image.width || 0),
    imageheight: Number(parsed.image.height || 0),
    tiles: parsed.tiles,
  }
}

let copied = 0
for (const [key, srcPath] of Object.entries(images)) {
  const dst = path.join(outBitmaps, key)
  fs.copyFileSync(srcPath, dst)
  copied++
  manifest.images.push(key)
}
manifest.images.sort()

fs.writeFileSync(outManifest, JSON.stringify(manifest, null, 1), 'utf8')
console.log(`同步完成: ${copied} 张图片 -> public/tilesets/bitmaps, ${Object.keys(manifest.tsx).length} 个 .tsx 清单 -> src/game/builtin-tilesets.json`)
