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

/**
 * The audio-context time of the sound leaving the speakers at `nowMs`. Tone's
 * `Transport.seconds` reads `lookAhead` (0.1 s) ahead of the audio, and output
 * latency adds more, so a key played on the heard click used to score 100–150 ms
 * late. `getOutputTimestamp` pairs a context time with the moment it is heard;
 * without one, the context's reported output latency is the best guess.
 */
export function heardContextTime(args: {
  stamp: { contextTime?: number; performanceTime?: number } | undefined
  nowMs: number
  currentTime: number
  outputLatency: number
}): number {
  const { stamp } = args
  if (stamp?.contextTime != null && stamp.performanceTime != null && stamp.performanceTime > 0) {
    return stamp.contextTime + (args.nowMs - stamp.performanceTime) / 1000
  }
  return args.currentTime - args.outputLatency
}
