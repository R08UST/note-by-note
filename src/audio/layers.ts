/**
 * The piano ships several recordings per pitch, one for each kind of strike. A soft
 * strike is not just a quiet loud strike: it has less hammer, a rounder attack and far
 * less high partial. Picking the recording by velocity is what makes `pp` sound like a
 * pianist playing softly instead of a pianist playing the same thing with the volume down.
 */

export interface LayerSpec {
  /** Directory the layer's samples live in, under `samples/piano/`. */
  id: string
  /** MIDI velocity this recording sits at. */
  velocity: number
}

/**
 * The pitches that actually have a recording. Every minor third is enough: the sampler
 * repitches by up to a semitone and a half, which stays inaudible on a piano.
 * `scripts/build-piano-layers.mjs` writes exactly these files.
 */
export const SAMPLE_NOTES = [
  'A0', 'C1', 'D#1', 'F#1', 'A1', 'C2', 'D#2', 'F#2', 'A2', 'C3', 'D#3', 'F#3',
  'A3', 'C4', 'D#4', 'F#4', 'A4', 'C5', 'D#5', 'F#5', 'A5', 'C6', 'D#6', 'F#6', 'A6', 'C7',
]

/**
 * File name for a pitch. A `#` cannot appear in a URL path: it starts the fragment, so
 * `D#4.ogg` is requested as `D%234.ogg` and a static server answers with the SPA
 * fallback page instead of audio. Sharps are spelled with `s`, which is a plain letter.
 */
export function sampleFile(note: string): string {
  return note.replace('#', 's')
}

/**
 * Three strikes are enough to cover the range: everything below `soft` uses the soft
 * recording, everything above `hard` the hard one, and the middle blends.
 */
export const PIANO_LAYERS: readonly LayerSpec[] = [
  { id: 'soft', velocity: 34 },
  { id: 'mid', velocity: 76 },
  { id: 'hard', velocity: 118 },
]

/** One recording to trigger, and how loud to trigger it. */
export interface LayerGain {
  index: number
  /** 0–1. Weights of one mix sum to 1, so the blend keeps a steady loudness. */
  gain: number
}

/**
 * Which recordings to trigger for a MIDI velocity, and at what gain each. Two adjacent
 * layers are blended so a dynamic between them keeps both the loudness and the timbre of a
 * real in-between strike; outside the range the nearest recording plays alone.
 */
export function layerMix(midi: number, layers: readonly LayerSpec[] = PIANO_LAYERS): LayerGain[] {
  if (layers.length === 0) return []
  const first = layers[0]
  const last = layers[layers.length - 1]
  if (midi <= first.velocity) return [{ index: 0, gain: 1 }]
  if (midi >= last.velocity) return [{ index: layers.length - 1, gain: 1 }]
  for (let index = 0; index < layers.length - 1; index += 1) {
    const low = layers[index]
    const high = layers[index + 1]
    if (midi > high.velocity) continue
    const span = high.velocity - low.velocity
    const t = span <= 0 ? 0 : (midi - low.velocity) / span
    // Landing exactly on a recording plays it alone instead of mixing in a silent one.
    if (t <= 0) return [{ index, gain: 1 }]
    if (t >= 1) return [{ index: index + 1, gain: 1 }]
    return [
      { index, gain: 1 - t },
      { index: index + 1, gain: t },
    ]
  }
  return [{ index: layers.length - 1, gain: 1 }]
}

/**
 * Sampler gain for one recording of a note at `midi`. The layer blend and the overall
 * loudness multiply, so the timbre follows the strike while the volume still follows the
 * score's dynamics.
 */
export function layerVelocity(gain: number, loudness: number): number {
  return Math.min(1, Math.max(0.001, gain * loudness))
}
