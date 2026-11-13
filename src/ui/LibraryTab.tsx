import { lazy, Suspense, useMemo, useState, type Ref } from 'react'
import {
  filterCatalog,
  groupByComposer,
  needsAttribution,
  pieceTitle,
  LEVEL_ORDER,
  type CatalogPiece,
  type CatalogQuery,
  type CatalogSort,
} from '../score/catalog'
import type { SavedScore, UserLevel } from '../storage/db'

const ScoreImport = lazy(() => import('./ScoreImport').then((mod) => ({ default: mod.ScoreImport })))

const CATEGORIES: { value: NonNullable<CatalogQuery['category']>; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'graded', label: '独奏曲' },
  { value: 'method', label: '教材' },
  { value: 'etude', label: '练习曲' },
]

const SORTS: { value: CatalogSort; label: string }[] = [
  { value: 'level', label: '难度' },
  { value: 'length', label: '长度' },
  { value: 'alpha', label: '字母' },
]

interface SavedScoreCard {
  id: number
  title: string
  createdAt: number
  level?: UserLevel
  tag?: string
}

interface LibraryTabProps {
  pieces: CatalogPiece[]
  activeId: string
  openingId: string | null
  error: string | null
  recent: CatalogPiece[]
  saved: SavedScoreCard[]
  query: CatalogQuery
  onQuery: (query: CatalogQuery) => void
  onOpen: (piece: CatalogPiece) => void
  onOpenSaved: (id: number) => void
  onRenameSaved: (id: number, title: string) => void
  onLevelSaved: (id: number, level: UserLevel) => void
  onTagSaved: (id: number, tag: string) => void
  onDeleteSaved: (id: number) => void
  onRefreshSaved: () => void
  savedScores: SavedScore[]
  onOpenFile: () => void
  onCollapse?: () => void
  searchRef?: Ref<HTMLInputElement>
}

