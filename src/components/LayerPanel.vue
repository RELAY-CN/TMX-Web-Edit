<script setup lang="ts">
/**
 * 图层面板：图块层 + 对象组统一列表（倒序显示，最上层在前），
 * 可见性、选中激活、增删、排序、重命名。
 */
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { isObjectGroup, isTileLayer } from '@/tmx/types'

const store = useEditorStore()
const { structRev, activeLayerIndex, activeObjectGroupIndex } = storeToRefs(store)

const entries = computed(() => {
  void structRev.value
  const m = store.map
  if (!m) return []
  return m.layers
    .map((item, index) => ({ item, index }))
    .reverse()
})

const showAdd = ref(false)
const addKind = ref<'tile' | 'object'>('tile')
const addName = ref('')

/** 游戏识别的推荐图层名 */
const SUGGESTED_TILE = ['Ground', 'Items', 'GroundDetails', 'GroundDetails2', 'PathingOverride', 'units']
const SUGGESTED_GROUP = ['Triggers', 'UnitObjects']

function selectEntry(index: number) {
  const m = store.map
  if (!m) return
  const item = m.layers[index]
  if (isTileLayer(item)) {
    store.activeLayerIndex = index
    if (store.tool === 'object') store.tool = 'brush'
  } else if (isObjectGroup(item)) {
    store.activeObjectGroupIndex = index
    store.tool = 'object'
  }
}

function doAdd() {
  const name = addName.value.trim()
  if (!name) return
  if (addKind.value === 'tile') store.addTileLayer(name)
  else store.addObjectGroup(name)
  showAdd.value = false
  addName.value = ''
}

const renamingIndex = ref(-1)
const renameText = ref('')
function startRename(index: number, current: string) {
  renamingIndex.value = index
  renameText.value = current
}
function commitRename() {
  if (renamingIndex.value >= 0 && renameText.value.trim()) {
    store.renameLayer(renamingIndex.value, renameText.value.trim())
  }
  renamingIndex.value = -1
}

function layerWarning(name: string, kind: 'tile' | 'object'): string {
  const lower = name.toLowerCase()
  if (kind === 'tile' && lower === 'units') return '保存进游戏时 units 图层会被游戏转为单位'
  return ''
}
</script>

<template>
  <div class="layer-panel">
    <div class="panel-title">
      图层
      <button class="icon" title="新建图层/对象组" @click="showAdd = true">＋</button>
    </div>
    <div class="layer-list scroll">
      <div
        v-for="e in entries"
        :key="e.index"
        class="layer-item"
        :class="{
          active: e.index === activeLayerIndex || e.index === activeObjectGroupIndex,
          objectgroup: isObjectGroup(e.item),
        }"
        @click="selectEntry(e.index)"
        @dblclick="startRename(e.index, e.item.name)"
      >
        <button
          class="vis"
          :title="e.item.visible ? '隐藏' : '显示'"
          @click.stop="store.toggleLayerVisible(e.index)"
        >
          {{ e.item.visible ? '👁' : '—' }}
        </button>
        <span class="kind">{{ isObjectGroup(e.item) ? '▣' : '▦' }}</span>
        <template v-if="renamingIndex === e.index">
          <input
            v-model="renameText"
            class="rename"
            @keydown.enter="commitRename"
            @blur="commitRename"
            @click.stop
          />
        </template>
        <template v-else>
          <span class="name" :title="layerWarning(e.item.name, isObjectGroup(e.item) ? 'object' : 'tile')">
            {{ e.item.name }}
            <em v-if="isObjectGroup(e.item)" class="count">({{ e.item.objects.length }})</em>
          </span>
        </template>
        <span class="ops">
          <button class="icon" title="上移（渲染更靠上）" @click.stop="store.moveLayer(e.index, 1)">↑</button>
          <button class="icon" title="下移" @click.stop="store.moveLayer(e.index, -1)">↓</button>
          <button class="icon danger" title="删除" @click.stop="store.removeLayer(e.index)">✕</button>
        </span>
      </div>
      <div v-if="!entries.length" class="empty">无图层</div>
    </div>

    <div v-if="showAdd" class="dialog-mask" @click.self="showAdd = false">
      <div class="dialog">
        <div class="dialog-header">新建图层</div>
        <div class="dialog-body">
          <div class="form-row">
            <label>类型</label>
            <select v-model="addKind">
              <option value="tile">图块层（地形/地块）</option>
              <option value="object">对象组（触发器/单位对象）</option>
            </select>
          </div>
          <div class="form-row">
            <label>名称</label>
            <input v-model="addName" placeholder="图层名称" @keydown.enter="doAdd" />
            <span class="hint">游戏要求必须有 Ground 与 Items；触发器放 Triggers，单位放 UnitObjects</span>
          </div>
          <div class="form-row">
            <label>常用名称</label>
            <div class="suggest">
              <button
                v-for="n in addKind === 'tile' ? SUGGESTED_TILE : SUGGESTED_GROUP"
                :key="n"
                @click="addName = n"
              >
                {{ n }}
              </button>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button @click="showAdd = false">取消</button>
          <button class="primary" :disabled="!addName.trim()" @click="doAdd">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layer-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.layer-list {
  flex: 1;
  min-height: 0;
  padding: 0 6px 6px;
}
.layer-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid transparent;
  user-select: none;
}
.layer-item:hover {
  background: var(--bg3);
}
.layer-item.active {
  background: var(--accent-dim);
  border-color: var(--accent);
}
.layer-item .vis {
  padding: 0 4px;
  min-width: 26px;
  background: transparent;
  border: none;
}
.kind {
  color: var(--text-dim);
  font-size: 11px;
}
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}
.count {
  color: var(--text-dim);
  font-style: normal;
  font-size: 11px;
}
.ops {
  display: none;
  gap: 2px;
}
.layer-item:hover .ops {
  display: flex;
}
.ops .icon {
  padding: 1px 5px;
  min-width: 0;
  font-size: 11px;
}
.rename {
  flex: 1;
}
.empty {
  color: var(--text-dim);
  text-align: center;
  padding: 14px;
}
.suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
</style>
