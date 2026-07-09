<script setup lang="ts">
/**
 * 地图画布：
 *  - 双模式渲染：缩放 < 8px/格 用平均色纹理（1 tile = 1px），>= 8px/格 绘制真实地块
 *  - 工具：笔刷/橡皮/矩形/油漆桶/取色/对象编辑，滚轮缩放，空格或中键平移
 *  - 对象叠加层：矩形、名称标签、选中高亮、拖拽移动/缩放
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { FLIP_D, FLIP_H, FLIP_V, isObjectGroup, isTileLayer, rawGid } from '@/tmx/types'
import type { TmxObject, TmxTileset } from '@/tmx/types'
import { tileSourceRect } from '@/tmx/images'
import { gidColor } from '@/render/avgColor'
import { objectColor } from '@/game/triggers'
import Minimap from '@/components/Minimap.vue'

const store = useEditorStore()
const { rev, structRev, tool, showGrid, showObjects, selectedObjectId, highlightActiveLayer, showMinimap, unitPreset } =
  storeToRefs(store)

const wrapEl = ref<HTMLDivElement>()
const canvasEl = ref<HTMLCanvasElement>()

// 视图状态（世界坐标 = 像素坐标，1 格 = map.tilewidth 像素）
const view = reactive({
  x: 0, // 世界坐标下画布左上角
  y: 0,
  zoom: 1,
})
const zoomText = ref('100%')
const canvasSize = reactive({ w: 0, h: 0 })

let raf = 0
let needRedraw = true
function requestRedraw() {
  needRedraw = true
}

// ---------------- 输入状态 ----------------
let panning = false
let spaceHeld = false
let panStart = { x: 0, y: 0, vx: 0, vy: 0 }
let painting = false
let paintButton = 0
let rectStart: { x: number; y: number } | null = null
const rectPreview = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
const hoverTile = ref<{ x: number; y: number } | null>(null)

// 对象拖拽
type DragMode = 'move' | 'resize-se' | null
let objDrag: {
  mode: DragMode
  groupIndex: number
  id: number
  startX: number
  startY: number
  origX: number
  origY: number
  origW: number
  origH: number
} | null = null

function screenToWorld(sx: number, sy: number) {
  return { x: view.x + sx / view.zoom, y: view.y + sy / view.zoom }
}
function worldToTile(wx: number, wy: number) {
  const m = store.map
  const tw = m?.tilewidth ?? 20
  const th = m?.tileheight ?? 20
  return { x: Math.floor(wx / tw), y: Math.floor(wy / th) }
}

function canvasPos(e: MouseEvent) {
  const rect = canvasEl.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

// ---------------- 渲染 ----------------
let avgTexCanvas: HTMLCanvasElement | null = null
let avgTexCtx: CanvasRenderingContext2D | null = null
let avgTexRev = -1
let avgTexStructRev = -1

function buildAvgTexture() {
  const m = store.map
  if (!m) return
  if (!avgTexCanvas) {
    avgTexCanvas = document.createElement('canvas')
    avgTexCtx = avgTexCanvas.getContext('2d')
  }
  if (avgTexCanvas.width !== m.width || avgTexCanvas.height !== m.height) {
    avgTexCanvas.width = m.width
    avgTexCanvas.height = m.height
  }
  const img = avgTexCtx!.createImageData(m.width, m.height)
  const buf = new Uint32Array(img.data.buffer)
  buf.fill(0xff10120a)
  for (const item of m.layers) {
    if (!isTileLayer(item) || !item.visible) continue
    const data = item.data
    for (let i = 0; i < data.length; i++) {
      const c = gidColor(m, data[i])
      if (c !== 0 && (c >>> 24) > 8) buf[i] = c
    }
  }
  avgTexCtx!.putImageData(img, 0, 0)
  avgTexRev = rev.value
  avgTexStructRev = structRev.value
}

function draw() {
  const canvas = canvasEl.value
  const m = store.map
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  ctx.fillStyle = '#101216'
  ctx.fillRect(0, 0, W, H)
  if (!m) return

  const tw = m.tilewidth
  const th = m.tileheight
  const z = view.zoom
  const pxPerTile = tw * z

  const mapPxW = m.width * tw
  const mapPxH = m.height * th

  // 地图边界底色
  const bx = (0 - view.x) * z
  const by = (0 - view.y) * z
  ctx.fillStyle = '#0b0d08'
  ctx.fillRect(bx, by, mapPxW * z, mapPxH * z)

  if (pxPerTile < 8) {
    // 低缩放：平均色纹理
    if (avgTexRev !== rev.value || avgTexStructRev !== structRev.value || !avgTexCanvas) buildAvgTexture()
    if (avgTexCanvas) {
      ctx.imageSmoothingEnabled = pxPerTile < 2
      ctx.drawImage(
        avgTexCanvas,
        0, 0, m.width, m.height,
        bx, by, mapPxW * z, mapPxH * z,
      )
      ctx.imageSmoothingEnabled = false
    }
  } else {
    // 高缩放：绘制真实地块（只画可见区域）
    ctx.imageSmoothingEnabled = false
    const x0 = Math.max(0, Math.floor(view.x / tw))
    const y0 = Math.max(0, Math.floor(view.y / th))
    const x1 = Math.min(m.width - 1, Math.ceil((view.x + W / z) / tw))
    const y1 = Math.min(m.height - 1, Math.ceil((view.y + H / z) / th))
    const activeIdx = store.activeLayerIndex

    for (let li = 0; li < m.layers.length; li++) {
      const item = m.layers[li]
      if (!isTileLayer(item) || !item.visible) continue
      const dim = highlightActiveLayer.value && activeIdx >= 0 && li !== activeIdx
      ctx.globalAlpha = (dim ? 0.35 : 1) * (item.opacity ?? 1)
      const data = item.data
      const lw = item.width
      for (let ty = y0; ty <= y1; ty++) {
        const rowOff = ty * lw
        for (let tx = x0; tx <= x1; tx++) {
          const gid = data[rowOff + tx]
          if (gid === 0) continue
          drawTile(ctx, m, gid, (tx * tw - view.x) * z, (ty * th - view.y) * z, tw * z, th * z)
        }
      }
      ctx.globalAlpha = 1
    }

    // 网格
    if (showGrid.value && pxPerTile >= 10) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let tx = x0; tx <= x1 + 1; tx++) {
        const sx = Math.round((tx * tw - view.x) * z) + 0.5
        ctx.moveTo(sx, Math.max(0, by))
        ctx.lineTo(sx, Math.min(H, by + mapPxH * z))
      }
      for (let ty = y0; ty <= y1 + 1; ty++) {
        const sy = Math.round((ty * th - view.y) * z) + 0.5
        ctx.moveTo(Math.max(0, bx), sy)
        ctx.lineTo(Math.min(W, bx + mapPxW * z), sy)
      }
      ctx.stroke()
    }
  }

  // 地图边框
  ctx.strokeStyle = '#3a4048'
  ctx.lineWidth = 1
  ctx.strokeRect(bx + 0.5, by + 0.5, mapPxW * z, mapPxH * z)

  // 对象层
  if (showObjects.value) drawObjects(ctx, z)

  // 笔刷预览 / 矩形预览
  drawToolPreview(ctx, z, tw, th)
}

const gidToTilesetCache = new Map<number, TmxTileset | null>()
watch([structRev], () => gidToTilesetCache.clear())

function findTs(gid: number): TmxTileset | null {
  const m = store.map!
  const g = rawGid(gid)
  let ts = gidToTilesetCache.get(g)
  if (ts !== undefined) return ts
  ts = null
  for (const t of m.tilesets) {
    if (t.firstgid <= g && (!ts || t.firstgid > ts.firstgid)) ts = t
  }
  gidToTilesetCache.set(g, ts)
  return ts
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  m: NonNullable<typeof store.map>,
  gid: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const ts = findTs(gid)
  if (!ts || !ts.bitmap) {
    // 缺失地块：紫色占位
    ctx.fillStyle = '#5a2a6a'
    ctx.fillRect(dx, dy, dw, dh)
    return
  }
  const local = rawGid(gid) - ts.firstgid
  const src = tileSourceRect(ts, local)
  const flipH = (gid & FLIP_H) !== 0
  const flipV = (gid & FLIP_V) !== 0
  const flipD = (gid & FLIP_D) !== 0
  if (!flipH && !flipV && !flipD) {
    ctx.drawImage(ts.bitmap, src.x, src.y, src.w, src.h, dx, dy, dw, dh)
    return
  }
  ctx.save()
  ctx.translate(dx + dw / 2, dy + dh / 2)
  if (flipD) {
    ctx.rotate(Math.PI / 2)
    ctx.scale(1, -1)
  }
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
  ctx.drawImage(ts.bitmap, src.x, src.y, src.w, src.h, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
}

function drawObjects(ctx: CanvasRenderingContext2D, z: number) {
  const m = store.map!
  // 编辑对象时才给矩形铺淡填充；平时只描边，避免 Triggers 大区域挡住地形
  const editingObjects = tool.value === 'object' || tool.value === 'unit'
  for (let gi = 0; gi < m.layers.length; gi++) {
    const item = m.layers[gi]
    if (!isObjectGroup(item) || !item.visible) continue
    const isActiveGroup = gi === store.activeObjectGroupIndex
    for (const o of item.objects) {
      const sx = (o.x - view.x) * z
      const sy = (o.y - view.y) * z
      const sw = o.width * z
      const sh = o.height * z
      const col = objectColor(o.type, o.name)
      const selected = isActiveGroup && o.id === selectedObjectId.value

      // 有 gid 的对象画地块图
      if (o.gid) {
        // TMX 对象锚点为左下角
        drawTile(ctx, m, o.gid, sx, sy - (o.height || m.tileheight) * z, sw || m.tilewidth * z, sh || m.tileheight * z)
      }

      ctx.lineWidth = selected ? 2 : 1
      ctx.strokeStyle = col
      if (o.point || (!o.width && !o.height)) {
        ctx.beginPath()
        ctx.arc(sx, sy, selected ? 6 : 4, 0, Math.PI * 2)
        ctx.fillStyle = col
        ctx.fill()
        ctx.stroke()
      } else {
        // 仅选中或正在编辑对象时淡填；否则只描边，不遮挡地形
        if (selected || (editingObjects && isActiveGroup)) {
          ctx.fillStyle = selected ? col + '33' : col + '18'
          ctx.fillRect(sx, sy, sw, sh)
        }
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw, sh)
        if (selected) {
          // 右下角缩放手柄
          ctx.fillStyle = col
          ctx.fillRect(sx + sw - 4, sy + sh - 4, 8, 8)
        }
      }

      // 标签：选中始终显示；未选中仅在放大且编辑对象时显示，减少遮挡
      const showLabel = selected || (editingObjects && z >= 0.5) || (!editingObjects && z >= 0.8)
      if (showLabel) {
        const label = o.name || o.type || '#' + o.id
        if (label) {
          ctx.font = '11px "Segoe UI", sans-serif'
          const tm = ctx.measureText(label)
          ctx.fillStyle = selected ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.45)'
          ctx.fillRect(sx, sy - 14, tm.width + 8, 13)
          ctx.fillStyle = selected ? '#ffffff' : col
          ctx.fillText(label, sx + 4, sy - 4)
        }
      }
    }
  }
}

function drawToolPreview(ctx: CanvasRenderingContext2D, z: number, tw: number, th: number) {
  const t = tool.value
  if (t === 'object' || t === 'pan') return
  const hov = hoverTile.value
  if (!hov) return
  const m = store.map!
  if (t === 'unit' && unitPreset.value) {
    const sx = (hov.x * tw - view.x) * z
    const sy = (hov.y * th - view.y) * z
    ctx.globalAlpha = 0.55
    if (unitPreset.value.gid) {
      drawTile(ctx, m, unitPreset.value.gid, sx, sy, tw * z, th * z)
    } else {
      ctx.fillStyle = '#c0f060'
      ctx.fillRect(sx, sy, tw * z, th * z)
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#40c080'
    ctx.lineWidth = 1.5
    ctx.strokeRect(sx + 0.5, sy + 0.5, tw * z, th * z)
    return
  }
  if (rectPreview.value && t === 'rect') {
    const r = rectPreview.value
    const xa = Math.min(r.x0, r.x1)
    const ya = Math.min(r.y0, r.y1)
    const xb = Math.max(r.x0, r.x1)
    const yb = Math.max(r.y0, r.y1)
    ctx.fillStyle = 'rgba(74,158,255,0.25)'
    ctx.strokeStyle = '#4a9eff'
    ctx.lineWidth = 1
    const sx = (xa * tw - view.x) * z
    const sy = (ya * th - view.y) * z
    ctx.fillRect(sx, sy, (xb - xa + 1) * tw * z, (yb - ya + 1) * th * z)
    ctx.strokeRect(sx + 0.5, sy + 0.5, (xb - xa + 1) * tw * z, (yb - ya + 1) * th * z)
    return
  }
  const stamp = store.stamp
  const w = t === 'brush' && stamp ? stamp.w : 1
  const h = t === 'brush' && stamp ? stamp.h : 1
  const sx = (hov.x * tw - view.x) * z
  const sy = (hov.y * th - view.y) * z
  // 半透明画出图章内容
  if (t === 'brush' && stamp && store.map) {
    ctx.globalAlpha = 0.5
    for (let yy = 0; yy < stamp.h; yy++) {
      for (let xx = 0; xx < stamp.w; xx++) {
        const gid = stamp.gids[yy * stamp.w + xx]
        if (!gid) continue
        drawTile(ctx, m, gid, sx + xx * tw * z, sy + yy * th * z, tw * z, th * z)
      }
    }
    ctx.globalAlpha = 1
  }
  ctx.strokeStyle = t === 'erase' ? '#e05050' : '#4a9eff'
  ctx.lineWidth = 1
  ctx.strokeRect(sx + 0.5, sy + 0.5, w * tw * z, h * th * z)
}

// ---------------- 渲染循环 ----------------
function tick() {
  if (needRedraw) {
    needRedraw = false
    draw()
  }
  raf = requestAnimationFrame(tick)
}

watch([rev, structRev, tool, showGrid, showObjects, selectedObjectId, highlightActiveLayer], requestRedraw)

// ---------------- 事件 ----------------
function fitView() {
  const m = store.map
  const canvas = canvasEl.value
  if (!m || !canvas) return
  const mapPxW = m.width * m.tilewidth
  const mapPxH = m.height * m.tileheight
  const zx = canvas.width / mapPxW
  const zy = canvas.height / mapPxH
  view.zoom = Math.min(zx, zy) * 0.95
  view.zoom = Math.max(0.02, Math.min(8, view.zoom))
  view.x = (mapPxW - canvas.width / view.zoom) / 2
  view.y = (mapPxH - canvas.height / view.zoom) / 2
  zoomText.value = Math.round(view.zoom * 100) + '%'
  requestRedraw()
}

/** 把视口中心移到世界坐标 (wx, wy) */
function centerOn(wx: number, wy: number) {
  const canvas = canvasEl.value
  if (!canvas) return
  view.x = wx - canvas.width / view.zoom / 2
  view.y = wy - canvas.height / view.zoom / 2
  requestRedraw()
}

