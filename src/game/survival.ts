/**
 * 生存模式（survival）波次与刷兵时间轴。
 * 对照游戏源码：
 *  - MissionEngine.java：type=survival / survivalWaves / survivalWavesClassic / attack_point
 *  - g.java：波次行解析（+时间 描述 [选项] - 单位列表）
 *  - a.java：delay / warmup / repeatDelay（毫秒；支持 "5s" / "500ms"）
 *
 * survivalWaves 每行格式（g.java Pattern）：
 *   +MM:SS 描述 [lockSpawn,noTimer] - 3 tank, 2 heavyTank
 *   +20 描述
 *   ![lockSpawn]   （仅选项，不推进时间）
 *
 * 波次单位写法：`count name`（空格分隔）
 * unitAdd.spawnUnits 写法：`name*count`（与波次不同，勿混用）
 */

import type { TmxMap, TmxObject, TmxObjectGroup } from '@/tmx/types'
import { isObjectGroup } from '@/tmx/types'

/** 游戏支持的波次选项（g.java）；paused/win 被识别但不抛错 */
export const WAVE_OPTIONS = ['lockSpawn', 'unlockSpawn', 'noTimer', 'paused', 'win'] as const
export type WaveOption = (typeof WAVE_OPTIONS)[number]

export interface WaveUnit {
  count: number
  unit: string
}

export interface SurvivalWave {
  /** 相对上一波的间隔（秒）；! 行无时间 */
  relativeSec: number | null
  /** 开局累计绝对时间（秒）；! 行继承上一累计 */
  absoluteSec: number
  /** 波次说明文字（UI 展示） */
  label: string
  options: WaveOption[]
  units: WaveUnit[]
  /** 原始行（解析失败时保留） */
  raw: string
  /** 解析错误信息 */
  error?: string
}

export type TimelineKind = 'wave' | 'spawn' | 'linked'

/** 时间轴上的一个可可视化事件 */
export interface TimelineEvent {
  kind: TimelineKind
  /** 首次触发绝对秒（linked 用 0 并标 activatedBy） */
  atSec: number
  /** 重复间隔秒；0 表示不重复 */
  repeatSec: number
  /** 展示标题 */
  title: string
  /** 单位摘要 */
  unitsText: string
  team?: string
  /** 关联对象（unitAdd） */
  objectId?: number
  layerIndex?: number
  /** 波次索引（0-based） */
  waveIndex?: number
  /** 被这些 id 激活（非定时刷兵） */
  activatedBy?: string
  /** 坐标（像素），便于跳转画布 */
  x?: number
  y?: number
}

export interface SurvivalMapInfo {
  isSurvival: boolean
  classic: boolean
  wavesText: string
  waves: SurvivalWave[]
  mapInfo?: TmxObject
  triggersIndex: number
  attackPoints: TmxObject[]
  survivalTeams: TmxObject[]
}

/** 解析 delay/warmup 等时间字段 → 毫秒（对照 a.java#b） */
export function parseTimeMs(raw: string | undefined | null, fallback = 0): number {
  if (raw == null || raw === '') return fallback
  const s = String(raw).trim()
  if (!s) return fallback
  let mult = 1
  let num = s
  if (s.endsWith('ms')) {
    num = s.slice(0, -2)
    mult = 1
  } else if (s.endsWith('s')) {
    num = s.slice(0, -1)
    mult = 1000
  }
  const v = Number(num)
  if (!Number.isFinite(v)) return fallback
  return Math.round(v * mult)
}

export function formatTimeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  if (ms % 1000 === 0) return `${ms / 1000}s`
  return `${ms}ms`
}

