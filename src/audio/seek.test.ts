import { describe, expect, it } from 'vitest'
import { seekPlayback } from './seek'

describe('seekPlayback', () => {
  it('plays on to the end of the piece when looping is off', () => {
    expect(seekPlayback({ startBeat: 0, endBeat: 8, loop: false }, 12, 32)).toEqual({
      startBeat: 12,
      endBeat: 32,
      loop: false,
    })
  })

  it('keeps the loop when the click lands inside the selection', () => {
    expect(seekPlayback({ startBeat: 8, endBeat: 16, loop: true }, 10, 32)).toEqual({
      startBeat: 10,
      endBeat: 16,
      loop: true,
    })
  })

  it('drops the loop when the click lands outside the selection', () => {
    expect(seekPlayback({ startBeat: 8, endBeat: 16, loop: true }, 20, 32)).toEqual({
      startBeat: 20,
      endBeat: 32,
      loop: false,
    })
  })

  it('never runs past the last beat and never starts before zero', () => {
    expect(seekPlayback({ startBeat: 0, endBeat: 8, loop: false }, 99, 32).startBeat).toBe(32)
    expect(seekPlayback({ startBeat: 0, endBeat: 8, loop: false }, -4, 32).startBeat).toBe(0)
  })

  it('keeps the end beyond a click on the final note so it still sounds', () => {
    expect(seekPlayback({ startBeat: 0, endBeat: 8, loop: false }, 32, 32)).toEqual({
      startBeat: 32,
      endBeat: 32,
      loop: false,
    })
  })
})
