<script setup lang="ts">
/**
 * 对象面板：当前对象组的对象列表 + 按类型新建对象（触发器、标记、单位对象等）。
 */
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { OBJECT_TYPES, objectColor } from '@/game/triggers'

const store = useEditorStore()
const { structRev, selectedObjectId } = storeToRefs(store)

const filter = ref('')
const showAdd = ref(false)

const group = computed(() => {
  void structRev.value
  return store.activeObjectGroup
})

const objects = computed(() => {
  void structRev.value
  const g = group.value
  if (!g) return []
  const f = filter.value.trim().toLowerCase()
  return g.objects.filter(
    (o) =>
      !f ||
      o.name.toLowerCase().includes(f) ||
      o.type.toLowerCase().includes(f) ||
      String(o.id) === f,
  )
})

const typeGroups = computed(() => {
  const groups: Record<string, typeof OBJECT_TYPES> = {
    触发条件: [],
    动作: [],
    标记与配置: [],
    单位: [],
    其他: [],
  }
  for (const t of OBJECT_TYPES) {
    if (t.type === '') continue
    switch (t.group) {
      case 'trigger': groups['触发条件'].push(t); break
      case 'action': groups['动作'].push(t); break
      case 'marker': groups['标记与配置'].push(t); break
      case 'unit': groups['单位'].push(t); break
      default: groups['其他'].push(t)
    }
  }
  return groups
})

function selectObject(id: number) {
  store.selectedObjectId = id
  store.tool = 'object'
}

/** 在视图中心新建对象 */
function addObject(typeDef: (typeof OBJECT_TYPES)[number]) {
  const m = store.map
  if (!m || store.activeObjectGroupIndex < 0) return
  const cx = (m.width * m.tilewidth) / 2
  const cy = (m.height * m.tileheight) / 2
  const isPoint = typeDef.shape === 'point'
  const isMapInfo = typeDef.type === 'map_info'
  store.addObject(store.activeObjectGroupIndex, {
    name: isMapInfo ? 'map_info' : typeDef.type === 'point' ? 'point_' + m.nextobjectid : '',
    type: isMapInfo ? '' : typeDef.type,
    x: Math.round(cx),
    y: Math.round(cy),
    width: isPoint ? 0 : 100,
    height: isPoint ? 0 : 100,
    rotation: 0,
    visible: true,
    point: isPoint || undefined,
    properties: { ...(typeDef.defaults ?? {}) },
    extraAttrs: {},
  })
  store.tool = 'object'
  showAdd.value = false
}

function objLabel(o: { name: string; type: string; id: number }): string {
  return o.name || o.type || '#' + o.id
}
</script>

<template>
  <div class="object-panel">
    <div class="panel-title">
      对象 <span v-if="group" class="group-name">{{ group.name }}</span>
      <button class="icon" :disabled="!group" title="新建对象/触发器" @click="showAdd = true">＋</button>
    </div>
    <div v-if="group" class="obj-filter">
      <input v-model="filter" placeholder="筛选名称 / 类型 / id" />
    </div>
    <div class="obj-list scroll">
      <div v-if="!group" class="empty">未选择对象组<br />（在图层面板点击对象组）</div>
      <div
        v-for="o in objects"
        :key="o.id"
        class="obj-item"
        :class="{ active: o.id === selectedObjectId }"
        @click="selectObject(o.id)"
      >
        <span class="dot" :style="{ background: objectColor(o.type, o.name) }"></span>
        <span class="label">{{ objLabel(o) }}</span>
        <span class="type">{{ o.type || (o.name === 'map_info' ? 'map_info' : '') }}</span>
        <button
          class="icon danger del"
          title="删除"
          @click.stop="store.removeObject(store.activeObjectGroupIndex, o.id)"
        >
          ✕
        </button>
      </div>
      <div v-if="group && !objects.length" class="empty">无对象</div>
    </div>

    <div v-if="showAdd" class="dialog-mask" @click.self="showAdd = false">
      <div class="dialog" style="min-width: 480px">
        <div class="dialog-header">新建对象（添加到对象组 {{ group?.name }}）</div>
        <div class="dialog-body scroll">
          <div v-for="(defs, gname) in typeGroups" :key="gname" class="type-group">
            <h4>{{ gname }}</h4>
            <div class="type-list">
              <button v-for="t in defs" :key="t.type" :title="t.desc" @click="addObject(t)">
                <span class="dot" :style="{ background: objectColor(t.type, '') }"></span>
                {{ t.label }}
              </button>
            </div>
          </div>
          <p class="hint" style="margin-bottom: 0">
            触发器必须放在名为 Triggers 的对象组，否则游戏会告警并忽略；对象添加后在画布中拖动调整位置/大小。
          </p>
        </div>
        <div class="dialog-footer">
          <button @click="showAdd = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.object-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.group-name {
  color: var(--accent);
  text-transform: none;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.obj-filter {
  padding: 0 8px 6px;
}
.obj-list {
  flex: 1;
  min-height: 0;
  padding: 0 6px 6px;
}
.obj-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid transparent;
}
.obj-item:hover {
  background: var(--bg3);
}
.obj-item.active {
  background: var(--accent-dim);
  border-color: var(--accent);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}
.type {
  color: var(--text-dim);
  font-size: 11px;
}
.del {
  display: none;
  padding: 0 4px;
  min-width: 0;
}
.obj-item:hover .del {
  display: block;
}
.empty {
  color: var(--text-dim);
  text-align: center;
  padding: 14px;
  font-size: 12px;
}
.type-group h4 {
  margin: 10px 0 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.type-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.type-list button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
</style>
