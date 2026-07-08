/**
 * 编辑器全局状态（Pinia）。
 * map 使用 shallowRef + 修订号（rev）驱动重绘，避免对大型 Uint32Array 做深层响应式代理。
 */
import { defineStore } from 'pinia'
import { markRaw, shallowRef } from 'vue'
import type { TmxLayer, TmxMap, TmxObject, TmxObjectGroup, TmxTileset } from '@/tmx/types'
import { isObjectGroup, isTileLayer } from '@/tmx/types'
import { parseTmx } from '@/tmx/parse'
import { serializeTmx } from '@/tmx/serialize'
import { loadAllTilesetBitmaps, loadTilesetBitmap, syncTilesetGeometry } from '@/tmx/images'
import { resolveTsx } from '@/game/builtin'
import { createNewMap, type NewMapOptions } from '@/game/mapFactory'
import { bytesToBase64 } from '@/tmx/base64'

export type ToolId = 'pan' | 'brush' | 'erase' | 'rect' | 'fill' | 'picker' | 'object' | 'unit'

/** 笔刷图章：从地块面板选取的一块 gid 矩阵 */
export interface Stamp {
  w: number
  h: number
  gids: number[]
}

/** 剪贴板：地块区域或对象 */
export type Clipboard =
  | { kind: 'tiles'; w: number; h: number; gids: number[] }
  | { kind: 'object'; data: Omit<TmxObject, 'id'> }

/** 单位摆放预置（从单位面板选取） */
export interface UnitPlacePreset {
  unit: string
  team: string
  customUnit?: string
  /** 若来自 units.tsx 地块，带上 gid 以便画布预览 */
  gid?: number
}

interface TilePatch {
  layerIndex: number
  idx: number
  before: number
  after: number
}

interface HistoryEntry {
  label: string
  undo: () => void
  redo: () => void
}

let objectSeq = 1

