import { describe, expect, it } from 'vitest'
import { tabFromHash } from './tabs'

describe('tabFromHash', () => {
  it('reads a known tab and falls back to practice', () => {
    expect(tabFromHash('#omr')).toBe('omr')
    expect(tabFromHash('history')).toBe('history')
    expect(tabFromHash('#nope')).toBe('practice')
    expect(tabFromHash('')).toBe('practice')
  })
})