export function LibraryTab({
  pieces,
  activeId,
  openingId,
  error,
  recent,
  saved,
  query,
  onQuery,
  onOpen,
  onOpenSaved,
  onRenameSaved,
  onLevelSaved,
  onTagSaved,
  onDeleteSaved,
  onRefreshSaved,
  savedScores,
  onOpenFile,
  onCollapse,
  searchRef,
}: LibraryTabProps) {
  const [importing, setImporting] = useState(false)
  const [dropped, setDropped] = useState<File[]>([])
  /** 用户手动折叠/展开过的作曲家。没记录的跟随默认（搜索时全展开）。 */
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  const category = query.category ?? 'all'
  const sort = query.sort ?? 'level'
  const shown = filterCatalog(pieces, query)
  const shelves = useMemo(() => groupByComposer(shown, sort), [shown, sort])
  const searching = query.text.trim().length > 0

  const count = (predicate: (piece: CatalogPiece) => boolean) => pieces.filter(predicate).length

  return (
    <section className="library-panel" aria-label="曲库">
      <div className="library-panel-head">
        <h2>曲库</h2>
        {onCollapse && (
          <button type="button" className="button ghost" onClick={onCollapse}>
            收起
          </button>
        )}
      </div>

      <div className="library-filters">
        <div className="segmented" role="group" aria-label="程度">
          <button
            type="button"
            aria-pressed={query.level === 'all'}
            onClick={() => onQuery({ ...query, level: 'all' })}
          >
            全部 {pieces.length}
          </button>
          {LEVEL_ORDER.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={query.level === level}
              onClick={() => onQuery({ ...query, level })}
            >
              {level} {count((piece) => piece.level === level)}
            </button>
          ))}
        </div>

        <div className="segmented" role="group" aria-label="类型">
          {CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={category === item.value}
              onClick={() => onQuery({ ...query, category: item.value })}
            >
              {item.label}{' '}
              {count((piece) =>
                item.value === 'all'
                  ? true
                  : item.value === 'graded'
                    ? piece.category == null
                    : piece.category === item.value,
              )}
            </button>
          ))}
        </div>

        <div className="segmented" role="group" aria-label="声部">
          <button type="button" aria-pressed={query.hands === 'all'} onClick={() => onQuery({ ...query, hands: 'all' })}>
            全部
          </button>
          <button type="button" aria-pressed={query.hands === 'one'} onClick={() => onQuery({ ...query, hands: 'one' })}>
            单手
          </button>
          <button type="button" aria-pressed={query.hands === 'two'} onClick={() => onQuery({ ...query, hands: 'two' })}>
            双手
          </button>
        </div>

        <label className="field search">
          <span>搜索</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="曲名、作曲家或教材名"
            value={query.text}
            onChange={(event) => onQuery({ ...query, text: event.target.value })}
          />
        </label>

        <div className="segmented" role="group" aria-label="排序">
          <span className="segmented-label">排序</span>
          {SORTS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={sort === item.value}
              onClick={() => onQuery({ ...query, sort: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <section className="library-section">
        <h3>最近练习</h3>
        {recent.length === 0 ? (
          <p className="device-note">还没有练过的曲子。</p>
        ) : (
          <div className="recent">
            {recent.map((piece) => (
              <button key={piece.id} type="button" onClick={() => onOpen(piece)}>
                {pieceTitle(piece)}
              </button>
            ))}
          </div>
        )}
      </section>

      <section
        className="library-section"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          setDropped([...event.dataTransfer.files])
          setImporting(true)
        }}
      >
        <h3>我的曲谱</h3>
        <p className="device-note">只存在这台浏览器里，不会上传。可以拖入 MusicXML、MIDI、PDF 或图片。</p>
        <button type="button" className="button ghost" onClick={() => setImporting((value) => !value)}>
          {importing ? '收起导入' : '导入曲谱'}
        </button>
        {importing && (
          <Suspense fallback={<p className="device-note">正在打开导入…</p>}>
            <ScoreImport
              key={dropped.map((file) => `${file.name}:${file.size}`).join('|') || 'import'}
              scores={savedScores}
              initialFiles={dropped}
              onSaved={onRefreshSaved}
              onClose={() => setImporting(false)}
            />
          </Suspense>
        )}
        {saved.length === 0 ? (
          <p className="device-note">还没有自己的曲子。导入后会出现在这里，练习功能和曲库里的曲子一样。</p>
        ) : (
          <ul className="saved-list">
            {saved.map((score) => (
              <li key={score.id}>
                <button type="button" className="button ghost" onClick={() => onOpenSaved(score.id)}>
                  练习
                </button>
                <input
                  aria-label="曲名"
                  value={score.title}
                  onChange={(event) => onRenameSaved(score.id, event.target.value)}
                />
                <select aria-label="程度" value={score.level ?? ''} onChange={(event) => onLevelSaved(score.id, event.target.value as UserLevel)}>
                  <option value="">程度</option>
                  {LEVEL_ORDER.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
                <input
                  aria-label="标签"
                  placeholder="标签"
                  value={score.tag ?? ''}
                  onChange={(event) => onTagSaved(score.id, event.target.value)}
                />
                <button type="button" className="button stop" onClick={() => onDeleteSaved(score.id)}>删除</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="library-section">
        <div className="library-shelf-head">
          <h3>{category === 'method' ? '教材' : category === 'etude' ? '练习曲' : '全部曲库'}</h3>
          <span className="device-note">
            {shown.length} 首 · {shelves.length} 位作曲家
            {openingId ? ' · 正在打开…' : ''}
          </span>
          <div className="library-shelf-actions">
            <button type="button" className="button ghost" onClick={() => setFolded({})}>
              全部展开
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setFolded(Object.fromEntries(shelves.map((shelf) => [shelf.composer, true])))}
            >
              全部收起
            </button>
          </div>
        </div>
        {error && <p className="score-status error">{error}</p>}
        {shown.length === 0 ? (
          <p>没有符合的曲子。</p>
        ) : (
          <div className="library-shelves">
            {shelves.map((shelf) => {
              // 搜索时默认展开，让结果直接可见；否则默认收起，只看到作曲家列表。
              const open = folded[shelf.composer] ?? searching
              const activeHere = shelf.pieces.some((piece) => piece.id === activeId)
              return (
                <section key={shelf.composer} className={open ? 'composer-shelf is-open' : 'composer-shelf'}>
                  <button
                    type="button"
                    className="composer-shelf-head"
                    aria-expanded={open}
                    onClick={() => setFolded((current) => ({ ...current, [shelf.composer]: !open }))}
                  >
                    <span className="composer-shelf-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                    <strong>{shelf.name}</strong>
                    <span className="composer-shelf-count">
                      {shelf.pieces.length} 首
                      {activeHere ? ' · 正在练' : ''}
                    </span>
                  </button>
                  {open && (
                    <ul className="library-grid">
                      {shelf.pieces.map((piece) => (
                        <li key={piece.id}>
                          <PieceCard piece={piece} active={piece.id === activeId} opening={openingId === piece.id} onOpen={onOpen} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </section>
      <button type="button" className="button ghost" onClick={onOpenFile}>
        打开乐谱文件
      </button>
    </section>
  )
}

function PieceCard({
  piece,
  active,
  opening,
  onOpen,
}: {
  piece: CatalogPiece
  active: boolean
  opening: boolean
  onOpen: (piece: CatalogPiece) => void
}) {
  const title = pieceTitle(piece)
  const original = piece.title?.trim()
  return (
    <div className={active ? 'library-card is-selected' : 'library-card'}>
      <button type="button" className="library-card-main" disabled={opening} onClick={() => onOpen(piece)}>
        <strong title={title}>{title}</strong>
        <span className="library-card-meta">
          {[
            piece.composer,
            piece.level,
            piece.hands === 'one' ? '单手' : '双手',
            `${piece.measures} 小节`,
          ].join(' · ')}
        </span>
      </button>
      <details className="library-card-more">
        <summary>详情</summary>
        <dl>
          {original && original !== title && (
            <>
              <dt>原名</dt>
              <dd>{original}</dd>
            </>
          )}
          {piece.book && (
            <>
              <dt>教材</dt>
              <dd>{piece.book}{piece.number != null ? ` 第 ${piece.number} 首` : ''}</dd>
            </>
          )}
          <dt>调号</dt>
          <dd>{piece.key || '—'} · {piece.time || '—'}</dd>
          <dt>授权</dt>
          <dd className={needsAttribution(piece) ? 'attribution is-required' : 'attribution'}>
            {needsAttribution(piece) ? `需署名：${piece.attribution}` : piece.attribution}
          </dd>
        </dl>
      </details>
    </div>
  )
}
