import type { Hand } from '../judge/types'
import { materialize, type WrittenNote, type WrittenScore } from './musicXml'

/** Early-grade scales and chords. Each level cites the syllabus line it follows. */

export type TechKind = 'scale' | 'chord'

export interface TechLevel {
  id: number
  title: string
  detail: string
  source: string
  items: TechBuilt[]
}

export interface TechBuilt {
  id: string
  title: string
  xml: string
  notes: ReturnType<typeof materialize>['notes']
  time: { beats: number; beatType: number }
  low: number
  high: number
}

type Mode = 'major' | 'natural' | 'harmonic'
type Hands = 'R' | 'L' | 'both'

const STEPS: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const TIME = { beats: 4, beatType: 4 }

interface KeyDef {
  name: string
  fifths: number
  tonic: number
  letter: number
  mode: Mode
  /** Right-hand fingering uses the F-major thumb turn. */
  fRh?: boolean
}

const C: KeyDef = { name: 'C 大调', fifths: 0, tonic: 60, letter: 0, mode: 'major' }
const G: KeyDef = { name: 'G 大调', fifths: 1, tonic: 67, letter: 4, mode: 'major' }
const D: KeyDef = { name: 'D 大调', fifths: 2, tonic: 62, letter: 1, mode: 'major' }
const F: KeyDef = { name: 'F 大调', fifths: -1, tonic: 65, letter: 3, mode: 'major', fRh: true }
const A: KeyDef = { name: 'a 小调', fifths: 0, tonic: 69, letter: 5, mode: 'natural' }
const Ah: KeyDef = { name: 'a 和声小调', fifths: 0, tonic: 69, letter: 5, mode: 'harmonic' }
const Dm: KeyDef = { name: 'd 小调', fifths: -1, tonic: 62, letter: 1, mode: 'natural' }
const Dh: KeyDef = { name: 'd 和声小调', fifths: -1, tonic: 62, letter: 1, mode: 'harmonic' }
const Eh: KeyDef = { name: 'e 和声小调', fifths: 1, tonic: 64, letter: 2, mode: 'harmonic' }
const Gm: KeyDef = { name: 'g 和声小调', fifths: -2, tonic: 67, letter: 4, mode: 'harmonic' }

function semi(mode: Mode, degree: number): number {
  const oct = Math.floor(degree / 7)
  return oct * 12 + (STEPS[mode][degree % 7] ?? 0)
}

function spellLetter(letter: number, midi: number): { step: string; alter: number } {
  const step = LETTERS[((letter % 7) + 7) % 7] ?? 'C'
  const octave = Math.floor(midi / 12) - 1
  const natural = (octave + 1) * 12 + (NATURAL[step] ?? 0)
  return { step, alter: midi - natural }
}

/** Semitones down the scale, so contrary motion really descends C B A, not C Bb Ab. */
function downSemi(mode: Mode, degree: number): number {
  const oct = Math.floor(degree / 7)
  const step = degree % 7
  if (step === 0) return oct * 12
  return oct * 12 + (12 - semi(mode, 7 - step))
}

function chromaticSpelling(midi: number, sharp: boolean): { step: string; alter: number } {
  const pc = ((midi % 12) + 12) % 12
  const sharpName = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'][pc] ?? 'C'
  const flatName = ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B'][pc] ?? 'C'
  const step = sharp ? sharpName : flatName
  const octave = Math.floor(midi / 12) - 1
  const natural = (octave + 1) * 12 + (NATURAL[step] ?? 0)
  return { step, alter: midi - natural }
}

interface Hit {
  pitch: number | null
  hand: Hand
  finger?: number
  at: number
  /** Letter index of this note, or null for a rest. */
  letter: number | null
  key: KeyDef
  /** Chromatic notes carry their own spelling. */
  spelling?: { step: string; alter: number }
}

