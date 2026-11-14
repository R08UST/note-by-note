import type { Articulation, Ornament, ScoreNote, Tremolo } from '../judge/types'
import type { DynamicMark, PedalSpan, TempoMark, Wedge } from '../score/parseMusicXml'

/** Printed expression that turns written notes into something a pianist would play. */
export interface Expression {
  dynamics?: readonly DynamicMark[]
  wedges?: readonly Wedge[]
  pedals?: readonly PedalSpan[]
  tempos?: readonly TempoMark[]
}

/** An extra attack the written note implies: a grace note or a played-out ornament. */
export interface ExtraAttack {
  pitch: number
  /** Beats from the written note's beat. Negative means before it. */
  offset: number
  /** How long the key is held, in beats. */
  gate: number
}

/** One note ready to be handed to the sampler. */
export interface PerformedNote {
  pitch: number
  beat: number
  /** Written length in quarter-note beats. Drives the score highlight. */
  duration: number
  hand: 'L' | 'R'
  /** Loudness as the sampler wants it, 0–1. */
  velocity: number
  /** MIDI velocity the printed marks asked for, 1–127. */
  midi: number
  /** How long the key stays down, in quarter-note beats. */
  gate: number
  /**
   * Beats to delay the strike, so a rolled chord climbs instead of landing flat.
   * The note's own `beat` is unchanged, which keeps the score highlight on the beat.
   */
  offset?: number
  /** Grace notes and played-out ornaments, in beat order. */
  extras?: ExtraAttack[]
  /**
   * The written note is already sounded by another note's attacks: the second half
   * of a two-note tremolo. It still highlights the score, but the sampler must not
   * strike it a second time.
   */
  silent?: boolean
}

/** Where a plain `mf` sits, used when the score prints no dynamic at all. */
export const DEFAULT_MIDI_VELOCITY = 80

/** A hairpin with no closing dynamic still has to go somewhere: about two steps. */
const WEDGE_FALLBACK = 28

const ARTICULATION_VELOCITY: Record<Articulation, number> = {
  staccato: -6,
  staccatissimo: -10,
  tenuto: 0,
  accent: 12,
  marcato: 18,
  portato: -2,
  'soft-accent': 6,
}

/** Share of the written value the key is held, before slurs and pedal. */
const ARTICULATION_GATE: Record<Articulation, number> = {
  staccato: 0.45,
  staccatissimo: 0.25,
  portato: 0.7,
  tenuto: 1,
  accent: 0.9,
  marcato: 0.85,
  'soft-accent': 0.92,
}

/** Articulations short enough that the sustain pedal must not smear them together. */
const LIFTED: ReadonlySet<Articulation> = new Set(['staccato', 'staccatissimo', 'marcato'])

const DEFAULT_GATE = 0.95
/** A printed fermata holds roughly this much longer than written. */
const FERMATA_STRETCH = 1.75
/** Keys never overlap a repeat of the same pitch by less than this. */
const SAME_PITCH_GAP = 0.01
/** Grace notes are squeezed into this much time before the beat they lean on. */
const GRACE_LEAD = 0.09
/** One alternation of a trill is never faster than this many beats. */
const TRILL_STEP = 0.25
/** Fast ornaments (mordent, turn) sit this far apart. */
const ORNAMENT_STEP = 0.1
/** A rolled chord spreads its tones over this much time per tone. */
const ARPEGGIO_STEP = 0.055
/** A rolled chord never takes longer than this, however many tones it has. */
const ARPEGGIO_MAX = 0.22
/** A breath mark lifts the key this share of the note early. */
const BREATH_LIFT = 0.35
/** How many alternations of a two-note tremolo fit into one beat, per printed slash. */
const TREMOLO_PER_BEAT: Record<number, number> = { 1: 2, 2: 4, 3: 8, 4: 16 }

/**
 * MIDI velocity to sampler gain. Tone's sampler uses velocity as playback gain,
 * so a straight linear map makes `pp` and `ff` nearly the same. The curve leaves
 * headroom at the top for accents and a floor low enough for `pp` to whisper.
 */
