import type { Hand } from '../judge/types'
import type { TimeSignature } from '../score/parseMusicXml'

/** One sounding or silent event inside a beat-sized cell. A quarter is 12 ticks. */
export interface CellEvent {
  ticks: number
  rest?: boolean
  triplet?: 'start' | 'mid' | 'stop'
  tie?: 'start' | 'stop'
}

export interface RhythmCell {
  id: string
  /** How many ticks the cell occupies. Must start on a beat. */
  span: number
  events: CellEvent[]
}

const event = (ticks: number, extra: Partial<CellEvent> = {}): CellEvent => ({ ticks, ...extra })

/** Solfege-style cells. Names follow solfege/const.py ("4", "8 8", "4.", "12 12 12"). */
export const CELLS: Record<string, RhythmCell> = {
  e: { id: '8', span: 6, events: [event(6)] },
  q: { id: '4', span: 12, events: [event(12)] },
  ee: { id: '8 8', span: 12, events: [event(6), event(6)] },
  rq: { id: 'r4', span: 12, events: [event(12, { rest: true })] },
  h: { id: '2', span: 24, events: [event(24)] },
  rh: { id: 'r2', span: 24, events: [event(24, { rest: true })] },
  w: { id: '1', span: 48, events: [event(48)] },
  dh: { id: '2.', span: 36, events: [event(36)] },
  dq: { id: '4.', span: 18, events: [event(18)] },
  qee: { id: '4. 8', span: 24, events: [event(18), event(6)] },
  eeq: { id: '8 4.', span: 24, events: [event(6), event(18)] },
  eeee: { id: '8 8 8 8', span: 24, events: [event(6), event(6), event(6), event(6)] },
  sync: { id: '8 4 8', span: 24, events: [event(6), event(12), event(6)] },
  tie: { id: '4~4', span: 24, events: [event(12, { tie: 'start' }), event(12, { tie: 'stop' })] },
  ssss: { id: '16 16 16 16', span: 12, events: [event(3), event(3), event(3), event(3)] },
  ess: { id: '8 16 16', span: 12, events: [event(6), event(3), event(3)] },
  sse: { id: '16 16 8', span: 12, events: [event(3), event(3), event(6)] },
  re: { id: 'r8 8', span: 12, events: [event(6, { rest: true }), event(6)] },
  dee: { id: '8. 16', span: 12, events: [event(9), event(3)] },
  ede: { id: '16 8.', span: 12, events: [event(3), event(9)] },
  ses: { id: '16 8 16', span: 12, events: [event(3), event(6), event(3)] },
  trip: {
    id: '12 12 12',
    span: 12,
    events: [event(4, { triplet: 'start' }), event(4, { triplet: 'mid' }), event(4, { triplet: 'stop' })],
  },
  eee: { id: '8 8 8', span: 18, events: [event(6), event(6), event(6)] },
  qe: { id: '4 8', span: 18, events: [event(12), event(6)] },
  eq: { id: '8 4', span: 18, events: [event(6), event(12)] },
}

export interface KeyChoice {
  name: string
  fifths: number
  minor: boolean
}

export interface SightLevel {
  id: number
  title: string
  detail: string
  /** Shown in the UI. Every rule traces to the research report. */
  source: string
  keys: KeyChoice[]
  meters: TimeSignature[]
  bars: number[]
  cells: string[]
  /** Largest melodic interval in semitones. Harris: step, 3rd, 4th, 5th. */
  maxInterval: number
  /** Five-finger span in scale steps. S1 starts at 3 (C–E). */
  span: number
  /** true from ABRSM Grade 2 / RCM Level 3: real hands together. */
  together: boolean
  startBpm: number
  /** Two-note chords and a shift out of five-finger position. */
  chords: boolean
  dynamics: boolean
}

