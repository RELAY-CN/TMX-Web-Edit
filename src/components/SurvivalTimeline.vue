<script setup lang="ts">
/**
 * 生存模式可视化时间轴：
 *  - 编辑 map_info.survivalWaves（相对时间 + 描述 + 选项 + 波次单位选择）
 *  - 展示/编辑 unitAdd 定时刷兵（delay/warmup/repeatDelay + spawnUnits 单位选择）
 *  - 联动刷兵（activatedBy）单独列表
 */
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import {
  WAVE_OPTIONS,
  collectTimelineEvents,
  defaultSurvivalWavesText,
  formatClock,
  formatRelativeTime,
  getSurvivalMapInfo,
  parseSurvivalWaves,
  parseTimeMs,
  serializeSurvivalWaves,
  timelineDurationSec,
  type SurvivalWave,
  type TimelineEvent,
  type WaveOption,
} from '@/game/survival'
import { parseSpawnUnits, serializeSpawnUnits, type SpawnUnitEntry } from '@/game/spawnUnits'
import UnitPicker, { type PickedUnit } from '@/components/UnitPicker.vue'
import { isObjectGroup } from '@/tmx/types'

const emit = defineEmits<{
  'jump-object': [payload: { layerIndex: number; objectId: number; x?: number; y?: number }]
  'focus-map-info': []
}>()

const store = useEditorStore()
const { structRev, rev, selectedObjectId } = storeToRefs(store)

const info = computed(() => {
  void structRev.value
  void rev.value
  return getSurvivalMapInfo(store.map)
})

const events = computed(() => {
  void structRev.value
  void rev.value
  return collectTimelineEvents(store.map)
})

const duration = computed(() => timelineDurationSec(events.value, info.value.waves))

const pxPerSec = ref(1.2)
const selectedWaveIndex = ref<number | null>(null)
const selectedSpawnId = ref<number | null>(null)
const editTab = ref<'waves' | 'spawns' | 'linked'>('waves')
const showRaw = ref(false)
const rawDraft = ref('')

// ---- 波次编辑草稿 ----
const draftRelative = ref('30')
const draftLabel = ref('')
const draftOptions = ref<WaveOption[]>([])
const draftUnits = ref<PickedUnit[]>([])

// ---- unitAdd 刷兵草稿 ----
const draftTeam = ref('1')
const draftDelay = ref('')
const draftWarmup = ref('60s')
const draftRepeat = ref('')
const draftSpawnUnits = ref<PickedUnit[]>([])
const draftSpawnName = ref('')

const timedSpawns = computed(() => events.value.filter((e) => e.kind === 'spawn'))
const linkedSpawns = computed(() => events.value.filter((e) => e.kind === 'linked'))
const waveEvents = computed(() => events.value.filter((e) => e.kind === 'wave'))

const markers = computed(() => {
  const d = duration.value
  const step = d > 1800 ? 300 : d > 600 ? 120 : d > 180 ? 60 : 30
  const out: { sec: number; label: string }[] = []
  for (let s = 0; s <= d; s += step) out.push({ sec: s, label: formatClock(s) })
  return out
})

function leftPct(sec: number): number {
  const d = Math.max(1, duration.value)
  return Math.min(100, Math.max(0, (sec / d) * 100))
}

function ensureTriggers(): number {
  if (info.value.triggersIndex >= 0) return info.value.triggersIndex
  // 不应发生；新建图会有 Triggers
  store.addObjectGroup('Triggers')
  return store.map!.layers.findIndex((l) => isObjectGroup(l) && l.name === 'Triggers')
}

function findMapInfo() {
  const idx = ensureTriggers()
  const g = store.map?.layers[idx]
  if (!g || !isObjectGroup(g)) return null
  const obj = g.objects.find((o) => o.name === 'map_info')
  return obj ? { groupIndex: idx, obj } : null
}

function writeWaves(waves: SurvivalWave[], label = '编辑生存波次') {
  const mi = findMapInfo()
  if (!mi) {
    store.setStatus('缺少 map_info，无法写入 survivalWaves')
    return
  }
  const text = serializeSurvivalWaves(waves)
  store.updateObject(
    mi.groupIndex,
    mi.obj.id,
    (o) => {
      o.properties['type'] = 'survival'
      if (text) o.properties['survivalWaves'] = text
      else delete o.properties['survivalWaves']
      if (!o.properties['winCondition']) o.properties['winCondition'] = 'none'
    },
    label,
  )
}