export function velocityGain(midi: number): number {
  const clamped = Math.min(127, Math.max(1, midi))
  return 0.08 + 0.92 * Math.pow(clamped / 127, 1.25)
}

function staffMatches(markStaff: number | undefined, staff: number | undefined): boolean {
  if (markStaff == null || staff == null) return true
  return markStaff === staff
}

/** The last dynamic printed at or before `beat` that applies to `staff`. */
function dynamicAt(
  dynamics: readonly DynamicMark[],
  beat: number,
  staff: number | undefined,
): DynamicMark | undefined {
  let found: DynamicMark | undefined
  for (const mark of dynamics) {
    if (mark.beat > beat + 1e-3) break
    if (!staffMatches(mark.staff, staff)) continue
    found = mark
  }
  return found
}

function clampVelocity(value: number): number {
  return Math.min(127, Math.max(1, Math.round(value)))
}

/**
 * Velocity a hairpin asks for at `beat`, from the dynamic it starts on to the
 * one it resolves to. A hairpin that never resolves moves by a fixed step.
 */
function wedgeVelocity(
  wedge: Wedge,
  beat: number,
  dynamics: readonly DynamicMark[],
  staff: number | undefined,
): number {
  const from = dynamicAt(dynamics, wedge.startBeat, staff)?.velocity ?? DEFAULT_MIDI_VELOCITY
  const end = wedge.endBeat
  if (end == null || end <= wedge.startBeat + 1e-3) return from
  const next = dynamics.find(
    (mark) => mark.beat > wedge.startBeat + 1e-3 && staffMatches(mark.staff, staff),
  )
  const to =
    next && next.beat >= end - 1e-3
      ? next.velocity
      : from + (wedge.direction === 'crescendo' ? WEDGE_FALLBACK : -WEDGE_FALLBACK)
  const span = end - wedge.startBeat
  const t = Math.min(1, Math.max(0, (beat - wedge.startBeat) / span))
  return from + (to - from) * t
}

/** MIDI velocity for one note, before articulation is applied. */
export function midiVelocityAt(
  beat: number,
  staff: number | undefined,
  expression: Expression,
): number {
  const dynamics = expression.dynamics ?? []
  let velocity = dynamicAt(dynamics, beat, staff)?.velocity ?? DEFAULT_MIDI_VELOCITY
  for (const wedge of expression.wedges ?? []) {
    if (beat < wedge.startBeat - 1e-3) continue
    if (wedge.endBeat != null && beat > wedge.endBeat + 1e-3) continue
    if (!staffMatches(wedge.staff, staff)) continue
    velocity = wedgeVelocity(wedge, beat, dynamics, staff)
  }
  return clampVelocity(velocity)
}

/** The grid a trill's alternations sit on, and how many of them fit in the note. */
function trillGrid(duration: number): { gap: number; count: number } {
  // Never trill past the note it decorates, and never longer than a beat or two.
  const span = Math.max(0.08, Math.min(2, duration))
  const count = Math.max(2, Math.min(12, Math.round(span / TRILL_STEP)))
  return { gap: span / count, count }
}

/** How fast a tremolo shakes, and how many alternations fit in its span. */
function tremoloGrid(strokes: number, span: number): { gap: number; count: number } {
  const perBeat = TREMOLO_PER_BEAT[strokes] ?? 4
  const safeSpan = Math.max(0.05, span)
  const count = Math.max(2, Math.min(64, Math.round(safeSpan * perBeat)))
  return { gap: safeSpan / count, count }
}

/**
 * The attacks a printed tremolo adds. The written note sounds on the beat, so the
 * shake carries on from there, taking turns with its partner when there is one.
 */
function tremoloExtras(tremolo: Tremolo, pitch: number, duration: number): ExtraAttack[] {
  const span = Math.max(duration, tremolo.span ?? duration)
  const { gap, count } = tremoloGrid(tremolo.strokes, span)
  const other = tremolo.kind === 'between' ? (tremolo.partner ?? pitch) : pitch
  const attacks: ExtraAttack[] = []
  for (let index = 1; index < count; index += 1) {
    attacks.push({
      pitch: index % 2 === 0 ? pitch : other,
      offset: gap * index,
      gate: gap * 0.9,
    })
  }
  return attacks
}

