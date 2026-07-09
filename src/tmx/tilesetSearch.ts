/**
 * 地块集查找规则。
 * UI 与测试共享这套规则，避免面板过滤和 tile 高亮出现两套事实源。
 */
import type { TmxTileset } from './types'

export function normalizeTilesetQuery(query: string): string {
  return query.trim().toLowerCase()
}

export function tilesetMatchesQuery(ts: TmxTileset, query: string): boolean {
  const q = normalizeTilesetQuery(query)
  if (!q) return true
  if (tilesetSearchText(ts).includes(q)) return true
  return matchingLocalTileIds(ts, q).length > 0
}

export function matchingLocalTileIds(ts: TmxTileset, query: string): number[] {
  const q = normalizeTilesetQuery(query)
  if (!q) return []

  const localMatch = q.match(/^#(\d+)$/)
  if (localMatch) {
    const id = Number(localMatch[1])
    return id >= 0 && id < ts.tilecount ? [id] : []
  }

  const gidMatch = q.match(/^gid:(\d+)$/)
  if (gidMatch) {
    const gid = Number(gidMatch[1])
    const local = gid - ts.firstgid
    return local >= 0 && local < ts.tilecount ? [local] : []
  }

  const matches: number[] = []
  for (const [rawId, props] of Object.entries(ts.tileProperties)) {
    const id = Number(rawId)
    if (id < 0 || id >= ts.tilecount) continue
    const text = Object.entries(props)
      .map(([k, v]) => `${k} ${v}`)
      .join(' ')
      .toLowerCase()
    if (text.includes(q)) matches.push(id)
  }
  return matches.sort((a, b) => a - b)
}

function tilesetSearchText(ts: TmxTileset): string {
  const tags: string[] = []
  if (ts.builtin) tags.push('builtin 内置 官方')
  else if (ts.missing) tags.push('missing 缺失')
  else tags.push('custom embedded 内嵌 自定义')
  return [ts.name, ts.image, ts.source ?? '', tags.join(' '), String(ts.firstgid)]
    .join(' ')
    .toLowerCase()
}
