<script setup lang="ts">
/**
 * 单位选择器：搜索 + 分类 + 数量，用于 survival 波次 / spawnUnits 可视化编辑。
 * mode:
 *  - wave: 输出 {count, unit}（波次行 "3 tank"）
 *  - spawn: 输出 {unit, count, opts?}（spawnUnits "tank*3"）
 */
import { computed, ref, watch } from 'vue'
import { BUILTIN_UNITS, type BuiltinUnit } from '@/game/units'

export interface PickedUnit {
  unit: string
  count: number
  opts?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: PickedUnit[]
    /** wave=波次单位；spawn=unitAdd.spawnUnits */
    mode?: 'wave' | 'spawn'
    /** 是否允许自定义单位名（非内置） */
    allowCustom?: boolean
    compact?: boolean
  }>(),
  {
    mode: 'spawn',
    allowCustom: true,
    compact: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [PickedUnit[]]
}>()

const filter = ref('')
const category = ref('全部')
const customName = ref('')
const customCount = ref(1)
const showBrowser = ref(false)

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

function labelOf(name: string): string {
  return BUILTIN_UNITS.find((u) => u.name === name)?.label ?? name
}

function categoryOf(name: string): string {
  return BUILTIN_UNITS.find((u) => u.name === name)?.category ?? '自定义'
}

function setList(next: PickedUnit[]) {
  emit('update:modelValue', next)
}

function addUnit(u: BuiltinUnit | string, count = 1) {
  const name = typeof u === 'string' ? u.trim() : u.name
  if (!name) return
  const list = [...props.modelValue]
  const i = list.findIndex((e) => e.unit === name && !e.opts)
  if (i >= 0) {
    list[i] = { ...list[i], count: list[i].count + Math.max(1, count) }
  } else {
    list.push({ unit: name, count: Math.max(1, count) })
  }
  setList(list)
}

function removeAt(i: number) {
  const list = [...props.modelValue]
  list.splice(i, 1)
  setList(list)
}

function setCount(i: number, count: number) {
  const list = [...props.modelValue]
  const c = Math.max(1, Math.min(9999, Math.floor(count) || 1))
  list[i] = { ...list[i], count: c }
  setList(list)
}

function setUnitName(i: number, unit: string) {
  const list = [...props.modelValue]
  list[i] = { ...list[i], unit: unit.trim() }
  setList(list)
}

function addCustom() {
  if (!props.allowCustom) return
  const name = customName.value.trim()
  if (!name) return
  addUnit(name, customCount.value)
  customName.value = ''
  customCount.value = 1
}

function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= props.modelValue.length) return
  const list = [...props.modelValue]
  const t = list[i]
  list[i] = list[j]
  list[j] = t
  setList(list)
}

// 外部清空时收起浏览器
watch(
  () => props.modelValue.length,
  (n) => {
    if (n === 0) {
      /* keep browser state */
    }
  },
)
</script>

<template>
  <div class="unit-picker" :class="{ compact }">
    <div v-if="modelValue.length" class="picked">
      <div v-for="(e, i) in modelValue" :key="i + ':' + e.unit" class="chip">
        <span class="cat">{{ categoryOf(e.unit) }}</span>
        <input
          class="name-input"
          :value="e.unit"
          list="unit-picker-builtin"
          :title="labelOf(e.unit)"
          @change="setUnitName(i, ($event.target as HTMLInputElement).value)"
        />
        <span class="label-hint">{{ labelOf(e.unit) }}</span>
        <label class="cnt">
          ×
          <input
            type="number"
            min="1"
            max="9999"
            :value="e.count"
            @change="setCount(i, Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <button type="button" class="icon tiny" title="上移" @click="move(i, -1)">↑</button>
        <button type="button" class="icon tiny" title="下移" @click="move(i, 1)">↓</button>
        <button type="button" class="icon tiny danger" title="移除" @click="removeAt(i)">×</button>
      </div>
    </div>
    <div v-else class="empty-hint">尚未选择单位，从下方列表点选或输入自定义名</div>

    <div class="actions">
      <button type="button" class="primary" @click="showBrowser = !showBrowser">
        {{ showBrowser ? '收起单位列表' : '选择单位…' }}
      </button>
      <template v-if="allowCustom">
        <input
          v-model="customName"
          class="custom-name"
          list="unit-picker-builtin"
          placeholder="自定义/模组单位名"
          @keydown.enter.prevent="addCustom"
        />
        <input v-model.number="customCount" type="number" min="1" max="9999" class="custom-cnt" title="数量" />
        <button type="button" :disabled="!customName.trim()" @click="addCustom">添加</button>
      </template>
    </div>

    <div v-if="showBrowser" class="browser">
      <input v-model="filter" placeholder="搜索中文名或英文 id…" class="search" />
      <div class="cats">
        <button
          v-for="c in categories"
          :key="c"
          type="button"
          :class="{ active: category === c }"
          @click="category = c"
        >
          {{ c }}
        </button>
      </div>
      <div class="unit-grid scroll">
        <button
          v-for="u in filtered"
          :key="u.name"
          type="button"
          class="unit-btn"
          :title="u.name"
          @click="addUnit(u, 1)"
        >
          <span class="ucat">{{ u.category }}</span>
          <span class="ulabel">{{ u.label }}</span>
          <code class="uname">{{ u.name }}</code>
        </button>
        <div v-if="!filtered.length" class="empty-hint">无匹配</div>
      </div>
    </div>

    <datalist id="unit-picker-builtin">
      <option v-for="u in BUILTIN_UNITS" :key="u.name" :value="u.name">{{ u.label }}</option>
    </datalist>
  </div>
</template>

<style scoped>
.unit-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.picked {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 6px;
  flex-wrap: wrap;
}
.cat {
  font-size: 10px;
  color: var(--text-dim);
  min-width: 2.5em;
}
.name-input {
  width: 120px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
}
.label-hint {
  font-size: 11px;
  color: var(--text-dim);
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cnt {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: var(--text-dim);
}
.cnt input {
  width: 56px;
}
.tiny {
  min-width: 24px;
  padding: 2px 5px;
  font-size: 11px;
}
.tiny.danger:hover {
  border-color: var(--danger);
  color: #ffb0b0;
}
.empty-hint {
  font-size: 11px;
  color: var(--text-dim);
  padding: 4px 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.custom-name {
  flex: 1;
  min-width: 100px;
}
.custom-cnt {
  width: 56px;
}
.browser {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
}
.search {
  width: 100%;
}
.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.cats button {
  padding: 2px 8px;
  font-size: 11px;
}
.cats button.active {
  background: var(--accent-dim);
  border-color: var(--accent);
}
.unit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 4px;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
}
.unit-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  text-align: left;
  padding: 5px 7px;
  min-height: 48px;
}
.unit-btn:hover {
  border-color: var(--accent);
}
.ucat {
  font-size: 10px;
  color: var(--text-dim);
}
.ulabel {
  font-size: 12px;
}
.uname {
  font-size: 10px;
  color: var(--accent);
  opacity: 0.85;
}
.compact .label-hint {
  display: none;
}
</style>
