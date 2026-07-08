<script setup lang="ts">
/**
 * 地块面板：地块集切换、瓦片选择（支持拖选多格作为图章）、
 * 添加内置地块集、导入自定义 PNG（保存时自动内嵌）。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { listBuiltinTsx } from '@/game/builtin'
import { tileSourceRect } from '@/tmx/images'

const store = useEditorStore()
const { structRev, activeTilesetIndex } = storeToRefs(store)

const canvasEl = ref<HTMLCanvasElement>()
const showAddBuiltin = ref(false)
const showImport = ref(false)
const importName = ref('custom')
const importTileSize = ref(20)
const importSpacing = ref(0)
const importFile = ref<File | null>(null)

const tilesets = computed(() => {
  void structRev.value
  return store.map?.tilesets ?? []
})
const activeTs = computed(() => tilesets.value[activeTilesetIndex.value] ?? null)

const builtinList = listBuiltinTsx()
const builtinGroups = computed(() => {
  const groups: Record<string, { path: string; label: string }[]> = {}
  for (const { path } of builtinList) {
    const dir = path.includes('/') ? path.split('/')[0] : '根目录'
    ;(groups[dir] ??= []).push({ path, label: path.split('/').pop()!.replace(/\.tsx$/i, '') })
  }
  return groups
})

// 选择状态（tile 坐标，在地块集内）
const sel = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
let selecting = false

const SCALE = 2

function redraw() {
  const ts = activeTs.value
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  if (!ts || !ts.bitmap) {
    canvas.width = 260
    canvas.height = 40
    ctx.fillStyle = '#22252c'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#8a93a0'
    ctx.font = '12px sans-serif'
    ctx.fillText(ts ? '图片缺失: ' + (ts.image || ts.name) : '无地块集', 8, 24)
    return
  }
  const cols = ts.columns || 1
  const rows = Math.ceil(Math.max(ts.tilecount, 1) / cols)
  canvas.width = cols * ts.tilewidth * SCALE
  canvas.height = rows * ts.tileheight * SCALE
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#14161a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < ts.tilecount; i++) {
    const src = tileSourceRect(ts, i)
    const dx = (i % cols) * ts.tilewidth * SCALE
    const dy = Math.floor(i / cols) * ts.tileheight * SCALE
    ctx.drawImage(ts.bitmap, src.x, src.y, src.w, src.h, dx, dy, ts.tilewidth * SCALE, ts.tileheight * SCALE)
  }
  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath()
  for (let c = 0; c <= cols; c++) {
    ctx.moveTo(c * ts.tilewidth * SCALE + 0.5, 0)
    ctx.lineTo(c * ts.tilewidth * SCALE + 0.5, canvas.height)
  }
  for (let r = 0; r <= rows; r++) {
    ctx.moveTo(0, r * ts.tileheight * SCALE + 0.5)
    ctx.lineTo(canvas.width, r * ts.tileheight * SCALE + 0.5)
  }
  ctx.stroke()
  // 选择框
  if (sel.value) {
    const s = sel.value
    const xa = Math.min(s.x0, s.x1)
    const ya = Math.min(s.y0, s.y1)
    const xb = Math.max(s.x0, s.x1)
    const yb = Math.max(s.y0, s.y1)
    ctx.strokeStyle = '#4a9eff'
    ctx.lineWidth = 2
    ctx.strokeRect(
      xa * ts.tilewidth * SCALE + 1,
      ya * ts.tileheight * SCALE + 1,
      (xb - xa + 1) * ts.tilewidth * SCALE - 2,
      (yb - ya + 1) * ts.tileheight * SCALE - 2,
    )
  }
}

watch([activeTs, structRev], () => nextTick(redraw), { immediate: true })
watch(sel, redraw, { deep: true })

function tileAt(e: MouseEvent): { x: number; y: number } | null {
  const ts = activeTs.value
  const canvas = canvasEl.value
  if (!ts || !canvas) return null
  const rect = canvas.getBoundingClientRect()
  const x = Math.floor((e.clientX - rect.left) / (ts.tilewidth * SCALE))
  const y = Math.floor((e.clientY - rect.top) / (ts.tileheight * SCALE))
  const cols = ts.columns || 1
  const rows = Math.ceil(Math.max(ts.tilecount, 1) / cols)
  if (x < 0 || y < 0 || x >= cols || y >= rows) return null
  return { x, y }
}

function updateStamp() {
  const ts = activeTs.value
  if (!ts || !sel.value) return
  const s = sel.value
  const xa = Math.min(s.x0, s.x1)
  const ya = Math.min(s.y0, s.y1)
  const xb = Math.max(s.x0, s.x1)
  const yb = Math.max(s.y0, s.y1)
  const w = xb - xa + 1
  const h = yb - ya + 1
  const gids: number[] = []
  const cols = ts.columns || 1
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const local = y * cols + x
      gids.push(local < ts.tilecount ? ts.firstgid + local : 0)
    }
  }
  store.stamp = { w, h, gids }
  if (store.tool !== 'brush' && store.tool !== 'rect' && store.tool !== 'fill') store.tool = 'brush'
}

function onDown(e: MouseEvent) {
  const t = tileAt(e)
  if (!t) return
  selecting = true
  sel.value = { x0: t.x, y0: t.y, x1: t.x, y1: t.y }
}
function onMove(e: MouseEvent) {
  if (!selecting || !sel.value) return
  const t = tileAt(e)
  if (!t) return
  sel.value = { ...sel.value, x1: t.x, y1: t.y }
}
function onUp() {
  if (!selecting) return
  selecting = false
  updateStamp()
}

/** 当前悬停 tile 的属性提示 */
const hoverInfo = ref('')
function onHover(e: MouseEvent) {
  onMove(e)
  const ts = activeTs.value
  const t = tileAt(e)
  if (!ts || !t) {
    hoverInfo.value = ''
    return
  }
  const local = t.y * (ts.columns || 1) + t.x
  const props = ts.tileProperties[local]
  const gid = ts.firstgid + local
  let info = `#${local} (gid ${gid})`
  if (props) {
    info += '  ' + Object.entries(props).map(([k, v]) => (v ? `${k}=${v}` : k)).join(', ')
  }
  hoverInfo.value = info
}

