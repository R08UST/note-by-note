import { describe, expect, it } from 'vitest'
import { hashOpensPicker, tabFromHash } from './tabs'

describe('tabFromHash', () => {
  it('reads a known tab and falls back to practice', () => {
    expect(tabFromHash('#library')).toBe('practice')
    expect(tabFromHash('#omr')).toBe('omr')
    expect(tabFromHash('history')).toBe('history')
    expect(tabFromHash('#nope')).toBe('practice')
    expect(tabFromHash('')).toBe('practice')
  })

  it('treats #library as the piece picker on the practice tab', () => {
    expect(hashOpensPicker('#library')).toBe(true)
    expect(hashOpensPicker('#practice')).toBe(false)
    expect(hashOpensPicker('')).toBe(false)
  })
})