/** 跳转到格子并高亮 */
function jumpToTile(tx: number, ty: number) {
  const m = store.map
  if (!m) return
  centerOn(tx * m.tilewidth + m.tilewidth / 2, ty * m.tileheight + m.tileheight / 2)
  if (view.zoom < 1) {
    view.zoom = Math.min(2, Math.max(1, view.zoom * 2))
    zoomText.value = Math.round(view.zoom * 100) + '%'
    centerOn(tx * m.tilewidth + m.tilewidth / 2, ty * m.tileheight + m.tileheight / 2)
  }
}

function onMinimapJump(wx: number, wy: number) {
  centerOn(wx, wy)
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const pos = canvasPos(e)
  const before = screenToWorld(pos.x, pos.y)
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  view.zoom = Math.max(0.02, Math.min(12, view.zoom * factor))
  const after = screenToWorld(pos.x, pos.y)
  view.x += before.x - after.x
  view.y += before.y - after.y
  zoomText.value = Math.round(view.zoom * 100) + '%'
  requestRedraw()
}

function hitTestObject(wx: number, wy: number): { groupIndex: number; obj: TmxObject; onHandle: boolean } | null {
  const m = store.map
  if (!m) return null
  // 后画的在上层，倒序检测；优先当前激活组
  const order: number[] = []
  for (let i = m.layers.length - 1; i >= 0; i--) order.push(i)
  order.sort((a, b) => (b === store.activeObjectGroupIndex ? 1 : 0) - (a === store.activeObjectGroupIndex ? 1 : 0))
  const tol = 6 / view.zoom
  for (const gi of order) {
    const item = m.layers[gi]
    if (!isObjectGroup(item) || !item.visible) continue
    for (let oi = item.objects.length - 1; oi >= 0; oi--) {
      const o = item.objects[oi]
      if (o.point || (!o.width && !o.height)) {
        if (Math.abs(wx - o.x) <= tol && Math.abs(wy - o.y) <= tol) {
          return { groupIndex: gi, obj: o, onHandle: false }
        }
      } else {
        const onHandle =
          wx >= o.x + o.width - tol && wx <= o.x + o.width + tol &&
          wy >= o.y + o.height - tol && wy <= o.y + o.height + tol
        if (onHandle || (wx >= o.x && wx <= o.x + o.width && wy >= o.y && wy <= o.y + o.height)) {
          return { groupIndex: gi, obj: o, onHandle }
        }
      }
    }
  }
  return null
}

