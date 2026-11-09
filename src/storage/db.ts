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
}

export interface RunRecord {
  id?: number
  pieceId: string
  title?: string
  createdAt: number
  hitRate: number
  meanOffsetMs: number | null
  mode: PracticeMode
}

export interface SavedScore {
  id?: number
  title: string
  xml: string
  createdAt: number
}

class PracticeDB extends Dexie {
  settings!: Table<SettingsRecord, string>
  runs!: Table<RunRecord, number>
  savedScores!: Table<SavedScore, number>

  constructor() {
    super('note-by-note')
    this.version(1).stores({
      settings: 'id',
      runs: '++id, pieceId, createdAt',
    })
    this.version(2).stores({
      savedScores: '++id, createdAt',
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
