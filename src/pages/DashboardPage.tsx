import { useEffect, useState } from 'react'
import { ArrowRight, Bot, ChartNoAxesColumnIncreasing, Clock3, Crown, Gamepad2, History, Puzzle, ShieldCheck, Trophy, UserRound, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { loadGames, loadPlayerRatings } from '../lib/data'
import { supabaseConfigured } from '../lib/supabase'
import type { PlayerRating, SavedGame } from '../lib/types'

type Props = { navigate: (path: string) => void; refreshKey: number }

export default function DashboardPage({ navigate, refreshKey }: Props) {
  const { user, profile } = useAuth()
  const [games, setGames] = useState<SavedGame[]>([])
  const [ratings, setRatings] = useState<PlayerRating[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) { setGames([]); setRatings([]); return }
    let active = true
    setLoading(true)
    Promise.all([loadGames(user.id, 12), loadPlayerRatings(user.id)]).then(([recentGames, playerRatings]) => {
      if (!active) return
      setGames(recentGames)
      setRatings(playerRatings)
      setError('')
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Deine Übersicht konnte nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user, refreshKey])

  const finishedGames = games.filter((game) => game.game_mode !== 'local')
  const wins = finishedGames.filter((game) => game.winner_id === user?.id).length
  const draws = finishedGames.filter((game) => game.result === '1/2-1/2').length
  const losses = finishedGames.filter((game) => game.result && game.result !== '1/2-1/2' && game.winner_id !== user?.id).length
  const winRate = finishedGames.length ? Math.round((wins / finishedGames.length) * 100) : null
  const accuracies = games.flatMap((game) => game.white_player_id === user?.id ? [game.white_accuracy] : game.black_player_id === user?.id ? [game.black_accuracy] : [])
    .filter((accuracy): accuracy is number => accuracy !== null)
  const averageAccuracy = accuracies.length ? Math.round(accuracies.reduce((sum, accuracy) => sum + accuracy, 0) / accuracies.length) : null
  const primaryRating = ratings.find((rating) => rating.game_type === 'rapid') ?? ratings[0]
  const displayName = profile?.display_name ?? 'Schachfreund'
  const greeting = new Date().getHours() < 12 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Guten Tag' : 'Guten Abend'

  return (
    <div className="platform-page dashboard-page">
      <section className="dashboard-hero"><div className="dashboard-hero-copy"><span className="eyebrow"><span className="eyebrow-line" /> DEIN SCHACHPLATZ</span><h1>{greeting}{user ? `, ${displayName}` : ', willkommen.'}</h1><p>Bereit für deinen nächsten Zug?</p><div className="dashboard-hero-actions"><button className="button-primary" onClick={() => navigate('/play?mode=online')}><Gamepad2 size={17} /> Online spielen <ArrowRight size={15} /></button><button className="button-secondary" onClick={() => navigate('/play?mode=computer')}><Bot size={16} /> Gegen Computer</button></div></div><div className="dashboard-hero-art" aria-hidden="true"><span className="hero-orbit hero-orbit-one" /><span className="hero-orbit hero-orbit-two" /><span className="hero-piece">♞</span><span className="hero-spark hero-spark-one">✦</span><span className="hero-spark hero-spark-two">·</span></div><div className="dashboard-greeting-badge"><span /> {user ? 'KONTO AKTIV' : 'GASTMODUS'}</div></section>

      {error && <div className="inline-error" role="alert">{error}</div>}

      <section className="dashboard-metric-grid" aria-label="Spielstatistiken">
        <article className="metric-card"><span className="metric-icon metric-rating"><Trophy size={18} /></span><span className="metric-label">SCHACHWERTUNG</span><strong>{primaryRating?.rating ?? '—'}</strong><small>{primaryRating ? `${primaryRating.game_type.toUpperCase()} · ${primaryRating.games_played} gewertete Partien` : user ? 'Noch keine gewerteten Partien' : 'Gastwertung nach Backend-Verbindung verfügbar'}</small></article>
        <article className="metric-card"><span className="metric-icon metric-games"><History size={18} /></span><span className="metric-label">GESPIELTE PARTIEN</span><strong>{user ? (loading ? '…' : String(games.length)) : '—'}</strong><small>{user ? 'Partien in deinem Gastprofil' : 'Lokale Partien funktionieren direkt'}</small></article>
        <article className="metric-card"><span className="metric-icon metric-win"><ChartNoAxesColumnIncreasing size={18} /></span><span className="metric-label">SIEGQUOTE</span><strong>{winRate === null ? '—' : `${winRate}%`}</strong><small>{finishedGames.length ? `${wins} Siege · ${losses} Niederlagen · ${draws} Remis` : 'Nach deinen ersten gespeicherten Partien'}</small></article>
        <article className="metric-card"><span className="metric-icon metric-friends"><ShieldCheck size={18} /></span><span className="metric-label">GENAUIGKEIT</span><strong>{averageAccuracy === null ? '—' : `${averageAccuracy}%`}</strong><small>{averageAccuracy === null ? 'Nach einer Partieanalyse' : `Aus ${accuracies.length} analysierten Partien`}</small></article>
      </section>

      <div className="dashboard-content-grid">
        <section className="dashboard-section quick-play-section"><div className="section-title-line"><div><span className="panel-kicker">LOS GEHT’S</span><h2>Wie möchtest du spielen?</h2></div><span className="section-title-icon"><Gamepad2 size={18} /></span></div><div className="quick-play-grid"><button className="quick-play-card quick-online" onClick={() => navigate('/play?mode=online')}><span className="quick-card-icon"><Users size={19} /></span><span><strong>Online-Partie</strong><small>Finde einen Gegner oder lade Freunde ein.</small></span><ArrowRight size={16} /></button><button className="quick-play-card quick-computer" onClick={() => navigate('/play?mode=computer')}><span className="quick-card-icon"><Bot size={19} /></span><span><strong>Gegen Computer</strong><small>Spiele mit Stockfish in deiner Stärke.</small></span><ArrowRight size={16} /></button><button className="quick-play-card quick-local" onClick={() => navigate('/play?mode=local')}><span className="quick-card-icon"><Gamepad2 size={19} /></span><span><strong>Lokale Partie</strong><small>Zwei Spieler an einem Gerät.</small></span><ArrowRight size={16} /></button></div><div className="daily-puzzle-banner"><div className="daily-puzzle-icon"><Puzzle size={19} /></div><div><span className="panel-kicker">PUZZLE DES TAGES</span><strong>Finde den besten Zug</strong><small>Ein kurzes Taktiktraining für heute.</small></div><button onClick={() => navigate('/puzzles')}>Lösen <ArrowRight size={14} /></button></div></section>

        <section className="dashboard-section recent-games-section"><div className="section-title-line"><div><span className="panel-kicker">PARTIEVERLAUF</span><h2>Zuletzt gespielt</h2></div><button className="subtle-link" onClick={() => navigate(user ? '/history' : '/play')}>Alle anzeigen <ArrowRight size={14} /></button></div>{!user ? <div className="dashboard-empty"><div className="empty-illustration"><UserRound size={21} /></div><strong>Spiele jederzeit als Gast</strong><p>Partien funktionieren ohne Anmeldung. Mit dem Backend werden Ergebnisse im Gastprofil gespeichert.</p><button className="button-secondary" onClick={() => navigate('/play')}>Partie starten</button></div> : loading ? <div className="dashboard-empty"><span className="loading-dots">Lade deine Partien …</span></div> : games.length ? <div className="recent-game-list">{games.slice(0, 5).map((game) => <button key={game.id} className="recent-game-row" onClick={() => navigate(`/history?game=${game.id}`)}><span className={`result-mark ${game.game_mode === 'local' || game.result === '1/2-1/2' ? 'result-draw' : game.winner_id === user.id ? 'result-win' : 'result-loss'}`}>{game.game_mode === 'local' ? '·' : game.result === '1/2-1/2' ? '½' : game.winner_id === user.id ? 'W' : 'L'}</span><span className="recent-game-info"><strong>{game.opponent_label ?? (game.game_mode === 'online' ? 'Online-Gegner' : game.game_mode === 'computer' ? 'Stockfish' : 'Lokale Partie')}</strong><small>{game.game_type.toUpperCase()} · {game.time_control} · {new Date(game.completed_at ?? game.created_at).toLocaleDateString('de-DE')}</small></span><span className="recent-game-result">{game.result}</span></button>)}</div> : <div className="dashboard-empty"><div className="empty-illustration"><History size={21} /></div><strong>Noch keine gespeicherten Partien</strong><p>Deine abgeschlossenen lokalen und Online-Partien erscheinen hier.</p><button className="text-link" onClick={() => navigate('/play')}>Erste Partie starten <ArrowRight size={14} /></button></div>}</section>

        <section className="dashboard-section skill-section"><div className="section-title-line"><div><span className="panel-kicker">DEIN TRAINING</span><h2>Ein Zug nach dem anderen.</h2></div><span className="skill-motif">✧</span></div><div className="skill-tip"><div className="skill-tip-number">01</div><div><strong>Prüfe die Drohungen.</strong><p>Bevor du ziehst, frag dich: Was würde mein Gegner im nächsten Zug spielen?</p></div></div><button className="subtle-link" onClick={() => navigate('/learn')}>Zu den Lektionen <ArrowRight size={14} /></button></section>

        <section className="dashboard-section account-status-section"><div className="section-title-line"><div><span className="panel-kicker">GASTMODUS</span><h2>{user ? 'Kostenloses Gastprofil' : 'Offline spielbereit'}</h2></div><ShieldCheck size={19} className="status-shield" /></div><p>{user ? 'Partien und Wertungen werden ohne Registrierung mit deinem Gastprofil synchronisiert.' : 'Lokale Partien, Rätsel, Lektionen und Analyse funktionieren ohne Backend und ohne Login.'}</p>{user && <button className="subtle-link" onClick={() => navigate('/profile')}>Gastprofil ansehen <ArrowRight size={14} /></button>}{!supabaseConfigured && <small className="backend-note">Für Onlinepartien und geräteübergreifende Speicherung Supabase verbinden.</small>}</section>
      </div>

      <div className="dashboard-bottom-links"><button onClick={() => navigate('/analysis')}><ChartNoAxesColumnIncreasing size={15} /> Partieanalyse</button><button onClick={() => navigate('/opening-explorer')}><Clock3 size={15} /> Eröffnungen</button><button onClick={() => navigate('/premium')}><Crown size={15} /> Alle Funktionen kostenlos</button></div>
    </div>
  )
}