function fingers(hand: Hand, octaves: 1 | 2, fRh: boolean): { up: number[]; down: number[] } {
  if (hand === 'R' && fRh) {
    return octaves === 1
      ? { up: [1, 2, 3, 4, 1, 2, 3, 4], down: [3, 2, 1, 4, 3, 2, 1] }
      : { up: [1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 4], down: [3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1] }
  }
  if (hand === 'R') {
    return octaves === 1
      ? { up: [1, 2, 3, 1, 2, 3, 4, 5], down: [4, 3, 2, 1, 3, 2, 1] }
      : { up: [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5], down: [4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1] }
  }
  return octaves === 1
    ? { up: [5, 4, 3, 2, 1, 3, 2, 1], down: [2, 3, 1, 2, 3, 4, 5] }
    : { up: [5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1], down: [2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5] }
}

function scaleHits(key: KeyDef, octaves: 1 | 2, hands: Hands, tonic: number): Hit[] {
  const count = octaves * 7
  const hits: Hit[] = []
  const handsToWrite: Hand[] = hands === 'both' ? ['R', 'L'] : [hands]
  let at = 0
  const push = (degree: number, goingUp: boolean, fingerIndex: number) => {
    for (const hand of handsToWrite) {
      const table = fingers(hand, octaves, Boolean(key.fRh))
      const finger = (goingUp ? table.up : table.down)[fingerIndex] ?? 1
      const base = hand === 'L' ? tonic - 12 : tonic
      const pitch = base + semi(key.mode, degree)
      hits.push({ pitch, hand, finger, at, letter: key.letter + degree, key })
    }
    at += 1
  }
  for (let degree = 0; degree <= count; degree += 1) push(degree, true, degree)
  for (let degree = count - 1; degree >= 0; degree -= 1) push(degree, false, count - 1 - degree)
  return hits
}

function contraryHits(tonic: number, octaves: 1 | 2): Hit[] {
  const key = C
  const count = octaves * 7
  const table = fingers('R', octaves, false)
  const hits: Hit[] = []
  let at = 0
  const add = (degree: number, outward: boolean, fingerIndex: number) => {
    const finger = (outward ? table.up : table.down)[fingerIndex] ?? 1
    const rh = tonic + semi('major', degree)
    const lh = tonic - downSemi('major', degree)
    hits.push({ pitch: rh, hand: 'R', finger, at, letter: key.letter + degree, key })
    if (rh === lh) hits.push({ pitch: null, hand: 'L', at, letter: null, key })
    else hits.push({ pitch: lh, hand: 'L', finger, at, letter: (key.letter - degree % 7 + 70) % 7, key })
    at += 1
  }
  for (let degree = 0; degree <= count; degree += 1) add(degree, true, degree)
  for (let degree = count - 1; degree >= 0; degree -= 1) add(degree, false, count - 1 - degree)
  return hits
}

function chromaticFingers(start: number, steps: number): number[] {
  const fingers: number[] = []
  let prev: { white: boolean; finger: number } | null = null
  for (let index = 0; index < steps; index += 1) {
    const midi = start + index
    const white = ![1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)
    let finger = 1
    if (!white) finger = 3
    else if (prev?.white && prev.finger === 1) finger = 2
    fingers.push(finger)
    prev = { white, finger }
  }
  return fingers
}

function chromaticHits(start: number, hand: Hand): Hit[] {
  const up = chromaticFingers(start, 13)
  const hits: Hit[] = []
  const key = D
  up.forEach((finger, index) => {
    const pitch = start + index
    hits.push({ pitch, hand, finger, at: index, letter: null, key, spelling: chromaticSpelling(pitch, true) })
  })
  for (let index = 11; index >= 0; index -= 1) {
    const pitch = start + index
    hits.push({ pitch, hand, finger: up[index] ?? 1, at: 13 + (11 - index), letter: null, key, spelling: chromaticSpelling(pitch, false) })
  }
  return hits
}

