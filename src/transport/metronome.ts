import * as Tone from 'tone'

let accent: Tone.Synth | null = null
let tick: Tone.Synth | null = null
let audioStarted = false

function ensureSynths(): void {
  if (accent && tick) return
  accent = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.03 },
    volume: -8,
  }).toDestination()
  tick = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    volume: -14,
  }).toDestination()
}

export async function startMetronome(bpm: number, quarterBeatsPerMeasure: number): Promise<void> {
  await Tone.start()
  audioStarted = true
  ensureSynths()
  stopMetronome()
  Tone.Transport.bpm.value = bpm
  Tone.Transport.position = 0
  let beat = 0
  const perMeasure = Math.max(1, Math.round(quarterBeatsPerMeasure))
  Tone.Transport.scheduleRepeat((time) => {
    const downbeat = beat % perMeasure === 0
    const synth = downbeat ? accent : tick
    synth?.triggerAttackRelease(downbeat ? 'E5' : 'C5', '32n', time)
    beat += 1
  }, '4n')
  Tone.Transport.start()
}

export function stopMetronome(): void {
  if (!audioStarted) return
  try {
    if (Tone.Transport.state !== 'stopped') Tone.Transport.stop()
    Tone.Transport.cancel()
    Tone.Transport.position = 0
  } catch {
    // The audio context has not been started yet.
  }
}

export function transportSeconds(): number {
  return Tone.Transport.seconds
}
