/**
 * TMX 解析（浏览器 DOMParser）。
 * 兼容游戏支持的编码：base64 + (无压缩|gzip|zlib)，另兼容 Tiled 的 csv。
 */
import { inflate, ungzip } from 'pako'
import { base64ToBytes } from './base64'
import type {
  TmxLayer,
  TmxMap,
  TmxObject,
  TmxObjectGroup,
  TmxProperties,
  TmxTileset,
} from './types'

function attr(el: Element, name: string, def = ''): string {
  return el.getAttribute(name) ?? def
}
function numAttr(el: Element, name: string, def = 0): number {
  const v = el.getAttribute(name)
  if (v === null || v === '') return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

/** 收集元素上未被显式建模的属性，保证往返不丢失 */
function extraAttrs(el: Element, known: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of Array.from(el.attributes)) {
    if (!known.includes(a.name)) out[a.name] = a.value
  }
  return out
}

/** 解析 <properties>（游戏读取 value 属性；无 value 属性时读文本内容，如 embedded_png） */
export function parseProperties(parent: Element): TmxProperties {
  const props: TmxProperties = {}
  for (const child of Array.from(parent.children)) {
    if (child.tagName !== 'properties') continue
    for (const p of Array.from(child.children)) {
      if (p.tagName !== 'property') continue
      const name = p.getAttribute('name')
      if (name === null) continue
      let value = p.getAttribute('value')
      if (value === null) value = p.textContent ?? ''
      props[name] = value
    }
  }
  return props
}

function parseTilesetElement(el: Element, firstgid: number, source?: string): TmxTileset {
  const imageEl = el.getElementsByTagName('image').item(0)
  const ts: TmxTileset = {
    firstgid,
    name: attr(el, 'name'),
    source,
    tilewidth: numAttr(el, 'tilewidth', 20),
    tileheight: numAttr(el, 'tileheight', 20),
    spacing: numAttr(el, 'spacing', 0),
    margin: numAttr(el, 'margin', 0),
    tilecount: numAttr(el, 'tilecount', 0),
    columns: numAttr(el, 'columns', 0),
    image: imageEl ? basename(attr(imageEl, 'source').trim()) : '',
    imagewidth: imageEl ? numAttr(imageEl, 'width', 0) : 0,
    imageheight: imageEl ? numAttr(imageEl, 'height', 0) : 0,
    properties: parseProperties(el),
    tileProperties: {},
  }
  for (const tileEl of Array.from(el.children)) {
    if (tileEl.tagName !== 'tile') continue
    const id = numAttr(tileEl, 'id', -1)
    if (id < 0) continue
    const p = parseProperties(tileEl)
    if (Object.keys(p).length) ts.tileProperties[id] = p
  }
  return ts
}

/** 与游戏 GameEngine.k() 一致：剥掉目录只保留文件名 */
export function basename(p: string): string {
  const i = p.lastIndexOf('/')
  const j = p.lastIndexOf('\\')
  return p.substring(Math.max(i, j) + 1)
}

