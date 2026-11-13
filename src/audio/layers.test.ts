import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { PIANO_LAYERS, SAMPLE_NOTES, layerMix, layerVelocity, sampleFile } from './layers'

const layers = [
  { id: 'soft', velocity: 34 },
  { id: 'mid', velocity: 76 },
  { id: 'hard', velocity: 118 },
]

describe('layer mix', () => {
  it('plays only the softest recording below its velocity', () => {
    expect(layerMix(1, layers)).toEqual([{ index: 0, gain: 1 }])
    expect(layerMix(34, layers)).toEqual([{ index: 0, gain: 1 }])
  })

  it('plays only the hardest recording above its velocity', () => {
    expect(layerMix(118, layers)).toEqual([{ index: 2, gain: 1 }])
    expect(layerMix(127, layers)).toEqual([{ index: 2, gain: 1 }])
  })

  it('lands exactly on a recorded layer', () => {
    expect(layerMix(76, layers)).toEqual([{ index: 1, gain: 1 }])
  })

  it('blends the two recordings around an in-between velocity', () => {
    const mix = layerMix(60, layers)
    expect(mix).toHaveLength(2)
    expect(mix[0].index).toBe(0)
    expect(mix[1].index).toBe(1)
    expect(mix[0].gain + mix[1].gain).toBeCloseTo(1)
    // 60 sits closer to 76 than to 34, so the louder recording leads.
    expect(mix[1].gain).toBeGreaterThan(mix[0].gain)
  })

  it('keeps the blend weights summing to one everywhere', () => {
    for (let midi = 1; midi <= 127; midi += 1) {
      const total = layerMix(midi, layers).reduce((sum, entry) => sum + entry.gain, 0)
      expect(total).toBeCloseTo(1, 6)
    }
  })

  it('moves forward through the layers as velocity rises', () => {
    const low = layerMix(40, layers).at(-1)!.index
    const high = layerMix(110, layers).at(-1)!.index
    expect(high).toBeGreaterThan(low)
  })

  it('still plays something with no layers configured', () => {
    expect(layerMix(80, [])).toEqual([])
  })
})

describe('layer velocity', () => {
  it('scales a layer by the note loudness', () => {
    expect(layerVelocity(1, 0.5)).toBeCloseTo(0.5)
    expect(layerVelocity(0.5, 0.5)).toBeCloseTo(0.25)
  })

  it('never asks the sampler for silence or for more than full scale', () => {
    expect(layerVelocity(0, 0)).toBeGreaterThan(0)
    expect(layerVelocity(1, 1)).toBeLessThanOrEqual(1)
    expect(layerVelocity(2, 2)).toBeLessThanOrEqual(1)
  })
})

describe('the shipped layers', () => {
  it('covers the keyboard in a rising order', () => {
    const velocities = PIANO_LAYERS.map((layer) => layer.velocity)
    expect(velocities).toEqual([...velocities].sort((a, b) => a - b))
    expect(new Set(PIANO_LAYERS.map((layer) => layer.id)).size).toBe(PIANO_LAYERS.length)
  })

  it('leaves room above the hardest recording for an accent', () => {
    const hardest = Math.max(...PIANO_LAYERS.map((layer) => layer.velocity))
    expect(hardest).toBeLessThan(127)
  })
})

describe('shipped samples', () => {
  it('has a file for every pitch in every layer', () => {
    const directory = `${process.cwd()}/public/samples/piano`
    for (const layer of PIANO_LAYERS) {
      for (const note of SAMPLE_NOTES) {
        const path = `${directory}/${layer.id}/${sampleFile(note)}.ogg`
        expect(existsSync(path), path).toBe(true)
      }
    }
  })

  it('names every file with characters that survive a URL path', () => {
    // `#` starts the fragment, so a file called `D#4.ogg` is requested as `D%234.ogg`
    // and a static server answers with the SPA fallback page instead of audio.
    for (const note of SAMPLE_NOTES) {
      expect(sampleFile(note)).not.toContain('#')
      expect(encodeURI(sampleFile(note))).toBe(sampleFile(note))
    }
    expect(sampleFile('D#4')).toBe('Ds4')
    expect(sampleFile('C4')).toBe('C4')
  })
})
