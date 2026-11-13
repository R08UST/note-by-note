import { audioPrefs, gainDb, subscribeAudioPrefs } from './prefs'
import { buildWarp, tempoPlanFor, velocityGain, DEFAULT_MIDI_VELOCITY } from './performance'
import type { ExtraAttack } from './performance'
import { PIANO_LAYERS, SAMPLE_NOTES, layerMix, layerVelocity, sampleFile } from './layers'
import type { TempoMark } from '../score/parseMusicXml'

type ToneModule = typeof import('tone')
type Sampler = import('tone').Sampler

let tone: ToneModule | null = null
let piano: LayeredPiano | null = null
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

/**
 * One sampler per dynamic layer, played together with weights so a strike between two
 * recorded layers gets both the loudness and the timbre of an in-between strike.
 */
class LayeredPiano {
  readonly samplers: Sampler[]
  private readonly output: import('tone').Gain

  constructor(samplers: Sampler[], output: import('tone').Gain) {
    this.samplers = samplers
    this.output = output
  }

  get loaded(): boolean {
    return this.samplers.every((sampler) => sampler.loaded)
  }

  /**
   * Strike a key. `midi` picks the recording, `loudness` sets how hard the whole note
   * sounds; the two are separate so a quiet note keeps its soft timbre instead of
   * becoming a loud note turned down.
   */
  attack(pitch: number, time: number | undefined, midi: number, loudness: number): void {
    const note = nameOf(pitch)
    for (const entry of layerMix(midi)) {
      const sampler = this.samplers[entry.index]
      if (!sampler) continue
      sampler.triggerAttack(note, time, layerVelocity(entry.gain, loudness))
    }
  }

  /** Strike and let go after `seconds`, for grace notes and ornaments. */
  attackRelease(pitch: number, seconds: number, time: number | undefined, midi: number, loudness: number): void {
    const note = nameOf(pitch)
    for (const entry of layerMix(midi)) {
      const sampler = this.samplers[entry.index]
      if (!sampler) continue
      sampler.triggerAttackRelease(note, seconds, time, layerVelocity(entry.gain, loudness))
    }
  }

  release(pitch: number, time: number | undefined): void {
    const note = nameOf(pitch)
    // The key may have been struck on more than one layer, and a layer with nothing
    // sounding for this pitch ignores the release.
    for (const sampler of this.samplers) sampler.triggerRelease(note, time)
  }

  releaseAll(time?: number): void {
    for (const sampler of this.samplers) sampler.releaseAll(time)
  }

  connectOutput(): void {
    for (const sampler of this.samplers) sampler.connect(this.output)
  }
}

export function pianoReady(): boolean {
  return piano?.loaded ?? false
}

