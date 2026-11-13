#!/usr/bin/env node
/**
 * Build the velocity-layered piano samples from the Salamander Grand Piano V3 Ogg
 * Vorbis archive.
 *
 * The app ships three dynamic layers so soft playing sounds soft — duller, rounder,
 * less hammer — instead of merely quieter. Within one pitch the three layers are
 * brought to the same RMS, so at runtime the velocity curve alone decides loudness and
 * the layer decides timbre. The pitch-to-pitch balance of the middle layer is left
 * alone, so the keyboard keeps the piano's natural roll-off from bass to treble.
 *
 * Usage: node scripts/build-piano-layers.mjs <extracted-ogg-dir> [--out public/samples/piano]
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SAMPLE_NOTES, sampleFile } from '../src/audio/layers.ts'

/** Pitches the runtime interpolates from, read from the module that defines them. */
const NOTES = SAMPLE_NOTES

/** The three strikes that become layers, on Salamander's 1-16 scale. */
const LAYERS = [
  { id: 'soft', source: 4 },
  { id: 'mid', source: 10 },
  { id: 'hard', source: 15 },
]
/** The layer whose natural level is the reference the others are matched to. */
const REFERENCE_LAYER = 'mid'

/** Never lift a soft strike by more than this, or its noise floor rises with it. */
const MAX_BOOST_DB = 12
/** Never let a sample peak above this, so a full chord keeps headroom. */
const PEAK_CEILING_DB = -1
/** Bitrate per sample. 80k Vorbis is transparent enough for a piano at this length. */
const BITRATE = '80k'

/**
 * How long each sample is kept. Bass strings ring longest, but past a few seconds the
 * tail is masked by the rest of the music, and every extra second costs decoded memory
 * in the browser.
 */
function keepSeconds(note) {
  const octave = Number(note.replace(/[A-G]#?/, ''))
  if (octave <= 1) return 7
  if (octave <= 2) return 6
  if (octave <= 4) return 5
  return 3.5
}

/**
 * RMS and peak of the first stretch of a file, in dBFS. volumedetect reports on stderr
 * and ffmpeg exits 0 even when it prints a warning, so stderr is read directly.
 */
function measure(file, seconds) {
  const run = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', file, '-t', String(seconds), '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' },
  )
  const text = String(run.stderr ?? '')
  const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(text)?.[1])
  const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(text)?.[1])
  if (!Number.isFinite(mean) || !Number.isFinite(peak)) throw new Error(`cannot measure ${file}`)
  return { mean, peak }
}

function encode(input, target, keep, gainDb) {
  const fadeStart = Math.max(0, keep - 1)
  execFileSync('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y',
    '-i', input,
    '-t', String(keep),
    '-af', `volume=${gainDb.toFixed(2)}dB,afade=t=out:st=${fadeStart.toFixed(2)}:d=1`,
    '-c:a', 'libvorbis', '-b:a', BITRATE,
    target,
  ])
}

function main() {
  const source = process.argv[2]
  if (!source) throw new Error('usage: build-piano-layers.mjs <extracted-ogg-dir> [--out dir]')
  const outIndex = process.argv.indexOf('--out')
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : 'public/samples/piano'

  for (const layer of LAYERS) mkdirSync(join(out, layer.id), { recursive: true })

  let bytes = 0
  let seconds = 0
  const skipped = []
  const referenceSource = LAYERS.find((layer) => layer.id === REFERENCE_LAYER).source
  for (const note of NOTES) {
    const keep = keepSeconds(note)
    const window = Math.min(2, keep)
    // The middle layer keeps its natural level; it is what the ear expects of this key.
    const reference = measure(join(source, `${note}v${referenceSource}.ogg`), window)
    for (const layer of LAYERS) {
      const input = join(source, `${note}v${layer.source}.ogg`)
      const { mean, peak } = measure(input, window)
      let gain = reference.mean - mean
      // A boost that would clip is traded for a lower peak; the sample stays usable.
      if (gain > MAX_BOOST_DB) {
        skipped.push(`${note}/${layer.id} wanted +${gain.toFixed(1)}dB, capped at +${MAX_BOOST_DB}`)
        gain = MAX_BOOST_DB
      }
      gain = Math.min(gain, PEAK_CEILING_DB - peak)
      const target = join(out, layer.id, `${sampleFile(note)}.ogg`)
      encode(input, target, keep, gain)
      bytes += statSync(target).size
      seconds += keep
    }
  }

  if (skipped.length > 0) console.log(`capped:\n  ${skipped.join('\n  ')}`)
  console.log(`${LAYERS.length} layers x ${NOTES.length} notes = ${LAYERS.length * NOTES.length} files`)
  console.log(`ogg ${(bytes / 1048576).toFixed(1)} MB`)
  console.log(`decoded ${((seconds * 48000 * 2 * 4) / 1048576).toFixed(0)} MB`)
}

main()
