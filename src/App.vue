<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore, type ToolId } from '@/stores/editor'
import MapCanvas from '@/components/MapCanvas.vue'
import TilesetPanel from '@/components/TilesetPanel.vue'
import LayerPanel from '@/components/LayerPanel.vue'
import ObjectPanel from '@/components/ObjectPanel.vue'
import ObjectInspector from '@/components/ObjectInspector.vue'
import UnitPanel from '@/components/UnitPanel.vue'
import NewMapDialog from '@/components/NewMapDialog.vue'
import MapSettingsDialog from '@/components/MapSettingsDialog.vue'
import ValidationPanel from '@/components/ValidationPanel.vue'
import { validateMap } from '@/game/validation'
import { saveDraft, loadDraft, clearDraft, hasDraft, type DraftMeta } from '@/utils/autosave'

const store = useEditorStore()
const { tool, statusMessage, dirty, fileName, loading, showGrid, showObjects, highlightActiveLayer, showMinimap } =
  storeToRefs(store)

const showNewMap = ref(false)
const showSettings = ref(false)
const showValidation = ref(false)
const errorText = ref('')
const rightTab = ref<'objects' | 'units'>('objects')
const canvasRef = ref<InstanceType<typeof MapCanvas> | null>(null)

const draftMeta = ref<DraftMeta | null>(null)
const showDraftPrompt = ref(false)

const TOOLS: { id: ToolId; icon: string; label: string; key: string }[] = [
  { id: 'brush', icon: '🖌', label: '笔刷', key: 'B' },
  { id: 'erase', icon: '⌫', label: '橡皮', key: 'E' },
  { id: 'rect', icon: '▭', label: '矩形填充', key: 'R' },
  { id: 'fill', icon: '🪣', label: '油漆桶', key: 'F' },
  { id: 'picker', icon: '💉', label: '取色', key: 'I' },
  { id: 'object', icon: '⬚', label: '对象编辑', key: 'O' },
  { id: 'unit', icon: '⚔', label: '单位摆放', key: 'U' },
  { id: 'pan', icon: '✋', label: '平移', key: '空格' },
]

const title = computed(() => (dirty.value ? '● ' : '') + fileName.value)

const validation = computed(() => {
  void store.structRev
  void store.rev
  return validateMap(store.map)
})
const errorCount = computed(() => validation.value.filter((i) => i.severity === 'error').length)
const warnCount = computed(() => validation.value.filter((i) => i.severity === 'warn').length)

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
        clearDraft()
        draftMeta.value = null
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
    clearDraft()
    draftMeta.value = null
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

/** 自动草稿：脏数据后每 30s 尝试保存一次 */
let autosaveTimer: ReturnType<typeof setInterval> | null = null
function tryAutosave() {
  if (!store.map || !store.dirty) return
  try {
    const text = store.exportTmxText()
    // 超过 ~4MB 跳过，避免撑爆 localStorage
    if (text.length > 4 * 1024 * 1024) {
      store.setStatus('地图过大，跳过本地草稿自动保存')
      return
    }
    const ok = saveDraft(store.fileName, text, store.map.width, store.map.height)
    if (ok) {
      draftMeta.value = {
        fileName: store.fileName,
        savedAt: Date.now(),
        width: store.map.width,
        height: store.map.height,
        sizeBytes: text.length,
      }
      store.setStatus('已自动保存本地草稿')
    }
  } catch {
    /* ignore */
  }
}

async function restoreDraft() {
  const d = loadDraft()
  if (!d) {
    showDraftPrompt.value = false
    return
  }
  try {
    await store.openTmxText(d.text, d.meta.fileName || 'draft.tmx')
    store.dirty = true
    store.setStatus('已恢复本地草稿（' + new Date(d.meta.savedAt).toLocaleString() + '）')
  } catch (e) {
    errorText.value = '恢复草稿失败: ' + String((e as Error).message ?? e)
  }
  showDraftPrompt.value = false
}

function discardDraft() {
  clearDraft()
  draftMeta.value = null
  showDraftPrompt.value = false
}

function onJumpTile(x: number, y: number) {
  canvasRef.value?.jumpToTile(x, y)
}

