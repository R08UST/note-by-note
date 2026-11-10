/** Plain settings. The sampler stays unloaded until something asks it to play. */

export interface AudioPrefs {
  muted: boolean
  /** 0–1, applied to the piano sampler. */
  piano: number
  /** 0–1, applied to the metronome click. */
  metro: number
  /** MIDI keyboards with their own speakers stay silent until this is turned on. */
  monitor: boolean
  /** During practice, play the hand the user is not practicing. */
  accompany: boolean
}

export const audioPrefs: AudioPrefs = {
  muted: false,
  piano: 0.8,
  metro: 0.7,
  monitor: false,
  accompany: false,
}

const listeners = new Set<() => void>()

export function setAudioPrefs(patch: Partial<AudioPrefs>): void {
  Object.assign(audioPrefs, patch)
  for (const listener of listeners) listener()
}

export function subscribeAudioPrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function gainDb(linear: number, muted: boolean): number {
  if (muted || linear <= 0.001) return -Infinity
  return Math.max(-48, 20 * Math.log10(linear))
}