function applyToolAt(tx: number, ty: number, erase: boolean) {
  const li = store.activeLayerIndex
  if (li < 0) return
  const t = tool.value
  if (t === 'brush') {
    if (erase) {
      store.setTile(li, tx, ty, 0)
    } else if (store.stamp) {
      store.applyStamp(li, tx, ty, store.stamp)
    }
  } else if (t === 'erase') {
    store.setTile(li, tx, ty, 0)
  }
}

function onMouseDown(e: MouseEvent) {
  const pos = canvasPos(e)
  const world = screenToWorld(pos.x, pos.y)
  const tile = worldToTile(world.x, world.y)

  if (e.button === 1 || spaceHeld || tool.value === 'pan') {
    panning = true
    panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    e.preventDefault()
    return
  }
  const m = store.map
  if (!m) return

  if (tool.value === 'object') {
    const hit = hitTestObject(world.x, world.y)
    if (hit) {
      store.activeObjectGroupIndex = hit.groupIndex
      store.selectedObjectId = hit.obj.id
      objDrag = {
        mode: hit.onHandle ? 'resize-se' : 'move',
        groupIndex: hit.groupIndex,
        id: hit.obj.id,
        startX: world.x,
        startY: world.y,
        origX: hit.obj.x,
        origY: hit.obj.y,
        origW: hit.obj.width,
        origH: hit.obj.height,
      }
    } else {
      store.selectedObjectId = -1
    }
    requestRedraw()
    return
  }

  if (tool.value === 'unit') {
    if (e.button === 0) store.placeUnitAt(world.x, world.y)
    requestRedraw()
    return
  }

  if (tool.value === 'picker') {
    store.pickTile(store.activeLayerIndex, tile.x, tile.y)
    requestRedraw()
    return
  }
  if (tool.value === 'fill') {
    const erase = e.button === 2
    store.bucketFill(store.activeLayerIndex, tile.x, tile.y, erase ? null : store.stamp)
    store.commitStroke('油漆桶')
    requestRedraw()
    return
  }
  if (tool.value === 'rect') {
    rectStart = tile
    rectPreview.value = { x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y }
    paintButton = e.button
    requestRedraw()
    return
  }
  // brush / erase
  painting = true
  paintButton = e.button
  applyToolAt(tile.x, tile.y, e.button === 2)
  requestRedraw()
}

