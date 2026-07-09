/**
 * TMX 导出体积优化。
 * 自定义 embedded_png 地块集只在导出副本中裁剪，编辑器内的原始地图保持不变。
 */
import { bytesToBase64 } from './base64'
import { tileSourceRect } from './images'
import type { TmxLayer, TmxMap, TmxObject, TmxObjectGroup, TmxTileset } from './types'
import { GID_MASK, isObjectGroup, isTileLayer, rawGid } from './types'

export interface TilesetCompactionGeometry {
  columns: number
  rows: number
}

export interface CompactTilesetImageResult {
  embeddedPng: string
  imagewidth: number
  imageheight: number
  bitmap?: HTMLCanvasElement | HTMLImageElement | ImageBitmap
}

export interface CompactTilesetImageEncoder {
  (
    ts: TmxTileset,
    usedLocalIds: number[],
    geometry: TilesetCompactionGeometry,
  ): Promise<CompactTilesetImageResult>
}

export interface EmbeddedTilesetUsagePlan {
  tilesetIndex: number
  firstgid: number
  nextFirstgid: number
  usedLocalIds: number[]
  referencedGids: number
  tilecount: number
  eligible: boolean
  hasBitmap: boolean
  unusedTileCount: number
}

export interface EmbeddedTilesetOptimizationStats {
  compactedTilesets: number
  removedTilesets: number
  skippedTilesets: number
  remappedGids: number
  beforeEmbeddedBytes: number
  afterEmbeddedBytes: number
}

export interface EmbeddedTilesetOptimizationResult {
  map: TmxMap
  stats: EmbeddedTilesetOptimizationStats
}

export function isEmbeddedCustomTileset(ts: TmxTileset): boolean {
  return !ts.builtin && !ts.source && Boolean(ts.properties.embedded_png?.trim())
}

export function compactTilesetGeometry(usedCount: number): TilesetCompactionGeometry {
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, usedCount))))
  return { columns, rows: Math.max(1, Math.ceil(Math.max(1, usedCount) / columns)) }
}

export function analyzeEmbeddedTilesetUsage(map: TmxMap): EmbeddedTilesetUsagePlan[] {
  return map.tilesets.map((ts, tilesetIndex) => {
    const nextFirstgid = nextTilesetFirstgid(map, tilesetIndex)
    const used = new Set<number>()
    let referencedGids = 0
    const visit = (gid: number | undefined) => {
      if (gid === undefined) return
      const g = rawGid(gid)
      if (g < ts.firstgid || g >= nextFirstgid) return
      referencedGids++
      const local = g - ts.firstgid
      if (local >= 0 && local < ts.tilecount) used.add(local)
    }
    for (const layer of map.layers) {
      if (isTileLayer(layer)) {
        for (let i = 0; i < layer.data.length; i++) visit(layer.data[i])
      } else if (isObjectGroup(layer)) {
        for (const obj of layer.objects) visit(obj.gid)
      }
    }
    const usedLocalIds = Array.from(used).sort((a, b) => a - b)
    return {
      tilesetIndex,
      firstgid: ts.firstgid,
      nextFirstgid,
      usedLocalIds,
      referencedGids,
      tilecount: ts.tilecount,
      eligible: isEmbeddedCustomTileset(ts),
      hasBitmap: Boolean(ts.bitmap),
      unusedTileCount: Math.max(0, ts.tilecount - usedLocalIds.length),
    }
  })
}

export async function optimizeEmbeddedTilesetsForSerialization(
  map: TmxMap,
  encoder: CompactTilesetImageEncoder = encodeCompactTilesetPng,
): Promise<EmbeddedTilesetOptimizationResult> {
  const plans = analyzeEmbeddedTilesetUsage(map)
  const out = cloneMapForSerialization(map)
  const stats: EmbeddedTilesetOptimizationStats = {
    compactedTilesets: 0,
    removedTilesets: 0,
    skippedTilesets: 0,
    remappedGids: 0,
    beforeEmbeddedBytes: 0,
    afterEmbeddedBytes: 0,
  }
  const remaps = new Map<number, Map<number, number>>()
  const removed = new Set<number>()

  for (const plan of plans) {
    if (!plan.eligible) continue
    const sourceTs = map.tilesets[plan.tilesetIndex]
    const outTs = out.tilesets[plan.tilesetIndex]
    const oldEmbedded = sourceTs.properties.embedded_png ?? ''
    stats.beforeEmbeddedBytes += base64ByteLength(oldEmbedded)

    if (!plan.hasBitmap) {
      stats.skippedTilesets++
      stats.afterEmbeddedBytes += base64ByteLength(oldEmbedded)
      continue
    }

    if (plan.referencedGids === 0) {
      removed.add(plan.tilesetIndex)
      stats.removedTilesets++
      continue
    }

    const alreadyTight =
      plan.usedLocalIds.length === sourceTs.tilecount &&
      sourceTs.spacing === 0 &&
      sourceTs.margin === 0
    if (alreadyTight) {
      stats.afterEmbeddedBytes += base64ByteLength(oldEmbedded)
      continue
    }

    if (plan.usedLocalIds.length === 0) {
      stats.skippedTilesets++
      stats.afterEmbeddedBytes += base64ByteLength(oldEmbedded)
      continue
    }

    const geometry = compactTilesetGeometry(plan.usedLocalIds.length)
    const encoded = await encoder(sourceTs, plan.usedLocalIds, geometry)
    const localRemap = new Map<number, number>()
    const tileProperties: TmxTileset['tileProperties'] = {}
    plan.usedLocalIds.forEach((oldLocal, newLocal) => {
      localRemap.set(oldLocal, newLocal)
      const props = sourceTs.tileProperties[oldLocal]
      if (props && Object.keys(props).length) tileProperties[newLocal] = { ...props }
    })
    remaps.set(plan.tilesetIndex, localRemap)

    outTs.spacing = 0
    outTs.margin = 0
    outTs.columns = geometry.columns
    outTs.tilecount = plan.usedLocalIds.length
    outTs.imagewidth = encoded.imagewidth
    outTs.imageheight = encoded.imageheight
    outTs.properties = { ...outTs.properties, embedded_png: encoded.embeddedPng }
    outTs.tileProperties = tileProperties
    outTs.bitmap = encoded.bitmap
    outTs.builtin = false
    outTs.missing = false
    stats.compactedTilesets++
    stats.afterEmbeddedBytes += base64ByteLength(encoded.embeddedPng)
  }

  if (remaps.size) stats.remappedGids = remapGids(out, map, remaps)
  if (removed.size) out.tilesets = out.tilesets.filter((_, index) => !removed.has(index))

  return { map: out, stats }
}

