/**
 * unitAdd.spawnUnits 语法解析/序列化。
 * 格式：name*count(key=value,...), name2*2
 * 与 survivalWaves 波次单位格式（count name）不同。
 */

export interface SpawnUnitEntry {
  unit: string
  count: number
  /** 可选参数，如 gridAlign=true */
  opts?: string
}

/** 解析 spawnUnits 字符串 */
export function parseSpawnUnits(raw: string | undefined | null): SpawnUnitEntry[] {
  if (!raw || !String(raw).trim()) return []
  const out: SpawnUnitEntry[] = []
  for (const piece of String(raw).split(',')) {
    const p = piece.trim()
    if (!p) continue
    // name*count(opts) 或 name(opts) 或 name*count 或 name
    const m = /^([^(]+?)(?:\*(\d+))?(?:\((.*)\))?$/.exec(p)
    if (!m) {
      out.push({ unit: p, count: 1 })
      continue
    }
    const unit = m[1].trim()
    const count = m[2] ? Math.max(1, parseInt(m[2], 10) || 1) : 1
    const opts = m[3]?.trim() || undefined
    if (unit) out.push({ unit, count, opts })
  }
  return out
}

export function serializeSpawnUnits(entries: SpawnUnitEntry[]): string {
  return entries
    .filter((e) => e.unit.trim())
    .map((e) => {
      const name = e.unit.trim()
      const count = e.count > 1 ? `*${e.count}` : ''
      const opts = e.opts?.trim() ? `(${e.opts.trim()})` : ''
      return `${name}${count}${opts}`
    })
    .join(', ')
}

export function spawnUnitsToBrief(raw: string | undefined): string {
  return parseSpawnUnits(raw)
    .map((e) => (e.count > 1 ? `${e.unit}×${e.count}` : e.unit))
    .join(', ')
}
