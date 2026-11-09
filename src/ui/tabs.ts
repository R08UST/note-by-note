export const TABS = [
  { id: 'practice', zh: '练习', en: 'Practice' },
  { id: 'train', zh: '训练', en: 'Training' },
  { id: 'omr', zh: '识谱', en: 'OMR' },
  { id: 'history', zh: '记录', en: 'History' },
  { id: 'settings', zh: '设置', en: 'Settings' },
] as const

export type TabId = (typeof TABS)[number]['id']

/** `#library` opens the piece picker. `#sight` is the old name for 训练. */
export function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#/, '')
  if (id === 'library') return 'practice'
  if (id === 'sight') return 'train'
  return TABS.some((tab) => tab.id === id) ? (id as TabId) : 'practice'
}

export function hashOpensPicker(hash: string): boolean {
  return hash.replace(/^#/, '') === 'library'
}