function onMouseMove(e: MouseEvent) {
  const pos = canvasPos(e)
  const world = screenToWorld(pos.x, pos.y)
  const tile = worldToTile(world.x, world.y)
  hoverTile.value = tile

  if (panning) {
    view.x = panStart.vx - (e.clientX - panStart.x) / view.zoom
    view.y = panStart.vy - (e.clientY - panStart.y) / view.zoom
    requestRedraw()
    return
  }
  if (objDrag) {
    const dx = world.x - objDrag.startX
    const dy = world.y - objDrag.startY
    const snap = e.ctrlKey ? 1 : store.map!.tilewidth / 2
    const rnd = (v: number) => Math.round(v / snap) * snap
    if (objDrag.mode === 'move') {
      store.nudgeObject(objDrag.groupIndex, objDrag.id, {
        x: rnd(objDrag.origX + dx),
        y: rnd(objDrag.origY + dy),
      })
    } else if (objDrag.mode === 'resize-se') {
      store.nudgeObject(objDrag.groupIndex, objDrag.id, {
        width: Math.max(0, rnd(objDrag.origW + dx)),
        height: Math.max(0, rnd(objDrag.origH + dy)),
      })
    }
    requestRedraw()
    return
  }
  if (painting) {
    applyToolAt(tile.x, tile.y, paintButton === 2)
  }
  if (rectStart && rectPreview.value) {
    rectPreview.value = { x0: rectStart.x, y0: rectStart.y, x1: tile.x, y1: tile.y }
  }
  requestRedraw()
}