/** 秒 → "M:SS" 展示 */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/** 秒 → 波次相对时间串 "M:SS" 或纯秒 */
export function formatRelativeTime(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return String(s)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/** 解析 "M:SS" / "SS" → 秒（g.java 时间段） */
export function parseWaveTime(token: string): number {
  const t = token.trim()
  if (!t) return 0
  const parts = t.split(':')
  if (parts.length === 1) {
    const sec = parseInt(parts[0], 10)
    if (Number.isNaN(sec)) throw new Error(`未知时间格式: ${token}`)
    return sec
  }
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10)
    const sec = parseInt(parts[1], 10)
    if (Number.isNaN(min) || Number.isNaN(sec)) throw new Error(`未知时间格式: ${token}`)
    return min * 60 + sec
  }
  throw new Error(`未知时间格式: ${token}`)
}

const WAVE_LINE_RE = /^\+([^ ]*)([^[\-]*)(?:\[(.*?)\])?\s*(-.*)?$/
const BANG_LINE_RE = /^!(.*)$/

function parseOptions(raw: string | undefined): WaveOption[] {
  if (!raw) return []
  const out: WaveOption[] = []
  for (const part of raw.split(',')) {
    const key = part.split(':')[0].trim()
    if (!key) continue
    const hit = WAVE_OPTIONS.find((o) => o.toLowerCase() === key.toLowerCase())
    if (hit) out.push(hit)
    else throw new Error(`未知波次选项 '${key}'`)
  }
  return out
}

/** 解析 `- 3 tank, 2 heavyTank` */
export function parseWaveUnits(unitsPart: string | undefined): WaveUnit[] {
  if (!unitsPart) return []
  let s = unitsPart.trim()
  if (s.startsWith('-')) s = s.slice(1).trim()
  if (!s) return []
  const units: WaveUnit[] = []
  for (const piece of s.split(',')) {
    const item = piece.trim()
    if (!item) continue
    if (!item.includes(' ')) {
      throw new Error(`波次单位格式应为 "数量 单位名"，收到: ${item}`)
    }
    const sp = item.indexOf(' ')
    const count = parseInt(item.slice(0, sp).trim(), 10)
    const unit = item.slice(sp + 1).trim()
    if (Number.isNaN(count) || !unit) {
      throw new Error(`波次单位格式错误: ${item}`)
    }
    units.push({ count, unit })
  }
  return units
}

export function formatWaveUnits(units: WaveUnit[]): string {
  if (!units.length) return ''
  return units.map((u) => `${u.count} ${u.unit}`).join(', ')
}

/**
 * 解析整段 survivalWaves 文本。
 * 相对时间累加为绝对秒（MissionEngine.g）。
 */
export function parseSurvivalWaves(text: string | undefined | null): SurvivalWave[] {
  if (!text) return []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const waves: SurvivalWave[] = []
  let abs = 0

  for (const rawLine of lines) {
    const raw = rawLine.trim()
    if (!raw) continue

    try {
      if (raw.startsWith('+')) {
        const m = WAVE_LINE_RE.exec(raw)
        if (!m) throw new Error(`无法解析波次行: ${raw}`)
        const relativeSec = parseWaveTime(m[1])
        abs += relativeSec
        const label = (m[2] ?? '').trim()
        const options = parseOptions(m[3])
        const units = parseWaveUnits(m[4])
        waves.push({ relativeSec, absoluteSec: abs, label, options, units, raw })
      } else if (raw.startsWith('!')) {
        const m = BANG_LINE_RE.exec(raw)
        if (!m) throw new Error(`无法解析波次行: ${raw}`)
        // g.java：! 后整段按逗号拆选项；实图常见 ![unlockSpawn] 与 !unlockSpawn
        let optRaw = (m[1] ?? '').trim()
        const bracket = /^\[(.*)\]$/.exec(optRaw)
        if (bracket) optRaw = bracket[1]
        const options = parseOptions(optRaw)
        waves.push({
          relativeSec: null,
          absoluteSec: abs,
          label: '',
          options,
          units: [],
          raw,
        })
      } else {
        throw new Error(`未知波次格式（须以 + 或 ! 开头）: ${raw}`)
      }
    } catch (e) {
      waves.push({
        relativeSec: null,
        absoluteSec: abs,
        label: '',
        options: [],
        units: [],
        raw,
        error: String((e as Error).message ?? e),
      })
    }
  }
  return waves
}

/** 将波次数组写回 survivalWaves 文本（游戏可读） */
export function serializeSurvivalWaves(waves: SurvivalWave[]): string {
  return waves
    .map((w) => {
      if (w.error && w.raw) return w.raw
      if (w.relativeSec == null) {
        const opt = w.options.length ? w.options.join(',') : ''
        return opt ? `![${opt}]` : '!'
      }
      const time = formatRelativeTime(w.relativeSec)
      const label = w.label ? ` ${w.label}` : ''
      const opt = w.options.length ? ` [${w.options.join(',')}]` : ''
      const units = w.units.length ? ` - ${formatWaveUnits(w.units)}` : ''
      return `+${time}${label}${opt}${units}`
    })
    .join('\n')
}

/** spawnUnits: `tank*3, heavyTank` → 展示串 */
export function formatSpawnUnitsBrief(spawnUnits: string | undefined): string {
  if (!spawnUnits) return ''
  return spawnUnits
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      // name*count(opts)
      const m = /^([^(]+?)(?:\*(\d+))?(?:\((.*)\))?$/.exec(p)
      if (!m) return p
      const name = m[1].trim()
      const count = m[2] ? Number(m[2]) : 1
      return count > 1 ? `${name}×${count}` : name
    })
    .join(', ')
}

