import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowRight, Bell, Check, ExternalLink, Globe2, Palette, ShieldCheck, Star, Trophy, Upload, Users, Wifi } from 'lucide-react'
import ChessBoard from '../components/ChessBoard'
import { useAuth } from '../contexts/AuthContext'
import { supabase, supabaseConfigured } from '../lib/supabase'
import type { GameCategory } from '../lib/types'
import { BackendNotice, EmptyState, PageHeading } from './CommunityPages'

type PublicGame = {
  id: string
  white_player_id: string | null
  black_player_id: string | null
  game_type: GameCategory
  time_control: string
  status: string
  fen: string
  pgn: string
  result: string | null
  started_at: string | null
  updated_at?: string
  whiteName?: string
  blackName?: string
}

export function WatchPage() {
  const [games, setGames] = useState<PublicGame[]>([])
  const [selected, setSelected] = useState<PublicGame | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const { data, error: queryError } = await client.from('games')
          .select('id,white_player_id,black_player_id,game_type,time_control,status,fen,pgn,result,started_at,updated_at')
          .eq('is_public', true).eq('status', 'active').order('started_at', { ascending: false }).limit(24)
        if (queryError) throw queryError
        const rows = (data ?? []) as PublicGame[]
        const playerIds = [...new Set(rows.flatMap((row) => [row.white_player_id, row.black_player_id].filter(Boolean) as string[]))]
        const names = new Map<string, string>()
        if (playerIds.length) {
          const { data: profiles, error: profilesError } = await client.from('profiles').select('id,display_name').in('id', playerIds)
          if (profilesError) throw profilesError
          for (const profile of profiles ?? []) names.set(profile.id, profile.display_name)
        }
        const namedRows = rows.map((row) => ({ ...row, whiteName: row.white_player_id ? names.get(row.white_player_id) : 'Weiß', blackName: row.black_player_id ? names.get(row.black_player_id) : 'Schwarz' }))
        if (!active) return
        setGames(namedRows)
        setSelected((previous) => namedRows.find((row) => row.id === previous?.id) ?? namedRows[0] ?? null)
        setError('')
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : 'Live-Partien konnten nicht geladen werden.') }
      finally { if (active) setLoading(false) }
    }
    void load()
    const channel = client.channel('public-live-games').on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => { void load() }).subscribe()
    return () => { active = false; void client.removeChannel(channel) }
  }, [])

  return <div className="platform-page"><PageHeading eyebrow="LIVE-SCHACH" title="Zuschauen" summary="Verfolge öffentliche Knight Club Partien und sieh die Züge in Echtzeit." />{!supabaseConfigured ? <BackendNotice /> : error ? <div className="inline-error">{error}</div> : loading && !games.length ? <div className="page-loading">Suche öffentliche Partien …</div> : games.length ? <div className="watch-layout"><section className="platform-board-card watch-board-card"><div className="platform-board-head"><div><span className="panel-kicker">LIVE · {selected?.game_type.toUpperCase()} · {selected?.time_control}</span><h2>{selected?.whiteName} gegen {selected?.blackName}</h2></div><span className="live-watch-badge"><i /> LIVE</span></div>{selected && <ChessBoard fen={selected.fen} onMove={() => undefined} interactive={false} />}</section><aside className="panel-card live-game-list"><div className="panel-heading"><div><span className="panel-kicker">ÖFFENTLICHE PARTIEN</span><h2>{games.length} live</h2></div><Wifi size={18} /></div>{games.map((game) => <button key={game.id} className={`live-game-row ${selected?.id === game.id ? 'live-game-selected' : ''}`} onClick={() => setSelected(game)}><span className="live-game-dot" /><span><strong>{game.whiteName} – {game.blackName}</strong><small>{game.game_type} · {game.time_control}</small></span><ArrowRight size={14} /></button>)}</aside></div> : <EmptyState icon={<Wifi size={22} />} title="Gerade keine öffentlichen Partien" copy="Online-Partien aus der Gegnersuche erscheinen hier, sobald Spieler eine Partie starten." />}</div>
}

