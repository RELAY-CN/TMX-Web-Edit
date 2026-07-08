<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore, type ToolId } from '@/stores/editor'
import MapCanvas from '@/components/MapCanvas.vue'
import TilesetPanel from '@/components/TilesetPanel.vue'
import LayerPanel from '@/components/LayerPanel.vue'
import ObjectPanel from '@/components/ObjectPanel.vue'
import ObjectInspector from '@/components/ObjectInspector.vue'
import NewMapDialog from '@/components/NewMapDialog.vue'
import MapSettingsDialog from '@/components/MapSettingsDialog.vue'

const store = useEditorStore()
const { tool, statusMessage, dirty, fileName, loading, showGrid, showObjects, highlightActiveLayer } =
  storeToRefs(store)

const showNewMap = ref(false)
const showSettings = ref(false)
const errorText = ref('')

const TOOLS: { id: ToolId; icon: string; label: string; key: string }[] = [
  { id: 'brush', icon: '🖌', label: '笔刷', key: 'B' },
  { id: 'erase', icon: '⌫', label: '橡皮', key: 'E' },
  { id: 'rect', icon: '▭', label: '矩形填充', key: 'R' },
  { id: 'fill', icon: '🪣', label: '油漆桶', key: 'F' },
  { id: 'picker', icon: '💉', label: '取色', key: 'I' },
  { id: 'object', icon: '⬚', label: '对象编辑', key: 'O' },
  { id: 'pan', icon: '✋', label: '平移', key: '空格' },
]

const title = computed(() => (dirty.value ? '● ' : '') + fileName.value)

async function openFile() {
  try {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.tmx,.xml'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        const text = await f.text()
        await store.openTmxText(text, f.name)
      } catch (e) {
        errorText.value = String((e as Error).message ?? e)
      }
    }
    input.click()
  } catch (e) {
    errorText.value = String((e as Error).message ?? e)
  }
}