export const encodeCompactTilesetPng: CompactTilesetImageEncoder = async (ts, usedLocalIds, geometry) => {
  if (!ts.bitmap) throw new Error(`地块集 ${ts.name || ts.image} 没有可裁剪的位图`)
  const canvas = document.createElement('canvas')
  canvas.width = geometry.columns * ts.tilewidth
  canvas.height = geometry.rows * ts.tileheight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D，无法优化地块集')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < usedLocalIds.length; i++) {
    const src = tileSourceRect(ts, usedLocalIds[i])
    const x = (i % geometry.columns) * ts.tilewidth
    const y = Math.floor(i / geometry.columns) * ts.tileheight
    ctx.drawImage(ts.bitmap, src.x, src.y, src.w, src.h, x, y, ts.tilewidth, ts.tileheight)
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('PNG 编码失败'))
    }, 'image/png')
  })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return {
    embeddedPng: bytesToBase64(bytes),
    imagewidth: canvas.width,
    imageheight: canvas.height,
    bitmap: canvas,
  }
}

function cloneMapForSerialization(map: TmxMap): TmxMap {
  return {
    version: map.version,
    tiledversion: map.tiledversion,
    orientation: map.orientation,
    renderorder: map.renderorder,
    width: map.width,
    height: map.height,
    tilewidth: map.tilewidth,
    tileheight: map.tileheight,
    nextobjectid: map.nextobjectid,
    properties: { ...map.properties },
    tilesets: map.tilesets.map((ts) => ({
      ...ts,
      properties: { ...ts.properties },
      tileProperties: cloneTileProperties(ts.tileProperties),
    })),
    layers: map.layers.map((layer) => {
      if (isTileLayer(layer)) return cloneLayer(layer)
      return cloneObjectGroup(layer)
    }),
    extraAttrs: { ...map.extraAttrs },
  }
}

function cloneTileProperties(input: TmxTileset['tileProperties']): TmxTileset['tileProperties'] {
  const out: TmxTileset['tileProperties'] = {}
  for (const [id, props] of Object.entries(input)) out[Number(id)] = { ...props }
  return out
}

function cloneLayer(layer: TmxLayer): TmxLayer {
  return {
    ...layer,
    properties: { ...layer.properties },
    data: new Uint32Array(layer.data),
    extraAttrs: { ...layer.extraAttrs },
  }
}

function cloneObjectGroup(group: TmxObjectGroup): TmxObjectGroup {
  return {
    ...group,
    properties: { ...group.properties },
    objects: group.objects.map(cloneObject),
    extraAttrs: { ...group.extraAttrs },
  }
}

function cloneObject(obj: TmxObject): TmxObject {
  return {
    ...obj,
    properties: { ...obj.properties },
    extraAttrs: { ...obj.extraAttrs },
  }
}

function remapGids(out: TmxMap, source: TmxMap, remaps: Map<number, Map<number, number>>): number {
  let changed = 0
  const remap = (gid: number): number => {
    const g = rawGid(gid)
    const index = source.tilesets.findIndex((ts, i) => g >= ts.firstgid && g < nextTilesetFirstgid(source, i))
    if (index < 0) return gid
    const localRemap = remaps.get(index)
    if (!localRemap) return gid
    const local = g - source.tilesets[index].firstgid
    const nextLocal = localRemap.get(local)
    if (nextLocal === undefined) return gid
    const next = ((gid & ~GID_MASK) | (source.tilesets[index].firstgid + nextLocal)) >>> 0
    changed++
    return next
  }
  for (const layer of out.layers) {
    if (isTileLayer(layer)) {
      for (let i = 0; i < layer.data.length; i++) layer.data[i] = remap(layer.data[i])
    } else if (isObjectGroup(layer)) {
      for (const obj of layer.objects) {
        if (obj.gid !== undefined) obj.gid = remap(obj.gid)
      }
    }
  }
  return changed
}

function nextTilesetFirstgid(map: TmxMap, index: number): number {
  const current = map.tilesets[index]
  const next = map.tilesets
    .filter((ts) => ts.firstgid > current.firstgid)
    .map((ts) => ts.firstgid)
  return next.length ? Math.min(...next) : Number.POSITIVE_INFINITY
}

function base64ByteLength(b64: string): number {
  const s = b64.replace(/\s+/g, '')
  if (!s) return 0
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((s.length * 3) / 4) - padding)
}
