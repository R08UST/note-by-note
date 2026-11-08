/**
 * Map a MIDI / keyboard timestamp onto the Tone.js transport clock.
 * `eventPerformanceMs` is the event's own DOMHighResTimeStamp. The transport
 * position is read when the handler runs (`performanceNowMs`), and the
 * difference puts the event back where it actually happened.
 */
export function mapPerformanceToTransportMs(args: {
  eventPerformanceMs: number
  performanceNowMs: number
  transportSeconds: number
}): number {
  const lagMs = args.performanceNowMs - args.eventPerformanceMs
  return args.transportSeconds * 1000 - lagMs
}

/** Transport time with the count-in removed, so beat 0 of the score is 0ms. */
export function toScoreTimeMs(transportMs: number, countInQuarterBeats: number, bpm: number): number {
  return transportMs - countInQuarterBeats * (60_000 / bpm)
}

/** How far the score clock lags the window close, so a late callback can still match. */
export const MISS_CUSHION_MS = 50
