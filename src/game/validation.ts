/**
 * 地图校验 —— 对照游戏 TiledMap / MissionEngine 硬性要求，输出可定位的问题列表。
 */
import { analyzeEmbeddedTilesetUsage, isEmbeddedCustomTileset } from '@/tmx/optimize'
import type { TmxMap, TmxTileset } from '@/tmx/types'
import { isObjectGroup, isTileLayer, rawGid } from '@/tmx/types'
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

  const tileRanges = map.tilesets.map((ts, i) => ({
    ts,
    index: i,
    nextFirstgid: nextTilesetFirstgid(map, i),
  }))

  for (const { ts, index } of tileRanges) {
    const previous = map.tilesets[index - 1]
    if (previous && ts.firstgid <= previous.firstgid) {
      issues.push({
        id: `tileset-firstgid-order-${index}`,
        severity: 'error',
        message: `地块集「${ts.name || ts.image || '#' + index}」的 firstgid=${ts.firstgid} 未严格递增；游戏会按 XML 顺序计算错误的 gid 范围`,
      })
    }
    if (ts.margin) {
      issues.push({
        id: `tileset-margin-${index}`,
        severity: 'warn',
        message: `地块集「${ts.name || ts.image || '#' + index}」设置了 margin=${ts.margin}；游戏源码只读取 spacing，可能与编辑器预览不一致`,
      })
    }
  }

  for (const { l, index } of tileLayers) {
    if (!isTileLayer(l)) continue
    for (let i = 0; i < l.data.length; i++) {
      const gid = rawGid(l.data[i])
      if (gid === 0) continue
      if (!validTileGid(tileRanges, gid)) {
        issues.push({
          id: `invalid-tile-gid-${i % l.width}-${Math.floor(i / l.width)}`,
          severity: 'error',
          message: `图层「${l.name}」引用了不存在的 gid=${gid}`,
          layerIndex: index,
          tileX: i % l.width,
          tileY: Math.floor(i / l.width),
        })
        break
      }
    }
  }

  const triggers = objectGroups.find((e) => e.l.name.toLowerCase() === 'triggers')
  const unitObjects = objectGroups.find(
    (e) => e.l.name.toLowerCase() === 'unitobjects' || e.l.name.toLowerCase() === 'units',
  )
  if (!unitObjects) {
    issues.push({
      id: 'missing-unitobjects',
      severity: 'info',
      message: '建议添加名为 UnitObjects 的对象组（游戏导出单位所用名称；摆单位会自动创建）',
    })
  }
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

  for (const og of objectGroups) {
    if (!isObjectGroup(og.l)) continue
    const isUnitGroup = og.l.name.toLowerCase() === 'unitobjects' || og.l.name.toLowerCase() === 'units'
    for (const o of og.l.objects) {
      if (o.gid !== undefined && !validTileGid(tileRanges, rawGid(o.gid))) {
        issues.push({
          id: `invalid-object-gid-${o.id}`,
          severity: 'error',
          message: `对象「${o.name || '#' + o.id}」引用了不存在的 gid=${rawGid(o.gid)}`,
          layerIndex: og.index,
          objectId: o.id,
        })
      }
      const looksLikeUnit = isUnitGroup || o.type === 'unit' || Boolean(o.properties.unit || o.properties.customUnit)
      if (!looksLikeUnit) continue
      if (!o.properties.team) {
        issues.push({
          id: `unit-object-no-team-${o.id}`,
          severity: 'error',
          message: `单位对象「${o.name || '#' + o.id}」缺少 team`,
          layerIndex: og.index,
          objectId: o.id,
        })
      }
      if (!o.properties.unit && !o.properties.customUnit) {
        issues.push({
          id: `unit-object-no-unit-${o.id}`,
          severity: 'error',
          message: `单位对象「${o.name || '#' + o.id}」缺少 unit 或 customUnit`,
          layerIndex: og.index,
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

  for (const plan of analyzeEmbeddedTilesetUsage(map)) {
    const ts = map.tilesets[plan.tilesetIndex]
    if (!isEmbeddedCustomTileset(ts)) continue
    if (plan.usedLocalIds.length > 0 && plan.unusedTileCount > 0) {
      issues.push({
        id: `custom-tileset-unused-${plan.tilesetIndex}`,
        severity: 'info',
        message: `自定义地块集「${ts.name || ts.image || '#' + plan.tilesetIndex}」有 ${plan.unusedTileCount} 个未使用图块；保存 TMX 时会自动裁剪优化`,
      })
    }
  }

  return issues
}

function nextTilesetFirstgid(map: TmxMap, index: number): number {
  const current = map.tilesets[index]
  const next = map.tilesets
    .filter((ts) => ts.firstgid > current.firstgid)
    .map((ts) => ts.firstgid)
  return next.length ? Math.min(...next) : Number.POSITIVE_INFINITY
}

function validTileGid(ranges: { ts: TmxTileset; nextFirstgid: number }[], gid: number): boolean {
  const range = ranges.find((r) => gid >= r.ts.firstgid && gid < r.nextFirstgid)
  if (!range) return false
  const local = gid - range.ts.firstgid
  if (range.ts.tilecount <= 0) return true
  return local >= 0 && local < range.ts.tilecount
}