function selectWave(i: number | null) {
  selectedWaveIndex.value = i
  selectedSpawnId.value = null
  if (i == null || !info.value.waves[i]) {
    draftRelative.value = '60'
    draftLabel.value = ''
    draftOptions.value = []
    draftUnits.value = []
    return
  }
  const w = info.value.waves[i]
  draftRelative.value =
    w.relativeSec == null ? '' : formatRelativeTime(w.relativeSec)
  draftLabel.value = w.label
  draftOptions.value = [...w.options]
  draftUnits.value = w.units.map((u) => ({ unit: u.unit, count: u.count }))
  editTab.value = 'waves'
}

function parseDraftRelative(): number | null {
  const t = draftRelative.value.trim()
  if (!t) return null
  // 允许 M:SS 或纯秒
  if (t.includes(':')) {
    const [a, b] = t.split(':')
    return (parseInt(a, 10) || 0) * 60 + (parseInt(b, 10) || 0)
  }
  const n = Number(t)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

function applyWaveEdit() {
  const i = selectedWaveIndex.value
  if (i == null) return
  // 从当前 info 拷贝后改写选中波次
  const list = info.value.waves.map((w) => ({ ...w, units: [...w.units], options: [...w.options] }))
  if (!list[i]) return
  const rel = parseDraftRelative()
  list[i] = {
    ...list[i],
    relativeSec: rel,
    label: draftLabel.value.trim(),
    options: [...draftOptions.value],
    units: draftUnits.value
      .filter((u) => u.unit.trim())
      .map((u) => ({ unit: u.unit.trim(), count: Math.max(1, u.count | 0) })),
    error: undefined,
    raw: '',
  }
  // 重算 absoluteSec
  let abs = 0
  for (const w of list) {
    if (w.relativeSec != null) abs += w.relativeSec
    w.absoluteSec = abs
  }
  writeWaves(list, '修改生存波次')
  // 刷新选中草稿
  selectWave(i)
}

function addWave() {
  const list = info.value.waves.map((w) => ({ ...w, units: [...w.units], options: [...w.options] }))
  const rel = parseDraftRelative() ?? 60
  list.push({
    relativeSec: rel,
    absoluteSec: 0,
    label: draftLabel.value.trim() || `波次 ${list.length + 1}`,
    options: [...draftOptions.value],
    units: draftUnits.value
      .filter((u) => u.unit.trim())
      .map((u) => ({ unit: u.unit.trim(), count: Math.max(1, u.count | 0) })),
    raw: '',
  })
  let abs = 0
  for (const w of list) {
    if (w.relativeSec != null) abs += w.relativeSec
    w.absoluteSec = abs
  }
  writeWaves(list, '添加生存波次')
  selectWave(list.length - 1)
}

function removeWave() {
  const i = selectedWaveIndex.value
  if (i == null) return
  const list = info.value.waves
    .filter((_, idx) => idx !== i)
    .map((w) => ({ ...w, units: [...w.units], options: [...w.options] }))
  let abs = 0
  for (const w of list) {
    if (w.relativeSec != null) abs += w.relativeSec
    w.absoluteSec = abs
  }
  writeWaves(list, '删除生存波次')
  selectWave(null)
}

function moveWave(dir: -1 | 1) {
  const i = selectedWaveIndex.value
  if (i == null) return
  const j = i + dir
  const list = info.value.waves.map((w) => ({ ...w, units: [...w.units], options: [...w.options] }))
  if (j < 0 || j >= list.length) return
  const t = list[i]
  list[i] = list[j]
  list[j] = t
  let abs = 0
  for (const w of list) {
    if (w.relativeSec != null) abs += w.relativeSec
    w.absoluteSec = abs
  }
  writeWaves(list, '调整波次顺序')
  selectWave(j)
}

function toggleOption(opt: WaveOption) {
  const set = new Set(draftOptions.value)
  if (set.has(opt)) set.delete(opt)
  else set.add(opt)
  draftOptions.value = WAVE_OPTIONS.filter((o) => set.has(o))
}

function seedDefaultWaves() {
  writeWaves(parseSurvivalWaves(defaultSurvivalWavesText()), '写入默认生存波次')
  selectWave(0)
}

// ---- unitAdd 刷兵 ----
function selectSpawn(ev: TimelineEvent) {
  selectedSpawnId.value = ev.objectId ?? null
  selectedWaveIndex.value = null
  if (ev.kind === 'linked') editTab.value = 'linked'
  else editTab.value = 'spawns'

  if (ev.objectId == null || ev.layerIndex == null) return
  const g = store.map?.layers[ev.layerIndex]
  if (!g || !isObjectGroup(g)) return
  const o = g.objects.find((x) => x.id === ev.objectId)
  if (!o) return
  store.activeObjectGroupIndex = ev.layerIndex
  store.selectedObjectId = o.id
  store.tool = 'object'

  draftTeam.value = o.properties['team'] ?? '1'
  draftDelay.value = o.properties['delay'] ?? ''
  draftWarmup.value = o.properties['warmup'] ?? ''
  draftRepeat.value = o.properties['repeatDelay'] ?? ''
  draftSpawnUnits.value = parseSpawnUnits(o.properties['spawnUnits']).map((e) => ({
    unit: e.unit,
    count: e.count,
    opts: e.opts,
  }))
  draftSpawnName.value = o.name
}

function applySpawnEdit() {
  const id = selectedSpawnId.value
  if (id == null) return
  // 找对象
  let groupIndex = -1
  if (!store.map) return
  for (let i = 0; i < store.map.layers.length; i++) {
    const g = store.map.layers[i]
    if (!isObjectGroup(g)) continue
    if (g.objects.some((o) => o.id === id)) {
      groupIndex = i
      break
    }
  }
  if (groupIndex < 0) return

  const spawnText = serializeSpawnUnits(
    draftSpawnUnits.value.map(
      (u): SpawnUnitEntry => ({
        unit: u.unit.trim(),
        count: Math.max(1, u.count | 0),
        opts: u.opts,
      }),
    ),
  )

  store.updateObject(
    groupIndex,
    id,
    (o) => {
      if (draftSpawnName.value.trim()) o.name = draftSpawnName.value.trim()
      o.properties['team'] = draftTeam.value
      o.properties['spawnUnits'] = spawnText
      const d = draftDelay.value.trim()
      const w = draftWarmup.value.trim()
      const r = draftRepeat.value.trim()
      if (d) o.properties['delay'] = d
      else delete o.properties['delay']
      if (w) o.properties['warmup'] = w
      else delete o.properties['warmup']
      if (r) o.properties['repeatDelay'] = r
      else delete o.properties['repeatDelay']
      // 定时刷兵：清掉 activatedBy，避免仍显示为联动
      if (d || w) {
        delete o.properties['activatedBy']
        delete o.properties['whenActivatedIds']
      }
    },
    '编辑刷兵 unitAdd',
  )
}

function addTimedSpawn() {
  const groupIndex = ensureTriggers()
  const spawnText =
    serializeSpawnUnits(
      draftSpawnUnits.value.map((u) => ({
        unit: u.unit.trim(),
        count: Math.max(1, u.count | 0),
        opts: u.opts,
      })),
    ) || 'tank*4'

  // 放在画布中心附近，避免叠在 0,0
  const m = store.map!
  const x = Math.floor((m.width * m.tilewidth) / 2 / 20) * 20
  const y = Math.floor((m.height * m.tileheight) / 2 / 20) * 20

  const created = store.addObject(groupIndex, {
    name: draftSpawnName.value.trim() || `spawn_${formatClock(parseTimeMs(draftWarmup.value || '60s') / 1000)}`,
    type: 'unitAdd',
    x,
    y,
    width: 20,
    height: 20,
    rotation: 0,
    visible: true,
    properties: {
      team: draftTeam.value || '1',
      spawnUnits: spawnText,
      ...(draftWarmup.value.trim() ? { warmup: draftWarmup.value.trim() } : { warmup: '60s' }),
      ...(draftDelay.value.trim() ? { delay: draftDelay.value.trim() } : {}),
      ...(draftRepeat.value.trim() ? { repeatDelay: draftRepeat.value.trim() } : {}),
    },
    extraAttrs: {},
  })
  if (created) {
    selectedSpawnId.value = created.id
    store.tool = 'object'
    store.setStatus('已添加定时刷兵 unitAdd，可在画布拖到刷兵点')
    // 载入草稿
    draftSpawnUnits.value = parseSpawnUnits(spawnText)
    editTab.value = 'spawns'
  }
}

function removeSpawn() {
  const id = selectedSpawnId.value
  if (id == null || !store.map) return
  for (let i = 0; i < store.map.layers.length; i++) {
    const g = store.map.layers[i]
    if (!isObjectGroup(g)) continue
    if (g.objects.some((o) => o.id === id)) {
      store.removeObject(i, id)
      selectedSpawnId.value = null
      return
    }
  }
}

function jumpToEvent(ev: TimelineEvent) {
  if (ev.kind === 'wave' && ev.waveIndex != null) {
    selectWave(ev.waveIndex)
    emit('focus-map-info')
    return
  }
  if (ev.objectId != null && ev.layerIndex != null) {
    selectSpawn(ev)
    emit('jump-object', {
      layerIndex: ev.layerIndex,
      objectId: ev.objectId,
      x: ev.x,
      y: ev.y,
    })
  }
}

function enableSurvivalBasics() {
  const mi = findMapInfo()
  if (!mi) {
    store.setStatus('缺少 map_info')
    return
  }
  store.updateObject(
    mi.groupIndex,
    mi.obj.id,
    (o) => {
      o.properties['type'] = 'survival'
      if (!o.properties['winCondition']) o.properties['winCondition'] = 'none'
      if (!o.properties['survivalWaves']) {
        o.properties['survivalWaves'] = defaultSurvivalWavesText()
      }
    },
    '启用生存模式',
  )

  // attack_point
  if (!info.value.attackPoints.length) {
    const m = store.map!
    store.addObject(mi.groupIndex, {
      name: 'attack_point',
      type: '',
      x: Math.floor((m.width * m.tilewidth) / 2 / 20) * 20,
      y: Math.floor((m.height * m.tileheight) / 2 / 20) * 20,
      width: 20,
      height: 20,
      rotation: 0,
      visible: true,
      properties: {},
      extraAttrs: {},
    })
  }
  // survival AI team
  if (!info.value.survivalTeams.length) {
    store.addObject(mi.groupIndex, {
      name: '',
      type: 'team_info',
      x: 40,
      y: 40,
      width: 20,
      height: 20,
      rotation: 0,
      visible: true,
      properties: { team: '1', ai: 'survival', credits: '0' },
      extraAttrs: {},
    })
  }
  store.setStatus('已启用 survival：map_info + attack_point + team_info(ai=survival)')
  selectWave(0)
}

// 原始文本
watch(showRaw, (v) => {
  if (v) rawDraft.value = info.value.wavesText
})

function applyRaw() {
  writeWaves(parseSurvivalWaves(rawDraft.value), '写入 survivalWaves 原文')
  showRaw.value = false
}

// 选中对象变化时，若是 unitAdd 同步到刷兵面板
watch(selectedObjectId, (id) => {
  if (id < 0 || !store.map) return
  for (let i = 0; i < store.map.layers.length; i++) {
    const g = store.map.layers[i]
    if (!isObjectGroup(g)) continue
    const o = g.objects.find((x) => x.id === id)
    if (o?.type === 'unitAdd') {
      selectSpawn({
        kind: o.properties['activatedBy'] ? 'linked' : 'spawn',
        atSec: 0,
        repeatSec: 0,
        title: o.name,
        unitsText: '',
        objectId: o.id,
        layerIndex: i,
        x: o.x,
        y: o.y,
        activatedBy: o.properties['activatedBy'],
      })
      return
    }
  }
})
</script>

<template>
  <div class="survival-panel">
    <div class="panel-title">
      <span>生存时间轴</span>
      <div class="title-actions">
        <span v-if="info.isSurvival" class="badge ok">survival</span>
        <span v-else class="badge dim">非生存图</span>
        <button v-if="!info.isSurvival" type="button" class="primary" @click="enableSurvivalBasics">
          启用生存兼容
        </button>
        <button type="button" @click="showRaw = !showRaw">{{ showRaw ? '可视化' : '原文' }}</button>
      </div>
    </div>

    <div v-if="!store.map" class="empty">请先打开或新建地图</div>

    <template v-else>
      <!-- 标尺时间轴 -->
      <div class="ruler-wrap">
        <div class="ruler" :style="{ minWidth: duration * pxPerSec + 'px' }">
          <div class="ruler-track">
            <span
              v-for="m in markers"
              :key="m.sec"
              class="tick"
              :style="{ left: leftPct(m.sec) + '%' }"
            >
              {{ m.label }}
            </span>
          </div>

          <!-- 波次条 -->
          <div class="lane wave-lane">
            <span class="lane-label">波次</span>
            <button
              v-for="ev in waveEvents"
              :key="'w' + ev.waveIndex"
              type="button"
              class="marker wave"
              :class="{ active: selectedWaveIndex === ev.waveIndex, err: ev.unitsText.includes('错误') || ev.unitsText.includes('解析') }"
              :style="{ left: leftPct(ev.atSec) + '%' }"
              :title="`${formatClock(ev.atSec)} ${ev.title}\n${ev.unitsText}`"
              @click="jumpToEvent(ev)"
            >
              <span class="dot" />
              <span class="cap">{{ ev.waveIndex! + 1 }}</span>
            </button>
          </div>

          <!-- 定时刷兵 -->
          <div class="lane spawn-lane">
            <span class="lane-label">刷兵</span>
            <button
              v-for="ev in timedSpawns"
              :key="'s' + ev.objectId"
              type="button"
              class="marker spawn"
              :class="{ active: selectedSpawnId === ev.objectId }"
              :style="{ left: leftPct(ev.atSec) + '%' }"
              :title="`${formatClock(ev.atSec)} ${ev.title}\n${ev.unitsText}${ev.repeatSec ? '\n重复 ' + formatClock(ev.repeatSec) : ''}`"
              @click="jumpToEvent(ev)"
            >
              <span class="dot" />
              <span v-if="ev.repeatSec" class="rep">↻</span>
            </button>
            <!-- 重复尾迹 -->
            <template v-for="ev in timedSpawns" :key="'r' + ev.objectId">
              <span
                v-for="k in ev.repeatSec > 0 ? 3 : 0"
                :key="k"
                class="echo"
                :style="{ left: leftPct(ev.atSec + ev.repeatSec * k) + '%' }"
              />
            </template>
          </div>
        </div>
        <div class="zoom">
          <label>缩放</label>
          <input v-model.number="pxPerSec" type="range" min="0.3" max="4" step="0.1" />
        </div>
      </div>

      <div class="meta-row">
        <span>波次 {{ info.waves.length }}</span>
        <span>定时刷兵 {{ timedSpawns.length }}</span>
        <span>联动刷兵 {{ linkedSpawns.length }}</span>
        <span>进攻点 {{ info.attackPoints.length }}</span>
        <span>survival AI {{ info.survivalTeams.length }}</span>
        <span v-if="info.classic" class="warn">经典波次 classic 开启</span>
      </div>

      <!-- 原文模式 -->
      <div v-if="showRaw" class="raw-box">
        <label>map_info.survivalWaves（每行一波，对照 g.java）</label>
        <textarea v-model="rawDraft" rows="8" spellcheck="false" />
        <div class="row-actions">
          <button type="button" class="primary" @click="applyRaw">写入原文</button>
          <button type="button" @click="seedDefaultWaves">填入默认样例</button>
        </div>
      </div>

      <template v-else>
        <div class="tabs">
          <button type="button" :class="{ active: editTab === 'waves' }" @click="editTab = 'waves'">
            波次公告 (survivalWaves)
          </button>
          <button type="button" :class="{ active: editTab === 'spawns' }" @click="editTab = 'spawns'">
            定时刷兵 (unitAdd)
          </button>
          <button type="button" :class="{ active: editTab === 'linked' }" @click="editTab = 'linked'">
            联动刷兵
          </button>
        </div>

        <!-- 波次编辑 -->
        <div v-if="editTab === 'waves'" class="editor-grid">
          <div class="list scroll">
            <button
              v-for="(w, i) in info.waves"
              :key="i"
              type="button"
              class="list-item"
              :class="{ active: selectedWaveIndex === i, err: !!w.error }"
              @click="selectWave(i)"
            >
              <code>{{ formatClock(w.absoluteSec) }}</code>
              <span class="t">{{ w.label || (w.error ? '解析错误' : `波次 ${i + 1}`) }}</span>
              <span class="u">{{ w.units.map((x) => x.count + ' ' + x.unit).join(', ') || '—' }}</span>
            </button>
            <div v-if="!info.waves.length" class="empty-hint">
              尚无波次。
              <button type="button" class="link" @click="seedDefaultWaves">填入默认样例</button>
            </div>
          </div>

          <div class="form scroll">
            <div class="form-inline">
              <div class="form-row">
                <label>相对间隔（相对上一波）</label>
                <input v-model="draftRelative" placeholder="60 或 1:30" />
                <span class="hint">+M:SS；空=选项行(!)</span>
              </div>
              <div class="form-row" style="flex: 2">
                <label>波次说明</label>
                <input v-model="draftLabel" placeholder="第一波来袭" />
              </div>
            </div>

            <div class="form-row">
              <label>波次选项</label>
              <div class="opt-row">
                <label v-for="opt in WAVE_OPTIONS" :key="opt" class="check">
                  <input
                    type="checkbox"
                    :checked="draftOptions.includes(opt)"
                    @change="toggleOption(opt)"
                  />
                  {{ opt }}
                </label>
              </div>
            </div>

            <div class="form-row">
              <label>波次单位（游戏格式：数量 单位名）</label>
              <UnitPicker v-model="draftUnits" mode="wave" />
            </div>

            <div class="row-actions">
              <button type="button" class="primary" :disabled="selectedWaveIndex == null" @click="applyWaveEdit">
                保存波次
              </button>
              <button type="button" @click="addWave">新增波次</button>
              <button type="button" :disabled="selectedWaveIndex == null" @click="moveWave(-1)">上移</button>
              <button type="button" :disabled="selectedWaveIndex == null" @click="moveWave(1)">下移</button>
              <button type="button" class="danger" :disabled="selectedWaveIndex == null" @click="removeWave">
                删除
              </button>
            </div>
          </div>
        </div>

        <!-- 定时刷兵 -->
        <div v-else-if="editTab === 'spawns'" class="editor-grid">
          <div class="list scroll">
            <button
              v-for="ev in timedSpawns"
              :key="ev.objectId"
              type="button"
              class="list-item"
              :class="{ active: selectedSpawnId === ev.objectId }"
              @click="jumpToEvent(ev)"
            >
              <code>{{ formatClock(ev.atSec) }}</code>
              <span class="t">{{ ev.title }}</span>
              <span class="u">T{{ ev.team ?? '?' }} · {{ ev.unitsText }}</span>
            </button>
            <div v-if="!timedSpawns.length" class="empty-hint">
              无 delay/warmup 定时 unitAdd。可用右侧表单新建。
            </div>
          </div>

          <div class="form scroll">
            <div class="form-inline">
              <div class="form-row">
                <label>名称</label>
                <input v-model="draftSpawnName" placeholder="spawn_wave1" />
              </div>
              <div class="form-row">
                <label>队伍 team</label>
                <select v-model="draftTeam">
                  <option value="-1">-1 中立</option>
                  <option v-for="t in 10" :key="t - 1" :value="String(t - 1)">队伍 {{ t - 1 }}</option>
                </select>
              </div>
            </div>
            <div class="form-inline">
              <div class="form-row">
                <label>delay</label>
                <input v-model="draftDelay" placeholder="可选，如 30s" />
              </div>
              <div class="form-row">
                <label>warmup 首次延迟</label>
                <input v-model="draftWarmup" placeholder="60s" />
              </div>
              <div class="form-row">
                <label>repeatDelay 重复</label>
                <input v-model="draftRepeat" placeholder="如 120s" />
              </div>
            </div>

            <div class="form-row">
              <label>生成单位 spawnUnits（可点选内置单位）</label>
              <UnitPicker v-model="draftSpawnUnits" mode="spawn" />
            </div>

            <div class="row-actions">
              <button type="button" class="primary" :disabled="selectedSpawnId == null" @click="applySpawnEdit">
                保存刷兵
              </button>
              <button type="button" @click="addTimedSpawn">新建 unitAdd</button>
              <button type="button" class="danger" :disabled="selectedSpawnId == null" @click="removeSpawn">
                删除
              </button>
            </div>
            <p class="hint">
              时间对照 a.java：无条件时 warmup 即开局后首次刷兵；repeatDelay 为重复间隔。
              保存后清掉 activatedBy，保证落在定时轨。
            </p>
          </div>
        </div>

        <!-- 联动 -->
        <div v-else class="editor-grid single">
          <div class="list scroll full">
            <button
              v-for="ev in linkedSpawns"
              :key="ev.objectId"
              type="button"
              class="list-item"
              :class="{ active: selectedSpawnId === ev.objectId }"
              @click="jumpToEvent(ev)"
            >
              <code>by:{{ ev.activatedBy }}</code>
              <span class="t">{{ ev.title }}</span>
              <span class="u">T{{ ev.team ?? '?' }} · {{ ev.unitsText }}</span>
            </button>
            <div v-if="!linkedSpawns.length" class="empty-hint">
              无 activatedBy 联动刷兵（如被其它触发器点名激活的 unitAdd）
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.survival-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  height: 100%;
  background: var(--panel);
  padding-bottom: 4px;
  overflow: hidden;
}
.title-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  text-transform: none;
  font-weight: 600;
}
.badge.ok {
  background: #1e4a35;
  color: #8dffc0;
}
.badge.dim {
  background: var(--bg3);
  color: var(--text-dim);
}
.warn {
  color: var(--warn);
}
.empty {
  padding: 12px;
  color: var(--text-dim);
}
.ruler-wrap {
  display: flex;
  gap: 8px;
  align-items: stretch;
  padding: 0 10px;
}
.ruler {
  flex: 1;
  overflow-x: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px 8px;
  position: relative;
}
.ruler-track {
  position: relative;
  height: 16px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}
