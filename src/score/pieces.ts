import lightSteps from './musicxml/light-steps.musicxml?raw'
import sundayChords from './musicxml/sunday-chords.musicxml?raw'
import twinkle from './musicxml/twinkle.musicxml?raw'

export interface BundledPiece {
  id: string
  title: string
  blurb: string
  xml: string
}

export const BUNDLED_PIECES: BundledPiece[] = [
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle',
    blurb: 'Right hand',
    xml: twinkle,
  },
  {
    id: 'light-steps',
    title: 'Light Steps',
    blurb: 'Both hands',
    xml: lightSteps,
  },
  {
    id: 'sunday-chords',
    title: 'Sunday Chords',
    blurb: 'Chords',
    xml: sundayChords,
  },
]
