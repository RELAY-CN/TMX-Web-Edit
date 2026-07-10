import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('前端单位层提示', () => {
  it('不把 UnitObjects 描述成游戏要求的唯一单位层', () => {
    const files = ['src/components/LayerPanel.vue', 'src/components/UnitPanel.vue']
    const templateText = files.map((file) => {
      const source = fs.readFileSync(path.resolve(file), 'utf8')
      return source.match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
    }).join('\n')

    expect(templateText).not.toContain('单位放 UnitObjects')
    expect(templateText).not.toContain('游戏官方对象组名')
    expect(templateText).not.toContain('游戏源码')
  })
})
