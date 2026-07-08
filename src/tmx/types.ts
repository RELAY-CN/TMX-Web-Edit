/**
 * TMX 数据模型 —— 针对铁锈战争（Rusted Warfare）实际使用的子集。
 * 依据反编译源码 TiledMap.java / TileSet.java / Layer.java / ObjectGroup.java 建模。
 */

/** 属性集（TMX <properties>）。值统一存字符串；multiline 属性（如 embedded_png）也放这里 */
export type TmxProperties = Record<string, string>

export interface TmxTileset {
  /** 首个全局 gid */
  firstgid: number
  /** 名称 */
  name: string
  /** 外部 .tsx 引用路径（如 "terrain/Dirt.tsx"），内联地块集为 undefined */
  source?: string
  tilewidth: number
  tileheight: number
  spacing: number
  margin: number
  tilecount: number
  columns: number
  /** <image source="..."> 的文件名（游戏只按文件名在 tilesets/bitmaps/ 下查找） */
  image: string
  imagewidth: number
  imageheight: number
  /** tileset 级属性；自定义地块集在此包含 embedded_png（base64 PNG） */
  properties: TmxProperties
  /** 每个 tile id（局部 id，不含 firstgid）的属性，例如 { unit: "tank", team: "0" } */
  tileProperties: Record<number, TmxProperties>
  /** ===== 运行时字段（不序列化） ===== */
  /** 解码后的图片（可绘制） */
  bitmap?: ImageBitmap | HTMLImageElement | HTMLCanvasElement
  /** 是否游戏内置地块集（保存时不内嵌图片数据） */
  builtin?: boolean
  /** 图片是否缺失（既非内置也无内嵌数据） */
  missing?: boolean
}

export interface TmxLayer {
  kind: 'tile'
  name: string
  width: number
  height: number
  visible: boolean
  opacity: number
  properties: TmxProperties
  /** gid 数组（含 flip 位），长度 = width*height，按行优先 [y*width+x] */
  data: Uint32Array
  /** 未知的原始 XML 属性（保留往返） */
  extraAttrs: Record<string, string>
}

export interface TmxObject {
  id: number
  name: string
  /** 触发器类型（type 属性），如 unitAdd / mapText / unitDetect ... */
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** 有 gid 的对象（单位对象等） */
  gid?: number
  visible: boolean
  properties: TmxProperties
  /** 点对象 <point/> */
  point?: boolean
  /** 椭圆对象 <ellipse/>（游戏当矩形处理，仅保留） */
  ellipse?: boolean
  extraAttrs: Record<string, string>
}

export interface TmxObjectGroup {
  kind: 'objectgroup'
  name: string
  visible: boolean
  opacity: number
  color?: string
  properties: TmxProperties
  objects: TmxObject[]
  extraAttrs: Record<string, string>
}

export type TmxGroupItem = TmxLayer | TmxObjectGroup

export interface TmxMap {
  version: string
  tiledversion?: string
  orientation: 'orthogonal'
  renderorder: string
  width: number
  height: number
  tilewidth: number
  tileheight: number
  nextobjectid: number
  properties: TmxProperties
  tilesets: TmxTileset[]
  /** 图层与对象组，保持文档顺序 */
  layers: TmxGroupItem[]
  /** 地图根元素上的未知属性（保留往返） */
  extraAttrs: Record<string, string>
}

/** GID flip 标志位（与游戏 Layer.java 一致） */
export const FLIP_H = 0x80000000
export const FLIP_V = 0x40000000
export const FLIP_D = 0x20000000
export const GID_MASK = 0x1fffffff

export function rawGid(gid: number): number {
  return (gid & GID_MASK) >>> 0
}

export function isTileLayer(item: TmxGroupItem): item is TmxLayer {
  return item.kind === 'tile'
}

export function isObjectGroup(item: TmxGroupItem): item is TmxObjectGroup {
  return item.kind === 'objectgroup'
}

/** 在地图的多个地块集中定位 gid 归属（与游戏 TiledMap.a(int) 一致：firstgid..max 区间） */
export function findTilesetForGid(map: TmxMap, gid: number): TmxTileset | null {
  const g = rawGid(gid)
  if (g === 0) return null
  let best: TmxTileset | null = null
  for (const ts of map.tilesets) {
    if (ts.firstgid <= g) {
      if (!best || ts.firstgid > best.firstgid) best = ts
    }
  }
  return best
}
