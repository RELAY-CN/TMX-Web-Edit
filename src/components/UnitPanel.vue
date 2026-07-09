<script setup lang="ts">
/**
 * 单位摆放面板：从内置单位列表或 units.tsx 地块集选取单位，
 * 切换到 unit 工具后在画布点击放置（写入 UnitObjects 对象组）。
 */
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { BUILTIN_UNITS } from '@/game/units'

const store = useEditorStore()
const { structRev, placeTeam, unitPreset, tool } = storeToRefs(store)

const filter = ref('')
const category = ref<string>('全部')

const categories = computed(() => {
  const set = new Set(BUILTIN_UNITS.map((u) => u.category))
  return ['全部', ...Array.from(set)]
})

const filtered = computed(() => {
  const f = filter.value.trim().toLowerCase()
  return BUILTIN_UNITS.filter((u) => {
    if (category.value !== '全部' && u.category !== category.value) return false
    if (!f) return true
    return u.name.toLowerCase().includes(f) || u.label.includes(f)
  })
})

/** 从地图中的 units 地块集提取带 unit 属性的 tile → gid 映射 */
const unitGidMap = computed(() => {
  void structRev.value
  const m = store.map
  const map = new Map<string, number>()
  if (!m) return map
  for (const ts of m.tilesets) {
    for (const [id, props] of Object.entries(ts.tileProperties)) {
      const unit = props.unit || props.customUnit
      if (!unit) continue
      // 同名取第一个
      if (!map.has(unit)) map.set(unit, ts.firstgid + Number(id))
    }
  }
  return map
})

function pick(name: string) {
  const gid = unitGidMap.value.get(name)
  store.setUnitPreset({
    unit: name,
    team: placeTeam.value,
    gid,
  })
}

function isActive(name: string) {
  return tool.value === 'unit' && unitPreset.value?.unit === name
}
</script>

<template>
  <div class="unit-panel">
    <div class="panel-title">
      单位摆放
      <span class="hint-inline">工具 U</span>
    </div>
    <div class="controls">
      <div class="form-row" style="margin-bottom: 6px">
        <label>队伍</label>
        <select v-model="store.placeTeam" @change="unitPreset && store.setUnitPreset({ ...unitPreset, team: store.placeTeam })">
          <option value="-1">-1 中立</option>
          <option v-for="t in 10" :key="t - 1" :value="String(t - 1)">队伍 {{ t - 1 }}</option>
          <option value="none">none 中立</option>
        </select>
      </div>
      <input v-model="filter" placeholder="搜索单位…" />
      <div class="cats">
        <button
          v-for="c in categories"
          :key="c"
          :class="{ active: category === c }"
          @click="category = c"
        >
          {{ c }}
        </button>
      </div>
    </div>
    <div class="unit-list scroll">
      <button
        v-for="u in filtered"
        :key="u.name"
        class="unit-item"
        :class="{ active: isActive(u.name) }"
        :title="u.name"
        @click="pick(u.name)"
      >
        <span class="cat">{{ u.category }}</span>
        <span class="label">{{ u.label }}</span>
        <code class="name">{{ u.name }}</code>
        <span v-if="unitGidMap.has(u.name)" class="has-gid" title="地图中有对应地块预览">▣</span>
      </button>
      <div v-if="!filtered.length" class="empty">无匹配单位</div>
    </div>
    <p class="footer-hint">选中后在画布点击放置；写入 UnitObjects（游戏官方对象组名，无则自动创建）</p>
  </div>
</template>

<style scoped>
.unit-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.hint-inline {
  color: var(--accent);
  text-transform: none;
  font-weight: 500;
}
.controls {
  padding: 0 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.cats button {
  font-size: 11px;
  padding: 1px 6px;
}
.unit-list {
  flex: 1;
  min-height: 0;
  padding: 0 6px 6px;
  overflow: auto;
}
.unit-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  margin-bottom: 1px;
  padding: 4px 6px;
  min-height: 28px;
}
.unit-item .cat {
  font-size: 10px;
  color: var(--text-dim);
  min-width: 28px;
}
.unit-item .label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unit-item .name {
  font-size: 10px;
  color: var(--accent);
}
.has-gid {
  color: var(--ok);
  font-size: 11px;
}
.empty {
  color: var(--text-dim);
  text-align: center;
  padding: 12px;
  font-size: 12px;
}
.footer-hint {
  margin: 0;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-dim);
  border-top: 1px solid var(--border);
}
</style>
