import type { Hand, ScoreNote } from '../judge/types'

/**
 * Self-paced tempo analysis for free-tempo practice.
 * Infers the player's own beat duration automatically from onset timestamps,
 * separates hesitation stalls (continuity) from local proportional rhythm stability,
 * and respects printed fermatas and breath marks.
 */

export interface FreeTempoMeasure {
  measure: number
  /** Hesitation stalls entering a note in this measure. */
  stalls: number
  /** Local median BPM of smooth intervals ending in this measure. */
  bpm: number | null
  /** Percent slower than the run's own tempo (negative is faster). Null with fewer than two smooth steps. */
  slowPct: number | null
  /** RMS proportional deviation of the smooth steps in this measure, in percent. Null with fewer than two. */
  unevenPct: number | null
  /** Longest hesitation beyond the expected duration, in ms. 0 without a stall. */
  pauseMs: number
  /** 1-based beat within the measure that the longest pause led into. */
  pauseBeat: number | null
  /** Hand of the attack the longest pause led into. Null when both hands strike it or there was no pause. */
  pauseHand: Hand | null
}

export interface FreeTempoReport {
  /** Automatically inferred median tempo in quarter-note BPM. Null when too few intervals exist. */
  bpm: number | null
  /** Middle tempo band (25th–75th percentile of smooth local BPM). */
  bpmRange: { low: number; high: number } | null
  /** Tempo change from first half to second half in BPM. Positive means sped up. */
  driftBpm: number | null
  /** Continuity score in [0, 1]: share of non-expressive transitions without a hesitation stall. */
  fluency: number | null
  /** Rhythm proportion stability in [0, 1] on smooth transitions against the player's local pulse. */
  stability: number | null
  /** Root-mean-square proportional deviation from local pulse, in percent. */
  unevenPct: number | null
  /** Total non-expressive onset intervals evaluated. */
  intervals: number
  /** Count of noticeable hesitation stalls. */
  stalls: number
  /** Longest continuous streak of non-stalled beats. */
  longestFlowBeats: number
  /** Sorted measures where at least one stall occurred. */
  stallMeasures: number[]
  /** Per-measure stall counts and local tempo. */
  perMeasure: FreeTempoMeasure[]
}

/** Minimum number of transitions needed before reporting tempo and stability. */
export const MIN_FREE_INTERVALS = 3
/** Ratio above the player's local pulse that marks a hesitation stall. */
export const STALL_RATIO = 1.55
/** Extra pause beyond the expected beat duration required to count as a stall. */
export const STALL_EXTRA_MS = 250
/** Sliding window radius (on each side) used to track local pulse during rubato. */
const LOCAL_RADIUS = 3
/** Extreme outlier multiple excluded from the local reference window when enough neighbours exist. */
const OUTLIER_RATIO = 2.0

interface PlayedOnset {
  beat: number
  measure: number
  timeMs: number
  hasFermata: boolean
  hasBreath: boolean
  localBeat: number | null
  hand: Hand | null
}

interface Interval {
  measure: number
  localBeat: number | null
  hand: Hand | null
  deltaBeats: number
  deltaMs: number
  msPerBeat: number
  expressivePause: boolean
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null
  const pos = (sorted.length - 1) * p
  const low = Math.floor(pos)
  const high = Math.ceil(pos)
  const a = sorted[low] ?? 0
  const b = sorted[high] ?? a
  return a + (b - a) * (pos - low)
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function collectOnsets(notes: readonly ScoreNote[], hitTimes: ReadonlyMap<string, number>): PlayedOnset[] {
  const required = notes
    .filter((note) => !note.optional && !note.fromGrace && hitTimes.has(note.id))
    .sort((a, b) => a.beat - b.beat || a.measure - b.measure || a.pitch - b.pitch || a.id.localeCompare(b.id))

  const groups: ScoreNote[][] = []
  for (const note of required) {
    const last = groups[groups.length - 1]
    if (!last || Math.abs(note.beat - last[0].beat) > 1e-3 || note.measure !== last[0].measure) groups.push([note])
    else last.push(note)
  }

  const onsets: PlayedOnset[] = []
  for (const group of groups) {
    const times = group
      .map((note) => hitTimes.get(note.id))
      .filter((time): time is number => typeof time === 'number')
    const timeMs = median(times)
    if (timeMs == null) continue
    onsets.push({
      beat: group[0].beat,
      measure: group[0].measure,
      timeMs,
      hasFermata: group.some((note) => Boolean(note.fermata)),
      hasBreath: group.some((note) => Boolean(note.breath)),
      localBeat: group[0].localBeat ?? null,
      hand: group.every((note) => note.hand === group[0].hand) ? group[0].hand : null,
    })
  }
  return onsets
}

function buildIntervals(onsets: readonly PlayedOnset[]): Interval[] {
  const intervals: Interval[] = []
  for (let i = 1; i < onsets.length; i += 1) {
    const prev = onsets[i - 1]
    const next = onsets[i]
    const deltaBeats = next.beat - prev.beat
    const deltaMs = next.timeMs - prev.timeMs
    if (deltaBeats <= 1e-3 || deltaMs <= 0) continue
    intervals.push({
      measure: next.measure,
      localBeat: next.localBeat,
      hand: next.hand,
      deltaBeats,
      deltaMs,
      msPerBeat: deltaMs / deltaBeats,
      expressivePause: prev.hasFermata || prev.hasBreath,
    })
  }
  return intervals
}

function trimmedMean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const trim = sorted.length >= 4 ? Math.floor(sorted.length / 4) : 0
  const slice = sorted.slice(trim, sorted.length - trim)
  if (slice.length === 0) return median(sorted)
  return slice.reduce((sum, value) => sum + value, 0) / slice.length
}