const C: KeyChoice = { name: 'C 大调', fifths: 0, minor: false }
const Dm: KeyChoice = { name: 'd 小调', fifths: -1, minor: true }
const G: KeyChoice = { name: 'G 大调', fifths: 1, minor: false }
const F: KeyChoice = { name: 'F 大调', fifths: -1, minor: false }
const Am: KeyChoice = { name: 'a 小调', fifths: 0, minor: true }
const D: KeyChoice = { name: 'D 大调', fifths: 2, minor: false }
const Em: KeyChoice = { name: 'e 小调', fifths: 1, minor: true }
const Gm: KeyChoice = { name: 'g 小调', fifths: -2, minor: true }
const A: KeyChoice = { name: 'A 大调', fifths: 3, minor: false }
const Bb: KeyChoice = { name: '降 B 大调', fifths: -2, minor: false }
const Eb: KeyChoice = { name: '降 E 大调', fifths: -3, minor: false }
const Bm: KeyChoice = { name: 'b 小调', fifths: 2, minor: true }
const E: KeyChoice = { name: 'E 大调', fifths: 4, minor: false }
const Ab: KeyChoice = { name: '降 A 大调', fifths: -4, minor: false }
const Fsm: KeyChoice = { name: '升 f 小调', fifths: 3, minor: true }
const Cm: KeyChoice = { name: 'c 小调', fifths: -3, minor: true }

export const SIGHT_LEVELS: SightLevel[] = [
  {
    id: 1,
    title: '四分与二分，C 到 E',
    detail: '右手五个音里先只用 C D E，左手同样。只走级进，顺一个方向。',
    source: 'RCM Prep A；Kodály/Gordon 从 ta 起，不用全音符开场；philippotto 三音窗',
    keys: [C],
    meters: [{ beats: 4, beatType: 4 }],
    bars: [2, 4],
    cells: ['q', 'h'],
    maxInterval: 2,
    span: 3,
    together: false,
    startBpm: 60,
    chords: false,
    dynamics: false,
  },
  {
    id: 2,
    title: '全音符、休止与三度',
    detail: '五个音 C–G。加上全音符、四分休止和三度。',
    source: 'Harris《Improve your sight-reading!》预备级第 6 阶段；Kodály 一年级四分休止',
    keys: [C],
    meters: [{ beats: 4, beatType: 4 }, { beats: 2, beatType: 4 }],
    bars: [4],
    cells: ['q', 'h', 'w', 'rq'],
    maxInterval: 4,
    span: 5,
    together: false,
    startBpm: 60,
    chords: false,
    dynamics: false,
  },
  {
    id: 3,
    title: '换把位、四度五度、3/4',
    detail: '左右手交替接旋律。可以到四度和五度，以及附点二分音符。',
    source: 'Harris 预备级第 8–11 阶段；RCM Prep B；ABRSM Grade 1 的附点二分音符',
    keys: [C],
    meters: [{ beats: 4, beatType: 4 }, { beats: 2, beatType: 4 }, { beats: 3, beatType: 4 }],
    bars: [4],
    cells: ['q', 'h', 'dh', 'rq', 'rh'],
    maxInterval: 7,
    span: 5,
    together: false,
    startBpm: 60,
    chords: false,
    dynamics: false,
  },
  {
    id: 4,
    title: '五指位置，八分音符一对',
    detail: '主音到属音的五指位置。C 大调或 d 小调。4/4 四小节，或 2/4 六小节。',
    source: 'ABRSM Initial',
    keys: [C, Dm],
    meters: [{ beats: 4, beatType: 4 }, { beats: 2, beatType: 4 }],
    bars: [4, 6],
    cells: ['q', 'h', 'ee'],
    maxInterval: 7,
    span: 5,
    together: false,
    startBpm: 66,
    chords: false,
    dynamics: true,
  },
  {
    id: 5,
    title: '任意五指位置',
    detail: '加上 G、F 大调和 a 小调，3/4，附点二分音符和四连八分。',
    source: 'ABRSM Grade 1；Harris Grade 1 第 1–4 阶段；RCM Level 1 的调',
    keys: [C, G, F, Am, Dm],
    meters: [{ beats: 4, beatType: 4 }, { beats: 3, beatType: 4 }, { beats: 2, beatType: 4 }],
    bars: [4, 6],
    cells: ['q', 'h', 'dh', 'ee', 'eeee', 'rq', 'rh'],
    maxInterval: 7,
    span: 5,
    together: false,
    startBpm: 66,
    chords: false,
    dynamics: true,
  },
  {
    id: 6,
    title: '延音线',
    detail: '仍在五指位置里。延音线可以跨过拍点。',
    source: 'Harris Grade 1 第 5–9 阶段；Trinity Grade 2 的延音线',
    keys: [C, G, F, Am, Dm],
    meters: [{ beats: 4, beatType: 4 }, { beats: 3, beatType: 4 }, { beats: 2, beatType: 4 }],
    bars: [6, 8],
    cells: ['q', 'h', 'ee', 'tie', 'rq'],
    maxInterval: 7,
    span: 5,
    together: false,
    startBpm: 72,
    chords: false,
    dynamics: true,
  },
  {
    id: 7,
    title: '双手一起',
    detail: '左手先长音或五度，右手旋律。可以出现附点四分音符。',
    source: 'ABRSM Grade 2；RCM Level 3；ftrain 的六度',
    keys: [C, G, F, D, Am, Dm, Em, Gm],
    meters: [{ beats: 4, beatType: 4 }, { beats: 3, beatType: 4 }],
    bars: [8],
    cells: ['q', 'h', 'w', 'ee', 'qee'],
    maxInterval: 9,
    span: 5,
    together: true,
    startBpm: 72,
    chords: false,
    dynamics: true,
  },
  {
    id: 8,
    title: '离开五指位置',
    detail: '一句里挪一次位置。简单十六分音符和二音和弦。',
    source: 'ABRSM Grade 3；Harris Grade 3 第 1–2 阶段；LenMus 的加线',
    keys: [C, G, F, D, A, Bb, Eb, Am, Dm, Em, Bm],
    meters: [{ beats: 4, beatType: 4 }, { beats: 3, beatType: 4 }, { beats: 3, beatType: 8 }],
    bars: [8],
    cells: ['e', 'q', 'ee', 'ssss', 'ess', 'rq', 're'],
    maxInterval: 12,
    span: 8,
    together: true,
    startBpm: 76,
    chords: true,
    dynamics: true,
  },
  {
    id: 9,
    title: '弱起与 6/8',
    detail: '可以有弱起、变化音和保持音。左右手到两条加线。',
    source: 'ABRSM Grade 4；LenMus 读谱第一级最后的音域',
    keys: [C, G, F, D, A, Bb, Eb, Am, Dm, Em, Bm],
    meters: [{ beats: 4, beatType: 4 }, { beats: 6, beatType: 8 }],
    bars: [8],
    cells: ['q', 'ee', 'dq', 'eee', 'qe', 'eq'],
    maxInterval: 12,
    span: 10,
    together: true,
    startBpm: 76,
    chords: true,
    dynamics: true,
  },
  {
    id: 10,
    title: '简单切分',
    detail: '8 到 12 小节。切分，结尾可以慢下来。',
    source: 'ABRSM Grade 5',
    keys: [C, G, F, D, A, E, Bb, Eb, Ab, Am, Dm, Em, Bm, Fsm, Cm],
    meters: [{ beats: 4, beatType: 4 }, { beats: 6, beatType: 8 }, { beats: 3, beatType: 4 }],
    bars: [8, 12],
    cells: ['q', 'ee', 'sync', 'ssss', 'qe'],
    maxInterval: 12,
    span: 10,
    together: true,
    startBpm: 80,
    chords: true,
    dynamics: true,
  },
]

