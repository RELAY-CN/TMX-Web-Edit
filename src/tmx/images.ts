/**
 * 地块集图片加载：
 *  - embedded_png 属性（base64 PNG，自定义地块集，对应 TileSet.a() 的 [EMBED] 机制）
 *  - 内置图片（按文件名从 public/tilesets/bitmaps/ 加载）
 */
import { base64ToBytes } from './base64'
import type { TmxMap, TmxTileset } from './types'
import { builtinImageUrl, isBuiltinImage } from '@/game/builtin'

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败: ' + url))
    img.src = url
  })
}

export async function loadImageFromBase64Png(b64: string): Promise<ImageBitmap | HTMLImageElement> {
  const bytes = base64ToBytes(b64)
  const buf = new Uint8Array(bytes.length)
  buf.set(bytes)
  const blob = new Blob([buf.buffer as ArrayBuffer], { type: 'image/png' })
  if ('createImageBitmap' in window) {
    return createImageBitmap(blob)
  }
  const url = URL.createObjectURL(blob)
  try {
    return await loadImageFromUrl(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 为单个地块集解析并加载位图，设置 builtin/missing 标记 */
export async function loadTilesetBitmap(ts: TmxTileset): Promise<void> {
  const embedded = ts.properties['embedded_png']
  if (embedded && embedded.trim()) {
    try {
      ts.bitmap = await loadImageFromBase64Png(embedded.replace(/\s+/g, ''))
      ts.builtin = false
      ts.missing = false
      syncTilesetGeometry(ts)
      return
    } catch (e) {
      console.warn('embedded_png 解码失败: ' + ts.name, e)
    }
  }
  if (ts.image && isBuiltinImage(ts.image)) {
    try {
      ts.bitmap = await loadImageFromUrl(builtinImageUrl(ts.image))
      ts.builtin = true
      ts.missing = false
      syncTilesetGeometry(ts)
      return
    } catch (e) {
      console.warn('内置图片加载失败: ' + ts.image, e)
    }
  }
  ts.builtin = false
  ts.missing = true
}

/** 依据实际位图尺寸修正 columns/tilecount（与游戏动态计算列数一致） */
export function syncTilesetGeometry(ts: TmxTileset): void {
  if (!ts.bitmap) return
  const w = ts.bitmap.width
  const h = ts.bitmap.height
  ts.imagewidth = w
  ts.imageheight = h
  const stepX = ts.tilewidth + ts.spacing
  const stepY = ts.tileheight + ts.spacing
  const cols = Math.max(1, Math.floor((w - ts.margin * 2 + ts.spacing) / stepX))
  const rows = Math.max(1, Math.floor((h - ts.margin * 2 + ts.spacing) / stepY))
  ts.columns = cols
  ts.tilecount = cols * rows
}

export async function loadAllTilesetBitmaps(map: TmxMap): Promise<void> {
  await Promise.all(map.tilesets.map((ts) => loadTilesetBitmap(ts)))
}

/** 地块集中局部 tile id 的源矩形（与 TileSet.a(int,Rect) 一致 + margin 支持） */
export function tileSourceRect(
  ts: TmxTileset,
  localId: number,
): { x: number; y: number; w: number; h: number } {
  const cols = ts.columns || 1
  const col = localId % cols
  const row = Math.floor(localId / cols)
  return {
    x: ts.margin + col * (ts.tilewidth + ts.spacing),
    y: ts.margin + row * (ts.tileheight + ts.spacing),
    w: ts.tilewidth,
    h: ts.tileheight,
  }
}
