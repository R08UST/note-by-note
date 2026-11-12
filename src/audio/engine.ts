import { audioPrefs, gainDb, subscribeAudioPrefs } from './prefs'

const SAMPLE_NOTES = ['A0', 'C1', 'D#1', 'F#1', 'A1', 'C2', 'D#2', 'F#2', 'A2', 'C3', 'D#3', 'F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4', 'C5', 'D#5', 'F#5', 'A5', 'C6', 'D#6', 'F#6', 'A6', 'C7']

type ToneModule = typeof import('tone')
type Sampler = import('tone').Sampler

let tone: ToneModule | null = null
let sampler: Sampler | null = null
let pianoGain: import('tone').Gain | null = null
let loading: Promise<void> | null = null
let pedalDown = false
const fingers = new Set<number>()
const caught = new Set<number>()
let demoStop: (() => void) | null = null
let clickHigh: import('tone').Synth | null = null
let clickLow: import('tone').Synth | null = null

async function toneModule(): Promise<ToneModule> {
  if (!tone) tone = await import('tone')
  return tone
}

export function pianoReady(): boolean {
  return sampler?.loaded ?? false
}

/** Load the local Salamander samples. Call this from a click or a key, not at startup. */
export function ensurePiano(): Promise<void> {
  if (sampler?.loaded) return Promise.resolve()
  if (loading) return loading
  loading = (async () => {
    const Tone = await toneModule()
    await Tone.start()
    pianoGain = new Tone.Gain(audioPrefs.muted ? 0 : audioPrefs.piano).toDestination()
    const urls = Object.fromEntries(SAMPLE_NOTES.map((note) => [note, `${encodeURIComponent(note)}.ogg`]))
    sampler = new Tone.Sampler({
      urls,
      baseUrl: new URL('samples/piano/', document.baseURI).href,
      release: 0.6,
    }).connect(pianoGain)
    await Tone.loaded()
    applyPianoGain()
  })()
  return loading
}

function applyPianoGain(): void {
  if (!pianoGain || !tone) return
  pianoGain.gain.value = audioPrefs.muted ? 0 : audioPrefs.piano
}

subscribeAudioPrefs(() => {
  applyPianoGain()
})

function nameOf(pitch: number): string {
  return tone?.Frequency(pitch, 'midi').toNote() ?? 'C4'
}

export async function monitorNote(pitch: number, velocity: number, on: boolean): Promise<void> {
  if (!audioPrefs.monitor || audioPrefs.muted) return
  await ensurePiano()
  if (!sampler) return
  const Tone = await toneModule()
  const note = nameOf(pitch)
  if (on) {
    fingers.add(pitch)
    caught.delete(pitch)
    sampler.triggerAttack(note, Tone.now(), Math.max(0.05, Math.min(1, velocity / 127)))
    return
  }
  fingers.delete(pitch)
  if (pedalDown) {
    caught.add(pitch)
    return
  }
  sampler.triggerRelease(note, Tone.now())
}

export async function monitorPedal(down: boolean): Promise<void> {
  if (!audioPrefs.monitor) return
  pedalDown = down
  if (down || !sampler) return
  await ensurePiano()
  const Tone = await toneModule()
  for (const pitch of caught) {
    if (!fingers.has(pitch)) sampler.triggerRelease(nameOf(pitch), Tone.now())
  }
  caught.clear()
}

export interface DemoNote {
  pitch: number
  beat: number
  duration: number
  hand: 'L' | 'R'
}

export function notesSounding(notes: readonly DemoNote[], beat: number): DemoNote[] {
  return notes.filter((note) => beat >= note.beat - 1e-3 && beat < note.beat + note.duration - 1e-3)
}

/** Quarter-note offset as Tone transport time in bar:beat:sixteenth, keeping fractions so notes between sixteenths (triplets, 32nds) don't get snapped. */
export function musicalTime(quarters: number): string {
  const sixteenths = Math.max(0, quarters * 4)
  const bars = Math.floor(sixteenths / 16)
  const beats = Math.floor((sixteenths % 16) / 4)
  const six = sixteenths % 4
  const sixString = Number.isInteger(six) ? String(six) : String(Math.round(six * 1000) / 1000)
  return `${bars}:${beats}:${sixString}`
}