export function decodeLayerData(dataEl: Element, width: number, height: number): Uint32Array {
  const encoding = attr(dataEl, 'encoding')
  const compression = attr(dataEl, 'compression')
  const text = dataEl.textContent ?? ''
  const expected = width * height

  if (encoding === 'csv') {
    const nums = text.split(',').map((s) => Number(s.trim()) >>> 0)
    const arr = new Uint32Array(expected)
    for (let i = 0; i < expected && i < nums.length; i++) arr[i] = nums[i]
    return arr
  }

  if (encoding === 'base64') {
    let bytes = base64ToBytes(text)
    if (compression === 'gzip') bytes = ungzip(bytes)
    else if (compression === 'zlib') bytes = inflate(bytes)
    else if (compression && compression !== '') {
      throw new Error(`不支持的压缩格式: ${compression}（游戏仅支持 base64 + gzip/zlib/无压缩）`)
    }
    const arr = new Uint32Array(expected)
    const n = Math.min(expected, bytes.length >> 2)
    for (let i = 0; i < n; i++) {
      const o = i * 4
      arr[i] = (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0
    }
    return arr
  }

  // XML <tile gid="..."/> 子元素编码（老版 Tiled）
  const tiles = Array.from(dataEl.getElementsByTagName('tile'))
  if (tiles.length) {
    const arr = new Uint32Array(expected)
    for (let i = 0; i < Math.min(expected, tiles.length); i++) {
      arr[i] = numAttr(tiles[i], 'gid', 0) >>> 0
    }
    return arr
  }
  throw new Error(`不支持的图层编码: ${encoding || '(未指定)'}`)
}

function parseLayer(el: Element): TmxLayer {
  const width = numAttr(el, 'width')
  const height = numAttr(el, 'height')
  const dataEl = el.getElementsByTagName('data').item(0)
  if (!dataEl) throw new Error(`图层 ${attr(el, 'name')} 缺少 <data> 元素`)
  return {
    kind: 'tile',
    name: attr(el, 'name'),
    width,
    height,
    visible: attr(el, 'visible', '1') !== '0',
    opacity: numAttr(el, 'opacity', 1),
    properties: parseProperties(el),
    data: decodeLayerData(dataEl, width, height),
    extraAttrs: extraAttrs(el, ['name', 'width', 'height', 'visible', 'opacity']),
  }
}

function parseObject(el: Element): TmxObject {
  const obj: TmxObject = {
    id: numAttr(el, 'id', 0),
    name: attr(el, 'name'),
    type: attr(el, 'type') || attr(el, 'class'),
    x: numAttr(el, 'x', 0),
    y: numAttr(el, 'y', 0),
    width: numAttr(el, 'width', 0),
    height: numAttr(el, 'height', 0),
    rotation: numAttr(el, 'rotation', 0),
    visible: attr(el, 'visible', '1') !== '0',
    properties: parseProperties(el),
    extraAttrs: extraAttrs(el, [
      'id', 'name', 'type', 'class', 'x', 'y', 'width', 'height', 'rotation', 'visible', 'gid',
    ]),
  }
  const gid = el.getAttribute('gid')
  if (gid !== null) obj.gid = Number(gid) >>> 0
  if (el.getElementsByTagName('point').length) obj.point = true
  if (el.getElementsByTagName('ellipse').length) obj.ellipse = true
  return obj
}

function parseObjectGroup(el: Element): TmxObjectGroup {
  const group: TmxObjectGroup = {
    kind: 'objectgroup',
    name: attr(el, 'name'),
    visible: attr(el, 'visible', '1') !== '0',
    opacity: numAttr(el, 'opacity', 1),
    color: el.getAttribute('color') ?? undefined,
    properties: parseProperties(el),
    objects: [],
    extraAttrs: extraAttrs(el, ['name', 'visible', 'opacity', 'color']),
  }
  for (const child of Array.from(el.children)) {
    if (child.tagName === 'object') group.objects.push(parseObject(child))
  }
  return group
}

export interface ExternalTsxResolver {
  /** 根据 source 路径解析外部 .tsx，返回解析后的地块集定义（不含 firstgid） */
  (source: string): Omit<TmxTileset, 'firstgid' | 'source'> | null
}

/**
 * 解析 TMX 文本。
 * @param resolveTsx 解析 <tileset source="..."> 外部引用（通常来自内置清单）
 */
export function parseTmx(xmlText: string, resolveTsx?: ExternalTsxResolver): TmxMap {
  // 游戏导出的地图可能带非标准 XML 声明（如 version='1'），浏览器解析器会拒绝；
  // 声明对解析无用（文本已解码），直接剥掉 BOM 与 <?xml ...?> 前导。
  const cleaned = xmlText.replace(/^\uFEFF/, '').replace(/^\s*<\?xml[\s\S]*?\?>/, '')
  const doc = new DOMParser().parseFromString(cleaned, 'text/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error('XML 解析失败: ' + (err.textContent ?? '').slice(0, 300))
  const mapEl = doc.documentElement
  if (mapEl.tagName !== 'map') throw new Error('不是 TMX 地图文件（根元素应为 <map>）')

  const orientation = attr(mapEl, 'orientation')
  if (orientation !== 'orthogonal') {
    throw new Error(`游戏仅支持 orthogonal 地图, 当前: ${orientation}`)
  }

  const map: TmxMap = {
    version: attr(mapEl, 'version', '1.2'),
    tiledversion: mapEl.getAttribute('tiledversion') ?? undefined,
    orientation: 'orthogonal',
    renderorder: attr(mapEl, 'renderorder', 'right-down'),
    width: numAttr(mapEl, 'width'),
    height: numAttr(mapEl, 'height'),
    tilewidth: numAttr(mapEl, 'tilewidth', 20),
    tileheight: numAttr(mapEl, 'tileheight', 20),
    nextobjectid: numAttr(mapEl, 'nextobjectid', 1),
    properties: parseProperties(mapEl),
    tilesets: [],
    layers: [],
    extraAttrs: extraAttrs(mapEl, [
      'version', 'tiledversion', 'orientation', 'renderorder',
      'width', 'height', 'tilewidth', 'tileheight', 'nextobjectid',
    ]),
  }

  for (const child of Array.from(mapEl.children)) {
    switch (child.tagName) {
      case 'tileset': {
        const firstgid = numAttr(child, 'firstgid', 1)
        const source = child.getAttribute('source')
        if (source) {
          const resolved = resolveTsx?.(source)
          if (resolved) {
            map.tilesets.push({ ...resolved, firstgid, source })
          } else {
            // 未能解析的外部引用：保留引用本身，标记缺失
            map.tilesets.push({
              firstgid,
              source,
              name: basename(source).replace(/\.tsx$/i, ''),
              tilewidth: map.tilewidth,
              tileheight: map.tileheight,
              spacing: 0,
              margin: 0,
              tilecount: 0,
              columns: 0,
              image: '',
              imagewidth: 0,
              imageheight: 0,
              properties: {},
              tileProperties: {},
              missing: true,
            })
          }
        } else {
          map.tilesets.push(parseTilesetElement(child, firstgid))
        }
        break
      }
      case 'layer':
        map.layers.push(parseLayer(child))
        break
      case 'objectgroup':
        map.layers.push(parseObjectGroup(child))
        break
      default:
        break
    }
  }

  // 修正 nextobjectid
  let maxId = 0
  for (const item of map.layers) {
    if (item.kind === 'objectgroup') {
      for (const o of item.objects) maxId = Math.max(maxId, o.id)
    }
  }
  if (map.nextobjectid <= maxId) map.nextobjectid = maxId + 1
  return map
}
