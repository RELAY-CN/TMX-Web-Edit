/**
 * 每个地块的平均颜色缓存 —— 用于低缩放级别的快速渲染（1 tile = 1 像素纹理）。
 */
import type { TmxMap, TmxTileset } from '@/tmx/types'
import { rawGid } from '@/tmx/types'

const cache = new WeakMap<TmxTileset, Uint32Array>()

/** 计算地块集中每个 tile 的平均颜色（ABGR packed，直接写入 ImageData 缓冲区） */
export function tilesetAvgColors(ts: TmxTileset): Uint32Array | null {
  if (!ts.bitmap) return null
  let colors = cache.get(ts)
  if (colors) return colors

  const cols = ts.columns || 1
  const rows = Math.max(1, Math.ceil(Math.max(ts.tilecount, 1) / cols))
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true

  // 把每个 tile 中心区域缩到 1px：直接整图缩放近似（margin/spacing 小时误差可忽略）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx = ts.margin + c * (ts.tilewidth + ts.spacing)
      const sy = ts.margin + r * (ts.tileheight + ts.spacing)
      ctx.drawImage(ts.bitmap, sx, sy, ts.tilewidth, ts.tileheight, c, r, 1, 1)
    }
  }
  const img = ctx.getImageData(0, 0, cols, rows)
  colors = new Uint32Array(img.data.buffer.slice(0))
  cache.set(ts, colors)
  return colors
}

export function invalidateAvgColors(ts: TmxTileset): void {
  cache.delete(ts)
}

/** gid -> ABGR 颜色（0 表示透明/无） */
export function gidColor(map: TmxMap, gid: number): number {
  const g = rawGid(gid)
  if (!g) return 0
  let best: TmxTileset | null = null
  for (const ts of map.tilesets) {
    if (ts.firstgid <= g && (!best || ts.firstgid > best.firstgid)) best = ts
  }
  if (!best) return 0
  const colors = tilesetAvgColors(best)
  if (!colors) return 0xff404040
  const local = g - best.firstgid
  if (local < 0 || local >= colors.length) return 0xff404040
  return colors[local]
}