export function sightLevel(id: number): SightLevel {
  const level = SIGHT_LEVELS.find((item) => item.id === id)
  if (!level) throw new Error(`没有视奏级别 S${id}`)
  return level
}

export interface RhythmLevel {
  id: number
  title: string
  detail: string
  source: string
  cells: string[]
  meters: TimeSignature[]
  /** Allow a one-beat pickup before the first full bar. */
  pickup: boolean
  startBpm: number
}

export const RHYTHM_LEVELS: RhythmLevel[] = [
  { id: 1, title: 'ta 与 ti-ti', detail: '四分、两个八分、四分休止。', source: 'Kodály 一年级；GNU Solfege rhythmdict-gen-1；RCM Prep A', cells: ['q', 'ee', 'rq'], meters: [{ beats: 2, beatType: 4 }, { beats: 4, beatType: 4 }], pickup: false, startBpm: 66 },
  { id: 2, title: '二分与全音符', detail: '加上二分、全音符和同样的休止。', source: 'Kodály 二年级；RCM Prep A', cells: ['q', 'h', 'w', 'rh'], meters: [{ beats: 4, beatType: 4 }], pickup: false, startBpm: 60 },
  { id: 3, title: '三拍子', detail: '3/4 的附点二分，以及 6/8 的附点四分和三个八分。', source: 'Gordon 先学二拍与三拍的大拍；Solfege gen-6_8-1；RCM Level 2', cells: ['q', 'dh', 'dq', 'eee', 'qe', 'eq'], meters: [{ beats: 3, beatType: 4 }, { beats: 6, beatType: 8 }], pickup: false, startBpm: 69 },
  { id: 4, title: '切分与延音线', detail: 'ti-ta-ti，以及跨拍的延音线。', source: 'Kodály 二年级 syn-co-pa；ABRSM Grade 2 的延音线', cells: ['q', 'ee', 'sync', 'tie'], meters: [{ beats: 2, beatType: 4 }, { beats: 4, beatType: 4 }], pickup: false, startBpm: 72 },
  { id: 5, title: '附点四分', detail: '附点四分接八分，或八分接附点四分。', source: 'Kodály 四年级 tam-ti；ABRSM Grade 2；RCM Level 3', cells: ['q', 'ee', 'qee', 'eeq'], meters: [{ beats: 4, beatType: 4 }, { beats: 3, beatType: 4 }], pickup: false, startBpm: 72 },
  { id: 6, title: '十六分音符', detail: '四个十六分，以及八分和十六分的组合。', source: 'Kodály 三年级 tiri-tiri；Solfege gen-2；ABRSM Grade 3', cells: ['q', 'ee', 'ssss', 'ess', 'sse'], meters: [{ beats: 2, beatType: 4 }, { beats: 4, beatType: 4 }], pickup: false, startBpm: 72 },
  { id: 7, title: '八分休止与弱起', detail: '八分休止，可以从弱拍起句。', source: 'Kodály 三年级；ABRSM Grade 4 的弱起', cells: ['q', 'ee', 're', 'rq'], meters: [{ beats: 2, beatType: 4 }, { beats: 3, beatType: 4 }, { beats: 4, beatType: 4 }], pickup: true, startBpm: 76 },
  { id: 8, title: '附点八分', detail: '附点八分接十六分，以及反过来。', source: 'Kodály 四年级 tim-ri；RCM Level 4', cells: ['q', 'ee', 'dee', 'ede'], meters: [{ beats: 2, beatType: 4 }, { beats: 4, beatType: 4 }], pickup: false, startBpm: 76 },
  { id: 9, title: '更密的切分', detail: '十六分、八分、十六分。', source: 'GNU Solfege 的节奏单元；ABRSM Grade 5', cells: ['ee', 'ssss', 'ses', 'sync'], meters: [{ beats: 4, beatType: 4 }], pickup: false, startBpm: 80 },
  { id: 10, title: '三连音', detail: '一拍三个八分三连音，也可以用 3/8。', source: 'GNU Solfege 的三连音单元；ABRSM Grade 6', cells: ['e', 'q', 'trip', 'ee'], meters: [{ beats: 4, beatType: 4 }, { beats: 3, beatType: 8 }], pickup: false, startBpm: 80 },
]

