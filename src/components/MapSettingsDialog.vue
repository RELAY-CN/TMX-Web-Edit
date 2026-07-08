<script setup lang="ts">
/**
 * 地图设置：尺寸调整 + 地图级自定义属性（<map><properties>）。
 */
import { computed, ref } from 'vue'
import { useEditorStore } from '@/stores/editor'

const emit = defineEmits<{ close: [] }>()
const store = useEditorStore()

const m = store.map!
const width = ref(m.width)
const height = ref(m.height)

const props = computed(() => Object.entries(store.map?.properties ?? {}))
const newKey = ref('')
const newValue = ref('')

function apply() {
  if (width.value !== m.width || height.value !== m.height) {
    store.resizeMap(Math.max(10, width.value), Math.max(10, height.value))
  }
  emit('close')
}

function setMapProp(key: string, value: string) {
  const map = store.map
  if (!map) return
  if (value === '') delete map.properties[key]
  else map.properties[key] = value
  store.bumpStruct()
}

function addProp() {
  const k = newKey.value.trim()
  if (!k) return
  setMapProp(k, newValue.value)
  newKey.value = ''
  newValue.value = ''
}
</script>

<template>
  <div class="dialog-mask" @click.self="emit('close')">
    <div class="dialog">
      <div class="dialog-header">地图设置</div>
      <div class="dialog-body scroll">
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
        <p class="hint">缩小会裁掉右/下侧内容；扩大在右/下侧补空（Ground 层记得补满地块，游戏要求每格必须有地面）</p>

        <div class="sec-title" style="margin-top: 10px">地图属性（map properties）</div>
        <div v-for="[k, v] in props" :key="k" class="prop-row">
          <code class="pk">{{ k }}</code>
          <input :value="v" @change="setMapProp(k, ($event.target as HTMLInputElement).value)" />
          <button class="icon danger" @click="setMapProp(k, '')">✕</button>
        </div>
        <div class="prop-row">
          <input v-model="newKey" placeholder="属性名" style="max-width: 130px" @keydown.enter="addProp" />
          <input v-model="newValue" placeholder="值" @keydown.enter="addProp" />
          <button class="icon" @click="addProp">＋</button>
        </div>
      </div>
      <div class="dialog-footer">
        <button @click="emit('close')">取消</button>
        <button class="primary" @click="apply">应用</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sec-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 8px;
}
.prop-row {
  display: flex;
  gap: 5px;
  align-items: center;
  margin-bottom: 5px;
}
.prop-row .pk {
  min-width: 90px;
  font-size: 11px;
  color: var(--warn);
}
.prop-row input {
  flex: 1;
}
</style>
