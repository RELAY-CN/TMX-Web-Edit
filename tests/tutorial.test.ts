import { describe, expect, it } from 'vitest'
import { TUTORIAL_STEPS } from '@/game/tutorial'

describe('引导式教程', () => {
  it('每一步都有目标、操作和完成标志', () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThanOrEqual(5)
    for (const step of TUTORIAL_STEPS) {
      expect(step.goal.trim()).not.toBe('')
      expect(step.action.trim()).not.toBe('')
      expect(step.checkpoint.trim()).not.toBe('')
    }
  })

  it('面向新手的文本只描述游戏行为和编辑操作', () => {
    const visibleText = TUTORIAL_STEPS.flatMap((step) => [
      step.title,
      step.goal,
      step.action,
      step.checkpoint,
      ...step.details,
      step.tip ?? '',
    ]).join('\n')

    expect(visibleText).not.toContain('源码')
    expect(visibleText).not.toContain('旧图里的 Units')
  })
})