export function NewsPage() {
  return <div className="platform-page"><PageHeading eyebrow="SCHACHWELT" title="Nachrichten" summary="Öffne aktuelle Schachnachrichten bei den Verlagen und Verbänden, die sie veröffentlichen." /><div className="news-source-grid"><a className="news-source-card" href="https://www.chess.com/news" target="_blank" rel="noreferrer"><span className="news-source-icon"><Globe2 size={20} /></span><span className="panel-kicker">CHESS.COM</span><strong>Chess.com News</strong><p>Turniere, Spieler und Neuigkeiten aus der internationalen Schachwelt.</p><span className="news-source-open">Aktuelle Artikel öffnen <ExternalLink size={14} /></span></a><a className="news-source-card" href="https://www.fide.com/news" target="_blank" rel="noreferrer"><span className="news-source-icon news-source-fide"><Trophy size={20} /></span><span className="panel-kicker">FIDE</span><strong>FIDE News</strong><p>Mitteilungen des Weltschachverbands und internationale Wettbewerbe.</p><span className="news-source-open">Aktuelle Mitteilungen öffnen <ExternalLink size={14} /></span></a><a className="news-source-card" href="https://lichess.org/blog" target="_blank" rel="noreferrer"><span className="news-source-icon news-source-community"><Users size={20} /></span><span className="panel-kicker">LICHESS</span><strong>Lichess Blog</strong><p>Schachprojekte, Community-Aktionen und Produktneuigkeiten.</p><span className="news-source-open">Blog öffnen <ExternalLink size={14} /></span></a></div><div className="news-credit"><ShieldCheck size={14} /> Artikel und Meldungen bleiben beim jeweiligen Herausgeber. Knight Club zeigt keine erfundenen Nachrichten.</div></div>
}

type Preferences = { boardTheme: 'green' | 'blue' | 'wood' | 'mono'; pieceSet: 'classic' | 'contrast' | 'minimal'; coordinates: boolean; sound: boolean }
const preferenceKey = 'knight-club-preferences'
const defaultPreferences: Preferences = { boardTheme: 'green', pieceSet: 'classic', coordinates: true, sound: false }
function readPreferences(): Preferences {
  try { return { ...defaultPreferences, ...JSON.parse(localStorage.getItem(preferenceKey) ?? '{}') } }
  catch { return defaultPreferences }
}