/**
 * Local reference beat duration at index `i`, resisting isolated stalls while still
 * following genuine gradual tempo shifts and staying centered under rhythmic jitter.
 */
function localPulse(core: readonly Interval[], index: number, globalMed: number): number {
  const start = Math.max(0, index - LOCAL_RADIUS)
  const end = Math.min(core.length - 1, index + LOCAL_RADIUS)
  const all: number[] = []
  const filtered: number[] = []
  for (let j = start; j <= end; j += 1) {
    const value = core[j].msPerBeat
    all.push(value)
    if (value <= globalMed * OUTLIER_RATIO) filtered.push(value)
  }
  const source = filtered.length >= 2 ? filtered : all
  return trimmedMean(source) ?? globalMed
}

/** Estimate the player's current spontaneous BPM from the most recent played onsets. */
export function estimateRecentBpm(
  notes: readonly ScoreNote[],
  hitTimes: ReadonlyMap<string, number>,
  window = 8,
): number | null {
  const onsets = collectOnsets(notes, hitTimes)
  const intervals = buildIntervals(onsets).filter((item) => !item.expressivePause)
  if (intervals.length < MIN_FREE_INTERVALS) return null
  const recent = intervals.slice(-window)
  const med = median(recent.map((item) => item.msPerBeat))
  if (med == null || med <= 0) return null
  return Math.round(60_000 / med)
}