function arpeggioHits(key: KeyDef, octaves: 1 | 2, hand: Hand, harmonic = false): Hit[] {
  const mode: Mode = key.mode === 'major' ? 'major' : harmonic || key.mode === 'harmonic' ? 'harmonic' : 'natural'
  const degrees = octaves === 1 ? [0, 2, 4, 7] : [0, 2, 4, 7, 9, 11, 14]
  const rh = octaves === 1 ? { up: [1, 2, 3, 1], down: [3, 2, 1] } : { up: [1, 2, 3, 1, 2, 3, 5], down: [3, 2, 1, 3, 2, 1] }
  const lh = octaves === 1 ? { up: [5, 4, 2, 1], down: [2, 4, 5] } : { up: [5, 4, 2, 1, 4, 2, 1], down: [2, 4, 1, 2, 4, 5] }
  const table = hand === 'R' ? rh : lh
  const base = hand === 'L' ? key.tonic - 12 : key.tonic
  const use: KeyDef = { ...key, mode }
  const hits: Hit[] = []
  let at = 0
  degrees.forEach((degree, index) => {
    hits.push({ pitch: base + semi(mode, degree), hand, finger: table.up[index] ?? 1, at, letter: use.letter + degree, key: use })
    at += 1
  })
  for (let index = degrees.length - 2; index >= 0; index -= 1) {
    const degree = degrees[index] ?? 0
    hits.push({ pitch: base + semi(mode, degree), hand, finger: table.down[degrees.length - 2 - index] ?? 1, at, letter: use.letter + degree, key: use })
    at += 1
  }
  return hits
}

function brokenFifth(key: KeyDef, hand: Hand): Hit[] {
  const mode: Mode = key.mode === 'major' ? 'major' : 'natural'
  const degrees = [0, 2, 4, 2, 0]
  const pattern = hand === 'R' ? [1, 2, 3, 2, 1] : [5, 3, 1, 3, 5]
  const base = hand === 'L' ? key.tonic - 12 : key.tonic
  return degrees.map((degree, index) => ({
    pitch: base + semi(mode, degree),
    hand,
    finger: pattern[index] ?? 1,
    at: index,
    letter: key.letter + degree,
    key: { ...key, mode },
  }))
}

function voiced(root: number, inversion: 0 | 1 | 2): number[] {
  const tones = [root, root + 4, root + 7]
  const turned = [0, 1, 2].map((index) => tones[(index + inversion) % 3] ?? root)
  const bass = turned[0] ?? root
  return turned.map((tone) => (tone < bass ? tone + 12 : tone))
}

function chordHits(groups: number[][], hand: Hand, key: KeyDef): Hit[] {
  const hits: Hit[] = []
  groups.forEach((group, at) => {
    const sorted = [...group].sort((a, b) => a - b)
    const pattern = hand === 'R' ? [1, 3, 5] : [5, 3, 1]
    sorted.forEach((pitch, index) => {
      hits.push({ pitch, hand, finger: pattern[index] ?? 1, at, letter: null, key, spelling: chromaticSpelling(pitch, true) })
    })
  })
  return hits
}

const CADENCE: Record<string, number[][]> = {
  C: [
    [60, 64, 67],
    [60, 65, 69],
    [59, 62, 67],
    [60, 64, 67],
  ],
  G: [
    [67, 71, 74],
    [67, 72, 76],
    [66, 69, 74],
    [67, 71, 74],
  ],
  F: [
    [65, 69, 72],
    [65, 70, 74],
    [64, 67, 72],
    [65, 69, 72],
  ],
}