function onMouseUp(e: MouseEvent) {
  if (panning) {
    panning = false
    return
  }
  if (objDrag) {
    // 提交一次可撤销的几何修改
    const d = objDrag
    objDrag = null
    const m = store.map
    if (m) {
      const g = m.layers[d.groupIndex]
      if (g && isObjectGroup(g)) {
        const o = g.objects.find((x) => x.id === d.id)
        if (o) {
          const cur = { x: o.x, y: o.y, width: o.width, height: o.height }
          // 先还原再通过 updateObject 记录历史
          o.x = d.origX
          o.y = d.origY
          o.width = d.origW
          o.height = d.origH
          store.updateObject(d.groupIndex, d.id, (obj) => Object.assign(obj, cur), '移动/缩放对象')
        }
      }
    }
    return
  }
  if (painting) {
    painting = false
    store.commitStroke(paintButton === 2 ? '擦除' : '绘制')
    return
  }
  if (rectStart && rectPreview.value) {
    const r = rectPreview.value
    const erase = paintButton === 2
    store.fillRect(store.activeLayerIndex, r.x0, r.y0, r.x1, r.y1, erase ? null : store.stamp)
    store.commitStroke('矩形填充')
    rectStart = null
    rectPreview.value = null
    requestRedraw()
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
  if (e.code === 'Space') {
    spaceHeld = true
    e.preventDefault()
    return
  }
  if (e.ctrlKey && e.code === 'KeyZ') {
    e.shiftKey ? store.redo() : store.undo()
    e.preventDefault()
    return
  }
  if (e.ctrlKey && e.code === 'KeyY') {
    store.redo()
    e.preventDefault()
    return
  }
  if (e.ctrlKey && e.code === 'KeyC') {
    e.preventDefault()
    if (store.tool === 'object' && store.selectedObjectId >= 0) {
      store.copySelectedObject()
    } else if (store.stamp) {
      store.clipboard = { kind: 'tiles', w: store.stamp.w, h: store.stamp.h, gids: [...store.stamp.gids] }
      store.setStatus(`已复制 ${store.stamp.w}×${store.stamp.h} 图章到剪贴板`)
    }
    return
  }
  if (e.ctrlKey && e.code === 'KeyV') {
    e.preventDefault()
    const clip = store.clipboard
    if (!clip) return
    if (clip.kind === 'object') {
      store.pasteObject()
    } else if (clip.kind === 'tiles' && hoverTile.value && store.activeLayerIndex >= 0) {
      store.pasteTiles(store.activeLayerIndex, hoverTile.value.x, hoverTile.value.y)
    }
    return
  }
  if (e.ctrlKey && e.code === 'KeyD') {
    // 复制并粘贴选中对象
    e.preventDefault()
    if (store.selectedObjectId >= 0) {
      store.copySelectedObject()
      store.pasteObject()
    }
    return
  }
  switch (e.code) {
    case 'KeyB': store.tool = 'brush'; break
    case 'KeyE': store.tool = 'erase'; break
    case 'KeyR': store.tool = 'rect'; break
    case 'KeyF': store.tool = 'fill'; break
    case 'KeyI': store.tool = 'picker'; break
    case 'KeyO': store.tool = 'object'; break
    case 'KeyU': store.tool = 'unit'; break
    case 'KeyG': store.showGrid = !store.showGrid; break
    case 'KeyH': store.showObjects = !store.showObjects; break
    case 'KeyM': store.showMinimap = !store.showMinimap; break
    case 'Delete':
    case 'Backspace':
      if (store.tool === 'object' && store.selectedObjectId >= 0 && store.activeObjectGroupIndex >= 0) {
        store.removeObject(store.activeObjectGroupIndex, store.selectedObjectId)
      }
      break
  }
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld = false
}

function resize() {
  const wrap = wrapEl.value
  const canvas = canvasEl.value
  if (!wrap || !canvas) return
  const r = wrap.getBoundingClientRect()
  canvas.width = Math.max(50, Math.floor(r.width))
  canvas.height = Math.max(50, Math.floor(r.height))
  canvasSize.w = canvas.width
  canvasSize.h = canvas.height
  requestRedraw()
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  resize()
  resizeObserver = new ResizeObserver(resize)
  if (wrapEl.value) resizeObserver.observe(wrapEl.value)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mouseup', onMouseUp)
  raf = requestAnimationFrame(tick)
  fitView()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('mouseup', onMouseUp)
})