watch(tool, (t) => {
  if (t === 'unit') rightTab.value = 'units'
  else if (t === 'object') rightTab.value = 'objects'
})

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey)
  window.addEventListener('beforeunload', (e) => {
    if (store.dirty) {
      tryAutosave()
      e.preventDefault()
    }
  })
  autosaveTimer = setInterval(tryAutosave, 30000)
  if (hasDraft()) {
    const d = loadDraft()
    if (d) {
      draftMeta.value = d.meta
      showDraftPrompt.value = true
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey)
  if (autosaveTimer) clearInterval(autosaveTimer)
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
        <button :disabled="!store.map" @click="showValidation = true" title="地图校验">
          校验
          <span v-if="errorCount" class="badge err">{{ errorCount }}</span>
          <span v-else-if="warnCount" class="badge warn">{{ warnCount }}</span>
        </button>
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
        <button class="icon" :class="{ active: showMinimap }" title="小地图 (M)" @click="store.showMinimap = !store.showMinimap">▣</button>
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
        <MapCanvas ref="canvasRef" />
      </section>
      <aside class="right">
        <div class="right-top">
          <LayerPanel />
        </div>
        <div class="right-tabs">
          <button :class="{ active: rightTab === 'objects' }" @click="rightTab = 'objects'">对象</button>
          <button :class="{ active: rightTab === 'units' }" @click="rightTab = 'units'">单位</button>
        </div>
        <div class="right-mid">
          <ObjectPanel v-if="rightTab === 'objects'" />
          <UnitPanel v-else />
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
          <li>小地图导航、单位摆放、复制粘贴、本地草稿自动保存</li>
        </ul>
        <div class="welcome-actions">
          <button class="primary" @click="showNewMap = true">新建地图</button>
          <button @click="openFile">打开 .tmx 文件</button>
          <button v-if="draftMeta" @click="restoreDraft">恢复草稿</button>
        </div>
      </div>
    </main>

    <footer class="statusbar">
      <span class="status-msg">{{ loading ? '加载中…' : statusMessage }}</span>
      <span
        v-if="validation.length"
        class="status-warn"
        :title="validation.map((i) => i.message).join('\n')"
        @click="showValidation = true"
        style="cursor: pointer"
      >
        ⚠ {{ errorCount ? errorCount + ' 错误' : '' }}{{ errorCount && warnCount ? ' / ' : '' }}{{ warnCount ? warnCount + ' 警告' : '' }}
      </span>
      <span v-if="store.map" class="status-dim">
        {{ store.map.width }}×{{ store.map.height }} · 地块集 {{ store.map.tilesets.length }} · 图层
        {{ store.map.layers.length }}
      </span>
    </footer>

    <NewMapDialog v-if="showNewMap" @close="showNewMap = false" />
    <MapSettingsDialog v-if="showSettings" @close="showSettings = false" />
    <ValidationPanel v-if="showValidation" @close="showValidation = false" @jump-tile="onJumpTile" />

    <div v-if="showDraftPrompt && draftMeta" class="dialog-mask" @click.self="showDraftPrompt = false">
      <div class="dialog">
        <div class="dialog-header">发现本地草稿</div>
        <div class="dialog-body">
          <p>
            文件：{{ draftMeta.fileName }}<br />
            尺寸：{{ draftMeta.width }}×{{ draftMeta.height }}<br />
            保存于：{{ new Date(draftMeta.savedAt).toLocaleString() }}
          </p>
          <p class="hint">上次编辑未正常保存时会留下草稿。恢复后可继续编辑，或丢弃草稿。</p>
        </div>
        <div class="dialog-footer">
          <button class="danger" @click="discardDraft">丢弃</button>
          <button class="primary" @click="restoreDraft">恢复草稿</button>
        </div>
      </div>
    </div>

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
.badge {
  display: inline-block;
  font-size: 10px;
  border-radius: 8px;
  padding: 0 5px;
  margin-left: 3px;
  vertical-align: middle;
}
.badge.err {
  background: #6b2b2b;
  color: #ffb0b0;
}
.badge.warn {
  background: #6b5a2b;
  color: #ffe0a0;
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
  grid-template-rows: minmax(100px, 22%) auto minmax(120px, 28%) 1fr;
  min-height: 0;
}
.right-top,
.right-mid {
  border-bottom: 1px solid var(--border);
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.right-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
}
.right-tabs button {
  flex: 1;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 5px;
  border-bottom: 2px solid transparent;
}
.right-tabs button.active {
  border-bottom-color: var(--accent);
  color: #fff;
  background: var(--bg3);
}
.right-mid :deep(.object-panel),
.right-mid :deep(.unit-panel),
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
  max-width: 480px;
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
  flex-wrap: wrap;
}
.error-pre {
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--danger);
  margin: 0;
  font-size: 12px;
}
</style>