.tick {
  position: absolute;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--text-dim);
  top: 0;
}
.lane {
  position: relative;
  height: 28px;
  margin-top: 2px;
}
.lane-label {
  position: absolute;
  left: 0;
  top: 6px;
  font-size: 10px;
  color: var(--text-dim);
  z-index: 1;
  background: var(--bg);
  padding-right: 4px;
}
.marker {
  position: absolute;
  top: 2px;
  transform: translateX(-50%);
  background: transparent;
  border: none;
  padding: 0;
  min-width: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.marker .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: var(--bg3);
}
.marker.wave .dot {
  border-color: #6aa8ff;
  background: #2b5f99;
}
.marker.spawn .dot {
  border-color: #f0a050;
  background: #8a5020;
}
.marker.active .dot {
  box-shadow: 0 0 0 2px var(--accent);
}
.marker.err .dot {
  border-color: var(--danger);
  background: #6b2b2b;
}
.marker .cap {
  font-size: 9px;
  color: var(--text-dim);
}
.marker .rep {
  font-size: 9px;
  color: var(--warn);
}
.echo {
  position: absolute;
  top: 10px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8a502066;
  transform: translateX(-50%);
  pointer-events: none;
}
.zoom {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  width: 90px;
  flex-shrink: 0;
}
.zoom input {
  width: 100%;
}
.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 12px;
  font-size: 11px;
  color: var(--text-dim);
}
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  padding: 0 8px;
}
.tabs button {
  border: none;
  border-radius: 0;
  background: transparent;
  border-bottom: 2px solid transparent;
  padding: 6px 10px;
}
.tabs button.active {
  border-bottom-color: var(--accent);
  color: #fff;
}
.editor-grid {
  display: grid;
  grid-template-columns: minmax(180px, 32%) 1fr;
  gap: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.editor-grid.single {
  grid-template-columns: 1fr;
}
.list {
  border-right: 1px solid var(--border);
  min-height: 140px;
  max-height: 280px;
}
.list.full {
  border-right: none;
  max-height: 280px;
}
.list-item {
  display: grid;
  grid-template-columns: 48px 1fr;
  grid-template-rows: auto auto;
  gap: 0 8px;
  width: 100%;
  text-align: left;
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  padding: 6px 8px;
}
.list-item code {
  grid-row: 1 / 3;
  align-self: center;
  color: var(--accent);
  font-size: 11px;
}
.list-item .t {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.list-item .u {
  font-size: 10px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.list-item.active {
  background: var(--bg3);
  border-left: 2px solid var(--accent);
}
.list-item.err {
  color: #ffb0b0;
}
.form {
  padding: 8px 10px;
  min-height: 140px;
  max-height: 280px;
}
.form-inline {
  display: flex;
  gap: 8px;
}
.form-inline .form-row {
  flex: 1;
}
.opt-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text);
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.hint {
  font-size: 11px;
  color: var(--text-dim);
  margin: 6px 0 0;
}
.empty-hint {
  padding: 10px;
  font-size: 12px;
  color: var(--text-dim);
}
button.link {
  background: none;
  border: none;
  color: var(--accent);
  padding: 0;
  text-decoration: underline;
}
.raw-box {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
}
.raw-box textarea {
  flex: 1;
  min-height: 120px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
}
</style>
