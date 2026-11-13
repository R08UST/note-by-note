import { audioPrefs, gainDb } from '../audio/prefs'

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

/** One printed metre, and how many quarter notes its bar holds. */
export interface MetreChange {
  /** Quarter-note beats from the start of the piece. */
  beat: number
  quarterBeats: number
}

/** How the click should follow a piece that changes metre partway through. */
export interface MetreMap {
  changes: readonly MetreChange[]
  /** Score beat the count-in ends on, which is where the piece begins. */
  originBeat: number
  countInBeats: number
}

/** Length of the bar that starts at `beat`, in quarter notes. */
function barLengthAt(map: MetreMap, beat: number, fallback: number): number {
  let found = fallback
  for (const change of map.changes) {
    if (change.beat > beat + 1e-6) break
    found = change.quarterBeats
  }
  return Math.max(1, found)
}

/** The click is a small synth, created the first time sound is needed. No sample library is fetched. */
export async function startMetronome(
  bpm: number,
  quarterBeatsPerMeasure: number,
  audible = true,
  metres?: MetreMap,
): Promise<void> {
  const Tone = await loadTone()
  await Tone.start()
  audioStarted = true
  await ensureSynths()
  stopMetronome()
  Tone.Transport.bpm.value = bpm
  Tone.Transport.position = 0
  let beat = 0
  // Where the bar being clicked began, on the score's own beat axis. A piece that
  // changes metre partway through then accents the right beat after the change.
  let barStart = metres ? metres.originBeat - metres.countInBeats : 0
  let perMeasure = metres
    ? barLengthAt(metres, metres.originBeat, quarterBeatsPerMeasure)
    : Math.max(1, Math.round(quarterBeatsPerMeasure))
  Tone.Transport.scheduleRepeat((time) => {
    beat += 1
    let downbeat: boolean
    if (metres) {
      const scoreBeat = beat - 1 - metres.countInBeats + metres.originBeat
      if (scoreBeat >= barStart + perMeasure - 1e-3) {
        barStart += perMeasure
        perMeasure = barLengthAt(metres, barStart, quarterBeatsPerMeasure)
      }
      downbeat = Math.abs(scoreBeat - barStart) < 1e-3
    } else {
      downbeat = (beat - 1) % perMeasure === 0
    }
    if (!audible || audioPrefs.muted) return
    const synth = downbeat ? accent : tick
    if (synth) synth.volume.value = gainDb(audioPrefs.metro, false)
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
