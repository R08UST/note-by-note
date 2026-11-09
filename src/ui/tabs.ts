export const TABS = [
  { id: 'practice', zh: '练习', en: 'Practice' },
  { id: 'sight', zh: '视奏', en: 'Sight-reading' },
  { id: 'omr', zh: '识谱', en: 'OMR' },
  { id: 'history', zh: '记录', en: 'History' },
  { id: 'settings', zh: '设置', en: 'Settings' },
] as const

export type TabId = (typeof TABS)[number]['id']

/** `#library` is an old address for the piece picker. It opens 练习. */
export function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#/, '')
  if (id === 'library') return 'practice'
  return TABS.some((tab) => tab.id === id) ? (id as TabId) : 'practice'
}

export function hashOpensPicker(hash: string): boolean {
  return hash.replace(/^#/, '') === 'library'
}