/**
 * The attacks a printed ornament adds around the written note. The written note
 * itself lands on the beat, so no pattern repeats it at `offset: 0`.
 */
function ornamentExtras(ornament: Ornament, pitch: number, duration: number): ExtraAttack[] {
  const { kind, upper, lower } = ornament
  const step = ORNAMENT_STEP
  const flick = (extra: number, offset: number, gate = step * 0.85): ExtraAttack => ({
    pitch: extra,
    offset,
    gate,
  })

  if (kind === 'trill') {
    // The written note sounds on the beat; from there the key is handed to the
    // upper neighbour and back. The written note's own gate is cut short so the
    // two keys really do take turns instead of ringing together. A wavy line
    // printed after the trill keeps the alternation going past the written note.
    const span = Math.max(duration, ornament.span ?? duration)
    const { gap, count } = trillGrid(span)
    const attacks: ExtraAttack[] = []
    for (let index = 0; index < count; index += 1) {
      const extra = index % 2 === 0 ? upper : pitch
      attacks.push(flick(extra, gap * (index + 0.5), gap * 0.9))
    }
    return attacks
  }

  if (kind === 'mordent') {
    // main – lower – main, with the written note as the closing main.
    return [flick(pitch, -2 * step), flick(lower, -step)]
  }

  if (kind === 'inverted-mordent') {
    return [flick(pitch, -2 * step), flick(upper, -step)]
  }

  if (kind === 'schleifer') {
    // A slide into the note: lower neighbour, then the written pitch, then the note itself.
    return [flick(lower, -2 * step), flick(pitch, -step)]
  }

  // turn: upper – main – lower – main, again ending on the written note.
  return [
    flick(upper, -3 * step),
    flick(pitch, -2 * step),
    flick(lower, -step),
  ]
}

/** Grace notes, ornament attacks and tremolo shakes, earliest first. */
export function extrasFor(note: ScoreNote): ExtraAttack[] | undefined {
  const attacks: ExtraAttack[] = []
  const graces = note.graces ?? []
  if (graces.length > 0) {
    const step = GRACE_LEAD / (graces.length + 1)
    graces.forEach((pitch, index) => {
      attacks.push({
        pitch,
        offset: -step * (graces.length - index),
        gate: Math.min(step * 0.85, GRACE_LEAD * 0.85),
      })
    })
  }
  if (note.ornament) attacks.push(...ornamentExtras(note.ornament, note.pitch, note.duration))
  // The first half of a two-note tremolo already plays the whole shake, so the
  // second half must not add a second one on top of it.
  if (note.tremolo && note.tremolo.role !== 'answer') {
    attacks.push(...tremoloExtras(note.tremolo, note.pitch, note.duration))
  }
  if (attacks.length === 0) return undefined
  return attacks.sort((a, b) => a.offset - b.offset)
}

/** The pedal span holding the key at `beat`, if any. */
function pedalHolding(
  pedals: readonly PedalSpan[],
  beat: number,
  release: number,
  staff: number | undefined,
): PedalSpan | undefined {
  let best: PedalSpan | undefined
  for (const span of pedals) {
    if (span.downBeat > beat + 1e-3) break
    if (!staffMatches(span.staff, staff)) continue
    const up = span.upBeat
    if (up != null && up <= beat + 1e-3) continue
    if (up != null && up >= release - 1e-3) best = span
    else if (up == null) best = span
  }
  return best
}

/**
 * Turn written notes into performed notes: loudness from dynamics and hairpins,
 * key length from articulation, slurs, fermatas, breath marks and the sustain
 * pedal, and the extra attacks that ornaments, tremolos and rolled chords imply.
 */
