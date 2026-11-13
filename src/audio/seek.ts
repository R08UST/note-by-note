/** A demo already running, described by the beats it will play through. */
export interface PlaybackSpan {
  startBeat: number
  endBeat: number
  loop: boolean
}

/**
 * Where the demo should run if the player jumps to `beat`.
 *
 * A click inside the loop selection keeps looping, now from the clicked beat to the
 * same loop end. A click outside it, or any click while looping is off, drops the
 * loop and plays on to the end of the piece: the player asked for that spot, not for
 * the selection it happened to sit in.
 */
export function seekPlayback(span: PlaybackSpan, beat: number, lastBeat: number): PlaybackSpan {
  const end = Math.max(span.endBeat, lastBeat)
  const target = Math.min(Math.max(beat, 0), end)
  const insideLoop =
    span.loop && target <= span.endBeat + 1e-3 && target >= span.startBeat - 1e-3
  if (insideLoop) return { startBeat: target, endBeat: span.endBeat, loop: true }
  return { startBeat: target, endBeat: Math.max(end, target), loop: false }
}