export function analyzeFreeTempo(
  notes: readonly ScoreNote[],
  hitTimes: ReadonlyMap<string, number>,
): FreeTempoReport {
  const measures = [...new Set(notes.filter((n) => !n.optional).map((n) => n.measure))].sort((a, b) => a - b)
  const onsets = collectOnsets(notes, hitTimes)
  const allIntervals = buildIntervals(onsets)
  const core = allIntervals.filter((item) => !item.expressivePause)

  if (core.length < MIN_FREE_INTERVALS) {
    return {
      bpm: null,
      bpmRange: null,
      driftBpm: null,
      fluency: null,
      stability: null,
      unevenPct: null,
      intervals: core.length,
      stalls: 0,
      longestFlowBeats: 0,
      stallMeasures: [],
      perMeasure: measures.map((measure) => ({
        measure,
        stalls: 0,
        bpm: null,
        slowPct: null,
        unevenPct: null,
        pauseMs: 0,
        pauseBeat: null,
        pauseHand: null,
      })),
    }
  }

  const globalMed = median(core.map((item) => item.msPerBeat)) ?? core[0].msPerBeat

  // Evaluate each core interval against its local pulse.
  const evaluated = core.map((item, index) => {
    const ref = localPulse(core, index, globalMed)
    const ratio = item.msPerBeat / ref
    const extraMs = item.deltaMs - ref * item.deltaBeats
    const stalled = ratio >= STALL_RATIO && extraMs >= STALL_EXTRA_MS
    return { ...item, ref, ratio, extraMs, stalled }
  })

  const stalledItems = evaluated.filter((item) => item.stalled)
  const smooth = evaluated.filter((item) => !item.stalled)
  const stalls = stalledItems.length
  const fluency = clamp((evaluated.length - stalls) / evaluated.length, 0, 1)

  // Longest continuous flow in beats across all intervals (expressive pauses keep the flow going).
  const coreStallSet = new Set<Interval>()
  for (let i = 0; i < evaluated.length; i += 1) {
    if (evaluated[i].stalled) coreStallSet.add(core[i])
  }
  let longestFlowBeats = 0
  let currentFlow = 0
  for (const item of allIntervals) {
    if (coreStallSet.has(item)) {
      currentFlow = 0
    } else {
      currentFlow += item.deltaBeats
      if (currentFlow > longestFlowBeats) longestFlowBeats = currentFlow
    }
  }

  // Self-paced BPM from smooth intervals (falls back to global median if almost everything stalled).
  const bpmSource = smooth.length >= MIN_FREE_INTERVALS ? smooth : evaluated
  const medianMs = median(bpmSource.map((item) => item.msPerBeat)) ?? globalMed
  const bpm = Math.round(60_000 / medianMs)

  // Middle tempo band (25th–75th percentile of local BPM on smooth steps).
  let bpmRange: { low: number; high: number } | null = null
  if (smooth.length >= MIN_FREE_INTERVALS) {
    const localBpms = smooth.map((item) => 60_000 / item.ref).sort((a, b) => a - b)
    const low = percentile(localBpms, 0.25)
    const high = percentile(localBpms, 0.75)
    if (low != null && high != null) {
      bpmRange = { low: Math.round(low), high: Math.round(high) }
    }
  }

  // Tempo drift: second half smooth BPM minus first half smooth BPM.
  let driftBpm: number | null = null
  if (smooth.length >= 6) {
    const mid = Math.floor(smooth.length / 2)
    const firstMed = median(smooth.slice(0, mid).map((item) => item.msPerBeat))
    const secondMed = median(smooth.slice(mid).map((item) => item.msPerBeat))
    if (firstMed && secondMed) {
      driftBpm = Math.round(60_000 / secondMed - 60_000 / firstMed)
    }
  }

  // Rhythm proportion stability on smooth transitions using symmetric log-ratio RMS.
  let unevenPct: number | null = null
  let stability: number | null = null
  if (smooth.length >= MIN_FREE_INTERVALS) {
    const sumSq = smooth.reduce((acc, item) => {
      const logRatio = Math.log(item.ratio)
      return acc + logRatio * logRatio
    }, 0)
    const rms = Math.sqrt(sumSq / smooth.length)
    unevenPct = Math.round(rms * 1000) / 10
    stability = clamp(1 - rms * 2, 0, 1)
  }

  // Per-measure summary.
  const byMeasure = new Map<number, typeof evaluated>()
  for (const item of evaluated) {
    const list = byMeasure.get(item.measure) ?? []
    list.push(item)
    byMeasure.set(item.measure, list)
  }
  const perMeasure: FreeTempoMeasure[] = measures.map((measure) => {
    const items = byMeasure.get(measure) ?? []
    const flowing = items.filter((item) => !item.stalled)
    const med = median(flowing.map((item) => item.msPerBeat))
    const measureBpm = med != null && med > 0 ? 60_000 / med : null
    // ponytail: two steps is the noise floor; one step mostly measures how a single note was held.
    const enough = flowing.length >= 2
    const rms = enough
      ? Math.sqrt(flowing.reduce((acc, item) => acc + Math.log(item.ratio) ** 2, 0) / flowing.length)
      : null
    let worst: (typeof items)[number] | null = null
    for (const item of items) if (item.stalled && (!worst || item.extraMs > worst.extraMs)) worst = item
    return {
      measure,
      stalls: items.filter((item) => item.stalled).length,
      bpm: measureBpm != null ? Math.round(measureBpm) : null,
      slowPct: enough && measureBpm != null ? Math.round(((bpm - measureBpm) / bpm) * 100) : null,
      unevenPct: rms != null ? Math.round(rms * 100) : null,
      pauseMs: worst ? Math.round(worst.extraMs) : 0,
      pauseBeat: worst?.localBeat != null ? Math.floor(worst.localBeat + 1e-3) + 1 : null,
      pauseHand: worst?.hand ?? null,
    }
  })
  const stallMeasures = perMeasure.filter((item) => item.stalls > 0).map((item) => item.measure)

  return {
    bpm,
    bpmRange,
    driftBpm,
    fluency,
    stability,
    unevenPct,
    intervals: evaluated.length,
    stalls,
    longestFlowBeats: Math.round(longestFlowBeats * 10) / 10,
    stallMeasures,
    perMeasure,
  }
}

