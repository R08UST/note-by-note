import Dexie, { type Table } from 'dexie'
import type { HandSelection } from '../modes/hands'
import type { PracticeMode } from '../modes/practiceMode'

export interface SettingsRecord {
  id: 'app'
  bpm: number
  hands: HandSelection
  mode: PracticeMode
  latencyOffsetMs: number
}

export interface RunRecord {
  id?: number
  pieceId: string
  createdAt: number
  hitRate: number
  meanOffsetMs: number | null
  mode: PracticeMode
}

class PracticeDB extends Dexie {
  settings!: Table<SettingsRecord, string>
  runs!: Table<RunRecord, number>

  constructor() {
    super('note-by-note')
    this.version(1).stores({
      settings: 'id',
      runs: '++id, pieceId, createdAt',
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

export async function latestRun(pieceId: string): Promise<RunRecord | undefined> {
  try {
    const rows = await db.runs.where('pieceId').equals(pieceId).toArray()
    rows.sort((a, b) => b.createdAt - a.createdAt)
    return rows[0]
  } catch {
    return undefined
  }
}