function findTriggers(map: TmxMap): { group: TmxObjectGroup; index: number } | null {
  for (let i = 0; i < map.layers.length; i++) {
    const l = map.layers[i]
    if (isObjectGroup(l) && l.name.toLowerCase() === 'triggers') {
      return { group: l, index: i }
    }
  }
  // 回退：任意含 map_info 的对象组
  for (let i = 0; i < map.layers.length; i++) {
    const l = map.layers[i]
    if (isObjectGroup(l) && l.objects.some((o) => o.name === 'map_info')) {
      return { group: l, index: i }
    }
  }
  return null
}

export function getSurvivalMapInfo(map: TmxMap | null): SurvivalMapInfo {
  const empty: SurvivalMapInfo = {
    isSurvival: false,
    classic: false,
    wavesText: '',
    waves: [],
    triggersIndex: -1,
    attackPoints: [],
    survivalTeams: [],
  }
  if (!map) return empty
  const tr = findTriggers(map)
  if (!tr) return empty
  const mapInfo = tr.group.objects.find((o) => o.name === 'map_info')
  const type = (mapInfo?.properties['type'] ?? '').toLowerCase()
  const isSurvival = type === 'survival'
  const classic = (mapInfo?.properties['survivalWavesClassic'] ?? '').toLowerCase() === 'true'
  const wavesText = mapInfo?.properties['survivalWaves'] ?? ''
  const waves = parseSurvivalWaves(wavesText)
  const attackPoints = tr.group.objects.filter((o) => o.name.toLowerCase() === 'attack_point')
  const survivalTeams = tr.group.objects.filter(
    (o) => o.type === 'team_info' && (o.properties['ai'] ?? '').toLowerCase() === 'survival',
  )
  return {
    isSurvival,
    classic,
    wavesText,
    waves,
    mapInfo,
    triggersIndex: tr.index,
    attackPoints,
    survivalTeams,
  }
}

/**
 * unitAdd 首次触发时间（秒）。
 * 对照 a.java#d：delay 到达后条件成立，再等 warmup；
 * 无 delay/无条件时 z2 为真，仅 warmup 生效。
 */
export function unitAddFirstAtSec(props: Record<string, string>): number | null {
  if (props['activatedBy'] || props['whenActivatedIds']) {
    // 事件链激活，不是纯时间轴
    return null
  }
  const delayMs = parseTimeMs(props['delay'], 0)
  const warmupMs = parseTimeMs(props['warmup'], 0)
  // delay 未写时 a.java 默认 -1，表示不按 delay 门控；此时仅 warmup
  const hasDelay = props['delay'] != null && String(props['delay']).trim() !== ''
  if (hasDelay) return (delayMs + warmupMs) / 1000
  return warmupMs / 1000
}

