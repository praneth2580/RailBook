import { describe, expect, it } from 'vitest'
import { DEFAULT_HUMAN_LEVEL, isHumanLevel, parseHumanLevel } from './human'

describe('human input levels', () => {
  it('knows the three levels and nothing else', () => {
    expect(['fast', 'natural', 'careful'].every(isHumanLevel)).toBe(true)
    expect(isHumanLevel('off')).toBe(false)
    expect(isHumanLevel(false)).toBe(false)
  })

  it('falls back to natural for anything saved that is not a level, "off" included', () => {
    expect(DEFAULT_HUMAN_LEVEL).toBe('natural')
    expect(parseHumanLevel('careful')).toBe('careful')
    expect(parseHumanLevel('off')).toBe('natural')
    expect(parseHumanLevel(null)).toBe('natural')
  })
})
