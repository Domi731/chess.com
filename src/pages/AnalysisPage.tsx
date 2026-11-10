import { useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { ArrowRight, BarChart3, Clipboard, Cpu, FileUp, LoaderCircle, Search, Sparkles, Target } from 'lucide-react'
import ChessBoard, { type BoardMove } from '../components/ChessBoard'
import { analyzePosition, parseUciMove, type EngineLine } from '../lib/stockfish'
import { useAuth } from '../contexts/AuthContext'
import { saveGameAccuracy } from '../lib/data'

type Props = { initialPgn?: string; initialGameId?: string; navigate: (path: string) => void; onAccuracySaved?: () => void }
type EvaluationPoint = { ply: number; san: string; whiteCp: number }

function scoreForWhite(line: EngineLine | undefined, sideToMove: 'w' | 'b') {
  if (!line) return null
  const raw = line.scoreCp ?? (line.mate ? Math.sign(line.mate) * 100_000 : 0)
  return sideToMove === 'w' ? raw : -raw
}

function variationToSan(fen: string, uciLine: string[]) {
  const game = new Chess(fen)
  const san: string[] = []
  for (const uci of uciLine) {
    const move = parseUciMove(uci)
    if (!move) break
    try { san.push(game.move(move).san) } catch { break }
  }
  return san.join(' ')
}

export default function AnalysisPage({ initialPgn = '', initialGameId, navigate, onAccuracySaved }: Props) {
  const { user } = useAuth()
  const [fen, setFen] = useState(() => new Chess().fen())
  const [fenInput, setFenInput] = useState(() => new Chess().fen())
  const [pgnInput, setPgnInput] = useState(initialPgn)
  const [gamePgn, setGamePgn] = useState(initialPgn)
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [lines, setLines] = useState<EngineLine[]>([])
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [depth, setDepth] = useState(13)
  const [evaluations, setEvaluations] = useState<EvaluationPoint[]>([])
  const [accuracy, setAccuracy] = useState<{ white: number; black: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const game = useMemo(() => new Chess(fen), [fen])
  const bestLine = lines[0]
  const evalWhite = scoreForWhite(bestLine, game.turn())
  const chartMax = Math.max(300, ...evaluations.map((point) => Math.abs(point.whiteCp)))

  function applyMove(move: BoardMove) {
    const next = new Chess(fen)
    try { next.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) }) }
    catch { return }
    setFen(next.fen())
    setFenInput(next.fen())
    setLastMove({ from: move.from, to: move.to })
    setLines([])
    setEvaluations([])
    setAccuracy(null)
  }

  function loadFen() {
    try {
      const next = new Chess(fenInput.trim())
      setFen(next.fen())
      setLastMove(null)
      setLines([])
      setEvaluations([])
      setAccuracy(null)
      setError('')
    } catch { setError('Die FEN-Position ist ungültig.') }
  }

  function loadPgn() {
    try {
      const next = new Chess()
      next.loadPgn(pgnInput)
      setFen(next.fen())
      setFenInput(next.fen())
      setGamePgn(next.pgn())
      const last = next.history({ verbose: true }).at(-1)
      setLastMove(last ? { from: last.from, to: last.to } : null)
      setLines([])
      setEvaluations([])
      setAccuracy(null)
      setError('')
    } catch { setError('Die PGN-Partie konnte nicht gelesen werden. Prüfe die Notation und importiere sie erneut.') }
  }

  async function analyseCurrent() {
    setBusy(true)
    setProgress('Stockfish berechnet diese Stellung …')
    setError('')
    try {
      const result = await analyzePosition(fen, depth, { multipv: 3 })
      setLines(result.lines)
      setProgress('Stellungsanalyse abgeschlossen.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Analyse fehlgeschlagen.')
      setProgress('')
    } finally { setBusy(false) }
  }

  async function analyseGame() {
    const pgn = pgnInput.trim() ? pgnInput : gamePgn
    if (!pgn.trim()) { setError('Importiere zuerst eine PGN-Partie.') ; return }
    setBusy(true)
    setError('')
    setEvaluations([])
    setAccuracy(null)
    try {
      const replay = new Chess()
      replay.loadPgn(pgn)
      const moveHistory = replay.history({ verbose: true })
      if (!moveHistory.length) throw new Error('Die PGN-Datei enthält keine Züge.')
      const positions = moveHistory.map((move, index) => ({ ply: index + 1, san: move.san, before: move.before, after: move.after, side: move.color as 'w' | 'b' }))
      const scores: EvaluationPoint[] = []
      let whiteLoss = 0
      let blackLoss = 0
      let whiteMoves = 0
      let blackMoves = 0
      for (let index = 0; index < positions.length; index += 1) {
        const position = positions[index]
        setProgress(`Analysiere Zug ${position.ply} von ${positions.length} …`)
        const beforeGame = new Chess(position.before)
        const before = await analyzePosition(position.before, Math.min(depth, 10), { multipv: 1 })
        const after = await analyzePosition(position.after, Math.min(depth, 10), { multipv: 1 })
        const bestWhite = scoreForWhite(before.lines[0], beforeGame.turn()) ?? 0
        const actualWhite = scoreForWhite(after.lines[0], new Chess(position.after).turn()) ?? bestWhite
        const loss = Math.max(0, position.side === 'w' ? bestWhite - actualWhite : actualWhite - bestWhite)
        if (position.side === 'w') { whiteLoss += loss; whiteMoves += 1 } else { blackLoss += loss; blackMoves += 1 }
        scores.push({ ply: position.ply, san: position.san, whiteCp: actualWhite })
        setEvaluations([...scores])
      }
      const calculatedAccuracy = {
        white: whiteMoves ? Math.round(Math.max(0, 100 - 10 * Math.sqrt(whiteLoss / whiteMoves / 100))) : 100,
        black: blackMoves ? Math.round(Math.max(0, 100 - 10 * Math.sqrt(blackLoss / blackMoves / 100))) : 100,
      }
      setAccuracy(calculatedAccuracy)
      if (initialGameId && user) {
        try {
          await saveGameAccuracy(initialGameId, user.id, calculatedAccuracy.white, calculatedAccuracy.black)
          onAccuracySaved?.()
          setProgress('Partieanalyse abgeschlossen · Genauigkeit gespeichert.')
          return
        } catch (caught) {
          setError(caught instanceof Error ? `Analyse abgeschlossen. Genauigkeit konnte nicht gespeichert werden: ${caught.message}` : 'Analyse abgeschlossen. Genauigkeit konnte nicht gespeichert werden.')
        }
      }
      setProgress('Partieanalyse abgeschlossen.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Partie konnte nicht analysiert werden.')
      setProgress('')
    } finally { setBusy(false) }
  }

  async function copyFen() {
    try { await navigator.clipboard.writeText(fen); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
    catch { setError('Die FEN konnte nicht in die Zwischenablage kopiert werden.') }
  }

  // Calculate evaluation bar white percentage (0% to 100%)
  const rawEval = evalWhite ?? 0
  const evalWhitePercentage = Math.min(95, Math.max(5, 50 + (rawEval / 100) * 8))
  const evalDisplay = bestLine
    ? bestLine.mate !== null
      ? `M${Math.abs(bestLine.mate)}`
      : `${rawEval >= 0 ? '+' : ''}${(rawEval / 100).toFixed(1)}`
    : '0.0'

  return (
    <div className="platform-page analysis-page">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow"><span className="eyebrow-line" /> GAME REVIEW & ANALYSIS</span>
          <h1>Analysis</h1>
          <p>Explore positions with Stockfish 19 engine and review game accuracy.</p>
        </div>
        <div className="engine-badge">
          <Cpu size={17} />
          <span><strong>Stockfish 19</strong><small>Deep Analysis · Local</small></span>
        </div>
      </div>

      {error && <div className="inline-error" role="alert">{error}</div>}

      <div className="analysis-workspace">
        <section className="platform-board-card analysis-board-card">
          <div className="platform-board-head">
            <div>
              <span className="panel-kicker">POSITION</span>
              <h2>{game.isCheck() ? 'Check' : game.isGameOver() ? 'Game Over' : `${game.turn() === 'w' ? 'White' : 'Black'} to move`}</h2>
            </div>
            <button className="board-action" onClick={() => void copyFen()} title="Copy FEN"><Clipboard size={16} /></button>
          </div>

          {/* Board with Left Vertical Evaluation Bar */}
          <div className="analysis-board-with-eval">
            <div className="vertical-eval-gauge" title={`Evaluation: ${evalDisplay}`}>
              <div className="eval-gauge-black" />
              <div className="eval-gauge-white" style={{ height: `${evalWhitePercentage}%` }} />
              <span className={`eval-gauge-text ${rawEval >= 0 ? 'eval-text-bottom' : 'eval-text-top'}`}>
                {evalDisplay}
              </span>
            </div>
            <ChessBoard fen={fen} onMove={applyMove} lastMove={lastMove} />
          </div>

          <div className="fen-control">
            <label htmlFor="fen-input">FEN</label>
            <input id="fen-input" value={fenInput} onChange={(event) => setFenInput(event.target.value)} />
            <button onClick={loadFen}>Load</button>
          </div>
          <div className="fen-copy-status">{copied ? 'FEN copied to clipboard.' : 'You can move pieces directly on the board to analyze.'}</div>
        </section>

        <aside className="analysis-sidebar">
          <section className="panel-card engine-analysis-card">
            <div className="panel-heading">
              <div><span className="panel-kicker">STOCKFISH</span><h2>Engine Evaluation</h2></div>
              <Sparkles size={18} />
            </div>
            <label className="depth-control">
              Search Depth
              <select value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
                <option value={10}>10 Depth (Fast)</option>
                <option value={13}>13 Depth (Standard)</option>
                <option value={16}>16 Depth (Deep)</option>
                <option value={18}>18 Depth (Master)</option>
              </select>
            </label>
            <button className="btn-chesscom-green analyze-button" disabled={busy} onClick={() => void analyseCurrent()}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
              Analyze Position
            </button>
            {progress && <div className="analysis-progress" aria-live="polite">{busy && <LoaderCircle className="spin" size={13} />}{progress}</div>}
            {bestLine && (
              <div className="engine-result">
                <div className="engine-eval">
                  <span>EVAL</span>
                  <strong>{evalDisplay}</strong>
                </div>
                <div className="engine-best-move">
                  <span>BEST MOVE · DEPTH {bestLine.depth}</span>
                  <strong>{variationToSan(fen, bestLine.pv)}</strong>
                  <small>{bestLine.pv.join(' ')}</small>
                </div>
                {lines.length > 1 && (
                  <div className="engine-alternatives">
                    {lines.slice(1).map((line) => (
                      <div key={line.multipv}>
                        <span>{line.multipv}.</span>
                        <strong>{variationToSan(fen, line.pv)}</strong>
                        <small>{line.scoreCp !== null ? (line.scoreCp / 100).toFixed(2) : `#${line.mate}`}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="panel-card pgn-import-card">
            <div className="panel-heading">
              <div><span className="panel-kicker">PGN GAME REVIEW</span><h2>Full Game Review</h2></div>
              <FileUp size={18} />
            </div>
            <textarea aria-label="PGN Game" placeholder="Paste PGN: 1. e4 e5 2. Nf3 Nc6 …" value={pgnInput} onChange={(event) => setPgnInput(event.target.value)} />
            <div className="pgn-actions">
              <button className="btn-chesscom-secondary" disabled={busy} onClick={loadPgn}>Load PGN</button>
              <button className="btn-chesscom-green" disabled={busy} onClick={() => { loadPgn(); window.setTimeout(() => void analyseGame(), 0) }}>
                {busy ? 'Reviewing …' : 'Run Game Review'}
              </button>
            </div>
            {evaluations.length > 0 && (
              <div className="accuracy-review-card">
                <span className="accuracy-review-title">ACCURACY SCORES</span>
                <div className="accuracy-row">
                  <div className="accuracy-box accuracy-white">
                    <Target size={18} />
                    <span>White</span>
                    <strong>{accuracy ? `${accuracy.white}%` : '…'}</strong>
                  </div>
                  <div className="accuracy-box accuracy-black">
                    <Target size={18} />
                    <span>Black</span>
                    <strong>{accuracy ? `${accuracy.black}%` : '…'}</strong>
                  </div>
                </div>
              </div>
            )}
          </section>

          <button className="analysis-opening-link" onClick={() => navigate('/opening-explorer')}>
            <BarChart3 size={16} />
            <span><strong>Explore Opening</strong><small>Lookup in Opening Book</small></span>
            <ArrowRight size={15} />
          </button>
        </aside>
      </div>
      {evaluations.length > 0 && <section className="analysis-chart-card"><div className="section-title-line"><div><span className="panel-kicker">PARTIEVERLAUF</span><h2>Bewertungsverlauf</h2></div><span className="analysis-chart-legend"><i /> Weißvorteil <i className="legend-black" /> Schwarzvorteil</span></div><div className="evaluation-chart" role="img" aria-label="Bewertung der analysierten Züge"><div className="evaluation-zero" />{evaluations.map((point) => { const height = Math.max(3, Math.abs(point.whiteCp) / chartMax * 45); return <div key={point.ply} className={`evaluation-bar ${point.whiteCp >= 0 ? 'eval-white' : 'eval-black'}`} title={`${point.ply}. ${point.san}: ${(point.whiteCp / 100).toFixed(2)}`} style={{ height: `${height}%`, [point.whiteCp >= 0 ? 'bottom' : 'top']: '50%' }} /> })}</div><div className="evaluation-ply-labels"><span>1. Zug</span><span>{evaluations.length} Halbzüge</span></div></section>}
    </div>
  )
}