export function compilePerformance(
  notes: readonly ScoreNote[],
  expression: Expression = {},
): PerformedNote[] {
  const sorted = [...notes].sort((a, b) => a.beat - b.beat || a.pitch - b.pitch)
  const dynamics = expression.dynamics ?? []
  const wedges = expression.wedges ?? []
  const pedals = expression.pedals ?? []

  // Onsets of the same pitch, so a repeat is never held through its own attack.
  const onsets = new Map<number, number[]>()
  for (const note of sorted) {
    const list = onsets.get(note.pitch)
    if (list) list.push(note.beat)
    else onsets.set(note.pitch, [note.beat])
  }
  const nextOnset = (pitch: number, beat: number): number | undefined => {
    for (const onset of onsets.get(pitch) ?? []) if (onset > beat + 1e-3) return onset
    return undefined
  }

  // Slur members, in order, so a slurred note can be held into the next one.
  const slurOrder = new Map<number, number[]>()
  for (const note of sorted) {
    if (note.slur == null) continue
    const list = slurOrder.get(note.slur)
    if (list) list.push(note.beat)
    else slurOrder.set(note.slur, [note.beat])
  }
  const slurNext = (slur: number, beat: number): number | undefined => {
    for (const onset of slurOrder.get(slur) ?? []) if (onset > beat + 1e-3) return onset
    return undefined
  }

  const hasExpression =
    dynamics.length > 0 || wedges.length > 0 || pedals.length > 0

  return sorted.map((note) => {
    const staff = note.staff
    const articulation = note.articulation
    const base = hasExpression
      ? midiVelocityAt(note.beat, staff, { dynamics, wedges })
      : DEFAULT_MIDI_VELOCITY
    // A dynamic printed on this one note outranks the dynamic in force on its staff.
    const printed = note.dynamics ?? base
    const midi = clampVelocity(printed + (articulation ? ARTICULATION_VELOCITY[articulation] : 0))
    const written = Math.max(0.02, note.duration)

    let gate = written * (articulation ? ARTICULATION_GATE[articulation] : DEFAULT_GATE)

    // A slur holds the key until the next note under the same slur begins.
    if (note.slur != null) {
      const next = slurNext(note.slur, note.beat)
      if (next != null) gate = Math.max(gate, next - note.beat)
    }

    // A fermata stretches the note past its written value.
    if (note.fermata) gate = Math.max(gate, written * FERMATA_STRETCH)

    // The sustain pedal keeps the string ringing after the key comes up. Staccato
    // and marcato stay short so the articulation is still heard.
    if (!articulation || !LIFTED.has(articulation)) {
      const span = pedalHolding(pedals, note.beat, note.beat + gate, staff)
      if (span) {
        const up = span.upBeat
        if (up != null) gate = Math.max(gate, up - note.beat)
      }
    }

    const next = nextOnset(note.pitch, note.beat)
    if (next != null) gate = Math.min(gate, next - note.beat - SAME_PITCH_GAP)

    // A trill passes the key back and forth with its upper neighbour, so the
    // written note is let go as soon as the first alternation sounds.
    if (note.ornament?.kind === 'trill') {
      gate = Math.min(gate, trillGrid(Math.max(written, note.ornament.span ?? written)).gap * 0.5)
    }

    // A tremolo shakes the same key (or trades with its partner) from the beat on,
    // so the written note itself is released as soon as the shake begins.
    if (note.tremolo && note.tremolo.role !== 'answer') {
      const span = Math.max(written, note.tremolo.span ?? written)
      gate = Math.min(gate, tremoloGrid(note.tremolo.strokes, span).gap * 0.5)
    }

    // A printed breath mark or caesura lifts the key a hair early, so the next
    // phrase can start cleanly instead of being smeared into this one.
    if (note.breath) gate = Math.min(gate, written * (1 - BREATH_LIFT))

    gate = Math.max(0.02, gate)

    const performed: PerformedNote = {
      pitch: note.pitch,
      beat: note.beat,
      duration: note.duration,
      hand: note.hand,
      velocity: velocityGain(midi),
      midi,
      gate,
    }

    // A rolled chord climbs through its tones instead of striking them together.
    if (note.arpeggio && note.arpeggio.count > 1) {
      const { index, count } = note.arpeggio
      const spread = Math.min(ARPEGGIO_MAX, ARPEGGIO_STEP * (count - 1))
      performed.offset = (spread * index) / (count - 1)
    }

    // The second half of a two-note tremolo is already struck by the first half's
    // shake, so it lights up the score without sounding again.
    if (note.tremolo?.role === 'answer') performed.silent = true

    const extras = extrasFor(note)
    if (extras) performed.extras = extras
    return performed
  })
}