export function SettingsPage() {
  const { user, profile, updateProfile } = useAuth()
  const [preferences, setPreferences] = useState(readPreferences)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)

  useEffect(() => {
    setUsername(profile?.username ?? '')
    setDisplayName(profile?.display_name ?? '')
    setBio(profile?.bio ?? '')
    setCountry(profile?.country ?? '')
  }, [profile])

  function updatePreferences(changes: Partial<Preferences>) {
    const next = { ...preferences, ...changes }
    setPreferences(next)
    localStorage.setItem(preferenceKey, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('knight-club-preferences'))
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      await updateProfile({ username, display_name: displayName, bio, country: country || null })
      setMessage('Profil gespeichert.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Änderungen konnten nicht gespeichert werden.') }
    finally { setBusy(false) }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !user || !supabase) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Verwende PNG, JPG oder WebP bis 2 MB.'); return }
    setAvatarBusy(true); setError('')
    try {
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await updateProfile({ avatar_url: data.publicUrl })
      setMessage('Profilbild aktualisiert.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Profilbild konnte nicht hochgeladen werden.') }
    finally { setAvatarBusy(false); event.target.value = '' }
  }

  return <div className="platform-page settings-page"><PageHeading eyebrow="GASTPROFIL & DARSTELLUNG" title="Einstellungen" summary="Passe das Brett an und verwalte dein kostenloses Gastprofil." />{user && <form className="settings-panel dashboard-section" onSubmit={saveAccount}><div className="section-title-line"><div><span className="panel-kicker">GASTPROFIL</span><h2>Profilinformationen</h2></div><ShieldCheck size={18} /></div><div className="avatar-edit-row"><span className="avatar avatar-settings">{profile?.avatar_url ? <img src={profile.avatar_url} alt="Profilbild" /> : displayName.slice(0, 1).toUpperCase() || 'G'}</span><div><strong>{profile?.username ? `@${profile.username}` : 'Dein Profil'}</strong><small>PNG, JPG oder WebP · maximal 2 MB</small></div><label className="button-secondary avatar-upload-button"><Upload size={14} />{avatarBusy ? 'Lädt …' : 'Bild ändern'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} hidden /></label></div><div className="settings-form-grid"><label>Anzeigename<input required maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Benutzername<input required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>Land (ISO-Code)<input maxLength={2} value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} placeholder="DE" /></label><label className="settings-bio-label">Kurzbiografie<textarea maxLength={240} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Was spielst du am liebsten?" /></label></div><div className="settings-form-actions"><button className="button-primary" disabled={busy}>{busy ? 'Speichert …' : 'Profil speichern'}</button></div></form>}{!user && <section className="dashboard-section guest-settings"><div className="section-title-line"><div><span className="panel-kicker">GASTPROFIL</span><h2>Offline-Modus</h2></div><ShieldCheck size={18} /></div><p>Deine Brettdarstellung wird lokal gespeichert. Für ein Gastprofil auf mehreren Geräten verbinde das Backend; eine Anmeldung bleibt unnötig.</p></section>}
    <section className="settings-panel dashboard-section"><div className="section-title-line"><div><span className="panel-kicker">BRETT & FIGUREN</span><h2>Darstellung</h2></div><Palette size={18} /></div><div className="appearance-grid"><label>Brettfarbe<select value={preferences.boardTheme} onChange={(event) => updatePreferences({ boardTheme: event.target.value as Preferences['boardTheme'] })}><option value="green">Grün</option><option value="blue">Blau</option><option value="wood">Holz</option><option value="mono">Monochrom</option></select></label><label>Figurenstil<select value={preferences.pieceSet} onChange={(event) => updatePreferences({ pieceSet: event.target.value as Preferences['pieceSet'] })}><option value="classic">Klassisch</option><option value="contrast">Hoher Kontrast</option><option value="minimal">Minimal</option></select></label></div><div className="settings-preview"><ChessBoard fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" onMove={() => undefined} interactive={false} theme={preferences.boardTheme} pieceSet={preferences.pieceSet} coordinates={preferences.coordinates} /></div><div className="preference-toggles"><label><span><strong>Koordinaten auf dem Brett</strong><small>Datei- und Rangmarkierungen anzeigen.</small></span><input type="checkbox" checked={preferences.coordinates} onChange={(event) => updatePreferences({ coordinates: event.target.checked })} /></label><label><span><strong>Lokale Zugtöne</strong><small>Kurze Signale bei Zügen aktivieren.</small></span><input type="checkbox" checked={preferences.sound} onChange={(event) => updatePreferences({ sound: event.target.checked })} /></label></div><div className="settings-privacy-note"><Bell size={14} /> Diese Darstellungseinstellungen werden auf diesem Gerät gespeichert.</div></section>{error && <div className="inline-error" role="alert">{error}</div>}{message && <div className="inline-success" role="status">{message}</div>}</div>
}

export function PremiumPage() {
  const features = ['Alle Spielmodi und Zeitkontrollen', 'Stockfish-Engine ohne Stärkenlimit', 'Puzzlepakete und persönliche Taktikwertung', 'Partieanalyse und PGN-Export', 'Profile, Freunde und Ranglisten', 'Brett- und Figurenstile']
  return <div className="platform-page"><PageHeading eyebrow="KNIGHT CLUB FÜR ALLE" title="Alles inklusive" summary="Alle Knight Club Funktionen sind kostenlos. Es gibt keine Premium-Schranke und kein kostenpflichtiges Abo." /><section className="free-membership-hero"><div className="free-membership-icon"><Star size={24} fill="currentColor" /></div><span className="panel-kicker">KOSTENLOS · OHNE ABO</span><h2>Volles Schach. Ohne Paywall.</h2><p>Jeder Spieler kann alle verfügbaren Spiel-, Trainings- und Analysefunktionen nutzen.</p><div className="free-feature-grid">{features.map((feature) => <div key={feature}><Check size={16} />{feature}</div>)}</div><div className="free-membership-foot"><ShieldCheck size={15} /> Alle Funktionen sind frei zugänglich. Zahlungsdaten werden nicht erhoben.</div></section></div>
}