export const useEditorStore = defineStore('editor', {
  state: () => ({
    mapRef: shallowRef<TmxMap | null>(null),
    /** 地图数据修订号，画布监听它重绘 */
    rev: 0,
    /** 结构修订号（图层增删/地块集变化），面板监听 */
    structRev: 0,
    fileName: 'untitled.tmx',
    dirty: false,

    tool: 'brush' as ToolId,
    activeLayerIndex: -1,
    activeObjectGroupIndex: -1,
    /** 当前笔刷 */
    stamp: null as Stamp | null,
    /** 地块面板当前地块集索引 */
    activeTilesetIndex: 0,

    /** 选中的对象（对象组索引 + 对象 id） */
    selectedObjectId: -1,

    /** 剪贴板 */
    clipboard: null as Clipboard | null,
    /** 单位摆放预置 */
    unitPreset: null as UnitPlacePreset | null,
    /** 默认摆放队伍 */
    placeTeam: '0',

    /** 视图设置 */
    showGrid: true,
    showObjects: true,
    showMinimap: true,
    highlightActiveLayer: false,

    history: [] as HistoryEntry[],
    historyIndex: -1,
    /** 当前笔画的补丁缓存（鼠标按下到抬起为一批） */
    strokePatches: [] as TilePatch[],

    statusMessage: '',
    loading: false,
  }),

  getters: {
    map(state): TmxMap | null {
      return state.mapRef as unknown as TmxMap | null
    },
    tileLayers(state): { layer: TmxLayer; index: number }[] {
      void state.structRev
      const m = this.map
      if (!m) return []
      return m.layers
        .map((l, index) => ({ layer: l as TmxLayer, index }))
        .filter((e) => isTileLayer(e.layer as TmxLayer))
    },
    objectGroups(state): { group: TmxObjectGroup; index: number }[] {
      void state.structRev
      const m = this.map
      if (!m) return []
      return m.layers
        .map((l, index) => ({ group: l as TmxObjectGroup, index }))
        .filter((e) => isObjectGroup(e.group as TmxObjectGroup))
    },
    activeLayer(): TmxLayer | null {
      const m = this.map
      if (!m) return null
      const l = m.layers[this.activeLayerIndex]
      return l && isTileLayer(l) ? l : null
    },
    activeObjectGroup(): TmxObjectGroup | null {
      const m = this.map
      if (!m) return null
      const g = m.layers[this.activeObjectGroupIndex]
      return g && isObjectGroup(g) ? g : null
    },
    selectedObject(): TmxObject | null {
      const g = this.activeObjectGroup
      if (!g) return null
      return g.objects.find((o) => o.id === this.selectedObjectId) ?? null
    },
    canUndo: (s) => s.historyIndex >= 0,
    canRedo: (s) => s.historyIndex < s.history.length - 1,
  },

  actions: {
    bump() {
      this.rev++
      this.dirty = true
    },
    bumpStruct() {
      this.structRev++
      this.bump()
    },

    setStatus(msg: string) {
      this.statusMessage = msg
    },

    // ---------------- 文件 ----------------
    async openTmxText(text: string, fileName: string) {
      this.loading = true
      try {
        const map = parseTmx(text, resolveTsx)
        markRaw(map)
        await loadAllTilesetBitmaps(map)
        this.mapRef = map
        this.fileName = fileName
        this.history = []
        this.historyIndex = -1
        this.dirty = false
        this.selectedObjectId = -1
        this.pickDefaultLayers()
        this.structRev++
        this.rev++
        this.setStatus(`已打开 ${fileName}（${map.width}x${map.height}）`)
      } finally {
        this.loading = false
      }
    },

    async newMap(opts: NewMapOptions) {
      this.loading = true
      try {
        const map = createNewMap(opts)
        markRaw(map)
        await loadAllTilesetBitmaps(map)
        this.mapRef = map
        this.fileName = 'untitled.tmx'
        this.history = []
        this.historyIndex = -1
        this.dirty = false
        this.selectedObjectId = -1
        this.pickDefaultLayers()
        this.structRev++
        this.rev++
        this.setStatus(`已新建地图 ${map.width}x${map.height}`)
      } finally {
        this.loading = false
      }
    },

    pickDefaultLayers() {
      const m = this.map
      if (!m) return
      this.activeLayerIndex = -1
      this.activeObjectGroupIndex = -1
      m.layers.forEach((l, i) => {
        if (isTileLayer(l) && l.name.toLowerCase() === 'ground' && this.activeLayerIndex === -1) {
          this.activeLayerIndex = i
        }
        if (isObjectGroup(l) && l.name.toLowerCase() === 'triggers' && this.activeObjectGroupIndex === -1) {
          this.activeObjectGroupIndex = i
        }
      })
      if (this.activeLayerIndex === -1) {
        this.activeLayerIndex = m.layers.findIndex((l) => isTileLayer(l))
      }
      if (this.activeObjectGroupIndex === -1) {
        this.activeObjectGroupIndex = m.layers.findIndex((l) => isObjectGroup(l))
      }
      this.activeTilesetIndex = Math.max(0, m.tilesets.findIndex((t) => !t.missing))
    },

    exportTmxText(): string {
      const m = this.map
      if (!m) throw new Error('没有打开的地图')
      return serializeTmx(m)
    },

    // ---------------- 历史 ----------------
    pushHistory(entry: HistoryEntry) {
      this.history.splice(this.historyIndex + 1)
      this.history.push(entry)
      if (this.history.length > 200) this.history.shift()
      this.historyIndex = this.history.length - 1
    },
    undo() {
      if (!this.canUndo) return
      const e = this.history[this.historyIndex]
      e.undo()
      this.historyIndex--
      this.bumpStruct()
      this.setStatus('撤销: ' + e.label)
    },
    redo() {
      if (!this.canRedo) return
      const e = this.history[this.historyIndex + 1]
      e.redo()
      this.historyIndex++
      this.bumpStruct()
      this.setStatus('重做: ' + e.label)
    },

    // ---------------- 地块绘制 ----------------
    /** 单格写入（笔画内自动汇总撤销记录） */
    setTile(layerIndex: number, x: number, y: number, gid: number) {
      const m = this.map
      if (!m) return
      const layer = m.layers[layerIndex]
      if (!layer || !isTileLayer(layer)) return
      if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return
      const idx = y * layer.width + x
      const before = layer.data[idx]
      if (before === (gid >>> 0)) return
      layer.data[idx] = gid >>> 0
      this.strokePatches.push({ layerIndex, idx, before, after: gid >>> 0 })
      this.bump()
    },

    /** 在 (x,y) 应用图章（brush 工具） */
    applyStamp(layerIndex: number, x: number, y: number, stamp: Stamp) {
      for (let sy = 0; sy < stamp.h; sy++) {
        for (let sx = 0; sx < stamp.w; sx++) {
          const gid = stamp.gids[sy * stamp.w + sx]
          this.setTile(layerIndex, x + sx, y + sy, gid)
        }
      }
    },

    /** 矩形填充（图章平铺） */
    fillRect(layerIndex: number, x0: number, y0: number, x1: number, y1: number, stamp: Stamp | null) {
      const xa = Math.min(x0, x1)
      const xb = Math.max(x0, x1)
      const ya = Math.min(y0, y1)
      const yb = Math.max(y0, y1)
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
          const gid = stamp ? stamp.gids[((y - ya) % stamp.h) * stamp.w + ((x - xa) % stamp.w)] : 0
          this.setTile(layerIndex, x, y, gid)
        }
      }
    },

    /** 油漆桶（连通区域替换，图章按坐标平铺取样） */
    bucketFill(layerIndex: number, x: number, y: number, stamp: Stamp | null) {
      const m = this.map
      if (!m) return
      const layer = m.layers[layerIndex]
      if (!layer || !isTileLayer(layer)) return
      if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return
      const w = layer.width
      const h = layer.height
      const target = layer.data[y * w + x]
      const sampleGid = (px: number, py: number) =>
        stamp ? stamp.gids[(py % stamp.h) * stamp.w + (px % stamp.w)] : 0
      if (stamp && stamp.w === 1 && stamp.h === 1 && (stamp.gids[0] >>> 0) === target) return
      if (!stamp && target === 0) return

      const visited = new Uint8Array(w * h)
      const queue: number[] = [y * w + x]
      visited[y * w + x] = 1
      let guard = 0
      while (queue.length && guard < w * h * 4) {
        guard++
        const idx = queue.pop()!
        const cx = idx % w
        const cy = Math.floor(idx / w)
        this.setTile(layerIndex, cx, cy, sampleGid(cx, cy))
        const push = (nx: number, ny: number) => {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) return
          const nidx = ny * w + nx
          if (visited[nidx]) return
          if (layer.data[nidx] !== target) return
          visited[nidx] = 1
          queue.push(nidx)
        }
        push(cx - 1, cy)
        push(cx + 1, cy)
        push(cx, cy - 1)
        push(cx, cy + 1)
      }
    },

    /** 结束一笔，把补丁打包进历史 */
    commitStroke(label: string) {
      if (!this.strokePatches.length) return
      const patches = this.strokePatches
      this.strokePatches = []
      const store = this
      // 同一格多次修改压缩为首尾值
      const merged = new Map<string, TilePatch>()
      for (const p of patches) {
        const key = p.layerIndex + ':' + p.idx
        const exist = merged.get(key)
        if (exist) exist.after = p.after
        else merged.set(key, { ...p })
      }
      const list = Array.from(merged.values())
      this.pushHistory({
        label,
        undo() {
          const m = store.map
          if (!m) return
          for (const p of list) {
            const layer = m.layers[p.layerIndex]
            if (layer && isTileLayer(layer)) layer.data[p.idx] = p.before
          }
        },
        redo() {
          const m = store.map
          if (!m) return
          for (const p of list) {
            const layer = m.layers[p.layerIndex]
            if (layer && isTileLayer(layer)) layer.data[p.idx] = p.after
          }
        },
      })
    },

    /** 取色：把某格的 gid 变成 1x1 图章 */
    pickTile(layerIndex: number, x: number, y: number) {
      const m = this.map
      if (!m) return
      const layer = m.layers[layerIndex]
      if (!layer || !isTileLayer(layer)) return
      if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return
      const gid = layer.data[y * layer.width + x]
      if (gid === 0) {
        this.stamp = null
        return
      }
      this.stamp = { w: 1, h: 1, gids: [gid] }
      // 同步地块面板选择
      const ts = m.tilesets.filter((t) => t.firstgid <= (gid & 0x1fffffff))
      if (ts.length) {
        const best = ts.reduce((a, b) => (a.firstgid > b.firstgid ? a : b))
        this.activeTilesetIndex = m.tilesets.indexOf(best)
      }
    },

    // ---------------- 图层操作 ----------------
    addTileLayer(name: string) {
      const m = this.map
      if (!m) return
      const layer: TmxLayer = {
        kind: 'tile',
        name,
        width: m.width,
        height: m.height,
        visible: true,
        opacity: 1,
        properties: {},
        data: new Uint32Array(m.width * m.height),
        extraAttrs: {},
      }
      const store = this
      const index = m.layers.length
      m.layers.push(layer)
      this.activeLayerIndex = index
      this.pushHistory({
        label: '新建图层 ' + name,
        undo() {
          store.map?.layers.splice(index, 1)
        },
        redo() {
          store.map?.layers.splice(index, 0, layer)
        },
      })
      this.bumpStruct()
    },

    addObjectGroup(name: string) {
      const m = this.map
      if (!m) return
      const group: TmxObjectGroup = {
        kind: 'objectgroup',
        name,
        visible: true,
        opacity: 1,
        properties: {},
        objects: [],
        extraAttrs: {},
      }
      const store = this
      const index = m.layers.length
      m.layers.push(group)
      this.activeObjectGroupIndex = index
      this.pushHistory({
        label: '新建对象组 ' + name,
        undo() {
          store.map?.layers.splice(index, 1)
        },
        redo() {
          store.map?.layers.splice(index, 0, group)
        },
      })
      this.bumpStruct()
    },

    removeLayer(index: number) {
      const m = this.map
      if (!m) return
      const layer = m.layers[index]
      if (!layer) return
      const store = this
      m.layers.splice(index, 1)
      if (this.activeLayerIndex === index) this.activeLayerIndex = -1
      if (this.activeObjectGroupIndex === index) this.activeObjectGroupIndex = -1
      if (this.activeLayerIndex > index) this.activeLayerIndex--
      if (this.activeObjectGroupIndex > index) this.activeObjectGroupIndex--
      this.pushHistory({
        label: '删除图层 ' + layer.name,
        undo() {
          store.map?.layers.splice(index, 0, layer)
        },
        redo() {
          store.map?.layers.splice(index, 1)
        },
      })
      this.bumpStruct()
    },

    moveLayer(index: number, dir: -1 | 1) {
      const m = this.map
      if (!m) return
      const j = index + dir
      if (j < 0 || j >= m.layers.length) return
      const store = this
      const swap = () => {
        const arr = store.map!.layers
        const t = arr[index]
        arr[index] = arr[j]
        arr[j] = t
      }
      swap()
      if (this.activeLayerIndex === index) this.activeLayerIndex = j
      else if (this.activeLayerIndex === j) this.activeLayerIndex = index
      if (this.activeObjectGroupIndex === index) this.activeObjectGroupIndex = j
      else if (this.activeObjectGroupIndex === j) this.activeObjectGroupIndex = index
      this.pushHistory({ label: '移动图层', undo: swap, redo: swap })
      this.bumpStruct()
    },

    renameLayer(index: number, name: string) {
      const m = this.map
      if (!m) return
      const layer = m.layers[index]
      if (!layer) return
      const old = layer.name
      layer.name = name
      const store = this
      this.pushHistory({
        label: '重命名图层',
        undo() {
          const l = store.map?.layers[index]
          if (l) l.name = old
        },
        redo() {
          const l = store.map?.layers[index]
          if (l) l.name = name
        },
      })
      this.bumpStruct()
    },

    toggleLayerVisible(index: number) {
      const m = this.map
      if (!m) return
      const layer = m.layers[index]
      if (!layer) return
      layer.visible = !layer.visible
      this.bumpStruct()
    },

    // ---------------- 对象操作 ----------------
    addObject(groupIndex: number, obj: Omit<TmxObject, 'id'>): TmxObject | null {
      const m = this.map
      if (!m) return null
      const group = m.layers[groupIndex]
      if (!group || !isObjectGroup(group)) return null
      const full: TmxObject = { ...obj, id: m.nextobjectid++ }
      group.objects.push(full)
      const store = this
      this.pushHistory({
        label: '添加对象 ' + (full.name || full.type || '#' + full.id),
        undo() {
          const g = store.map?.layers[groupIndex]
          if (g && isObjectGroup(g)) {
            const i = g.objects.indexOf(full)
            if (i >= 0) g.objects.splice(i, 1)
          }
        },
        redo() {
          const g = store.map?.layers[groupIndex]
          if (g && isObjectGroup(g)) g.objects.push(full)
        },
      })
      this.selectedObjectId = full.id
      this.bumpStruct()
      return full
    },

    removeObject(groupIndex: number, id: number) {
      const m = this.map
      if (!m) return
      const group = m.layers[groupIndex]
      if (!group || !isObjectGroup(group)) return
      const i = group.objects.findIndex((o) => o.id === id)
      if (i < 0) return
      const obj = group.objects[i]
      group.objects.splice(i, 1)
      if (this.selectedObjectId === id) this.selectedObjectId = -1
      const store = this
      this.pushHistory({
        label: '删除对象 ' + (obj.name || obj.type || '#' + obj.id),
        undo() {
          const g = store.map?.layers[groupIndex]
          if (g && isObjectGroup(g)) g.objects.splice(i, 0, obj)
        },
        redo() {
          const g = store.map?.layers[groupIndex]
          if (g && isObjectGroup(g)) {
            const j = g.objects.indexOf(obj)
            if (j >= 0) g.objects.splice(j, 1)
          }
        },
      })
      this.bumpStruct()
    },

    /** 修改对象（几何或属性），带撤销 */
    updateObject(groupIndex: number, id: number, mutate: (o: TmxObject) => void, label = '编辑对象') {
      const m = this.map
      if (!m) return
      const group = m.layers[groupIndex]
      if (!group || !isObjectGroup(group)) return
      const obj = group.objects.find((o) => o.id === id)
      if (!obj) return
      const before = JSON.stringify(serializableObject(obj))
      mutate(obj)
      const after = JSON.stringify(serializableObject(obj))
      if (before === after) return
      const store = this
      this.pushHistory({
        label,
        undo() {
          const g = store.map?.layers[groupIndex]
          if (!g || !isObjectGroup(g)) return
          const o = g.objects.find((o2) => o2.id === id)
          if (o) Object.assign(o, JSON.parse(before))
        },
        redo() {
          const g = store.map?.layers[groupIndex]
          if (!g || !isObjectGroup(g)) return
          const o = g.objects.find((o2) => o2.id === id)
          if (o) Object.assign(o, JSON.parse(after))
        },
      })
      this.bumpStruct()
    },

    /** 无撤销记录的对象几何移动（拖拽过程中调用，结束时用 updateObject 提交） */
    nudgeObject(groupIndex: number, id: number, patch: Partial<TmxObject>) {
      const m = this.map
      if (!m) return
      const group = m.layers[groupIndex]
      if (!group || !isObjectGroup(group)) return
      const obj = group.objects.find((o) => o.id === id)
      if (!obj) return
      Object.assign(obj, patch)
      this.bump()
    },

    /** 复制当前选中对象到剪贴板 */
    copySelectedObject() {
      const o = this.selectedObject
      if (!o) {
        this.setStatus('没有选中的对象可复制')
        return
      }
      const data = serializableObject(o)
      const { id: _id, ...rest } = data
      this.clipboard = { kind: 'object', data: rest }
      this.setStatus('已复制对象 ' + (o.name || o.type || '#' + o.id))
    },

    /** 粘贴对象（偏移一点避免完全重叠） */
    pasteObject(offsetX = 20, offsetY = 20) {
      const clip = this.clipboard
      if (!clip || clip.kind !== 'object') {
        this.setStatus('剪贴板没有对象')
        return
      }
      let gi = this.activeObjectGroupIndex
      if (gi < 0) {
        // 自动找 Triggers 或第一个对象组
        const m = this.map
        if (!m) return
        gi = m.layers.findIndex((l) => isObjectGroup(l) && l.name.toLowerCase() === 'triggers')
        if (gi < 0) gi = m.layers.findIndex((l) => isObjectGroup(l))
        if (gi < 0) {
          this.setStatus('没有可用的对象组')
          return
        }
        this.activeObjectGroupIndex = gi
      }
      const data = {
        ...clip.data,
        properties: { ...clip.data.properties },
        extraAttrs: { ...clip.data.extraAttrs },
        x: clip.data.x + offsetX,
        y: clip.data.y + offsetY,
      }
      this.addObject(gi, data)
      this.tool = 'object'
      this.setStatus('已粘贴对象')
    },

    /** 复制当前图层矩形区域到剪贴板（作为图章） */
    copyTileRect(layerIndex: number, x0: number, y0: number, x1: number, y1: number) {
      const m = this.map
      if (!m) return
      const layer = m.layers[layerIndex]
      if (!layer || !isTileLayer(layer)) return
      const xa = Math.max(0, Math.min(x0, x1))
      const ya = Math.max(0, Math.min(y0, y1))
      const xb = Math.min(layer.width - 1, Math.max(x0, x1))
      const yb = Math.min(layer.height - 1, Math.max(y0, y1))
      const w = xb - xa + 1
      const h = yb - ya + 1
      const gids: number[] = []
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
          gids.push(layer.data[y * layer.width + x])
        }
      }
      this.clipboard = { kind: 'tiles', w, h, gids }
      this.stamp = { w, h, gids }
      this.setStatus(`已复制 ${w}×${h} 地块区域`)
    },

    /** 粘贴地块剪贴板到指定位置 */
    pasteTiles(layerIndex: number, x: number, y: number) {
      const clip = this.clipboard
      if (!clip || clip.kind !== 'tiles') {
        this.setStatus('剪贴板没有地块区域')
        return
      }
      this.applyStamp(layerIndex, x, y, { w: clip.w, h: clip.h, gids: clip.gids })
      this.commitStroke('粘贴地块')
      this.setStatus(`已粘贴 ${clip.w}×${clip.h} 地块`)
    },

    /** 设置单位摆放预置并切换到 unit 工具 */
    setUnitPreset(preset: UnitPlacePreset) {
      this.unitPreset = preset
      this.tool = 'unit'
      this.setStatus(`摆放单位: ${preset.unit || preset.customUnit} (队伍 ${preset.team})`)
    },

    /**
     * 在世界坐标处放置单位对象。
     * 优先写入 UnitObjects 对象组；没有则写入 Triggers；都没有则新建 UnitObjects。
     */
    placeUnitAt(worldX: number, worldY: number) {
      const m = this.map
      const preset = this.unitPreset
      if (!m || !preset) return
      let gi = m.layers.findIndex((l) => isObjectGroup(l) && l.name.toLowerCase() === 'unitobjects')
      if (gi < 0) {
        gi = m.layers.findIndex((l) => isObjectGroup(l) && l.name.toLowerCase() === 'triggers')
      }
      if (gi < 0) {
        this.addObjectGroup('UnitObjects')
        gi = this.activeObjectGroupIndex
      }
      const tw = m.tilewidth
      const th = m.tileheight
      // 对齐到格子中心
      const tx = Math.floor(worldX / tw)
      const ty = Math.floor(worldY / th)
      const x = tx * tw
      const y = ty * th
      const props: Record<string, string> = { team: preset.team || this.placeTeam }
      if (preset.customUnit) props.customUnit = preset.customUnit
      else props.unit = preset.unit
      const name = preset.unit || preset.customUnit || 'unit'
      this.addObject(gi, {
        name: `${name} (t:${props.team})`,
        type: 'unit',
        x,
        y,
        width: tw,
        height: th,
        rotation: 0,
        visible: true,
        gid: preset.gid,
        properties: props,
        extraAttrs: {},
      })
      this.setStatus(`已放置 ${name} @ ${tx},${ty}`)
    },

    // ---------------- 地块集操作 ----------------
    /** 导入自定义地块图片（PNG dataURL bytes），生成内嵌地块集 */
    async importCustomTileset(name: string, pngBytes: Uint8Array, tileSize = 20, spacing = 0) {
      const m = this.map
      if (!m) return
      const b64 = bytesToBase64(pngBytes)
      const last = m.tilesets[m.tilesets.length - 1]
      // 与游戏 TiledMap.e(String) 一致：新地块集 firstgid 给足空间
      const firstgid = last ? Math.max(last.firstgid + Math.max(last.tilecount, 1), lastGidEnd(last)) : 1
      const ts: TmxTileset = {
        firstgid,
        name,
        tilewidth: tileSize,
        tileheight: tileSize,
        spacing,
        margin: 0,
        tilecount: 0,
        columns: 0,
        image: sanitizeFilename(name) + '.png',
        imagewidth: 0,
        imageheight: 0,
        properties: { embedded_png: b64 },
        tileProperties: {},
        builtin: false,
      }
      await loadTilesetBitmap(ts)
      syncTilesetGeometry(ts)
      m.tilesets.push(ts)
      this.activeTilesetIndex = m.tilesets.length - 1
      const store = this
      this.pushHistory({
        label: '导入地块集 ' + name,
        undo() {
          const i = store.map?.tilesets.indexOf(ts) ?? -1
          if (i >= 0) store.map!.tilesets.splice(i, 1)
        },
        redo() {
          store.map?.tilesets.push(ts)
        },
      })
      this.bumpStruct()
      this.setStatus(`已导入自定义地块集 ${name}（保存时将内嵌 PNG）`)
    },

    /** 添加内置 .tsx 地块集引用 */
    async addBuiltinTileset(tsxPath: string) {
      const m = this.map
      if (!m) return
      if (m.tilesets.some((t) => t.source === tsxPath)) {
        this.setStatus('该地块集已存在')
        return
      }
      const resolved = resolveTsx(tsxPath)
      if (!resolved) {
        this.setStatus('未找到内置地块集: ' + tsxPath)
        return
      }
      const last = m.tilesets[m.tilesets.length - 1]
      const firstgid = last ? lastGidEnd(last) : 1
      const ts: TmxTileset = { ...resolved, firstgid, source: tsxPath }
      await loadTilesetBitmap(ts)
      m.tilesets.push(ts)
      this.activeTilesetIndex = m.tilesets.length - 1
      const store = this
      this.pushHistory({
        label: '添加地块集 ' + tsxPath,
        undo() {
          const i = store.map?.tilesets.indexOf(ts) ?? -1
          if (i >= 0) store.map!.tilesets.splice(i, 1)
        },
        redo() {
          store.map?.tilesets.push(ts)
        },
      })
      this.bumpStruct()
    },

    /** 为图片缺失的地块集补充 PNG（转为内嵌自定义地块集） */
    async attachImageToTileset(index: number, pngBytes: Uint8Array) {
      const m = this.map
      if (!m) return
      const ts = m.tilesets[index]
      if (!ts) return
      const oldEmbedded = ts.properties['embedded_png']
      const oldBuiltin = ts.builtin
      const oldMissing = ts.missing
      ts.properties['embedded_png'] = bytesToBase64(pngBytes)
      // 内嵌后不再是外部引用（source 引用与内嵌属性互斥，转为内联地块集）
      const oldSource = ts.source
      ts.source = undefined
      await loadTilesetBitmap(ts)
      syncTilesetGeometry(ts)
      const store = this
      this.pushHistory({
        label: '补充地块集图片 ' + ts.name,
        undo() {
          if (oldEmbedded === undefined) delete ts.properties['embedded_png']
          else ts.properties['embedded_png'] = oldEmbedded
          ts.source = oldSource
          ts.builtin = oldBuiltin
          ts.missing = oldMissing
          ts.bitmap = undefined
        },
        redo() {
          ts.properties['embedded_png'] = bytesToBase64(pngBytes)
          ts.source = undefined
          void loadTilesetBitmap(ts).then(() => {
            syncTilesetGeometry(ts)
            store.bumpStruct()
          })
        },
      })
      this.bumpStruct()
      this.setStatus(`已为 ${ts.name} 内嵌图片（保存时写入 embedded_png）`)
    },

    removeTileset(index: number) {
      const m = this.map
      if (!m) return
      const ts = m.tilesets[index]
      if (!ts) return
      // 检查是否使用中
      const used = usedGidRange(m, ts)
      if (used) {
        this.setStatus(`地块集 ${ts.name} 仍被图层使用，无法删除`)
        return
      }
      m.tilesets.splice(index, 1)
      if (this.activeTilesetIndex >= m.tilesets.length) this.activeTilesetIndex = m.tilesets.length - 1
      const store = this
      this.pushHistory({
        label: '删除地块集 ' + ts.name,
        undo() {
          store.map?.tilesets.splice(index, 0, ts)
        },
        redo() {
          store.map?.tilesets.splice(index, 1)
        },
      })
      this.bumpStruct()
    },

    // ---------------- 地图属性 ----------------
    resizeMap(newW: number, newH: number) {
      const m = this.map
      if (!m) return
      const oldW = m.width
      const oldH = m.height
      if (newW === oldW && newH === oldH) return
      const snapshots: { layer: TmxLayer; old: Uint32Array }[] = []
      for (const l of m.layers) {
        if (!isTileLayer(l)) continue
        snapshots.push({ layer: l, old: l.data })
        const next = new Uint32Array(newW * newH)
        const copyW = Math.min(oldW, newW)
        const copyH = Math.min(oldH, newH)
        for (let y = 0; y < copyH; y++) {
          for (let x = 0; x < copyW; x++) {
            next[y * newW + x] = l.data[y * oldW + x]
          }
        }
        l.data = next
        l.width = newW
        l.height = newH
      }
      m.width = newW
      m.height = newH
      const store = this
      this.pushHistory({
        label: `调整地图尺寸 ${newW}x${newH}`,
        undo() {
          const mm = store.map
          if (!mm) return
          mm.width = oldW
          mm.height = oldH
          for (const s of snapshots) {
            s.layer.data = s.old
            s.layer.width = oldW
            s.layer.height = oldH
          }
        },
        redo() {
          const mm = store.map
          if (!mm) return
          mm.width = newW
          mm.height = newH
          for (const s of snapshots) {
            const next = new Uint32Array(newW * newH)
            const copyW = Math.min(oldW, newW)
            const copyH = Math.min(oldH, newH)
            for (let y = 0; y < copyH; y++) {
              for (let x = 0; x < copyW; x++) {
                next[y * newW + x] = s.old[y * oldW + x]
              }
            }
            s.layer.data = next
            s.layer.width = newW
            s.layer.height = newH
          }
        },
      })
      this.bumpStruct()
    },
  },
})

function serializableObject(o: TmxObject): Omit<TmxObject, never> {
  return {
    id: o.id,
    name: o.name,
    type: o.type,
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
    rotation: o.rotation,
    gid: o.gid,
    visible: o.visible,
    properties: { ...o.properties },
    point: o.point,
    ellipse: o.ellipse,
    extraAttrs: { ...o.extraAttrs },
  }
}

function lastGidEnd(ts: TmxTileset): number {
  return ts.firstgid + Math.max(ts.tilecount, 1)
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^\w\u4e00-\u9fa5-]+/g, '_') || 'custom'
}

/** 判断地块集的 gid 区间是否被任何图层使用 */
function usedGidRange(map: TmxMap, ts: TmxTileset): boolean {
  const from = ts.firstgid
  const others = map.tilesets.filter((t) => t !== ts && t.firstgid > ts.firstgid)
  const to = others.length ? Math.min(...others.map((t) => t.firstgid)) : Infinity
  for (const l of map.layers) {
    if (!isTileLayer(l)) continue
    for (let i = 0; i < l.data.length; i++) {
      const g = l.data[i] & 0x1fffffff
      if (g >= from && g < to) return true
    }
  }
  return false
}
