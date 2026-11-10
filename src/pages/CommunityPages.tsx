import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowRight, Award, Check, CircleUserRound, ExternalLink, MessageCircle, Search, ShieldCheck, Trophy, UserMinus, UserPlus, Users, Wifi, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import AccountGate from '../components/AccountGate'
import { loadFriendships, loadLeaderboard, loadPlayerRatings, loadGames, removeFriendship, respondToFriendRequest, sendFriendRequest } from '../lib/data'
import { supabase, supabaseConfigured } from '../lib/supabase'
import type { GameCategory, PlayerProfile, PlayerRating, SavedGame } from '../lib/types'

export function LeaderboardPage() {
  const [category, setCategory] = useState<GameCategory>('rapid')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!supabaseConfigured) { setRows([]); return }
    let active = true
    setLoading(true)
    loadLeaderboard(category).then((result) => { if (active) { setRows(result); setError('') } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Rangliste konnte nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [category])
  return <div className="platform-page"><PageHeading eyebrow="WERTUNGEN" title="Rangliste" summary="Öffentliche Wertungen aus tatsächlich gespielten, gewerteten Online-Partien." /><div className="segmented-tabs">{(['bullet', 'blitz', 'rapid', 'custom'] as GameCategory[]).map((item) => <button className={category === item ? 'segment-active' : ''} key={item} onClick={() => setCategory(item)}>{item === 'custom' ? 'Eigene' : item[0].toUpperCase() + item.slice(1)}</button>)}</div>{error && <div className="inline-error">{error}</div>}{!supabaseConfigured ? <BackendNotice /> : loading ? <div className="page-loading">Lade Rangliste …</div> : rows.length ? <section className="table-card"><div className="table-header rank-grid"><span>RANG</span><span>SPIELER</span><span>WERTUNG</span><span>PARTIEN</span><span>LETZTE AKTIVITÄT</span></div>{rows.map((row, index) => { const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; return <div className="table-row rank-grid" key={row.user_id}><span className={`rank-number ${index < 3 ? `rank-top-${index + 1}` : ''}`}>{index + 1}</span><span className="rank-player"><span className="avatar">{profile?.display_name?.slice(0, 1) ?? '?'}</span><span><strong>{profile?.display_name ?? profile?.username ?? 'Spieler'}</strong><small>@{profile?.username ?? 'unbekannt'}</small></span></span><strong className="rank-rating">{row.rating}</strong><span>{row.games_played}</span><time>{new Date(row.updated_at).toLocaleDateString('de-DE')}</time></div>})}</section> : <EmptyState icon={<Trophy size={23} />} title="Noch keine gewerteten Partien" copy="Die Rangliste füllt sich, sobald Spieler Online-Partien mit Wertung abschließen." />}</div>
}

type FriendItem = { id: string; requester_id: string; addressee_id: string; status: 'pending' | 'accepted' | 'declined'; counterpart: PlayerProfile | null }

function usePresence() {
  const { user, profile } = useAuth()
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  useEffect(() => {
    const client = supabase
    if (!user || !client) return
    const channel = client.channel('online-users', { config: { private: true, presence: { key: user.id } } })
      .on('presence', { event: 'sync' }, () => {
        const presence = channel.presenceState<{ user_id: string }>()
        setOnlineUsers(new Set(Object.values(presence).flat().map((entry) => entry.user_id)))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ user_id: user.id, username: profile?.username ?? user.id, display_name: profile?.display_name ?? 'Schachfreund', online_at: new Date().toISOString() })
      })
    return () => { void client.removeChannel(channel) }
  }, [user, profile?.username, profile?.display_name])
  return onlineUsers
}

