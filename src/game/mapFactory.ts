/**
 * 新建地图工厂。
 * 游戏硬性要求（TiledMap.a(InputStream,boolean)）：
 *  - 必须有名为 Ground 的图层（每格都要有地块）
 *  - 必须有名为 Items 的图层
 *  - 建议有 Triggers 对象组 + map_info 对象
 *  - 建议有 UnitObjects 对象组（摆放单位；游戏导出亦用此名）
 */
import type { TmxLayer, TmxMap, TmxObjectGroup, TmxTileset } from '@/tmx/types'
import { resolveTsx } from './builtin'

export interface NewMapOptions {
  width: number
  height: number
  /** 地面填充用的内置 .tsx（如 terrain/Long Grass.tsx） */
  groundTsx?: string
  mapType?: string
}

function makeLayer(name: string, width: number, height: number): TmxLayer {
  return {
    kind: 'tile',
    name,
    width,
    height,
    visible: true,
    opacity: 1,
    properties: {},
    data: new Uint32Array(width * height),
    extraAttrs: {},
  }
}

export function createNewMap(opts: NewMapOptions): TmxMap {
  const { width, height } = opts
  const map: TmxMap = {
    version: '1.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width,
    height,
    tilewidth: 20,
    tileheight: 20,
    nextobjectid: 1,
    properties: {},
    tilesets: [],
    layers: [],
    extraAttrs: {},
  }

  // 地面地块集
  const groundSrc = opts.groundTsx ?? 'terrain/Long Grass.tsx'
  const resolved = resolveTsx(groundSrc)
  let fillGid = 0
  if (resolved) {
    const ts: TmxTileset = { ...resolved, firstgid: 1, source: groundSrc }
    map.tilesets.push(ts)
    fillGid = 1
  }

  const ground = makeLayer('Ground', width, height)
  if (fillGid) ground.data.fill(fillGid)
  const items = makeLayer('Items', width, height)
  map.layers.push(ground, items)

  const triggers: TmxObjectGroup = {
    kind: 'objectgroup',
    name: 'Triggers',
    visible: true,
    opacity: 1,
    properties: {},
    objects: [
      {
        id: 1,
        name: 'map_info',
        type: '',
        x: 20,
        y: 20,
        width: 60,
        height: 40,
        rotation: 0,
        visible: true,
        properties: { type: opts.mapType ?? 'skirmish' },
        extraAttrs: {},
      },
    ],
    extraAttrs: {},
  }
  const unitObjects: TmxObjectGroup = {
    kind: 'objectgroup',
    name: 'UnitObjects',
    visible: true,
    opacity: 1,
    properties: {},
    objects: [],
    extraAttrs: {},
  }
  map.layers.push(triggers, unitObjects)
  map.nextobjectid = 2
  return map
}