/** A tempo curve flattened to "from this beat on, play at this tempo". */
export type TempoPlan = readonly { beat: number; bpm: number }[]

/** Tempo in effect at `beat`, using `fallback` before the first printed mark. */
export function bpmAt(plan: TempoPlan, beat: number, fallback: number): number {
  let bpm = fallback
  for (const entry of plan) {
    if (entry.beat > beat + 1e-3) break
    bpm = entry.bpm
  }
  return bpm
}

/**
 * Scale printed tempos so the piece starts at the tempo the player chose. The
 * score keeps its own tempo changes, just transposed to that starting speed.
 */
export function tempoPlanFor(tempos: readonly TempoMark[], bpm: number): TempoPlan {
  if (tempos.length === 0) return []
  const sorted = [...tempos].sort((a, b) => a.beat - b.beat)
  const reference = sorted[0].bpm
  if (!(reference > 0)) return []
  const factor = bpm / reference
  const plan = sorted.map((mark) => ({ beat: mark.beat, bpm: Math.max(20, mark.bpm * factor) }))
  if (plan[0].beat > 1e-6) plan.unshift({ beat: 0, bpm })
  else plan[0] = { beat: 0, bpm }
  return plan
}

/**
 * The score's beat axis mapped onto a constant-tempo transport axis.
 *
 * A score beat lasts `60 / bpm(beat)` seconds. If the transport runs at `base`
 * quarter notes per minute, that same beat is worth `base / bpm(beat)`
 * transport quarters. Baking the ratio into every scheduled position means
 * tempo changes need no automation curve, the loop stays sample accurate, and
 * the user's tempo slider still scales the whole piece uniformly.
 */
export interface Warp {
  /** Transport tempo the warp was built against. */
  base: number
  toUnits(beat: number): number
  toBeat(units: number): number
}

export function buildWarp(plan: TempoPlan, base: number): Warp {
  const changes = [...plan].sort((a, b) => a.beat - b.beat)
  const safeBase = Math.max(1, base)

  // Breakpoints, each carrying the tempo that starts there and where it lands.
  const points: { beat: number; units: number; bpm: number }[] = []
  let units = 0
  let previousBeat = 0
  let bpm = bpmAt(changes, 0, safeBase)
  for (const entry of changes) {
    if (entry.beat <= previousBeat + 1e-9) {
      bpm = entry.bpm
      if (points.length === 0) points.push({ beat: 0, units: 0, bpm })
      continue
    }
    units += ((entry.beat - previousBeat) * safeBase) / bpm
    points.push({ beat: entry.beat, units, bpm: entry.bpm })
    previousBeat = entry.beat
    bpm = entry.bpm
  }
  const head = points[0]?.beat === 0 ? points[0] : { beat: 0, units: 0, bpm }

  const atBeat = (beat: number) => {
    let found = head
    for (const point of points) {
      if (point.beat > beat + 1e-9) break
      found = point
    }
    return found
  }
  const atUnits = (target: number) => {
    let found = head
    for (const point of points) {
      if (point.units > target + 1e-9) break
      found = point
    }
    return found
  }

  return {
    base: safeBase,
    toUnits(beat: number): number {
      const segment = atBeat(beat)
      return segment.units + ((beat - segment.beat) * safeBase) / segment.bpm
    },
    toBeat(target: number): number {
      const segment = atUnits(target)
      return segment.beat + ((target - segment.units) * segment.bpm) / safeBase
    },
  }
}