async function doImport() {
  const f = importFile.value
  if (!f) return
  const buf = new Uint8Array(await f.arrayBuffer())
  await store.importCustomTileset(importName.value || f.name.replace(/\.png$/i, ''), buf, importTileSize.value, importSpacing.value)
  showImport.value = false
  importFile.value = null
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0] ?? null
  importFile.value = f
  if (f) importName.value = f.name.replace(/\.png$/i, '')
}

async function addBuiltin(path: string) {
  await store.addBuiltinTileset(path)
  showAddBuiltin.value = false
}

async function onAttachFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  const buf = new Uint8Array(await f.arrayBuffer())
  await store.attachImageToTileset(store.activeTilesetIndex, buf)
  input.value = ''
}
</script>

<template>
  <div class="tileset-panel">
    <div class="panel-title">
      地块集
      <span class="actions">
        <button class="icon" title="添加游戏内置地块集" @click="showAddBuiltin = true">＋内置</button>
        <button class="icon" title="导入自定义 PNG 地块集（保存时内嵌进 TMX）" @click="showImport = true">＋导入</button>
      </span>
    </div>

    <div class="ts-tabs scroll">
      <button
        v-for="(ts, i) in tilesets"
        :key="i"
        :class="{ active: i === activeTilesetIndex }"
        :title="(ts.source || ts.image) + (ts.builtin ? '（内置，不内嵌）' : ts.missing ? '（图片缺失）' : '（自定义，保存时内嵌）')"
        @click="store.activeTilesetIndex = i"
      >
        <span v-if="ts.builtin" class="tag builtin">内置</span>
        <span v-else-if="ts.missing" class="tag missing">缺失</span>
        <span v-else class="tag custom">内嵌</span>
        {{ ts.name || ts.image }}
      </button>
    </div>

    <div class="ts-body scroll" @mouseleave="onUp">
      <div v-if="activeTs?.missing" class="missing-tip">
        <p>图片缺失：{{ activeTs.image || activeTs.source || activeTs.name }}</p>
        <p class="hint">该地块集既不是游戏内置、也没有内嵌数据。补充 PNG 后将自动内嵌进 TMX。</p>
        <label class="attach-btn">
          选择 PNG 补充图片
          <input type="file" accept="image/png" style="display: none" @change="onAttachFile" />
        </label>
      </div>
      <canvas
        ref="canvasEl"
        @mousedown.prevent="onDown"
        @mousemove="onHover"
        @mouseup="onUp"
        @contextmenu.prevent
      />
    </div>
    <div class="ts-info">{{ hoverInfo || '拖选可作为多格图章' }}</div>

    <!-- 添加内置地块集 -->
    <div v-if="showAddBuiltin" class="dialog-mask" @click.self="showAddBuiltin = false">
      <div class="dialog">
        <div class="dialog-header">添加游戏内置地块集（引用方式，保存时不内嵌图片）</div>
        <div class="dialog-body scroll">
          <div v-for="(items, dir) in builtinGroups" :key="dir" class="builtin-group">
            <h4>{{ dir }}</h4>
            <div class="builtin-list">
              <button v-for="it in items" :key="it.path" @click="addBuiltin(it.path)">{{ it.label }}</button>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button @click="showAddBuiltin = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 导入自定义地块集 -->
    <div v-if="showImport" class="dialog-mask" @click.self="showImport = false">
      <div class="dialog">
        <div class="dialog-header">导入自定义地块集（PNG）</div>
        <div class="dialog-body">
          <div class="form-row">
            <label>PNG 图片</label>
            <input type="file" accept="image/png" @change="onFileChange" />
            <span class="hint">非游戏官方地块，保存 TMX 时会以 embedded_png(base64) 内嵌，游戏可直接读取</span>
          </div>
          <div class="form-row">
            <label>名称</label>
            <input v-model="importName" />
          </div>
          <div class="form-inline">
            <div class="form-row" style="flex: 1">
              <label>地块尺寸(px)</label>
              <input v-model.number="importTileSize" type="number" min="1" />
            </div>
            <div class="form-row" style="flex: 1">
              <label>间距(px)</label>
              <input v-model.number="importSpacing" type="number" min="0" />
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button @click="showImport = false">取消</button>
          <button class="primary" :disabled="!importFile" @click="doImport">导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tileset-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.actions {
  display: flex;
  gap: 4px;
}
.ts-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 8px 8px;
  max-height: 108px;
  border-bottom: 1px solid var(--border);
}
.ts-tabs button {
  font-size: 11px;
  padding: 2px 7px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag {
  display: inline-block;
  font-size: 10px;
  border-radius: 3px;
  padding: 0 3px;
  margin-right: 3px;
}
.tag.builtin {
  background: #234d33;
  color: #7fdda6;
}
.tag.custom {
  background: #4d3a23;
  color: #ddb37f;
}
.tag.missing {
  background: #4d2323;
  color: #dd7f7f;
}
.ts-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.ts-body canvas {
  image-rendering: pixelated;
  cursor: crosshair;
}
.ts-info {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-dim);
  border-top: 1px solid var(--border);
  min-height: 22px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.builtin-group h4 {
  margin: 8px 0 6px;
  color: var(--text-dim);
  font-size: 12px;
}
.builtin-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.missing-tip {
  background: #3a2626;
  border: 1px solid #5a3a3a;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
  font-size: 12px;
}
.missing-tip p {
  margin: 0 0 6px;
}
.attach-btn {
  display: inline-block;
  background: var(--accent-dim);
  border: 1px solid var(--accent);
  color: #fff;
  border-radius: var(--radius);
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}
</style>
