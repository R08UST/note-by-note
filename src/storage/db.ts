import Dexie, { type Table } from 'dexie'
import type { HandSelection } from '../modes/hands'
import type { PracticeMode } from '../modes/practiceMode'

export interface SettingsRecord {
  id: 'app'
  bpm: number
  hands: HandSelection
  mode: PracticeMode
  latencyOffsetMs: number
  lastLibraryId?: string
  /** Keep serving the next item in the same level after each exercise. Default on. */
  continuous?: boolean
  /** Piano sampler through the MIDI keyboard. Off when the keyboard has its own speaker. */
  monitor?: boolean
  /** Play the other hand during rhythm practice. */
  accompany?: boolean
  muted?: boolean
  pianoVolume?: number
  metroVolume?: number
  /** On-screen keyboard stays open. Collapsed when omitted. */
  keyboardOpen?: boolean
  /** 1 fits the score to the width. */
  scoreZoom?: number
  /** Wait mode: a wrong pitch rewinds to the first note of the measure. Default on. */
  resetOnError?: boolean
  /** Practice counts the strikes printed marks imply, not just the noteheads. Default off. */
  honorMarks?: boolean
}

export interface RunRecord {
  id?: number
  pieceId: string
  title?: string
  createdAt: number
  hitRate: number
  meanOffsetMs: number | null
  mode: PracticeMode
  errorsPerMeasure?: { measure: number; errors: number; expected: number }[]
}

export type UserLevel = '' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

export interface SavedScore {
  id?: number
  title: string
  xml: string
  createdAt: number
  /** Optional shelf grade. Empty means the user has not graded it. */
  level?: UserLevel
  /** Free label such as 流行 or 练习. */
  tag?: string
}

export type TrainMode = 'sight-flash' | 'sight-phrase' | 'rhythm' | 'rhythm-hands' | 'pulse' | 'rhythm-piece' | 'scale' | 'chord' | 'finger'

export interface TrainRunRecord {
  id?: number
  mode: TrainMode
  level: number
  createdAt: number
  pitchAccuracy: number
  onTimeRate: number
  meanOffsetMs: number | null
  spreadMs: number | null
  bpm: number
  scoredTiming: boolean
  hand?: 'R' | 'L' | 'both'
  seed?: number
  firstAttempt?: boolean
  curriculum?: number
  /** Stable 题库 id, so a redo is not a new piece. */
  itemId?: string
  /** Technique drills: spread of neighbour intervals around the player's pulse, in percent. */
  unevenPct?: number | null
  /** Technique drills: standard deviation of key velocity. Null without velocity data. */
  velocitySpread?: number | null
}

export interface PracticeRangeRecord {
  pieceId: string
  start: number
  end: number
  loops: number
  ramp: boolean
  /** Onset the passage starts on. Missing on ranges saved before note-level selection. */
  startBeat?: number
  endBeat?: number
}

export interface BankMarkRecord {
  id: string
  clean: boolean
  at: number
}

export interface PitchStatRecord {
  pitch: number
  seen: number
  errors: number
  reactionMs: number
  reactionCount: number
}

class PracticeDB extends Dexie {
  settings!: Table<SettingsRecord, string>
  runs!: Table<RunRecord, number>
  savedScores!: Table<SavedScore, number>
  trainRuns!: Table<TrainRunRecord, number>
  pitchStats!: Table<PitchStatRecord, number>
  ranges!: Table<PracticeRangeRecord, string>
  bankMarks!: Table<BankMarkRecord, string>

  constructor() {
    super('note-by-note')
    this.version(1).stores({
      settings: 'id',
      runs: '++id, pieceId, createdAt',
    })
    this.version(2).stores({
      savedScores: '++id, createdAt',
    })
    this.version(3).stores({
      trainRuns: '++id, mode, createdAt, level',
      pitchStats: 'pitch',
    })
    this.version(4).stores({
      ranges: 'pieceId',
    })
    this.version(5).stores({
      bankMarks: 'id',
    })
  }
}

export const db = new PracticeDB()

export async function loadSettings(): Promise<SettingsRecord | undefined> {
  try {
    return await db.settings.get('app')
  } catch {
    return undefined
  }
}

