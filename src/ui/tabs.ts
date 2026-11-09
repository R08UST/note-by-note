export const TABS = [
  { id: 'practice', zh: '练习', en: 'Practice' },
  { id: 'library', zh: '曲库', en: 'Library' },
  { id: 'sight', zh: '视奏', en: 'Sight-reading' },
  { id: 'omr', zh: '识谱', en: 'OMR' },
  { id: 'history', zh: '记录', en: 'History' },
  { id: 'settings', zh: '设置', en: 'Settings' },
] as const

export type TabId = (typeof TABS)[number]['id']

export function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#/, '')
  return TABS.some((tab) => tab.id === id) ? (id as TabId) : 'practice'
}
