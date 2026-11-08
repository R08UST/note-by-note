const STEP: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

/** MusicXML pitch to MIDI. Octave 4 step C is middle C (60). */
export function pitchToMidi(step: string, octave: number, alter = 0): number {
  const semitone = STEP[step.toUpperCase()]
  if (semitone == null) throw new Error(`Unknown pitch step "${step}"`)
  return (octave + 1) * 12 + semitone + alter
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export function noteName(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${NAMES[pitchClass]}${octave}`
}