/** Load the local Salamander samples. Call this from a click or a key, not at startup. */
export function ensurePiano(): Promise<void> {
  if (piano?.loaded) return Promise.resolve()
  if (loading) return loading
  loading = (async () => {
    const Tone = await toneModule()
    await Tone.start()
    pianoGain = new Tone.Gain(audioPrefs.muted ? 0 : audioPrefs.piano).toDestination()
    const baseUrl = new URL('samples/piano/', document.baseURI).href
    const samplers = PIANO_LAYERS.map((layer) => {
      const urls = Object.fromEntries(
        SAMPLE_NOTES.map((note) => [note, `${layer.id}/${sampleFile(note)}.ogg`]),
      )
      return new Tone.Sampler({ urls, baseUrl, release: 0.6 })
    })
    piano = new LayeredPiano(samplers, pianoGain)
    piano.connectOutput()
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
  if (!piano) return
  const Tone = await toneModule()
  if (on) {
    fingers.add(pitch)
    caught.delete(pitch)
    const midi = Math.min(127, Math.max(1, velocity))
    // A real key strike is both the timbre and the loudness of that velocity.
    piano.attack(pitch, Tone.now(), midi, velocityGain(midi))
    return
  }
  fingers.delete(pitch)
  if (pedalDown) {
    caught.add(pitch)
    return
  }
  piano.release(pitch, Tone.now())
}

export async function monitorPedal(down: boolean): Promise<void> {
  if (!audioPrefs.monitor) return
  pedalDown = down
  if (down || !piano) return
  await ensurePiano()
  const Tone = await toneModule()
  for (const pitch of caught) {
    if (!fingers.has(pitch)) piano.release(pitch, Tone.now())
  }
  caught.clear()
}

export interface DemoNote {
  pitch: number
  beat: number
  duration: number
  hand: 'L' | 'R'
  /** Sampler gain, 0–1. Absent plays a neutral `mf`. */
  velocity?: number
  /** MIDI velocity the printed marks asked for. Absent falls back to `mf`. */
  midi?: number
  /** How long the key is held, in beats. Absent holds the written value. */
  gate?: number
  /** Grace notes and played-out ornaments, each offset in beats from the attack. */
  extras?: readonly ExtraAttack[]
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

/** Neutral velocity used when the score prints no dynamic. */
const NEUTRAL_VELOCITY = velocityGain(DEFAULT_MIDI_VELOCITY)

/** The layer-picking velocity for a note, matching the loudness it was compiled with. */
function midiOf(note: DemoNote): number {
  if (note.midi != null) return note.midi
  // A note built without a MIDI velocity still has to pick a sensible recording, so
  // invert the gain curve at its loudness.
  const loudness = Math.min(1, Math.max(0.02, note.velocity ?? NEUTRAL_VELOCITY))
  const ratio = (loudness - 0.08) / 0.92
  return Math.min(127, Math.max(1, Math.pow(Math.max(0, ratio), 1 / 1.25) * 127))
}

/**
 * Play the written notes with the expression the score asked for: per-note
 * loudness, articulation-shaped key length, and the score's own tempo changes.
 */
export async function startDemo(options: {
  notes: readonly DemoNote[]
  bpm: number
  startBeat: number
  endBeat: number
  loop: boolean
  countInBeats?: number
  /** Printed tempo changes. When present the score's own speed is followed. */
  tempos?: readonly TempoMark[]
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
  const countIn = options.countInBeats ?? 0

  // Bake the score's tempo changes into the scheduling grid so the transport can
  // run at one constant tempo. Changing the transport tempo later then scales the
  // whole piece uniformly, which is what the slider should do.
  const plan = tempoPlanFor(options.tempos ?? [], bpm)
  const warp = buildWarp(plan, bpm)
  const origin = warp.toUnits(start)
  const at = (beat: number) => countIn + warp.toUnits(beat) - origin
  const spanUnits = Math.max(0.25, warp.toUnits(end) - origin)

  Tone.Transport.cancel()
  Tone.Transport.bpm.value = bpm
  Tone.Transport.position = 0
  Tone.Transport.loop = options.loop
  Tone.Transport.loopStart = 0
  Tone.Transport.loopEnd = musicalTime(countIn + spanUnits)
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
  // Extras are measured in beats; the sampler wants seconds, and the transport
  // runs at one constant tempo because the score's tempo changes are baked into
  // the grid, so a plain quarter-note conversion is exact here.
  const quarter = 60 / bpm
  for (const note of options.notes) {
    if (note.beat < start - 1e-3) continue
    const loudness = Math.min(1, Math.max(0.02, note.velocity ?? NEUTRAL_VELOCITY))
    const midi = midiOf(note)
    const gate = note.gate ?? note.duration
    if (note.extras && note.extras.length > 0) {
      // Grace notes and ornament turns are scheduled alongside the main note and
      // nudged by their own beat offset, so they never drift apart under a
      // tempo change and always land before the beat they decorate.
      for (const extra of note.extras) {
        const startBeat = Math.max(0, note.beat + extra.offset)
        // The length is measured through the same warp as the attack, so an
        // ornament under a tempo change stays proportional to its note.
        const seconds = Math.max(0.02, (at(startBeat + extra.gate) - at(startBeat)) * quarter)
        Tone.Transport.schedule((time) => {
          piano?.attackRelease(extra.pitch, seconds, time, midi, loudness * 0.85)
        }, musicalTime(Math.max(0, at(startBeat))))
      }
    }
    // Attack and release are scheduled separately on the score's beat axis, so a
    // tempo change in the middle of a note still lands the release correctly.
    // The release is pulled back to the end of the span so nothing is left hanging
    // when the transport loops or stops.
    const releaseAt = Math.min(note.beat + gate, end)
    Tone.Transport.schedule((time) => {
      piano?.attack(note.pitch, time, midi, loudness)
    }, musicalTime(Math.max(0, at(note.beat))))
    Tone.Transport.schedule((time) => {
      piano?.release(note.pitch, time)
    }, musicalTime(Math.max(0, at(releaseAt))))
  }
  const cursor = Tone.Transport.scheduleRepeat(() => {
    const units = Tone.Transport.ticks / Tone.Transport.PPQ
    const beat = warp.toBeat(units - countIn + origin)
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
  }, musicalTime(countIn + spanUnits))
  if (options.loop) {
    // The transport jumps back before anything scheduled exactly on the loop end
    // can fire, so let go of the last chord just before the wrap.
    Tone.Transport.schedule(() => {
      piano?.releaseAll()
    }, musicalTime(Math.max(0, countIn + spanUnits - 0.02)))
  }
  Tone.Transport.start()
  demoStop = () => {
    Tone.Transport.clear(cursor)
    Tone.Transport.clear(endId)
    Tone.Transport.loop = false
    if (Tone.Transport.state !== 'stopped') Tone.Transport.stop()
    Tone.Transport.cancel()
    // Stopping the transport drops the scheduled releases, so anything still
    // ringing has to be let go by hand.
    piano?.releaseAll()
    demoStop = null
  }
}

export function stopDemo(): void {
  demoStop?.()
}

export function pauseDemo(): void {
  if (tone && tone.Transport.state === 'started') {
    tone.Transport.pause()
    // The transport clock stops, so scheduled releases never fire while paused.
    piano?.releaseAll()
  }
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
  const ids: number[] = []
  for (const note of notes) {
    const loudness = Math.min(1, Math.max(0.02, note.velocity ?? NEUTRAL_VELOCITY))
    const midi = midiOf(note)
    ids.push(
      Tone.Transport.schedule((time) => {
        piano?.attackRelease(note.pitch, Math.max(0.05, (note.gate ?? note.duration) * quarter), time, midi, loudness)
      }, Math.max(0, (countInBeats + note.beat - startBeat) * quarter)),
    )
    // Grace notes and ornaments belong to the hand that plays the written note,
    // so the accompaniment carries them too.
    for (const extra of note.extras ?? []) {
      ids.push(
        Tone.Transport.schedule((time) => {
          piano?.attackRelease(extra.pitch, Math.max(0.03, extra.gate * quarter), time, midi, loudness * 0.85)
        }, Math.max(0, (countInBeats + note.beat + extra.offset - startBeat) * quarter)),
      )
    }
  }
  return () => {
    for (const id of ids) Tone.Transport.clear(id)
  }
}
