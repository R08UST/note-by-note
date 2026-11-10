import { strToU8, unzipSync, zipSync } from 'fflate'
import { parseMusicXml } from './parseMusicXml'
import type { UserLevel } from '../storage/db'

export interface BackupScore {
  title: string
  xml: string
  level: UserLevel
  tag: string
}

export function exportScoresZip(scores: readonly { title: string; xml: string; level?: UserLevel; tag?: string }[]): Uint8Array {
  const manifest = scores.map((score, index) => ({
    file: `scores/${String(index + 1).padStart(3, '0')}.musicxml`,
    title: score.title,
    level: score.level ?? '',
    tag: score.tag ?? '',
  }))
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify({ private: true, scores: manifest })),
  }
  manifest.forEach((entry, index) => {
    files[entry.file] = strToU8(scores[index]?.xml ?? '')
  })
  return zipSync(files)
}

export function readScoresZip(data: Uint8Array): BackupScore[] {
  const files = unzipSync(data)
  const manifestBytes = files['manifest.json']
  if (!manifestBytes) throw new Error('备份里没有 manifest.json。')
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
    scores?: { file: string; title?: string; level?: UserLevel; tag?: string }[]
  }
  if (!manifest.scores) throw new Error('这份备份不是「我的曲谱」。')
  return manifest.scores.flatMap((entry) => {
    const xmlBytes = files[entry.file]
    if (!xmlBytes) return []
    const xml = new TextDecoder().decode(xmlBytes)
    return [{ title: entry.title?.trim() || '未命名', xml, level: entry.level ?? '', tag: entry.tag ?? '' }]
  })
}

/** Reject a file that is not playable MusicXML. The message is shown on the import row. */
export function assertPlayableMusicXml(xml: string): { title: string } {
  let score
  try {
    score = parseMusicXml(xml)
  } catch (error) {
    const message = error instanceof Error ? error.message : '读不了这份乐谱。'
    throw new Error(message.includes('XML') ? '这个文件不是有效的 MusicXML。' : message)
  }
  if (score.notes.length === 0) throw new Error('这个文件里没有可弹的音。')
  return { title: score.title && score.title !== 'Untitled' ? score.title : '' }
}