export function FriendsPage() {
  const { user } = useAuth()
  const onlineUsers = usePresence()
  const [rows, setRows] = useState<FriendItem[]>([])
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    if (!user) return
    setLoading(true)
    try { setRows(await loadFriendships(user.id) as FriendItem[]); setError('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Freundesliste konnte nicht geladen werden.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [user])

  if (!user) return <div className="platform-page"><PageHeading eyebrow="COMMUNITY" title="Freunde" summary="Füge Freunde hinzu, sieh ihren Online-Status und lade sie zu einer Partie ein." /><AccountGate /></div>
  const accepted = rows.filter((row) => row.status === 'accepted')
  const incoming = rows.filter((row) => row.status === 'pending' && row.addressee_id === user.id)
  const outgoing = rows.filter((row) => row.status === 'pending' && row.requester_id === user.id)

  async function addFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try { await sendFriendRequest(user!.id, username); setUsername(''); setMessage('Freundschaftsanfrage gesendet.'); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Anfrage konnte nicht gesendet werden.') }
  }
  async function respond(id: string, status: 'accepted' | 'declined') {
    setBusyId(id)
    try { await respondToFriendRequest(id, status); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Anfrage konnte nicht aktualisiert werden.') }
    finally { setBusyId('') }
  }
  async function remove(id: string) {
    setBusyId(id)
    try { await removeFriendship(id); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Freund konnte nicht entfernt werden.') }
    finally { setBusyId('') }
  }
  async function inviteFriend() {
    if (!supabase) return
    const { data, error: inviteError } = await supabase.rpc('create_game_invite', { p_game_type: 'blitz', p_time_control: '3 + 2', p_base_seconds: 180, p_increment_seconds: 2 })
    if (inviteError) { setError(inviteError.message); return }
    const invite = data as { invite_code: string }
    const url = `${window.location.origin}/play?invite=${invite.invite_code}`
    try { await navigator.clipboard.writeText(url); setMessage(`Freundescode ${invite.invite_code} erstellt. Code oder kopierten Link mit deinem Freund teilen.`) }
    catch { setMessage(`Einladungscode: ${invite.invite_code}`) }
  }

  return <div className="platform-page"><PageHeading eyebrow="COMMUNITY" title="Freunde" summary="Bleib mit Schachfreunden in Kontakt und fordere sie zu einer Partie heraus." /><div className="friends-layout"><section className="dashboard-section friend-main"><div className="section-title-line"><div><span className="panel-kicker">DEINE COMMUNITY</span><h2>Freundesliste <span className="friend-count">{accepted.length}</span></h2></div><button className="button-secondary" onClick={() => void inviteFriend()}><Users size={15} /> Partie-Einladung kopieren</button></div>{loading ? <div className="page-loading">Lade Freundesliste …</div> : accepted.length ? <div className="friend-list">{accepted.map((row) => { const person = row.counterpart; const online = person ? onlineUsers.has(person.id) : false; return <div className="friend-row" key={row.id}><span className="avatar friend-avatar">{person?.display_name?.slice(0, 1) ?? '?' }<i className={online ? 'presence-online' : ''} /></span><span className="friend-info"><strong>{person?.display_name ?? 'Spieler'}</strong><small>@{person?.username ?? 'unbekannt'} · {online ? 'Online' : 'Offline'}</small></span><button className="friend-challenge" onClick={() => void inviteFriend()}><MessageCircle size={14} /> Einladen</button><button className="icon-quiet" title="Freund entfernen" onClick={() => void remove(row.id)} disabled={busyId === row.id}><UserMinus size={15} /></button></div> })}</div> : <EmptyState icon={<Users size={22} />} title="Deine Liste wartet auf den ersten Freund" copy="Suche nach einem Benutzernamen und sende eine Anfrage." />}</section>
        <aside className="friends-side"><section className="panel-card friend-search-card"><div className="panel-heading"><div><span className="panel-kicker">SPIELER FINDEN</span><h2>Freund hinzufügen</h2></div><UserPlus size={18} /></div><form className="friend-search-form" onSubmit={addFriend}><input required minLength={3} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Benutzername" /><button className="button-primary" aria-label="Freund suchen"><Search size={15} /></button></form><small>Die Anfrage wird an das passende Knight Club Profil gesendet.</small></section>{incoming.length > 0 && <section className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">ANFRAGEN</span><h2>Eingehend · {incoming.length}</h2></div><UserPlus size={18} /></div>{incoming.map((row) => <div className="request-row" key={row.id}><span>{row.counterpart?.display_name ?? row.counterpart?.username ?? 'Spieler'}</span><button aria-label="Annehmen" onClick={() => void respond(row.id, 'accepted')} disabled={busyId === row.id}><Check size={14} /></button><button aria-label="Ablehnen" onClick={() => void respond(row.id, 'declined')} disabled={busyId === row.id}><X size={14} /></button></div>)}</section>}{outgoing.length > 0 && <section className="panel-card"><span className="panel-kicker">AUSSTEHEND</span><h2 className="small-panel-title">Gesendete Anfragen</h2>{outgoing.map((row) => <div className="pending-row" key={row.id}>{row.counterpart?.username ?? 'Spieler'} <span>Wartet auf Antwort</span></div>)}</section>}</aside></div>{error && <div className="inline-error">{error}</div>}{message && <div className="inline-success">{message}</div>}<div className="presence-footnote"><Wifi size={14} /> Online-Anzeige nutzt Supabase Realtime Presence. Deine Anwesenheit bleibt sichtbar, solange dein Gastprofil online ist.</div></div>
}

export function ProfilePage({ username, navigate }: { username?: string; navigate: (path: string) => void }) {
  const { user, profile: ownProfile } = useAuth()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [ratings, setRatings] = useState<PlayerRating[]>([])
  const [games, setGames] = useState<SavedGame[]>([])
  const [error, setError] = useState('')
  const isOwn = !username || username === ownProfile?.username
  useEffect(() => {
    let active = true
    const client = supabase
    if (!client) return
    async function load() {
      try {
        if (isOwn && user) {
          const [ratingRows, gameRows] = await Promise.all([loadPlayerRatings(user.id), loadGames(user.id, 20)])
          if (active) { setProfile(ownProfile); setRatings(ratingRows); setGames(gameRows) }
        } else if (username) {
          const { data, error: profileError } = await client!.from('profiles').select('*').eq('username', username).maybeSingle()
          if (profileError) throw profileError
          if (!data) throw new Error('Profil wurde nicht gefunden.')
          const { data: ratingData, error: ratingError } = await client!.from('player_ratings').select('*').eq('user_id', data.id)
          if (ratingError) throw ratingError
          if (active) { setProfile(data as PlayerProfile); setRatings((ratingData ?? []) as PlayerRating[]); setGames([]) }
        }
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : 'Profil konnte nicht geladen werden.') }
    }
    void load()
    return () => { active = false }
  }, [isOwn, user, username, ownProfile])

  if (!user && !username) return <div className="platform-page"><PageHeading eyebrow="COMMUNITY" title="Profil noch nicht verfügbar" summary="Ein Gastprofil wird bereitgestellt, sobald die anonyme Backend-Verbindung aktiv ist." /><AccountGate /></div>
  if (!supabaseConfigured) return <div className="platform-page"><PageHeading eyebrow="SPIELERPROFIL" title="Profil" summary="Verbinde Supabase, um echte Spielerprofile und Wertungen zu laden." /><BackendNotice /></div>
  const rapid = ratings.find((rating) => rating.game_type === 'rapid')
  const onlineGames = games.filter((game) => game.game_mode === 'online' || game.game_mode === 'computer')
  const wins = onlineGames.filter((game) => game.winner_id === profile?.id).length
  const accuracyValues = games.flatMap((game) => game.white_player_id === profile?.id ? [game.white_accuracy] : game.black_player_id === profile?.id ? [game.black_accuracy] : [])
    .filter((accuracy): accuracy is number => accuracy !== null)
  const averageAccuracy = accuracyValues.length ? Math.round(accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length) : null
  return <div className="platform-page"><PageHeading eyebrow="SPIELERPROFIL" title={profile?.display_name ?? 'Profil'} summary={profile ? `@${profile.username} · Seit ${new Date(profile.created_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}` : 'Lade Profil …'} />{error && <div className="inline-error">{error}</div>}{profile && <><section className="profile-hero-card"><span className="avatar profile-hero-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="Profilbild" /> : profile.display_name.slice(0, 1).toUpperCase()}</span><div><span className="panel-kicker">{isOwn ? 'DEIN PROFIL' : 'KNIGHT CLUB SPIELER'}</span><h2>{profile.display_name}</h2><span>@{profile.username}{profile.country ? ` · ${profile.country}` : ''}</span><p>{profile.bio || 'Noch keine Profilbeschreibung.'}</p></div>{isOwn && <button className="button-secondary" onClick={() => navigate('/settings')}>Profil bearbeiten <ArrowRight size={14} /></button>}</section><section className="profile-stat-grid"><div><Trophy size={17} /><span>Rapid-Wertung</span><strong>{rapid?.rating ?? '—'}</strong><small>{rapid ? `${rapid.games_played} gewertete Partien` : 'Noch keine Rapid-Wertung'}</small></div><div><ShieldCheck size={17} /><span>Gewertete Partien</span><strong>{ratings.reduce((total, rating) => total + rating.games_played, 0)}</strong><small>Über alle Zeitkontrollen</small></div><div><Award size={17} /><span>Genauigkeit</span><strong>{isOwn && averageAccuracy !== null ? `${averageAccuracy}%` : '—'}</strong><small>{isOwn && averageAccuracy !== null ? `Aus ${accuracyValues.length} analysierten Partien` : 'Nach einer Partieanalyse'}</small></div><div><Trophy size={17} /><span>Siege gegen Gegner</span><strong>{isOwn ? wins : '—'}</strong><small>{isOwn ? 'Online- und Computerpartien' : 'Privater Spielverlauf'}</small></div></section>{isOwn && <section className="dashboard-section profile-rating-section"><div className="section-title-line"><div><span className="panel-kicker">DEINE WERTUNGEN</span><h2>Spielstärke nach Zeitkontrolle</h2></div><button className="subtle-link" onClick={() => navigate('/leaderboard')}>Rangliste <ArrowRight size={14} /></button></div><div className="rating-card-list">{(['bullet', 'blitz', 'rapid', 'custom'] as GameCategory[]).map((type) => { const rating = ratings.find((row) => row.game_type === type); return <div className="rating-card-row" key={type}><span>{type === 'custom' ? 'Eigene' : type[0].toUpperCase() + type.slice(1)}</span><strong>{rating?.rating ?? '—'}</strong><small>{rating ? `${rating.wins}S · ${rating.losses}N · ${rating.draws}R` : 'Noch nicht gewertet'}</small></div> })}</div></section>}</>}</div>
}

export function HistoryPage({ onAnalyze }: { onAnalyze: (game: SavedGame) => void }) {
  const { user } = useAuth()
  const requestedGameId = new URLSearchParams(window.location.search).get('game')
  const [games, setGames] = useState<SavedGame[]>([])
  const [modeFilter, setModeFilter] = useState('all')
  const [gameTypeFilter, setGameTypeFilter] = useState('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!user) return
    let active = true
    setLoading(true)
    loadGames(user.id).then((rows) => { if (active) setGames(rows) })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Partien konnten nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user])
  useEffect(() => {
    if (!requestedGameId || loading) return
    const target = Array.from(document.querySelectorAll<HTMLElement>('.history-card')).find((card) => card.dataset.gameId === requestedGameId)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [games, loading, requestedGameId])
  if (!user) return <div className="platform-page"><PageHeading eyebrow="PARTIEVERLAUF" title="Spielhistorie" summary="Partien werden im Gastmodus gespeichert, sobald das Backend verbunden ist." /><AccountGate /></div>
  const filtered = games.filter((game) => (modeFilter === 'all' || game.game_mode === modeFilter) && (gameTypeFilter === 'all' || game.game_type === gameTypeFilter))
  function downloadPgn(game: SavedGame) {
    const blob = new Blob([game.pgn], { type: 'application/x-chess-pgn' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `knight-club-${game.id.slice(0, 8)}.pgn`
    link.click()
    URL.revokeObjectURL(url)
  }
  return <div className="platform-page"><PageHeading eyebrow="PARTIEVERLAUF" title="Spielhistorie" summary="Abgeschlossene Partien aus deinem Gastprofil." /><div className="history-filters"><label>Modus<select value={modeFilter} onChange={(event) => setModeFilter(event.target.value)}><option value="all">Alle Modi</option><option value="local">Lokal</option><option value="computer">Computer</option><option value="online">Online</option></select></label><label>Zeitkontrolle<select value={gameTypeFilter} onChange={(event) => setGameTypeFilter(event.target.value)}><option value="all">Alle Zeitkontrollen</option><option value="bullet">Bullet</option><option value="blitz">Blitz</option><option value="rapid">Rapid</option><option value="custom">Eigene</option></select></label></div>{error && <div className="inline-error">{error}</div>}{loading ? <div className="page-loading">Lade deine Partien …</div> : filtered.length ? <section className="history-list">{filtered.map((game) => <article className={`history-card ${requestedGameId === game.id ? 'history-card-target' : ''}`} data-game-id={game.id} key={game.id}><span className={`result-mark ${game.game_mode === 'local' ? 'result-draw' : game.winner_id === user.id ? 'result-win' : game.result === '1/2-1/2' ? 'result-draw' : 'result-loss'}`}>{game.game_mode === 'local' ? '·' : game.result === '1/2-1/2' ? '½' : game.winner_id === user.id ? 'W' : 'L'}</span><div className="history-game-details"><div><strong>{game.opponent_label ?? (game.game_mode === 'online' ? 'Online-Gegner' : 'Lokale Partie')}</strong><span>{game.game_type.toUpperCase()} · {game.time_control} · {new Date(game.completed_at ?? game.created_at).toLocaleString('de-DE')}</span></div><div className="history-game-meta"><span>{game.result}</span><small>{game.san_moves.length} Halbzüge{game.white_accuracy !== null || game.black_accuracy !== null ? ` · ${game.white_player_id === user.id ? game.white_accuracy : game.black_accuracy}% Genauigkeit` : ''}</small></div></div><div className="history-actions"><button onClick={() => onAnalyze(game)} disabled={!game.pgn}><Search size={14} /> Analysieren</button><button title="PGN herunterladen" onClick={() => downloadPgn(game)} disabled={!game.pgn}><ExternalLink size={14} /></button></div></article>)}</section> : <EmptyState icon={<CircleUserRound size={22} />} title="Noch keine Partien gespeichert" copy="Spiele eine Partie, damit sie hier erscheint." />}</div>
}

export function PageHeading({ eyebrow, title, summary }: { eyebrow: string; title: string; summary: string }) { return <div className="page-heading-row"><div><span className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</span><h1>{title}</h1><p>{summary}</p></div></div> }
export function EmptyState({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) { return <div className="content-empty"><div className="empty-illustration">{icon}</div><strong>{title}</strong><p>{copy}</p></div> }
export function BackendNotice() { return <div className="backend-notice"><ShieldCheck size={21} /><div><strong>Supabase ist noch nicht verbunden</strong><p>Lege .env.local mit VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY an und wende die Migration unter supabase/migrations an. Danach werden hier echte Konten- und Partiedaten geladen.</p></div></div> }
