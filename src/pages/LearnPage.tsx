import { useEffect, useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap, Lightbulb, RotateCcw, Target } from 'lucide-react'
import ChessBoard, { type BoardMove } from '../components/ChessBoard'
import { useAuth } from '../contexts/AuthContext'
import { loadLessonProgress, saveLessonProgress } from '../lib/data'

type Lesson = { id: string; title: string; category: string; level: string; objective: string; explanation: string; hint: string; fen: string; solution: string; notation: string }

const castlePosition = (() => {
  const game = new Chess()
  game.loadPgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6')
  return game.fen()
})()

const lessons: Lesson[] = [
  { id: 'opening-center', title: 'Das Zentrum kontrollieren', category: 'Eröffnung', level: 'Einsteiger', objective: 'Öffne eine Linie für deine Figuren.', explanation: 'Ein Zug mit dem e-Bauern kontrolliert das Zentrum und gibt Läufer und Dame mehr Bewegungsfreiheit.', hint: 'Zieh den Bauern vor dem König zwei Felder nach vorn.', fen: new Chess().fen(), solution: 'e2e4', notation: 'e4' },
  { id: 'castle-kingside', title: 'Den König in Sicherheit bringen', category: 'Königssicherheit', level: 'Einsteiger', objective: 'Führe die kurze Rochade aus.', explanation: 'Bei der kurzen Rochade zieht der König zwei Felder Richtung Turm; der Turm springt auf das Feld direkt neben ihm.', hint: 'Zieh den König von e1 nach g1. Die Schachregeln verschieben den Turm automatisch.', fen: castlePosition, solution: 'e1g1', notation: 'O-O' },
  { id: 'mate-with-queen', title: 'Matt mit König und Dame', category: 'Mattführung', level: 'Fortgeschritten', objective: 'Finde den Mattzug.', explanation: 'Die Dame schränkt den König auf der achten Reihe ein. Dein König deckt gleichzeitig die Fluchtfelder.', hint: 'Zieh die Dame von g6 nach g7. Dein König deckt das Zielfeld.', fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', solution: 'g6g7', notation: 'Qg7#' },
]

function readGuestProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem('knight-club-lesson-progress') ?? '[]')
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] }
}

export default function LearnPage() {
  const { user } = useAuth()
  const [selected, setSelected] = useState(lessons[0])
  const [fen, setFen] = useState(selected.fen)
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [completed, setCompleted] = useState(false)
  const [progress, setProgress] = useState<string[]>(readGuestProgress)
  const [message, setMessage] = useState('Wähle deinen Zug auf dem Brett.')
  const [error, setError] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) { setProgress(readGuestProgress()); return }
    let active = true
    loadLessonProgress(user.id).then((rows) => { if (active) setProgress(rows.filter((row: { completed_at?: string | null }) => row.completed_at).map((row: { lesson_id: string }) => row.lesson_id)) })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Fortschritt konnte nicht geladen werden.') })
    return () => { active = false }
  }, [user])

  const completedCount = useMemo(() => progress.length, [progress])

  function chooseLesson(lesson: Lesson) {
    setSelected(lesson)
    setFen(lesson.fen)
    setLastMove(null)
    setCompleted(false)
    setMessage('Wähle deinen Zug auf dem Brett.')
    setShowHint(false)
    setError('')
  }

  async function makeMove(move: BoardMove) {
    const candidate = `${move.from}${move.to}${move.promotion ?? ''}`
    if (candidate !== selected.solution) {
      setMessage('Noch nicht ganz. Schau dir das Ziel der Lektion an und versuche es erneut.')
      return
    }
    const game = new Chess(fen)
    try { game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) }) }
    catch { setMessage('Dieser Zug ist nicht möglich.'); return }
    setFen(game.fen())
    setLastMove({ from: move.from, to: move.to })
    setCompleted(true)
    setMessage(`Richtig: ${selected.notation}. Lektion abgeschlossen.`)
    if (!user) {
      setProgress((items) => {
        const next = items.includes(selected.id) ? items : [...items, selected.id]
        localStorage.setItem('knight-club-lesson-progress', JSON.stringify(next))
        return next
      })
      return
    }
    setBusy(true)
    try {
      await saveLessonProgress(user.id, selected.id, 100)
      setProgress((items) => items.includes(selected.id) ? items : [...items, selected.id])
    } catch (caught) {
      setError(caught instanceof Error ? `Lektion geschafft, aber nicht gespeichert: ${caught.message}` : 'Fortschritt konnte nicht gespeichert werden.')
    } finally { setBusy(false) }
  }

  return (
    <div className="platform-page learn-page">
      <div className="page-heading-row"><div><span className="eyebrow"><span className="eyebrow-line" /> SCHACH VERSTEHEN</span><h1>Lernen</h1><p>Kurze Lektionen mit einem konkreten Zug zum Ausprobieren.</p></div><div className="lesson-progress-badge"><GraduationCap size={18} /><span><small>DEIN FORTSCHRITT</small><strong>{user ? `${completedCount} / ${lessons.length} Lektionen` : 'Gastmodus'}</strong></span></div></div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="learn-layout"><aside className="lesson-list-panel"><div className="panel-heading"><div><span className="panel-kicker">LEKTIONEN</span><h2>Trainingsplan</h2></div><BookOpen size={18} /></div>{lessons.map((lesson, index) => <button key={lesson.id} className={`lesson-list-item ${selected.id === lesson.id ? 'lesson-list-active' : ''}`} onClick={() => chooseLesson(lesson)}><span className="lesson-index">{progress.includes(lesson.id) ? <CheckCircle2 size={18} /> : `0${index + 1}`}</span><span><small>{lesson.category.toUpperCase()} · {lesson.level.toUpperCase()}</small><strong>{lesson.title}</strong></span><ArrowRight size={15} /></button>)}<div className="lesson-list-note"><CheckCircle2 size={14} /> {user ? 'Im Gastprofil gespeichert.' : 'Kostenlos in diesem Browser gespeichert.'}</div></aside>
        <section className="lesson-workspace"><div className="lesson-copy"><span className="panel-kicker">{selected.category.toUpperCase()} · {selected.level.toUpperCase()}</span><h2>{selected.title}</h2><p className="lesson-objective"><Target size={15} /> {selected.objective}</p><p>{selected.explanation}</p><div className={`lesson-feedback ${completed ? 'lesson-feedback-done' : ''}`} role="status">{completed ? <CheckCircle2 size={16} /> : <Lightbulb size={16} />}{message}</div>{showHint && <div className="lesson-hint">{selected.hint}</div>}<div className="lesson-actions"><button className="button-secondary" onClick={() => setShowHint(!showHint)}><Lightbulb size={15} /> {showHint ? 'Hinweis verbergen' : 'Hinweis'}</button><button className="button-secondary" onClick={() => chooseLesson(selected)}><RotateCcw size={15} /> Neu starten</button></div></div><div className="lesson-board-column"><div className="lesson-board-label"><span className="daily-dot" />{completed ? 'LEKTION ABGESCHLOSSEN' : 'WEISS AM ZUG'}</div><ChessBoard fen={fen} onMove={makeMove} interactive={!completed && !busy} lastMove={lastMove} /></div></section>
      </div>
    </div>
  )
}
