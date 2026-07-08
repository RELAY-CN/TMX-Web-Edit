<script setup lang="ts">
/**
 * 对象检查器：按触发器 schema 渲染表单（含通用触发器属性），
 * 并提供自定义属性的增删（schema 覆盖不到的一律可手工编辑）。
 */
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import {
  COMMON_TRIGGER_FIELDS,
  MISSION_TRIGGER_TYPES,
  OBJECT_TYPES,
  getObjectTypeDef,
  type FieldDef,
} from '@/game/triggers'
import { BUILTIN_UNITS } from '@/game/units'
import { isObjectGroup } from '@/tmx/types'

const store = useEditorStore()
const { structRev, rev } = storeToRefs(store)

const obj = computed(() => {
  void structRev.value
  void rev.value
  return store.selectedObject
})

const typeDef = computed(() => {
  const o = obj.value
  if (!o) return undefined
  return getObjectTypeDef(o.type, o.name)
})

const isTrigger = computed(() => {
  const o = obj.value
  return !!o && MISSION_TRIGGER_TYPES.has(o.type)
})

/** 展示的 schema 字段（类型字段 + 通用触发器字段） */
const schemaFields = computed<FieldDef[]>(() => {
  const def = typeDef.value
  const fields: FieldDef[] = []
  if (def) fields.push(...def.fields)
  if (isTrigger.value) fields.push(...COMMON_TRIGGER_FIELDS)
  return fields
})

/** schema 未覆盖的自定义属性 */
const extraProps = computed(() => {
  const o = obj.value
  if (!o) return []
  const known = new Set(schemaFields.value.map((f) => f.key))
  return Object.keys(o.properties).filter((k) => !known.has(k))
})

function setGeom(key: 'x' | 'y' | 'width' | 'height' | 'rotation', v: string) {
  const o = obj.value
  if (!o) return
  const num = Number(v)
  if (!Number.isFinite(num)) return
  store.updateObject(store.activeObjectGroupIndex, o.id, (mut) => {
    ;(mut as never as Record<string, number>)[key] = num
  }, '编辑对象几何')
}

function setName(v: string) {
  const o = obj.value
  if (!o) return
  store.updateObject(store.activeObjectGroupIndex, o.id, (m) => (m.name = v), '重命名对象')
}

function setType(v: string) {
  const o = obj.value
  if (!o) return
  store.updateObject(store.activeObjectGroupIndex, o.id, (m) => {
    m.type = v
    const def = OBJECT_TYPES.find((t) => t.type === v)
    if (def?.defaults) {
      for (const [k, val] of Object.entries(def.defaults)) {
        if (!(k in m.properties)) m.properties[k] = val
      }
    }
  }, '修改对象类型')
}

function setProp(key: string, value: string | boolean) {
  const o = obj.value
  if (!o) return
  const v = typeof value === 'boolean' ? (value ? 'true' : '') : value
  store.updateObject(store.activeObjectGroupIndex, o.id, (m) => {
    if (v === '' || v === undefined) delete m.properties[key]
    else m.properties[key] = String(v)
  }, '编辑属性 ' + key)
}

const newPropKey = ref('')
const newPropValue = ref('')
function addProp() {
  const k = newPropKey.value.trim()
  if (!k || !obj.value) return
  setProp(k, newPropValue.value)
  newPropKey.value = ''
  newPropValue.value = ''
}

/** point 对象名称列表（move.target 用） */
const pointNames = computed(() => {
  void structRev.value
  const m = store.map
  if (!m) return []
  const names: string[] = []
  for (const item of m.layers) {
    if (!isObjectGroup(item)) continue
    for (const o of item.objects) {
      if (o.type === 'point' && o.name) names.push(o.name)
    }
  }
  return names
})

/** 触发器 id 列表提示（idlist 用） */
const triggerIds = computed(() => {
  void structRev.value
  const m = store.map
  if (!m) return []
  const ids: string[] = []
  for (const item of m.layers) {
    if (!isObjectGroup(item)) continue
    for (const o of item.objects) {
      const id = o.properties['id'] || o.name
      if (id && MISSION_TRIGGER_TYPES.has(o.type)) ids.push(id)
    }
  }
  return ids
})

const TEAMS = ['', '-1', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'none']

const showAllCommon = ref(false)
function fieldVisible(f: FieldDef): boolean {
  const o = obj.value
  if (!o) return false
  // 通用字段默认折叠：只显示已有值的 + 常用几个
  if (!showAllCommon.value && COMMON_TRIGGER_FIELDS.includes(f)) {
    const important = ['id', 'team', 'delay', 'activatedBy', 'alsoActivate']
    return important.includes(f.key) || o.properties[f.key] !== undefined
  }
  return true
}
</script>