/** 收集时间轴事件（波次 + unitAdd 定时刷兵 + 联动刷兵摘要） */
export function collectTimelineEvents(map: TmxMap | null): TimelineEvent[] {
  if (!map) return []
  const info = getSurvivalMapInfo(map)
  const events: TimelineEvent[] = []

  info.waves.forEach((w, i) => {
    if (w.error) {
      events.push({
        kind: 'wave',
        atSec: w.absoluteSec,
        repeatSec: 0,
        title: `波次 ${i + 1} 解析错误`,
        unitsText: w.error,
        waveIndex: i,
      })
      return
    }
    events.push({
      kind: 'wave',
      atSec: w.absoluteSec,
      repeatSec: 0,
      title: w.label || `波次 ${i + 1}`,
      unitsText: formatWaveUnits(w.units) || (w.options.length ? `[${w.options.join(',')}]` : '（仅公告/计时）'),
      waveIndex: i,
    })
  })

  for (let li = 0; li < map.layers.length; li++) {
    const layer = map.layers[li]
    if (!isObjectGroup(layer)) continue
    for (const o of layer.objects) {
      if (o.type !== 'unitAdd') continue
      const unitsText = formatSpawnUnitsBrief(o.properties['spawnUnits'])
      const team = o.properties['team']
      const activatedBy = o.properties['activatedBy'] || o.properties['whenActivatedIds']
      const first = unitAddFirstAtSec(o.properties)
      const repeatMs = parseTimeMs(o.properties['repeatDelay'], 0)
      const title = o.name || `unitAdd #${o.id}`

      if (first == null) {
        events.push({
          kind: 'linked',
          atSec: 0,
          repeatSec: repeatMs / 1000,
          title,
          unitsText: unitsText || '（无 spawnUnits）',
          team,
          objectId: o.id,
          layerIndex: li,
          activatedBy,
          x: o.x,
          y: o.y,
        })
      } else {
        events.push({
          kind: 'spawn',
          atSec: first,
          repeatSec: repeatMs / 1000,
          title,
          unitsText: unitsText || '（无 spawnUnits）',
          team,
          objectId: o.id,
          layerIndex: li,
          x: o.x,
          y: o.y,
        })
      }
    }
  }

  events.sort((a, b) => {
    if (a.kind === 'linked' && b.kind !== 'linked') return 1
    if (b.kind === 'linked' && a.kind !== 'linked') return -1
    if (a.atSec !== b.atSec) return a.atSec - b.atSec
    return (a.objectId ?? 0) - (b.objectId ?? 0)
  })
  return events
}

/** 时间轴总时长（用于标尺）；至少覆盖最后事件 + 一点边距 */
export function timelineDurationSec(events: TimelineEvent[], waves: SurvivalWave[]): number {
  let max = 0
  for (const w of waves) max = Math.max(max, w.absoluteSec)
  for (const e of events) {
    if (e.kind === 'linked') continue
    max = Math.max(max, e.atSec)
    // 展示最多 3 次重复的尾迹
    if (e.repeatSec > 0) max = Math.max(max, e.atSec + e.repeatSec * 3)
  }
  if (max <= 0) return 120
  return Math.ceil(max * 1.1 + 30)
}

/** 新建生存图默认波次文本 */
export function defaultSurvivalWavesText(): string {
  return [
    '+0:30 准备阶段',
    '+1:30 第一波 - 4 tank, 2 scout',
    '+2:00 第二波 - 3 heavyTank, 2 helicopter',
    '+2:00 第三波 - 2 megaTank, 1 gunShip',
    '+0:30 防守成功',
  ].join('\n')
}
