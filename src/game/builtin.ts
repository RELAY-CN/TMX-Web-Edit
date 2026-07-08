/**
 * 游戏内置地块资源访问层。
 * builtin-tilesets.json 由 scripts/sync-game-assets.mjs 从游戏官方资源生成。
 *
 * 判定规则（对应 TileSet.java）：
 *  - 图片按文件名在 tilesets/bitmaps/ 查找 → 文件名在内置清单中 = 官方地块，保存时不内嵌;
 *  - 不在清单中 = 玩家自定义地块，保存时必须写 embedded_png(base64) 进 TMX。
 */
import manifest from './builtin-tilesets.json'
import type { TmxProperties, TmxTileset } from '@/tmx/types'

export interface TsxDef {
  name: string
  tilewidth: number
  tileheight: number
  spacing: number
  margin: number
  tilecount: number
  columns: number
  image: string
  imagewidth: number
  imageheight: number
  tiles: Record<string, TmxProperties>
}

const tsxMap: Record<string, TsxDef> = manifest.tsx as unknown as Record<string, TsxDef>
const imageSet = new Set<string>(manifest.images as string[])

/** 是否游戏内置图片（按文件名，大小写不敏感） */
export function isBuiltinImage(filename: string): boolean {
  return imageSet.has(filename.toLowerCase())
}

/** 内置图片 URL（相对应用根路径） */
export function builtinImageUrl(filename: string): string {
  return `${import.meta.env.BASE_URL}tilesets/bitmaps/${filename.toLowerCase()}`
}

/**
 * 解析外部 .tsx 引用。模拟游戏 TiledMap.d()+a() 的目录回退规则：
 * 先按完整路径找，再取后 2 段、后 1 段。
 */
export function resolveTsx(source: string): Omit<TmxTileset, 'firstgid' | 'source'> | null {
  const norm = source.replace(/\\/g, '/').replace(/^\.\//, '')
  const segs = norm.split('/')
  const candidates: string[] = [norm]
  if (segs.length >= 2) candidates.push(segs.slice(-2).join('/'))
  candidates.push(segs[segs.length - 1])

  let def: TsxDef | null = null
  for (const c of candidates) {
    // 大小写不敏感匹配
    const hit = Object.keys(tsxMap).find((k) => k.toLowerCase() === c.toLowerCase())
    if (hit) {
      def = tsxMap[hit]
      break
    }
  }
  if (!def) return null

  const tileProperties: Record<number, TmxProperties> = {}
  for (const [id, props] of Object.entries(def.tiles)) {
    tileProperties[Number(id)] = { ...props }
  }
  return {
    name: def.name,
    tilewidth: def.tilewidth,
    tileheight: def.tileheight,
    spacing: def.spacing,
    margin: def.margin,
    tilecount: def.tilecount,
    columns: def.columns,
    image: def.image,
    imagewidth: def.imagewidth,
    imageheight: def.imageheight,
    properties: {},
    tileProperties,
    builtin: true,
  }
}

/** 所有可添加的内置 .tsx 地块集（按目录分组展示用） */
export function listBuiltinTsx(): { path: string; def: TsxDef }[] {
  return Object.entries(tsxMap)
    .map(([path, def]) => ({ path, def }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export { manifest }
