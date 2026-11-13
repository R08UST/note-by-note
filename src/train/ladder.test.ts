import { describe, expect, it } from 'vitest'
import { EMPTY_STREAK, LADDER_MAX, LADDER_MIN, bestCleanBpm, isCleanRun, nextBpm, startBpm } from './ladder'

const run = (bpm: number, clean = true, itemId = 'a') => ({
  itemId,
  bpm,
  scoredTiming: true,
  pitchAccuracy: clean ? 1 : 0.5,
  onTimeRate: clean ? 1 : 0.5,
})

describe('speed ladder', () => {
  it('only counts timed takes that pass both gates', () => {
    expect(isCleanRun(run(80))).toBe(true)
    expect(isCleanRun(run(80, false))).toBe(false)
    expect(isCleanRun({ ...run(80), scoredTiming: false })).toBe(false)
  })

  it('remembers the fastest clean tempo per item', () => {
    const runs = [run(72), run(96, false), run(88), run(120, true, 'b')]
    expect(bestCleanBpm(runs, 'a')).toBe(88)
    expect(bestCleanBpm(runs, 'c')).toBeNull()
  })

  it('starts a little under the best tempo', () => {
    expect(startBpm(88, 66)).toBe(80)
    expect(startBpm(null, 66)).toBe(66)
    expect(startBpm(50, 66)).toBe(LADDER_MIN)
  })

  it('raises after two clean takes and lowers after two misses', () => {
    const first = nextBpm(80, EMPTY_STREAK, true)
    expect(first.bpm).toBe(80)
    const second = nextBpm(first.bpm, first.streak, true)
    expect(second.bpm).toBe(84)
    expect(second.change).toBe(4)
    const miss = nextBpm(84, second.streak, false)
    expect(miss.bpm).toBe(84)
    expect(nextBpm(miss.bpm, miss.streak, false).bpm).toBe(80)
  })

  it('a miss breaks a clean run', () => {
    const one = nextBpm(80, EMPTY_STREAK, true)
    const broken = nextBpm(80, one.streak, false)
    expect(nextBpm(80, broken.streak, true).bpm).toBe(80)
  })

  it('stays inside the slider range', () => {
    expect(nextBpm(LADDER_MAX, { clean: 1, fail: 0 }, true).bpm).toBe(LADDER_MAX)
    expect(nextBpm(LADDER_MIN, { clean: 0, fail: 1 }, false).bpm).toBe(LADDER_MIN)
  })
})
