import { describe, expect, it } from 'vitest'
import { createPortDeduper } from './bus'

const on = (pitch: number, timeMs: number) => ({ pitch, velocity: 80, timeMs, type: 'on' as const })

describe('createPortDeduper', () => {
  it('drops the same note echoed by a second port but keeps fast repeats on one port', () => {
    const keep = createPortDeduper()
    expect(keep('a', on(60, 100))).toBe(true)
    expect(keep('b', on(60, 102))).toBe(false)
    expect(keep('a', on(60, 104))).toBe(true)
    expect(keep('b', on(62, 104))).toBe(true)
    expect(keep('b', on(60, 200))).toBe(true)
  })
})