<template>
  <div class="inspector">
    <div class="panel-title">属性</div>
    <div v-if="!obj" class="empty">
      未选中对象<br />
      <span class="hint">使用对象工具 (O) 在画布点选，或在对象面板选择</span>
    </div>
    <div v-else class="body scroll">
      <div class="section">
        <div class="sec-title">
          基本
          <span v-if="typeDef" class="type-label" :title="typeDef.desc">{{ typeDef.label }}</span>
        </div>
        <div class="grid2">
          <div class="form-row">
            <label>名称</label>
            <input :value="obj.name" @change="setName(($event.target as HTMLInputElement).value)" />
          </div>
          <div class="form-row">
            <label>类型 (type)</label>
            <select :value="obj.type" @change="setType(($event.target as HTMLSelectElement).value)">
              <option v-for="t in OBJECT_TYPES" :key="t.type" :value="t.type">
                {{ t.type || '（无类型）' }}
              </option>
            </select>
          </div>
        </div>
        <div class="grid4">
          <div class="form-row">
            <label>X</label>
            <input type="number" :value="obj.x" @change="setGeom('x', ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="form-row">
            <label>Y</label>
            <input type="number" :value="obj.y" @change="setGeom('y', ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="form-row">
            <label>宽</label>
            <input type="number" :value="obj.width" @change="setGeom('width', ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="form-row">
            <label>高</label>
            <input type="number" :value="obj.height" @change="setGeom('height', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
        <p v-if="typeDef && typeDef.desc" class="desc">{{ typeDef.desc }}</p>
      </div>

      <div v-if="schemaFields.length" class="section">
        <div class="sec-title">
          {{ isTrigger ? '触发器属性' : '类型属性' }}
          <button v-if="isTrigger" class="icon" @click="showAllCommon = !showAllCommon">
            {{ showAllCommon ? '收起' : '全部' }}
          </button>
        </div>
        <template v-for="f in schemaFields" :key="f.key">
          <div v-if="fieldVisible(f)" class="form-row">
            <label :title="f.desc">{{ f.label }} <code>{{ f.key }}</code></label>

            <select
              v-if="f.type === 'enum'"
              :value="obj.properties[f.key] ?? ''"
              @change="setProp(f.key, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in f.options" :key="opt" :value="opt">{{ opt || '（未设置）' }}</option>
            </select>

            <select
              v-else-if="f.type === 'team'"
              :value="obj.properties[f.key] ?? ''"
              @change="setProp(f.key, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="t in TEAMS" :key="t" :value="t">{{ t === '' ? '（未设置）' : t === '-1' || t === 'none' ? t + '（中立）' : '队伍 ' + t }}</option>
            </select>

            <label v-else-if="f.type === 'bool'" class="check">
              <input
                type="checkbox"
                :checked="obj.properties[f.key] === 'true'"
                @change="setProp(f.key, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ obj.properties[f.key] === 'true' ? 'true' : '未设置' }}</span>
            </label>

            <textarea
              v-else-if="f.type === 'text' || f.type === 'unitlist'"
              :value="obj.properties[f.key] ?? ''"
              :placeholder="f.placeholder"
              rows="2"
              @change="setProp(f.key, ($event.target as HTMLTextAreaElement).value)"
            />

            <template v-else-if="f.type === 'unit'">
              <input
                :value="obj.properties[f.key] ?? ''"
                list="builtin-units"
                :placeholder="f.placeholder ?? '单位名'"
                @change="setProp(f.key, ($event.target as HTMLInputElement).value)"
              />
            </template>

            <template v-else-if="f.type === 'pointid'">
              <input
                :value="obj.properties[f.key] ?? ''"
                list="point-names"
                placeholder="point 对象名称"
                @change="setProp(f.key, ($event.target as HTMLInputElement).value)"
              />
            </template>

            <template v-else-if="f.type === 'idlist'">
              <input
                :value="obj.properties[f.key] ?? ''"
                list="trigger-ids"
                placeholder="id1,id2"
                @change="setProp(f.key, ($event.target as HTMLInputElement).value)"
              />
            </template>

            <input
              v-else
              :value="obj.properties[f.key] ?? ''"
              :placeholder="f.placeholder ?? (f.type === 'time' ? '如 5s / 500ms' : f.type === 'color' ? '如 #ff0000 / red' : '')"
              @change="setProp(f.key, ($event.target as HTMLInputElement).value)"
            />
            <span v-if="f.desc" class="hint">{{ f.desc }}</span>
          </div>
        </template>
      </div>

      <div class="section">
        <div class="sec-title">自定义属性</div>
        <div v-for="k in extraProps" :key="k" class="prop-row">
          <code class="pk" :title="k">{{ k }}</code>
          <input :value="obj.properties[k]" @change="setProp(k, ($event.target as HTMLInputElement).value)" />
          <button class="icon danger" title="删除属性" @click="setProp(k, '')">✕</button>
        </div>
        <div class="prop-row add">
          <input v-model="newPropKey" placeholder="属性名" @keydown.enter="addProp" />
          <input v-model="newPropValue" placeholder="值" @keydown.enter="addProp" />
          <button class="icon" title="添加" @click="addProp">＋</button>
        </div>
        <p class="hint">
          本地化文本可加后缀，如 text_zh / introText_zh；时间可写 5s、500ms
        </p>
      </div>
    </div>

    <datalist id="builtin-units">
      <option v-for="u in BUILTIN_UNITS" :key="u.name" :value="u.name">{{ u.label }}</option>
    </datalist>
    <datalist id="point-names">
      <option v-for="n in pointNames" :key="n" :value="n" />
    </datalist>
    <datalist id="trigger-ids">
      <option v-for="n in triggerIds" :key="n" :value="n" />
    </datalist>
  </div>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.empty {
  color: var(--text-dim);
  text-align: center;
  padding: 18px 10px;
  font-size: 12px;
}
.body {
  flex: 1;
  min-height: 0;
  padding: 0 10px 12px;
}
.section {
  margin-bottom: 14px;
}
.sec-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.type-label {
  color: var(--accent);
  font-weight: 500;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 8px;
}
.grid4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0 6px;
}
.desc {
  font-size: 11px;
  color: var(--text-dim);
  margin: 2px 0 0;
}
label code {
  color: var(--accent);
  font-size: 10px;
}
.check {
  display: flex;
  gap: 6px;
  align-items: center;
  color: var(--text);
}
.prop-row {
  display: flex;
  gap: 5px;
  align-items: center;
  margin-bottom: 5px;
}
.prop-row .pk {
  min-width: 90px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--warn);
}
.prop-row.add input {
  flex: 1;
}
</style>
