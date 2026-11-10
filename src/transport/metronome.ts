let accent: import('tone').Synth | null = null
let tick: import('tone').Synth | null = null
let tone: typeof import('tone') | null = null
let audioStarted = false

async function loadTone(): Promise<typeof import('tone')> {
  if (!tone) tone = await import('tone')
  return tone
}

async function ensureSynths(): Promise<void> {
  if (accent && tick) return
  const Tone = await loadTone()
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

/** The click is a small synth, created the first time sound is needed. No sample library is fetched. */
export async function startMetronome(bpm: number, quarterBeatsPerMeasure: number, audible = true): Promise<void> {
  const Tone = await loadTone()
  await Tone.start()
  audioStarted = true
  await ensureSynths()
  stopMetronome()
  Tone.Transport.bpm.value = bpm
  Tone.Transport.position = 0
  let beat = 0
  const perMeasure = Math.max(1, Math.round(quarterBeatsPerMeasure))
  Tone.Transport.scheduleRepeat((time) => {
    beat += 1
    if (!audible) return
    const downbeat = (beat - 1) % perMeasure === 0
    const synth = downbeat ? accent : tick
    synth?.triggerAttackRelease(downbeat ? 'E5' : 'C5', '32n', time)
  }, '4n')
  Tone.Transport.start()
}

export function stopMetronome(): void {
  if (!audioStarted || !tone) return
  try {
    if (tone.Transport.state !== 'stopped') tone.Transport.stop()
    tone.Transport.cancel()
    tone.Transport.position = 0
  } catch {
    // The audio context has not been started yet.
  }
}

export function transportSeconds(): number {
  return tone?.Transport.seconds ?? 0
}
