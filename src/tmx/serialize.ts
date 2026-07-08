/**
 * TMX 序列化 —— 输出游戏可直接读取的格式：
 *  - 图层数据: base64 + zlib（游戏 Layer.a() 支持 gzip/zlib/无压缩）
 *  - 内置地块集: 只写 <image source="文件名.png">，不内嵌图片
 *  - 自定义地块集: 写 embedded_png 属性（base64 PNG，游戏 TileSet.a() 读取）
 *  - 外部 .tsx 引用 (<tileset source>): 原样保留
 */
import { deflate } from 'pako'
import { bytesToBase64, wrapBase64 } from './base64'
import type { TmxLayer, TmxMap, TmxObject, TmxObjectGroup, TmxProperties, TmxTileset } from './types'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // 属性中的换行/制表用字符引用保留（防止 XML 属性值规范化把它们变成空格）
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;')
    .replace(/\t/g, '&#9;')
}
function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 100000) / 100000)
}

class Xml {
  parts: string[] = []
  indent = 0
  line(s: string) {
    this.parts.push(' '.repeat(this.indent) + s)
  }
  raw(s: string) {
    this.parts.push(s)
  }
  toString() {
    return this.parts.join('\n')
  }
}

/**
 * 写属性集。
 * @param allowTextNode 是否允许把多行/超长值写成文本节点。
 *  游戏解析差异（反编译源码）：
 *   - 对象属性 (maps/a.java) 与 tileset 的 embedded_png (TileSet.java)：支持 value 属性或文本节点
 *   - map/layer/objectgroup 属性：只读 value 属性 → 必须写成属性（换行以 &#10; 保留）
 */
function writeProperties(x: Xml, props: TmxProperties, allowTextNode = false) {
  const keys = Object.keys(props)
  if (!keys.length) return
  x.line('<properties>')
  x.indent += 1
  for (const k of keys) {
    const v = props[k]
    const useText = allowTextNode && (v.includes('\n') || v.length > 512)
    if (useText) {
      x.line(`<property name="${esc(k)}">${escText(v)}</property>`)
    } else {
      x.line(`<property name="${esc(k)}" value="${esc(v)}"/>`)
    }
  }
  x.indent -= 1
  x.line('</properties>')
}

function extraAttrString(extra: Record<string, string>): string {
  const keys = Object.keys(extra)
  if (!keys.length) return ''
  return keys.map((k) => ` ${k}="${esc(extra[k])}"`).join('')
}

function writeTileset(x: Xml, ts: TmxTileset) {
  if (ts.source) {
    x.line(`<tileset firstgid="${ts.firstgid}" source="${esc(ts.source)}"/>`)
    return
  }
  const attrs: string[] = [`firstgid="${ts.firstgid}"`, `name="${esc(ts.name)}"`]
  attrs.push(`tilewidth="${ts.tilewidth}"`, `tileheight="${ts.tileheight}"`)
  if (ts.spacing) attrs.push(`spacing="${ts.spacing}"`)
  if (ts.margin) attrs.push(`margin="${ts.margin}"`)
  if (ts.tilecount) attrs.push(`tilecount="${ts.tilecount}"`)
  if (ts.columns) attrs.push(`columns="${ts.columns}"`)
  x.line(`<tileset ${attrs.join(' ')}>`)
  x.indent += 1

  // 属性：内置地块集绝不写 embedded_png；自定义地块集必须带 embedded_png
  // （游戏 TileSet.java 对 embedded_png 支持文本节点，写文本节点避免超长属性）
  const props: TmxProperties = { ...ts.properties }
  if (ts.builtin) {
    delete props['embedded_png']
  }
  writeProperties(x, props, true)

  if (ts.image) {
    const imgAttrs = [`source="${esc(ts.image)}"`]
    if (ts.imagewidth) imgAttrs.push(`width="${ts.imagewidth}"`)
    if (ts.imageheight) imgAttrs.push(`height="${ts.imageheight}"`)
    x.line(`<image ${imgAttrs.join(' ')}/>`)
  }

  const tileIds = Object.keys(ts.tileProperties)
    .map(Number)
    .sort((a, b) => a - b)
  for (const id of tileIds) {
    const p = ts.tileProperties[id]
    if (!p || !Object.keys(p).length) continue
    x.line(`<tile id="${id}">`)
    x.indent += 1
    writeProperties(x, p)
    x.indent -= 1
    x.line('</tile>')
  }
  x.indent -= 1
  x.line('</tileset>')
}

