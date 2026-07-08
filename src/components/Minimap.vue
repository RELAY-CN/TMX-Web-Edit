<script setup lang="ts">
/**
 * 小地图：用平均色纹理缩略显示整张地图，并标出当前视口矩形；点击/拖拽可跳转。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { isTileLayer } from '@/tmx/types'
import { gidColor } from '@/render/avgColor'

const props = defineProps<{
  viewX: number
  viewY: number
  viewZoom: number
  canvasW: number
  canvasH: number
}>()

const emit = defineEmits<{
  jump: [worldX: number, worldY: number]
}>()

const store = useEditorStore()
const { rev, structRev, showMinimap } = storeToRefs(store)

const canvasEl = ref<HTMLCanvasElement>()
const SIZE = 160

let texCanvas: HTMLCanvasElement | null = null
let texRev = -1
let texStruct = -1
let dragging = false

function buildTex() {
  const m = store.map
  if (!m) return
  if (!texCanvas) texCanvas = document.createElement('canvas')
  if (texCanvas.width !== m.width || texCanvas.height !== m.height) {
    texCanvas.width = m.width
    texCanvas.height = m.height
  }
  const ctx = texCanvas.getContext('2d')!
  const img = ctx.createImageData(m.width, m.height)
  const buf = new Uint32Array(img.data.buffer)
  buf.fill(0xff10120a)
  for (const item of m.layers) {
    if (!isTileLayer(item) || !item.visible) continue
    for (let i = 0; i < item.data.length; i++) {
      const c = gidColor(m, item.data[i])
      if (c !== 0 && (c >>> 24) > 8) buf[i] = c
    }
  }
  ctx.putImageData(img, 0, 0)
  texRev = rev.value
  texStruct = structRev.value
}

function draw() {
  const canvas = canvasEl.value
  const m = store.map
  if (!canvas || !m || !showMinimap.value) return
  if (texRev !== rev.value || texStruct !== structRev.value || !texCanvas) buildTex()
  const ctx = canvas.getContext('2d')!
  canvas.width = SIZE
  canvas.height = SIZE
  ctx.fillStyle = '#0b0d08'
  ctx.fillRect(0, 0, SIZE, SIZE)

  const mapPxW = m.width * m.tilewidth
  const mapPxH = m.height * m.tileheight
  const scale = Math.min(SIZE / mapPxW, SIZE / mapPxH)
  const drawW = mapPxW * scale
  const drawH = mapPxH * scale
  const ox = (SIZE - drawW) / 2
  const oy = (SIZE - drawH) / 2

  if (texCanvas) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(texCanvas, 0, 0, m.width, m.height, ox, oy, drawW, drawH)
  }

  // 视口矩形
  const vx = ox + props.viewX * scale
  const vy = oy + props.viewY * scale
  const vw = (props.canvasW / props.viewZoom) * scale
  const vh = (props.canvasH / props.viewZoom) * scale
  ctx.strokeStyle = '#4a9eff'
  ctx.lineWidth = 1.5
  ctx.strokeRect(vx, vy, vw, vh)
  ctx.fillStyle = 'rgba(74,158,255,0.12)'
  ctx.fillRect(vx, vy, vw, vh)

  ctx.strokeStyle = '#3a4048'
  ctx.lineWidth = 1
  ctx.strokeRect(ox + 0.5, oy + 0.5, drawW, drawH)
}

function worldFromEvent(e: MouseEvent): { x: number; y: number } | null {
  const m = store.map
  const canvas = canvasEl.value
  if (!m || !canvas) return null
  const rect = canvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const mapPxW = m.width * m.tilewidth
  const mapPxH = m.height * m.tileheight
  const scale = Math.min(SIZE / mapPxW, SIZE / mapPxH)
  const drawW = mapPxW * scale
  const drawH = mapPxH * scale
  const ox = (SIZE - drawW) / 2
  const oy = (SIZE - drawH) / 2
  const wx = (sx - ox) / scale
  const wy = (sy - oy) / scale
  return {
    x: Math.max(0, Math.min(mapPxW, wx)),
    y: Math.max(0, Math.min(mapPxH, wy)),
  }
}

function onDown(e: MouseEvent) {
  dragging = true
  const w = worldFromEvent(e)
  if (w) emit('jump', w.x, w.y)
}
function onMove(e: MouseEvent) {
  if (!dragging) return
  const w = worldFromEvent(e)
  if (w) emit('jump', w.x, w.y)
}
function onUp() {
  dragging = false
}

watch([rev, structRev, () => props.viewX, () => props.viewY, () => props.viewZoom, showMinimap], draw)

onMounted(() => {
  draw()
  window.addEventListener('mouseup', onUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('mouseup', onUp)
})
</script>

<template>
  <div v-if="showMinimap && store.map" class="minimap" title="小地图：点击/拖拽跳转">
    <canvas
      ref="canvasEl"
      width="160"
      height="160"
      @mousedown.prevent="onDown"
      @mousemove="onMove"
    />
  </div>
</template>

<style scoped>
.minimap {
  position: absolute;
  left: 10px;
  bottom: 10px;
  width: 160px;
  height: 160px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: #0b0d08;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  cursor: crosshair;
  z-index: 5;
}
.minimap canvas {
  display: block;
  width: 160px;
  height: 160px;
  image-rendering: pixelated;
}
</style>