function toScore(title: string, fifths: number, hits: Hit[], clef: WrittenScore['clef']): TechBuilt {
  const staves: 1 | 2 = clef === 'grand' ? 2 : 1
  const notes: WrittenNote[] = hits.map((hit) => ({
    pitch: hit.pitch,
    ticks: 12,
    hand: hit.hand,
    measure: Math.floor(hit.at / 4) + 1,
    chord: false,
    finger: hit.finger,
    spelling: hit.pitch == null ? undefined : hit.spelling ?? (hit.letter == null ? undefined : spellLetter(hit.letter, hit.pitch)),
  }))
  const byAt = new Map<string, number>()
  for (const note of notes) {
    const at = hits[notes.indexOf(note)]?.at ?? 0
    const slot = `${note.hand}:${at}`
    const seen = byAt.get(slot) ?? 0
    if (seen > 0) note.chord = true
    byAt.set(slot, seen + 1)
  }
  const score: WrittenScore = { title, fifths, time: TIME, staves, clef, notes }
  const made = materialize(score)
  const pitches = made.notes.map((note) => note.pitch)
  if (pitches.length === 0) pitches.push(60)
  return {
    id: title,
    title,
    xml: made.xml,
    notes: made.notes,
    time: TIME,
    low: Math.min(...pitches),
    high: Math.max(...pitches),
  }
}

function scaleItem(key: KeyDef, octaves: 1 | 2, hands: Hands, tonic = key.tonic): TechBuilt {
  const handLabel = hands === 'R' ? '右手' : hands === 'L' ? '左手' : '双手'
  const title = `${key.name} · ${handLabel} · ${octaves} 个八度`
  const hits = scaleHits(key, octaves, hands, tonic)
  const clef = hands === 'both' ? 'grand' : hands === 'L' ? 'bass' : 'treble'
  const built = toScore(title, key.fifths, hits, clef)
  built.id = `scale-${key.name}-${hands}-${octaves}-${tonic}`
  return built
}

function buildScales(): TechLevel[] {
  return [
    {
      id: 1,
      title: '大调分手，一个八度',
      detail: 'C、G、D、F 大调。先分手，一个八度，上行再下行。指法印在符头旁，例如 C 大调右手 123-1234。',
      source: 'ABRSM 2017–2018 Grade 1：C、G、D、F 大调，分手一个八度。ABRSM 2021 Initial 仍要求 C 大调分手一个八度。',
      items: [scaleItem(C, 1, 'R'), scaleItem(G, 1, 'R'), scaleItem(D, 1, 'R'), scaleItem(F, 1, 'R'), scaleItem(C, 1, 'L')],
    },
    {
      id: 2,
      title: '大调分手，两个八度',
      detail: '同一个指法组再走一个八度。G、F 在 2021 大纲里就是两个八度。',
      source: 'ABRSM 2021 Grade 1：G、F 大调分手两个八度。D 大调两个八度见 ABRSM 2021 Grade 2 分手。',
      items: [scaleItem(G, 2, 'R'), scaleItem(F, 2, 'R'), scaleItem(D, 2, 'R'), scaleItem(C, 2, 'L')],
    },
    {
      id: 3,
      title: '双手同向',
      detail: '双手相距一个八度，一起上行再下行。C 大调先一个八度，G、F 两个八度。',
      source: 'ABRSM 2021 Grade 1：C 大调合手一个八度。Grade 2：G、F 大调合手两个八度。',
      items: [scaleItem(C, 1, 'both'), scaleItem(G, 2, 'both'), scaleItem(F, 2, 'both')],
    },
    {
      id: 4,
      title: '小调：自然与和声',
      detail: 'a、d、e 小调。自然小调按调号，和声小调升高第 7 级。先分手一个八度。',
      source: 'ABRSM 2021 Initial：d 小调可选自然或和声，分手一个八度。Grade 1：a、d 小调分手两个八度（此处先一个八度）。Grade 2：e 小调。',
      items: [
        scaleItem(A, 1, 'R'),
        scaleItem(Ah, 1, 'R'),
        scaleItem(Dh, 1, 'R'),
        scaleItem(Eh, 1, 'L'),
      ],
    },
    {
      id: 5,
      title: '反向',
      detail: '两手从同一个主音出发，反向走到八度再回来。开头和结尾是一个音。',
      source: 'ABRSM 2021 Grade 1：C 大调反向一个八度，两手从主音同度开始。Grade 2 把同一条放到两个八度。',
      items: [
        { ...contraryItem(60, 1), id: 'scale-contrary-1-c4' },
        { ...contraryItem(72, 1), id: 'scale-contrary-1-c5' },
        { ...contraryItem(60, 2), id: 'scale-contrary-2-c4' },
      ],
    },
    {
      id: 6,
      title: '半音阶',
      detail: '从 D 开始，分手一个八度。白键用 1，黑键用 3，连续两个白键时第二个用 2。',
      source: 'ABRSM 2021 Grade 2：半音阶从 D 开始，分手一个八度。指法按大纲允许的常规 1–3 指法。',
      items: [chromaticItem(62, 'R'), chromaticItem(50, 'L'), chromaticItem(74, 'R')],
    },
  ]
}