export function rhythmLevel(id: number): RhythmLevel {
  const level = RHYTHM_LEVELS.find((item) => item.id === id)
  if (!level) throw new Error(`没有节奏级别 R${id}`)
  return level
}

export function beatTicks(time: TimeSignature): number {
  if (time.beats === 6 && time.beatType === 8) return 18
  if (time.beatType === 8) return 6
  return 12
}

export function barTicks(time: TimeSignature): number {
  return Math.round(time.beats * (4 / time.beatType) * 12)
}

/** Scale steps 0–6, pitch classes. From S5, minor keys use a raised 7th (ABRSM accidental). */
export function scalePcs(key: KeyChoice, harmonic: boolean): number[] {
  const tonic = tonicPc(key)
  const steps = key.minor ? [0, 2, 3, 5, 7, 8, harmonic ? 11 : 10] : [0, 2, 4, 5, 7, 9, 11]
  return steps.map((step) => (tonic + step) % 12)
}

export function tonicPc(key: KeyChoice): number {
  const major = ((key.fifths * 7) % 12 + 12) % 12
  return key.minor ? (major + 9) % 12 : major
}

export function handRange(level: SightLevel, hand: Hand, key: KeyChoice): [number, number] {
  const tonic = tonicPc(key)
  const lowOctave = hand === 'R' ? 60 : 48
  let low = lowOctave + ((tonic - (lowOctave % 12) + 12) % 12)
  if (low < lowOctave) low += 12
  const high = low + (level.span - 1) * 2 + (level.span > 5 ? 5 : 0)
  return [low, Math.min(84, high)]
}