function saveFile() {
  try {
    const text = store.exportTmxText()
    const blob = new Blob([text], { type: 'application/xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName.value.endsWith('.tmx') ? fileName.value : fileName.value + '.tmx'
    a.click()
    URL.revokeObjectURL(a.href)
    store.dirty = false
    store.setStatus('已导出 ' + a.download + '（内置地块仅引用，自定义地块已内嵌）')
  } catch (e) {
    errorText.value = String((e as Error).message ?? e)
  }
}

function onGlobalKey(e: KeyboardEvent) {
  if (e.ctrlKey && e.code === 'KeyS') {
    e.preventDefault()
    if (store.map) saveFile()
  }
  if (e.ctrlKey && e.code === 'KeyO') {
    e.preventDefault()
    openFile()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey)
  window.addEventListener('beforeunload', (e) => {
    if (store.dirty) e.preventDefault()
  })
})

/** 校验地图是否满足游戏要求 */
const validation = computed(() => {
  void store.structRev
  void store.rev
  const m = store.map
  if (!m) return []
  const problems: string[] = []
  const tileLayers = m.layers.filter((l) => l.kind === 'tile')
  const ground = tileLayers.find((l) => l.name.toLowerCase() === 'ground')
  if (!ground) problems.push('缺少 Ground 图层（游戏必需）')
  const items = tileLayers.find((l) => (l as { name: string }).name.toLowerCase() === 'items' || (l as { name: string }).name.toLowerCase() === 'objects')
  if (!items) problems.push('缺少 Items 图层（游戏必需）')
  const triggers = m.layers.find((l) => l.kind === 'objectgroup' && l.name.toLowerCase() === 'triggers')
  if (!triggers) problems.push('建议添加 Triggers 对象组与 map_info 对象')
  else {
    const grp = triggers as { objects: { name: string }[] }
    if (!grp.objects.some((o) => o.name === 'map_info')) problems.push('Triggers 组中缺少 map_info 对象')
  }
  if (ground && ground.kind === 'tile') {
    let empty = 0
    for (let i = 0; i < ground.data.length; i++) if (ground.data[i] === 0) empty++
    if (empty > 0) problems.push(`Ground 层有 ${empty} 个空格（游戏要求地面每格必须有地块）`)
  }
  return problems
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand" title="TMX Web Edit - 铁锈战争地图编辑器">
        <span class="logo">🗺</span> TMX Web Edit
      </div>
      <div class="file-ops">
        <button @click="showNewMap = true">新建</button>
        <button @click="openFile">打开 (Ctrl+O)</button>
        <button class="primary" :disabled="!store.map" @click="saveFile">保存 TMX (Ctrl+S)</button>
        <button :disabled="!store.map" @click="showSettings = true">地图设置</button>
      </div>
      <div class="toolbar">
        <button
          v-for="t in TOOLS"
          :key="t.id"
          class="icon"
          :class="{ active: tool === t.id }"
          :title="t.label + ' (' + t.key + ')'"
          @click="store.tool = t.id"
        >
          {{ t.icon }}
        </button>
        <span class="sep"></span>
        <button class="icon" :class="{ active: showGrid }" title="网格 (G)" @click="store.showGrid = !store.showGrid">▦</button>
        <button class="icon" :class="{ active: showObjects }" title="显示对象 (H)" @click="store.showObjects = !store.showObjects">⬚</button>
        <button
          class="icon"
          :class="{ active: highlightActiveLayer }"
          title="高亮当前图层"
          @click="store.highlightActiveLayer = !store.highlightActiveLayer"
        >
          ◧
        </button>
        <span class="sep"></span>
        <button class="icon" :disabled="!store.canUndo" title="撤销 (Ctrl+Z)" @click="store.undo()">↶</button>
        <button class="icon" :disabled="!store.canRedo" title="重做 (Ctrl+Y)" @click="store.redo()">↷</button>
      </div>
      <div class="filename" :title="fileName">{{ title }}</div>
    </header>

    <main class="layout" v-if="store.map">
      <aside class="left">
        <TilesetPanel />
      </aside>
      <section class="center">
        <MapCanvas />
      </section>
      <aside class="right">
        <div class="right-top">
          <LayerPanel />
        </div>
        <div class="right-mid">
          <ObjectPanel />
        </div>
        <div class="right-bottom scroll">
          <ObjectInspector />
        </div>
      </aside>
    </main>

    <main v-else class="welcome">
      <div class="welcome-card">
        <h2>TMX Web Edit</h2>
        <p>铁锈战争（Rusted Warfare）网页版地图编辑器</p>
        <ul>
          <li>打开 / 编辑 / 保存游戏可直接读取的 .tmx 地图</li>
          <li>地形绘制、图层管理、内置与自定义地块集</li>
          <li>完整触发器系统：unitDetect、unitAdd、mapText、objective 等</li>
          <li>官方地块自动按名称引用，自定义地块自动内嵌（embedded_png）</li>
        </ul>
        <div class="welcome-actions">
          <button class="primary" @click="showNewMap = true">新建地图</button>
          <button @click="openFile">打开 .tmx 文件</button>
        </div>
      </div>
    </main>

    <footer class="statusbar">
      <span class="status-msg">{{ loading ? '加载中…' : statusMessage }}</span>
      <span v-if="validation.length" class="status-warn" :title="validation.join('\n')">
        ⚠ {{ validation.length }} 项校验提示
      </span>
      <span v-if="store.map" class="status-dim">
        {{ store.map.width }}×{{ store.map.height }} · 地块集 {{ store.map.tilesets.length }} · 图层
        {{ store.map.layers.length }}
      </span>
    </footer>

    <NewMapDialog v-if="showNewMap" @close="showNewMap = false" />
    <MapSettingsDialog v-if="showSettings" @close="showSettings = false" />

    <div v-if="errorText" class="dialog-mask" @click.self="errorText = ''">
      <div class="dialog">
        <div class="dialog-header">出错了</div>
        <div class="dialog-body">
          <pre class="error-pre">{{ errorText }}</pre>
        </div>
        <div class="dialog-footer">
          <button class="primary" @click="errorText = ''">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 12px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.brand {
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
  user-select: none;
}
.logo {
  margin-right: 2px;
}
.file-ops,
.toolbar {
  display: flex;
  gap: 5px;
  align-items: center;
}
.sep {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 4px;
}
.filename {
  margin-left: auto;
  color: var(--text-dim);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}
.layout {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr 320px;
  min-height: 0;
}
.left {
  border-right: 1px solid var(--border);
  background: var(--panel);
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.center {
  min-width: 0;
  min-height: 0;
}
.right {
  border-left: 1px solid var(--border);
  background: var(--panel);
  display: grid;
  grid-template-rows: minmax(120px, 24%) minmax(140px, 30%) 1fr;
  min-height: 0;
}
.right-top,
.right-mid {
  border-bottom: 1px solid var(--border);
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.right-mid :deep(.object-panel),
.right-top :deep(.layer-panel) {
  height: 100%;
}
.right-bottom {
  min-height: 0;
}
.statusbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg2);
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
}
.status-msg {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-warn {
  color: var(--warn);
  cursor: help;
}
.status-dim {
  white-space: nowrap;
}
.welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.welcome-card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px 36px;
  max-width: 460px;
}
.welcome-card h2 {
  margin: 0 0 4px;
}
.welcome-card p {
  color: var(--text-dim);
  margin: 0 0 12px;
}
.welcome-card ul {
  margin: 0 0 18px;
  padding-left: 18px;
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1.8;
}
.welcome-actions {
  display: flex;
  gap: 10px;
}
.error-pre {
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--danger);
  margin: 0;
  font-size: 12px;
}
</style>
