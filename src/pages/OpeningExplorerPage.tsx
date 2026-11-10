import { useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronUp, GitBranch, Search } from 'lucide-react'
import ChessBoard, { type BoardMove } from '../components/ChessBoard'

const openings = [
  { id: 'ruy-lopez', name: 'Spanische Partie', eco: 'C60', family: 'Offene Spiele', moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5' },
  { id: 'italian', name: 'Italienische Partie', eco: 'C50', family: 'Offene Spiele', moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4' },
  { id: 'scotch', name: 'Schottische Partie', eco: 'C45', family: 'Offene Spiele', moves: '1. e4 e5 2. Nf3 Nc6 3. d4', pgn: '1. e4 e5 2. Nf3 Nc6 3. d4' },
  { id: 'sicilian', name: 'Sizilianische Verteidigung', eco: 'B20', family: 'Halboffene Spiele', moves: '1. e4 c5 2. Nf3 d6 3. d4', pgn: '1. e4 c5 2. Nf3 d6 3. d4' },
  { id: 'french', name: 'Französische Verteidigung', eco: 'C00', family: 'Halboffene Spiele', moves: '1. e4 e6 2. d4 d5', pgn: '1. e4 e6 2. d4 d5' },
  { id: 'caro', name: 'Caro-Kann-Verteidigung', eco: 'B10', family: 'Halboffene Spiele', moves: '1. e4 c6 2. d4 d5', pgn: '1. e4 c6 2. d4 d5' },
  { id: 'queens-gambit', name: 'Damengambit', eco: 'D06', family: 'Geschlossene Spiele', moves: '1. d4 d5 2. c4 e6 3. Nc3', pgn: '1. d4 d5 2. c4 e6 3. Nc3' },
  { id: 'london', name: 'Londoner System', eco: 'D02', family: 'Geschlossene Spiele', moves: '1. d4 d5 2. Nf3 Nf6 3. Bf4', pgn: '1. d4 d5 2. Nf3 Nf6 3. Bf4' },
]

export default function OpeningExplorerPage() {
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(openings[0])
  const [ply, setPly] = useState(0)
  const [fen, setFen] = useState(() => new Chess().fen())
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [family, setFamily] = useState('Alle Eröffnungen')
  const filtered = openings.filter((opening) => `${opening.name} ${opening.eco} ${opening.family}`.toLowerCase().includes(search.toLowerCase()) && (family === 'Alle Eröffnungen' || opening.family === family))
  const parsed = useMemo(() => { const game = new Chess(); game.loadPgn(active.pgn); return game.history({ verbose: true }) }, [active])
  const movePairs = useMemo(() => { const pairs: { no: number; white: string; black?: string }[] = []; for (let i = 0; i < parsed.length; i += 2) pairs.push({ no: i / 2 + 1, white: parsed[i].san, black: parsed[i + 1]?.san }); return pairs }, [parsed])

  function showPly(nextPly: number) {
    const game = new Chess()
    game.loadPgn(active.pgn)
    while (game.history().length > nextPly) game.undo()
    const history = game.history({ verbose: true })
    const last = history.at(-1)
    setFen(game.fen())
    setLastMove(last ? { from: last.from, to: last.to } : null)
    setPly(nextPly)
  }

  function chooseOpening(opening: typeof openings[number]) {
    setActive(opening)
    setPly(0)
    setLastMove(null)
    setFen(new Chess().fen())
  }

  function extendLine(move: BoardMove) {
    const game = new Chess(fen)
    try { game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) }) }
    catch { return }
    setFen(game.fen())
    setLastMove({ from: move.from, to: move.to })
  }

  const families = ['Alle Eröffnungen', ...new Set(openings.map((opening) => opening.family))]
  return (
    <div className="platform-page openings-page">
      <div className="page-heading-row"><div><span className="eyebrow"><span className="eyebrow-line" /> REPERTOIRE & IDEEN</span><h1>Opening Explorer</h1><p>Entdecke bekannte Eröffnungen und spiele die Hauptzüge auf dem Brett nach.</p></div><div className="opening-tag"><BookOpen size={16} /> THEORIE-REPERTOIRE</div></div>
      <div className="opening-explorer-layout"><aside className="opening-library"><div className="opening-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Eröffnung suchen" aria-label="Eröffnung suchen" /></div><label className="opening-family">Familie<select value={family} onChange={(event) => setFamily(event.target.value)}>{families.map((item) => <option key={item}>{item}</option>)}</select></label><div className="opening-list">{filtered.length ? filtered.map((opening) => <button key={opening.id} className={`opening-list-row ${active.id === opening.id ? 'opening-list-active' : ''}`} onClick={() => chooseOpening(opening)}><span className="opening-eco">{opening.eco}</span><span><strong>{opening.name}</strong><small>{opening.family}</small></span><ArrowRight size={14} /></button>) : <div className="compact-empty">Keine Eröffnung gefunden.</div>}</div><div className="opening-source-note"><GitBranch size={14} /> Hauptvarianten zum Nachspielen. Verbundene Partiedaten werden in einer späteren Ausbaustufe ergänzt.</div></aside>
        <section className="platform-board-card opening-board-card"><div className="platform-board-head"><div><span className="panel-kicker">{active.eco} · {active.family.toUpperCase()}</span><h2>{active.name}</h2></div><button className="board-action" title="Zurück zum Anfang" onClick={() => showPly(0)}><ArrowLeft size={16} /></button></div><ChessBoard fen={fen} onMove={extendLine} lastMove={lastMove} /><div className="opening-board-navigation"><button disabled={ply === 0} onClick={() => showPly(Math.max(0, ply - 1))}><ChevronUp size={15} /> Zurück</button><span>{ply} / {parsed.length} Halbzüge</span><button disabled={ply >= parsed.length} onClick={() => showPly(Math.min(parsed.length, ply + 1))}>Weiter <ChevronDown size={15} /></button></div><div className="opening-move-list">{movePairs.map((pair) => <div className="move-row" key={pair.no}><span className="move-number">{pair.no}.</span><button className={ply === (pair.no - 1) * 2 + 1 ? 'opening-move-active' : ''} onClick={() => showPly((pair.no - 1) * 2 + 1)}>{pair.white}</button>{pair.black && <button className={ply === (pair.no - 1) * 2 + 2 ? 'opening-move-active' : ''} onClick={() => showPly((pair.no - 1) * 2 + 2)}>{pair.black}</button>}</div>)}</div><div className="opening-line-note"><ArrowDown size={14} /> Klicke auf Züge, um die Stellung zu wechseln. Du kannst eigene Fortsetzungen auf dem Brett ausprobieren.</div></section></div>
    </div>
  )
}
