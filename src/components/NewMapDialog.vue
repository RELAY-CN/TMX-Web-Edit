<script setup lang="ts">
import { ref } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { listBuiltinTsx } from '@/game/builtin'

const emit = defineEmits<{ close: [] }>()
const store = useEditorStore()

const width = ref(100)
const height = ref(100)
const mapType = ref('skirmish')
const groundTsx = ref('terrain/Long Grass.tsx')

const terrainOptions = listBuiltinTsx().filter((t) => t.path.toLowerCase().startsWith('terrain/'))

async function create() {
  await store.newMap({
    width: Math.max(10, Math.min(2000, width.value)),
    height: Math.max(10, Math.min(2000, height.value)),
    groundTsx: groundTsx.value,
    mapType: mapType.value,
  })
  emit('close')
}
</script>

<template>
  <div class="dialog-mask" @click.self="emit('close')">
    <div class="dialog">
      <div class="dialog-header">新建地图</div>
      <div class="dialog-body">
        <div class="form-inline">
          <div class="form-row" style="flex: 1">
            <label>宽度（格）</label>
            <input v-model.number="width" type="number" min="10" max="2000" />
          </div>
          <div class="form-row" style="flex: 1">
            <label>高度（格）</label>
            <input v-model.number="height" type="number" min="10" max="2000" />
          </div>
        </div>
        <div class="form-row">
          <label>地图类型（写入 map_info）</label>
          <select v-model="mapType">
            <option value="skirmish">skirmish - 遭遇战</option>
            <option value="mission">mission - 任务</option>
            <option value="survival">survival - 生存</option>
            <option value="challenge">challenge - 挑战</option>
          </select>
        </div>
        <div class="form-row">
          <label>地面填充地块</label>
          <select v-model="groundTsx">
            <option v-for="t in terrainOptions" :key="t.path" :value="t.path">{{ t.def.name }}</option>
          </select>
          <span class="hint">自动创建 Ground / Items、Triggers（含 map_info）与 UnitObjects</span>
        </div>
      </div>
      <div class="dialog-footer">
        <button @click="emit('close')">取消</button>
        <button class="primary" @click="create">创建</button>
      </div>
    </div>
  </div>
</template>