export async function startDemo(options: {
  notes: readonly DemoNote[]
  bpm: number
  startBeat: number
  endBeat: number
  loop: boolean
  countInBeats?: number
  onBeat: (beat: number) => void
  onSounding?: (notes: readonly DemoNote[]) => void
  onEnded?: () => void
}): Promise<void> {
  await ensurePiano()
  const Tone = await toneModule()
  await Tone.start()
  stopDemo()
  const bpm = Math.max(40, options.bpm)
  const start = Math.min(options.startBeat, options.endBeat)
  const end = Math.max(options.startBeat, options.endBeat)
  const span = Math.max(0.25, end - start)
  const countIn = options.countInBeats ?? 0
  const quarter = 60 / bpm
  Tone.Transport.cancel()
  Tone.Transport.bpm.value = bpm
  Tone.Transport.position = 0
  Tone.Transport.loop = options.loop
  Tone.Transport.loopStart = 0
  Tone.Transport.loopEnd = musicalTime(countIn + span)
  if (!clickHigh || !clickLow) {
    clickHigh = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
    }).toDestination()
    clickLow = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
    }).toDestination()
  }
  const click = (downbeat: boolean, time: number) => {
    if (audioPrefs.muted || audioPrefs.metro <= 0.001) return
    const synth = downbeat ? clickHigh : clickLow
    if (!synth) return
    synth.volume.value = gainDb(audioPrefs.metro, false)
    synth.triggerAttackRelease(downbeat ? 'E5' : 'C5', '32n', time)
  }
  for (let beat = 0; beat < countIn; beat += 1) {
    const downbeat = beat % 4 === 0
    Tone.Transport.schedule((time) => click(downbeat, time), musicalTime(beat))
  }
  for (const note of options.notes) {
    const when = countIn + note.beat - start
    if (when < -1e-3) continue
    Tone.Transport.schedule((time) => {
      sampler?.triggerAttackRelease(nameOf(note.pitch), Math.max(0.05, note.duration * quarter), time, 0.75)
    }, musicalTime(Math.max(0, when)))
  }
  const cursor = Tone.Transport.scheduleRepeat(() => {
    const quarters = Tone.Transport.ticks / Tone.Transport.PPQ
    const beat = start + quarters - countIn
    const clamped = Math.min(end, Math.max(start, beat))
    options.onBeat(clamped)
    options.onSounding?.(notesSounding(options.notes, clamped))
  }, '32n')
  const endId = Tone.Transport.scheduleOnce(() => {
    if (!options.loop) {
      options.onBeat(end)
      options.onSounding?.([])
      options.onEnded?.()
      stopDemo()
    }
  }, musicalTime(countIn + span))
  Tone.Transport.start()
  demoStop = () => {
    Tone.Transport.clear(cursor)
    Tone.Transport.clear(endId)
    Tone.Transport.loop = false
    if (Tone.Transport.state !== 'stopped') Tone.Transport.stop()
    Tone.Transport.cancel()
    demoStop = null
  }
}

export function stopDemo(): void {
  demoStop?.()
}

export function pauseDemo(): void {
  if (tone && tone.Transport.state === 'started') tone.Transport.pause()
}

export function resumeDemo(): void {
  if (tone && tone.Transport.state === 'paused') tone.Transport.start()
}

export function setDemoTempo(bpm: number): void {
  if (tone) tone.Transport.bpm.value = Math.max(40, bpm)
}

/** Notes for the hand the player is not practicing, scheduled on the already running transport. */
export async function scheduleAccompaniment(
  notes: readonly DemoNote[],
  bpm: number,
  countInBeats: number,
  startBeat: number,
): Promise<() => void> {
  if (!audioPrefs.accompany || audioPrefs.muted || notes.length === 0) return () => {}
  await ensurePiano()
  const Tone = await toneModule()
  const quarter = 60 / bpm
  const ids = notes.map((note) =>
    Tone.Transport.schedule((time) => {
      sampler?.triggerAttackRelease(nameOf(note.pitch), Math.max(0.05, note.duration * quarter), time, 0.7)
    }, Math.max(0, (countInBeats + note.beat - startBeat) * quarter)),
  )
  return () => {
    for (const id of ids) Tone.Transport.clear(id)
  }
}