export function encodeLayerData(data: Uint32Array): string {
  const bytes = new Uint8Array(data.length * 4)
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    const o = i * 4
    bytes[o] = v & 0xff
    bytes[o + 1] = (v >>> 8) & 0xff
    bytes[o + 2] = (v >>> 16) & 0xff
    bytes[o + 3] = (v >>> 24) & 0xff
  }
  return bytesToBase64(deflate(bytes))
}

function writeLayer(x: Xml, layer: TmxLayer) {
  const attrs = [`name="${esc(layer.name)}"`, `width="${layer.width}"`, `height="${layer.height}"`]
  if (!layer.visible) attrs.push('visible="0"')
  if (layer.opacity !== 1) attrs.push(`opacity="${fmtNum(layer.opacity)}"`)
  x.line(`<layer ${attrs.join(' ')}${extraAttrString(layer.extraAttrs)}>`)
  x.indent += 1
  writeProperties(x, layer.properties)
  x.line('<data encoding="base64" compression="zlib">')
  const b64 = encodeLayerData(layer.data)
  x.raw(wrapBase64(b64))
  x.line('</data>')
  x.indent -= 1
  x.line('</layer>')
}

function writeObject(x: Xml, obj: TmxObject) {
  const attrs: string[] = [`id="${obj.id}"`]
  if (obj.name) attrs.push(`name="${esc(obj.name)}"`)
  if (obj.type) attrs.push(`type="${esc(obj.type)}"`)
  if (obj.gid !== undefined) attrs.push(`gid="${obj.gid}"`)
  attrs.push(`x="${fmtNum(obj.x)}"`, `y="${fmtNum(obj.y)}"`)
  if (obj.width) attrs.push(`width="${fmtNum(obj.width)}"`)
  if (obj.height) attrs.push(`height="${fmtNum(obj.height)}"`)
  if (obj.rotation) attrs.push(`rotation="${fmtNum(obj.rotation)}"`)
  if (!obj.visible) attrs.push('visible="0"')
  const extra = extraAttrString(obj.extraAttrs)

  const hasChildren = Object.keys(obj.properties).length > 0 || obj.point || obj.ellipse
  if (!hasChildren) {
    x.line(`<object ${attrs.join(' ')}${extra}/>`)
    return
  }
  x.line(`<object ${attrs.join(' ')}${extra}>`)
  x.indent += 1
  writeProperties(x, obj.properties, true)
  if (obj.point) x.line('<point/>')
  if (obj.ellipse) x.line('<ellipse/>')
  x.indent -= 1
  x.line('</object>')
}

function writeObjectGroup(x: Xml, group: TmxObjectGroup) {
  const attrs = [`name="${esc(group.name)}"`]
  if (group.color) attrs.push(`color="${esc(group.color)}"`)
  if (!group.visible) attrs.push('visible="0"')
  if (group.opacity !== 1) attrs.push(`opacity="${fmtNum(group.opacity)}"`)
  x.line(`<objectgroup ${attrs.join(' ')}${extraAttrString(group.extraAttrs)}>`)
  x.indent += 1
  writeProperties(x, group.properties)
  for (const o of group.objects) writeObject(x, o)
  x.indent -= 1
  x.line('</objectgroup>')
}

export function serializeTmx(map: TmxMap): string {
  const x = new Xml()
  x.line('<?xml version="1.0" encoding="UTF-8"?>')
  const mapAttrs = [
    `version="${esc(map.version || '1.2')}"`,
    map.tiledversion ? `tiledversion="${esc(map.tiledversion)}"` : '',
    'orientation="orthogonal"',
    `renderorder="${esc(map.renderorder || 'right-down')}"`,
    `width="${map.width}"`,
    `height="${map.height}"`,
    `tilewidth="${map.tilewidth}"`,
    `tileheight="${map.tileheight}"`,
    `nextobjectid="${map.nextobjectid}"`,
  ].filter(Boolean)
  x.line(`<map ${mapAttrs.join(' ')}${extraAttrString(map.extraAttrs)}>`)
  x.indent += 1
  writeProperties(x, map.properties)
  for (const ts of map.tilesets) writeTileset(x, ts)
  for (const item of map.layers) {
    if (item.kind === 'tile') writeLayer(x, item)
    else writeObjectGroup(x, item)
  }
  x.indent -= 1
  x.line('</map>')
  return x.toString() + '\n'
}