function contraryItem(tonic: number, octaves: 1 | 2): TechBuilt {
  const title = `C 大调反向 · ${octaves} 个八度`
  const built = toScore(title, 0, contraryHits(tonic, octaves), 'grand')
  built.id = `scale-contrary-${octaves}-${tonic}`
  return built
}

function chromaticItem(start: number, hand: Hand): TechBuilt {
  const title = `半音阶从 D · ${hand === 'R' ? '右手' : '左手'}`
  const built = toScore(title, 0, chromaticHits(start, hand), hand === 'L' ? 'bass' : 'treble')
  built.id = `scale-chrom-${hand}-${start}`
  return built
}

function oneChord(name: string, fifths: number, pitches: number[], hand: Hand, key: KeyDef): TechBuilt {
  const title = `${name} · ${hand === 'R' ? '右手' : '左手'}`
  const built = toScore(title, fifths, chordHits([pitches], hand, key), hand === 'L' ? 'bass' : 'treble')
  built.id = `chord-${name}-${hand}`
  return built
}

function buildChords(): TechLevel[] {
  const root = (key: KeyDef, hand: Hand) => oneChord(`${key.name} 原位`, key.fifths, voiced(hand === 'L' ? key.tonic - 12 : key.tonic, 0), hand, key)
  return [
    {
      id: 1,
      title: '原位三和弦',
      detail: 'C、G、F 大调的 I 级。三个音一起下键，指法 1-3-5。',
      source: 'RCM Piano Syllabus 2015 Level 1：音阶各调的原位三和弦，分手。调与 ABRSM 2017–2018 Grade 1 的大调一致。',
      items: [root(C, 'R'), root(G, 'R'), root(F, 'R'), root(C, 'L')],
    },
    {
      id: 2,
      title: 'I、IV、V',
      detail: '每个调弹三个原位三和弦：主、下属、属。仍是同时发响。',
      source: 'RCM 2015 Level 1：主、下属、属三和弦。这里按正三和弦的顺序连起来。',
      items: [progression('C 大调 I–IV–V', 0, C, [[60, 64, 67], [65, 69, 72], [67, 71, 74]]), progression('G 大调 I–IV–V', 1, G, [[67, 71, 74], [72, 76, 79], [62, 66, 69]]), progression('F 大调 I–IV–V', -1, F, [[65, 69, 72], [70, 74, 77], [60, 64, 67]])],
    },
    {
      id: 3,
      title: '五度内的分解和弦',
      detail: '主音、三音、五音，再回到主音。C 大调和 d 小调，分手。',
      source: 'ABRSM 2021 Initial Grade：C 大调、d 小调分解和弦，范围一个五度，分手。',
      items: [lineItem('C 大调分解', 0, brokenFifth(C, 'R'), 'treble', 'chord-broken-C-R'), lineItem('d 小调分解', -1, brokenFifth(Dm, 'R'), 'treble', 'chord-broken-d-R'), lineItem('C 大调分解左手', 0, brokenFifth(C, 'L'), 'bass', 'chord-broken-C-L')],
    },
    {
      id: 4,
      title: '转位',
      detail: '主和弦的原位、第一转位、第二转位，各弹一次。',
      source: 'RCM 2015 Level 2：在一级原位之后加入主和弦转位。',
      items: [
        progression('C 大调转位', 0, C, [voiced(60, 0), voiced(60, 1), voiced(60, 2)]),
        progression('G 大调转位', 1, G, [voiced(67, 0), voiced(67, 1), voiced(67, 2)]),
        progression('F 大调转位', -1, F, [voiced(65, 0), voiced(65, 1), voiced(65, 2)]),
      ],
    },
    {
      id: 5,
      title: '琶音，一个八度',
      detail: 'G 大调、a 小调。上行到八度再下来，分手。',
      source: 'ABRSM 2021 Grade 1：G 大调、a 小调琶音，一个八度，分手。',
      items: [
        lineItem('G 大调琶音右手', 1, arpeggioHits(G, 1, 'R'), 'treble', 'chord-arp-G-R-1'),
        lineItem('a 小调琶音右手', 0, arpeggioHits(A, 1, 'R'), 'treble', 'chord-arp-a-R-1'),
        lineItem('G 大调琶音左手', 1, arpeggioHits(G, 1, 'L'), 'bass', 'chord-arp-G-L-1'),
      ],
    },
    {
      id: 6,
      title: '琶音，两个八度',
      detail: 'D、A 大调，e、g 小调。分手两个八度。',
      source: 'ABRSM 2021 Grade 2：D、A 大调与 e、g 小调琶音，两个八度，分手。',
      items: [
        lineItem('D 大调琶音', 2, arpeggioHits(D, 2, 'R'), 'treble', 'chord-arp-D-R-2'),
        lineItem('A 大调琶音', 3, arpeggioHits({ ...C, fifths: 3, tonic: 69, letter: 5, mode: 'major', name: 'A 大调' }, 2, 'R'), 'treble', 'chord-arp-A-R-2'),
        lineItem('e 小调琶音', 1, arpeggioHits(Eh, 2, 'R', true), 'treble', 'chord-arp-e-R-2'),
        lineItem('g 小调琶音', -2, arpeggioHits(Gm, 2, 'L', true), 'bass', 'chord-arp-g-L-2'),
      ],
    },
    {
      id: 7,
      title: '终止式 I–IV–V–I',
      detail: '四个和弦各占一拍。听低音是不是主、下属、属、主。',
      source: 'RCM 2015 Level 2 要求 I–IV–I 与 I–V–I。这里连成 I–IV–V–I，调用的是 Grade 1 的 C、G、F 大调。',
      items: [
        progression('C 大调终止式', 0, C, CADENCE.C ?? []),
        progression('G 大调终止式', 1, G, CADENCE.G ?? []),
        progression('F 大调终止式', -1, F, CADENCE.F ?? []),
      ],
    },
  ]
}

function progression(title: string, fifths: number, key: KeyDef, groups: number[][]): TechBuilt {
  const built = toScore(title, fifths, chordHits(groups, 'R', key), 'treble')
  built.id = `chord-${title}`
  return built
}

function lineItem(title: string, fifths: number, hits: Hit[], clef: WrittenScore['clef'], id: string): TechBuilt {
  const built = toScore(title, fifths, hits, clef)
  built.id = id
  return built
}

export const SCALE_LEVELS: TechLevel[] = buildScales()
export const CHORD_LEVELS: TechLevel[] = buildChords()

export function techLevels(kind: TechKind): TechLevel[] {
  return kind === 'scale' ? SCALE_LEVELS : CHORD_LEVELS
}

/** Pitches and fingers of one scale, for tests. */
export function scaleShape(keyName: 'C' | 'F', octaves: 1 | 2, hand: Hand): { pitches: number[]; fingers: number[] } {
  const key = keyName === 'C' ? C : F
  const hits = scaleHits(key, octaves, hand, key.tonic).filter((hit) => hit.hand === hand && hit.pitch != null && hit.finger != null)
  return { pitches: hits.map((hit) => hit.pitch as number), fingers: hits.map((hit) => hit.finger as number) }
}
