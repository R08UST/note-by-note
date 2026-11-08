import { describe, expect, it } from 'vitest'
import { mapPerformanceToTransportMs, toScoreTimeMs } from './clock'

describe('transport clock', () => {
  it('places the event on the transport using its own timestamp', () => {
    const mapped = mapPerformanceToTransportMs({
      eventPerformanceMs: 1000,
      performanceNowMs: 1030,
      transportSeconds: 2.5,
    })
    expect(mapped).toBeCloseTo(2470)
  })

  it('subtracts the count-in from the transport time', () => {
    expect(toScoreTimeMs(4000, 4, 60)).toBeCloseTo(0)
    expect(toScoreTimeMs(2500, 4, 120)).toBeCloseTo(500)
  })
})