export async function saveSettings(settings: Omit<SettingsRecord, 'id'>): Promise<void> {
  try {
    await db.settings.put({ id: 'app', ...settings })
  } catch {
    // Storage is optional in v1. Practice still runs if IndexedDB is blocked.
  }
}

export async function saveRun(run: Omit<RunRecord, 'id'>): Promise<void> {
  try {
    await db.runs.add(run)
  } catch {
    // Ignore storage failures.
  }
}

export async function saveUserScore(title: string, xml: string): Promise<number | undefined> {
  try {
    return await db.savedScores.add({ title, xml, createdAt: Date.now() })
  } catch {
    return undefined
  }
}

export async function listUserScores(): Promise<SavedScore[]> {
  try {
    const rows = await db.savedScores.toArray()
    rows.sort((a, b) => b.createdAt - a.createdAt)
    return rows
  } catch {
    return []
  }
}

export async function getUserScore(id: number): Promise<SavedScore | undefined> {
  try {
    return await db.savedScores.get(id)
  } catch {
    return undefined
  }
}

export async function updateUserScore(id: number, patch: Partial<Pick<SavedScore, 'title' | 'level' | 'tag'>>): Promise<void> {
  try {
    await db.savedScores.update(id, patch)
  } catch {
    // The list stays as it was if storage is blocked.
  }
}

export async function deleteUserScore(id: number): Promise<void> {
  try {
    await db.savedScores.delete(id)
  } catch {
    // Ignore storage failures.
  }
}

export async function listRuns(): Promise<RunRecord[]> {
  try {
    const rows = await db.runs.toArray()
    rows.sort((a, b) => b.createdAt - a.createdAt)
    return rows
  } catch {
    return []
  }
}

export async function latestRun(pieceId: string): Promise<RunRecord | undefined> {
  try {
    const rows = await db.runs.where('pieceId').equals(pieceId).toArray()
    rows.sort((a, b) => b.createdAt - a.createdAt)
    return rows[0]
  } catch {
    return undefined
  }
}

export async function saveTrainRun(run: Omit<TrainRunRecord, 'id'>): Promise<void> {
  try {
    await db.trainRuns.add(run)
  } catch {
    // Practice still finishes if storage is blocked.
  }
}

export async function listTrainRuns(): Promise<TrainRunRecord[]> {
  try {
    const rows = await db.trainRuns.toArray()
    rows.sort((a, b) => a.createdAt - b.createdAt)
    return rows
  } catch {
    return []
  }
}

export async function listPitchStats(): Promise<PitchStatRecord[]> {
  try {
    return await db.pitchStats.toArray()
  } catch {
    return []
  }
}

export async function loadPracticeRange(pieceId: string): Promise<PracticeRangeRecord | undefined> {
  try {
    return await db.ranges.get(pieceId)
  } catch {
    return undefined
  }
}

export async function savePracticeRange(range: PracticeRangeRecord): Promise<void> {
  try {
    await db.ranges.put(range)
  } catch {
    // The passage can still be practiced if storage is blocked.
  }
}

export async function listBankMarks(): Promise<BankMarkRecord[]> {
  try {
    return await db.bankMarks.toArray()
  } catch {
    return []
  }
}

export async function markBankItem(id: string, clean: boolean): Promise<void> {
  try {
    const current = await db.bankMarks.get(id)
    await db.bankMarks.put({ id, clean: Boolean(clean || current?.clean), at: Date.now() })
  } catch {
    // The drill result is still on screen if storage is blocked.
  }
}

export async function rememberPitches(results: readonly { pitch: number; hit: boolean; reactionMs?: number }[]): Promise<void> {
  try {
    await db.transaction('rw', db.pitchStats, async () => {
      for (const result of results) {
        const current = await db.pitchStats.get(result.pitch)
        const next: PitchStatRecord = current ?? { pitch: result.pitch, seen: 0, errors: 0, reactionMs: 0, reactionCount: 0 }
        next.seen += 1
        if (!result.hit) next.errors += 1
        if (result.reactionMs != null) {
          next.reactionMs += result.reactionMs
          next.reactionCount += 1
        }
        await db.pitchStats.put(next)
      }
    })
  } catch {
    // The drill result is still on screen.
  }
}
