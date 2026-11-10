import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { ArrowRight, Award, Check, Lightbulb, Puzzle, RotateCcw, Target, Zap } from 'lucide-react'
import ChessBoard, { type BoardMove } from '../components/ChessBoard'
import { useAuth } from '../contexts/AuthContext'
import { dailyPuzzleIndex, loadPuzzleStats, loadPuzzles, recordPuzzleAttempt } from '../lib/data'
import { CURATED_PUZZLES, type PuzzleRecord } from '../lib/puzzles'
import { supabaseConfigured } from '../lib/supabase'

type PuzzleStats = { rating: number; attempts: number; solved: number; current_streak: number; best_streak: number }

function readGuestStats(): PuzzleStats | null {
  try { return JSON.parse(localStorage.getItem('knight-club-puzzle-stats') ?? 'null') as PuzzleStats | null }
  catch { return null }
}

export default function PuzzlesPage() {
  const { user } = useAuth()
  const [puzzles, setPuzzles] = useState<PuzzleRecord[]>(CURATED_PUZZLES)
  const [activePuzzle, setActivePuzzle] = useState<PuzzleRecord>(CURATED_PUZZLES[dailyPuzzleIndex()])
  const [fen, setFen] = useState(activePuzzle.fen)
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [attemptMoves, setAttemptMoves] = useState<string[]>([])
  const [completed, setCompleted] = useState<boolean | null>(null)
  const [hintVisible, setHintVisible] = useState(false)
  const [message, setMessage] = useState('Finde den Mattzug in einem Zug.')
  const [error, setError] = useState('')
  const [stats, setStats] = useState<PuzzleStats | null>(readGuestStats)
  const startedAt = useRef(Date.now())
  const [difficulty, setDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard'>('all')

  useEffect(() => {
    if (supabaseConfigured) {
      let active = true
      loadPuzzles().then((rows) => { if (active && rows.length) { setPuzzles(rows); setActivePuzzle(rows[dailyPuzzleIndex() % rows.length]); setFen(rows[dailyPuzzleIndex() % rows.length].fen) } })
        .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Puzzle konnten nicht geladen werden.') })
      return () => { active = false }
    }
  }, [])

  useEffect(() => {
    if (!user) { setStats(readGuestStats()); return }
    let active = true
    loadPuzzleStats(user.id).then((row) => { if (active && row) setStats(row as typeof stats) })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Puzzle-Statistik konnte nicht geladen werden.') })
    return () => { active = false }
  }, [user])

  const filtered = useMemo(() => puzzles.filter((puzzle) => difficulty === 'all' || difficulty === 'easy' && puzzle.rating < 1000 || difficulty === 'medium' && puzzle.rating >= 1000 && puzzle.rating < 1300 || difficulty === 'hard' && puzzle.rating >= 1300), [puzzles, difficulty])

  function startPuzzle(puzzle: PuzzleRecord) {
    setActivePuzzle(puzzle)
    setFen(puzzle.fen)
    setLastMove(null)
    setAttemptMoves([])
    setCompleted(null)
    setHintVisible(false)
    setMessage('Find the best move!')
    setError('')
    startedAt.current = Date.now()
  }

  async function finish(solved: boolean, attempt: string[]) {
    setCompleted(solved)
    setMessage(solved ? 'Solved! Great tactic found.' : 'Incorrect move. Try again or check the hint.')
    if (!user) {
      const previous = readGuestStats() ?? { rating: 1500, attempts: 0, solved: 0, current_streak: 0, best_streak: 0 }
      const current_streak = solved ? previous.current_streak + 1 : 0
      const next: PuzzleStats = {
        rating: Math.max(100, previous.rating + (solved ? 8 : -5)),
        attempts: previous.attempts + 1,
        solved: previous.solved + (solved ? 1 : 0),
        current_streak,
        best_streak: Math.max(previous.best_streak, current_streak),
      }
      localStorage.setItem('knight-club-puzzle-stats', JSON.stringify(next))
      setStats(next)
      return
    }
    try {
      const result = await recordPuzzleAttempt(activePuzzle, attempt, Math.floor((Date.now() - startedAt.current) / 1000))
      setStats({ rating: result.rating, attempts: result.attempts, solved: result.solved_count, current_streak: result.current_streak, best_streak: result.best_streak })
    } catch (caught) {
      setError(caught instanceof Error ? `Result saved locally: ${caught.message}` : 'Could not sync puzzle rating.')
    }
  }

  function playMove(move: BoardMove) {
    if (completed !== null) return
    const uci = `${move.from}${move.to}${move.promotion ?? ''}`
    const updatedMoves = [...attemptMoves, uci]
    setAttemptMoves(updatedMoves)
    const expected = activePuzzle.solution_uci[attemptMoves.length]
    if (uci !== expected) { void finish(false, updatedMoves); return }
    const game = new Chess(fen)
    try { game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) }) }
    catch { return }
    setFen(game.fen())
    setLastMove({ from: move.from, to: move.to })
    if (updatedMoves.length === activePuzzle.solution_uci.length) void finish(true, updatedMoves)
  }

  const nextPuzzle = () => {
    const index = puzzles.findIndex((puzzle) => puzzle.id === activePuzzle.id)
    const next = puzzles[(index + 1 + puzzles.length) % puzzles.length]
    if (next) startPuzzle(next)
  }

  const turn = new Chess(fen).turn()

  return (
    <div className="platform-page puzzles-page">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow"><span className="eyebrow-line" /> TACTICS & PUZZLES</span>
          <h1>Puzzles</h1>
          <p>Solve tactical puzzles to train your calculation and pattern recognition.</p>
        </div>
        <div className="puzzle-rating-badge">
          <Award size={18} />
          <span><small>PUZZLE RATING</small><strong>{stats?.rating ?? '1500'}</strong></span>
        </div>
      </div>

      {error && <div className="inline-error" role="alert">{error}</div>}

      <div className="puzzle-toolbar">
        <div className="puzzle-day-label">
          <span className="daily-dot" />
          <div><small>CURRENT PUZZLE</small><strong>{activePuzzle.title}</strong></div>
        </div>
        <div className="difficulty-filter">
          <span>DIFFICULTY</span>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}>
            <option value="all">All Difficulties</option>
            <option value="easy">Easy (&lt; 1000)</option>
            <option value="medium">Medium (1000–1300)</option>
            <option value="hard">Hard (&gt; 1300)</option>
          </select>
        </div>
      </div>

      <div className="puzzle-layout">
        <section className="platform-board-card puzzle-board-card">
          <div className="platform-board-head">
            <div>
              <span className="panel-kicker">{turn === 'w' ? 'WHITE TO MOVE' : 'BLACK TO MOVE'}</span>
              <h2>{message}</h2>
            </div>
            <span className="game-type-pill">{activePuzzle.rating} RATED</span>
          </div>

          <ChessBoard fen={fen} onMove={playMove} interactive={completed === null} lastMove={lastMove} />

          <div className="puzzle-board-footer">
            <span><span className="keyboard-hint">THEME</span> {activePuzzle.themes?.slice(0, 2).join(' · ') ?? 'Tactics'}</span>
            {completed !== null ? (
              <span className={`puzzle-result-pill ${completed ? 'puzzle-result-right' : 'puzzle-result-wrong'}`}>
                {completed ? <Check size={14} /> : <RotateCcw size={14} />}
                {completed ? 'Success!' : 'Missed'}
              </span>
            ) : (
              <button className="toolbar-undo" onClick={() => setHintVisible(!hintVisible)}>
                <Lightbulb size={14} /> {hintVisible ? 'Hide Hint' : 'Get Hint'}
              </button>
            )}
          </div>
          {hintVisible && <div className="puzzle-hint"><Lightbulb size={15} /> Look for an attacking move against the king or an undefended major piece.</div>}
        </section>

        <aside className="puzzle-side">
          <section className="panel-card puzzle-stats-card">
            <div className="panel-heading">
              <div><span className="panel-kicker">STATS</span><h2>Your Tactics Record</h2></div>
              <Target size={18} />
            </div>
            <div className="puzzle-stat-grid">
              <div><strong>{stats?.attempts ?? '0'}</strong><span>Attempts</span></div>
              <div><strong>{stats?.solved ?? '0'}</strong><span>Solved</span></div>
              <div><strong>{stats?.current_streak ?? '0'} 🔥</strong><span>Streak</span></div>
            </div>
          </section>

          {completed === false && (
            <button className="btn-chesscom-secondary puzzle-next-button" onClick={() => startPuzzle(activePuzzle)}>
              <RotateCcw size={15} /> Try Again
            </button>
          )}

          {completed === true && (
            <button className="btn-chesscom-green puzzle-next-button" onClick={nextPuzzle}>
              Next Puzzle <ArrowRight size={15} />
            </button>
          )}

          <section className="panel-card puzzle-training-card">
            <div className="panel-heading">
              <div><span className="panel-kicker">CURATED SET</span><h2>By Level</h2></div>
              <Zap size={18} />
            </div>
            <div className="puzzle-list">
              {filtered.length ? filtered.map((puzzle) => (
                <button
                  key={puzzle.id}
                  className={`puzzle-list-row ${activePuzzle.id === puzzle.id ? 'puzzle-list-active' : ''}`}
                  onClick={() => startPuzzle(puzzle)}
                >
                  <span className="puzzle-list-icon"><Puzzle size={15} /></span>
                  <span><strong>{puzzle.title}</strong><small>{puzzle.rating} · {puzzle.themes?.[0] ?? 'Tactics'}</small></span>
                  <ArrowRight size={14} />
                </button>
              )) : (
                <div className="compact-empty">No puzzles in this category.</div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
