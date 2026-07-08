/**
 * 地图校验 —— 对照游戏 TiledMap / MissionEngine 硬性要求，输出可定位的问题列表。
 */
import type { TmxMap } from '@/tmx/types'
import { isObjectGroup, isTileLayer } from '@/tmx/types'
import { MISSION_TRIGGER_TYPES } from '@/game/triggers'

export type ValidationSeverity = 'error' | 'warn' | 'info'

export interface ValidationIssue {
  id: string
  severity: ValidationSeverity
  message: string
  /** 可选：跳转到图层索引 */
  layerIndex?: number
  /** 可选：跳转到对象 id */
  objectId?: number
  /** 可选：跳转到格子 */
  tileX?: number
  tileY?: number
}

export function validateMap(map: TmxMap | null): ValidationIssue[] {
  if (!map) return []
  const issues: ValidationIssue[] = []

  const tileLayers = map.layers
    .map((l, index) => ({ l, index }))
    .filter((e) => isTileLayer(e.l))
  const objectGroups = map.layers
    .map((l, index) => ({ l, index }))
    .filter((e) => isObjectGroup(e.l))

  const ground = tileLayers.find((e) => e.l.name.toLowerCase() === 'ground')
  if (!ground) {
    issues.push({
      id: 'missing-ground',
      severity: 'error',
      message: '缺少 Ground 图层（游戏必需，且每格必须有地块）',
    })
  } else if (isTileLayer(ground.l)) {
    let firstEmpty: { x: number; y: number } | null = null
    let empty = 0
    const w = ground.l.width
    for (let i = 0; i < ground.l.data.length; i++) {
      if (ground.l.data[i] === 0) {
        empty++
        if (!firstEmpty) firstEmpty = { x: i % w, y: Math.floor(i / w) }
      }
    }
    if (empty > 0) {
      issues.push({
        id: 'ground-empty',
        severity: 'error',
        message: `Ground 层有 ${empty} 个空格（游戏要求地面每格必须有地块）`,
        layerIndex: ground.index,
        tileX: firstEmpty?.x,
        tileY: firstEmpty?.y,
      })
    }
  }

  const items = tileLayers.find((e) => {
    const n = e.l.name.toLowerCase()
    return n === 'items' || n === 'objects'
  })
  if (!items) {
    issues.push({
      id: 'missing-items',
      severity: 'error',
      message: '缺少 Items 图层（游戏必需）',
    })
  }

  const triggers = objectGroups.find((e) => e.l.name.toLowerCase() === 'triggers')
  if (!triggers) {
    issues.push({
      id: 'missing-triggers',
      severity: 'warn',
      message: '建议添加名为 Triggers 的对象组（触发器应放在此层）',
    })
  } else if (isObjectGroup(triggers.l)) {
    const mapInfo = triggers.l.objects.find((o) => o.name === 'map_info')
    if (!mapInfo) {
      issues.push({
        id: 'missing-map-info',
        severity: 'warn',
        message: 'Triggers 组中缺少 map_info 对象（地图类型/胜利条件）',
        layerIndex: triggers.index,
      })
    } else {
      const t = mapInfo.properties['type']
      if (!t) {
        issues.push({
          id: 'map-info-no-type',
          severity: 'warn',
          message: 'map_info 缺少 type 属性（skirmish/mission/survival/challenge）',
          layerIndex: triggers.index,
          objectId: mapInfo.id,
        })
      }
      if (t && t.toLowerCase() !== 'skirmish' && !mapInfo.properties['winCondition']) {
        issues.push({
          id: 'map-info-no-win',
          severity: 'warn',
          message: '非 skirmish 地图建议设置 winCondition',
          layerIndex: triggers.index,
          objectId: mapInfo.id,
        })
      }
    }

    // 触发器放错层的提示：其他对象组里的 mission 触发器
    for (const og of objectGroups) {
      if (og.index === triggers.index || !isObjectGroup(og.l)) continue
      for (const o of og.l.objects) {
        if (MISSION_TRIGGER_TYPES.has(o.type)) {
          issues.push({
            id: `trigger-wrong-layer-${o.id}`,
            severity: 'warn',
            message: `触发器「${o.name || o.type || '#' + o.id}」不在 Triggers 层（游戏会告警）`,
            layerIndex: og.index,
            objectId: o.id,
          })
        }
      }
    }

    // unitAdd 缺 team / spawnUnits
    for (const o of triggers.l.objects) {
      if (o.type === 'unitAdd') {
        if (!o.properties['team']) {
          issues.push({
            id: `unitadd-no-team-${o.id}`,
            severity: 'error',
            message: `unitAdd「${o.name || '#' + o.id}」缺少 team`,
            layerIndex: triggers.index,
            objectId: o.id,
          })
        }
        if (!o.properties['spawnUnits']) {
          issues.push({
            id: `unitadd-no-spawn-${o.id}`,
            severity: 'error',
            message: `unitAdd「${o.name || '#' + o.id}」缺少 spawnUnits`,
            layerIndex: triggers.index,
            objectId: o.id,
          })
        }
      }
      if (o.type === 'move' && !o.properties['target']) {
        issues.push({
          id: `move-no-target-${o.id}`,
          severity: 'error',
          message: `move「${o.name || '#' + o.id}」缺少 target（point 名称）`,
          layerIndex: triggers.index,
          objectId: o.id,
        })
      }
    }
  }

  // 缺失图片的地块集
  map.tilesets.forEach((ts, i) => {
    if (ts.missing) {
      issues.push({
        id: `tileset-missing-${i}`,
        severity: 'warn',
        message: `地块集「${ts.name || ts.image || '#' + i}」图片缺失（可补充 PNG 内嵌）`,
      })
    }
  })

  return issues
}
