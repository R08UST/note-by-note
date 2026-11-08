/**
 * OSMD stores `Note.halfTone` as `pitchClass + 12 * MusicXML octave`.
 * MIDI is `pitchClass + 12 * (octave + 1)`, so middle C is halfTone 48 and MIDI 60.
 * Kept in this one module so score parsing never touches OSMD.
 */
export function osmdHalfToneToMidi(halfTone: number): number {
  return halfTone + 12
}