// 打开新地图时适配视图
watch(
  () => store.fileName + ':' + (store.map ? store.map.width + 'x' + store.map.height : ''),
  () => {
    gidToTilesetCache.clear()
    fitView()
  },
)

const cursorStyle = computed(() => {
  if (tool.value === 'pan') return 'grab'
  if (tool.value === 'object') return 'default'
  if (tool.value === 'picker') return 'crosshair'
  if (tool.value === 'unit') return 'copy'
  return 'crosshair'
})

defineExpose({ fitView, centerOn, jumpToTile })
</script>

<template>
  <div ref="wrapEl" class="canvas-wrap">
    <canvas
      ref="canvasEl"
      :style="{ cursor: cursorStyle }"
      @wheel="onWheel"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @contextmenu.prevent
    />
    <Minimap
      v-if="showMinimap"
      :view-x="view.x"
      :view-y="view.y"
      :view-zoom="view.zoom"
      :canvas-w="canvasSize.w"
      :canvas-h="canvasSize.h"
      @jump="onMinimapJump"
    />
    <div class="canvas-hud">
      <span>{{ zoomText }}</span>
      <span v-if="hoverTile">格 {{ hoverTile.x }}, {{ hoverTile.y }}</span>
      <span v-if="tool === 'unit' && unitPreset" class="unit-tip">
        {{ unitPreset.unit || unitPreset.customUnit }} t:{{ unitPreset.team }}
      </span>
      <button class="icon" title="适配视图" @click="fitView()">⛶</button>
    </div>
  </div>
</template>

<style scoped>
.canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #101216;
}
canvas {
  display: block;
}
.canvas-hud {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 10px;
  align-items: center;
  background: rgba(20, 22, 28, 0.85);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-dim);
  user-select: none;
  z-index: 6;
}
.unit-tip {
  color: var(--ok);
}
</style>
