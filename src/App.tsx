import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, ArrowRight, Bell, BookOpen, ChartNoAxesColumnIncreasing,
  ChevronRight, Crown, Gamepad2, History, Menu, MoreHorizontal,
  Newspaper, Puzzle, Search, Settings, Swords, Trophy, UserRound,
  Users, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import DashboardPage from './pages/DashboardPage'
import PlayPage from './pages/PlayPage'
import PuzzlesPage from './pages/PuzzlesPage'
import LearnPage from './pages/LearnPage'
import AnalysisPage from './pages/AnalysisPage'
import OpeningExplorerPage from './pages/OpeningExplorerPage'
import {
  FriendsPage, HistoryPage, LeaderboardPage, ProfilePage,
} from './pages/CommunityPages'
import {
  NewsPage, PremiumPage, SettingsPage, WatchPage,
} from './pages/UtilityPages'
import { loadFriendships, searchProfiles } from './lib/data'
import { supabaseConfigured } from './lib/supabase'
import type { PlayerProfile, SavedGame } from './lib/types'

type RouteId = 'dashboard' | 'play' | 'puzzles' | 'learn' | 'watch' | 'news' | 'friends' | 'leaderboard' | 'analysis' | 'openings' | 'history' | 'profile' | 'settings' | 'free'
type RouteState = { path: string; search: string; id: RouteId; username?: string }
type NavEntry = { label: string; path: string; id: RouteId; icon: LucideIcon }

const primaryNav: NavEntry[] = [
  { label: 'Play', path: '/play', id: 'play', icon: Gamepad2 },
  { label: 'Puzzles', path: '/puzzles', id: 'puzzles', icon: Puzzle },
  { label: 'Learn', path: '/learn', id: 'learn', icon: BookOpen },
  { label: 'Watch', path: '/watch', id: 'watch', icon: Activity },
  { label: 'News', path: '/news', id: 'news', icon: Newspaper },
  { label: 'Social', path: '/friends', id: 'friends', icon: Users },
]

const moreNav: NavEntry[] = [
  { label: 'Analysis', path: '/analysis', id: 'analysis', icon: ChartNoAxesColumnIncreasing },
  { label: 'Openings', path: '/opening-explorer', id: 'openings', icon: Swords },
  { label: 'Leaderboard', path: '/leaderboard', id: 'leaderboard', icon: Trophy },
  { label: 'Game Archive', path: '/history', id: 'history', icon: History },
  { label: 'Settings', path: '/settings', id: 'settings', icon: Settings },
  { label: 'Free Trial / Premium', path: '/premium', id: 'free', icon: Crown },
]

function routeFromLocation(path: string, search: string): RouteState {
  const cleanPath = path.replace(/\/+$/, '') || '/'
  if (cleanPath.startsWith('/profile/')) return { path: cleanPath, search, id: 'profile', username: decodeURIComponent(cleanPath.slice('/profile/'.length)) }
  const routes: Record<string, RouteId> = {
    '/': 'play', '/dashboard': 'dashboard', '/play': 'play', '/puzzles': 'puzzles', '/learn': 'learn',
    '/watch': 'watch', '/news': 'news', '/friends': 'friends', '/leaderboard': 'leaderboard',
    '/analysis': 'analysis', '/opening-explorer': 'openings', '/history': 'history',
    '/profile': 'profile', '/settings': 'settings', '/premium': 'free',
  }
  return { path: cleanPath, search, id: routes[cleanPath] ?? 'play' }
}

function App() {
  return <AuthProvider><PlatformApp /></AuthProvider>
}

function PlatformApp() {
  const { user, profile, loading, guestError } = useAuth()
  const [location, setLocation] = useState(() => ({ path: window.location.pathname, search: window.location.search }))
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PlayerProfile[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [pendingRequests, setPendingRequests] = useState(0)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [analysisSource, setAnalysisSource] = useState<SavedGame | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const route = routeFromLocation(location.path, location.search)

  const navigate = useCallback((to: string) => {
    const next = new URL(to, window.location.origin)
    window.history.pushState({}, '', `${next.pathname}${next.search}${next.hash}`)
    setLocation({ path: next.pathname, search: next.search })
    if (next.pathname !== '/analysis') setAnalysisSource(null)
    setMobileNavOpen(false)
    setMoreMenuOpen(false)
    setSearchOpen(false)
    setNotificationsOpen(false)
    setProfileMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const onPopState = () => setLocation({ path: window.location.pathname, search: window.location.search })
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2 || !supabaseConfigured) {
      setSearchResults([])
      setSearchBusy(false)
      return
    }
    let active = true
    setSearchBusy(true)
    const timer = window.setTimeout(() => {
      searchProfiles(searchQuery).then((rows) => { if (active) setSearchResults(rows) })
        .catch(() => { if (active) setSearchResults([]) })
        .finally(() => { if (active) setSearchBusy(false) })
    }, 220)
    return () => { active = false; window.clearTimeout(timer) }
  }, [searchOpen, searchQuery])

  useEffect(() => {
    if (!user || !supabaseConfigured) { setPendingRequests(0); return }
    let active = true
    loadFriendships(user.id).then((rows) => {
      if (active) setPendingRequests(rows.filter((row) => row.status === 'pending' && row.addressee_id === user.id).length)
    }).catch(() => { if (active) setPendingRequests(0) })
    return () => { active = false }
  }, [user, refreshKey])

  function refreshNotificationCount() {
    if (!user || !supabaseConfigured) return
    loadFriendships(user.id).then((rows) => setPendingRequests(rows.filter((row) => row.status === 'pending' && row.addressee_id === user.id).length))
      .catch(() => setPendingRequests(0))
  }

  function onGameAnalyze(game: SavedGame) {
    setAnalysisSource(game)
    navigate('/analysis')
  }

  function renderPage() {
    switch (route.id) {
      case 'dashboard': return <DashboardPage navigate={navigate} refreshKey={refreshKey} />
      case 'play':
        return <PlayPage key={route.path + route.search} initialMode={new URLSearchParams(route.search).get('mode') ?? undefined} onSaved={() => setRefreshKey((value) => value + 1)} onAnalyze={onGameAnalyze} />
      case 'puzzles': return <PuzzlesPage />
      case 'learn': return <LearnPage />
      case 'watch': return <WatchPage />
      case 'news': return <NewsPage />
      case 'friends': return <FriendsPage />
      case 'leaderboard': return <LeaderboardPage />
      case 'analysis': return <AnalysisPage key={analysisSource?.id ?? 'analysis'} initialPgn={analysisSource?.pgn ?? ''} initialGameId={analysisSource?.id} navigate={navigate} onAccuracySaved={() => setRefreshKey((value) => value + 1)} />
      case 'openings': return <OpeningExplorerPage />
      case 'history': return <HistoryPage onAnalyze={onGameAnalyze} />
      case 'profile': return <ProfilePage username={route.username} navigate={navigate} />
      case 'settings': return <SettingsPage />
      case 'free': return <PremiumPage />
      default: return <PlayPage onSaved={() => setRefreshKey((value) => value + 1)} onAnalyze={onGameAnalyze} />
    }
  }

  const activeId = route.id
  const accountInitial = profile?.display_name?.slice(0, 1).toUpperCase() ?? 'G'

  return (
    <div className="chesscom-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      
      {/* Chess.com Authentic Collapsible Left Sidebar */}
      <aside className={`chesscom-sidebar ${mobileNavOpen ? 'chesscom-sidebar-open' : ''}`}>
        <button className="chesscom-brand" onClick={() => navigate('/play')} aria-label="Chess.com Home">
          <img src="/chess-logo.png" alt="Chess.com" className="brand-pawn-logo" />
          <span className="brand-text">chess<span className="brand-dot-com">.com</span></span>
        </button>

        <nav className="chesscom-nav">
          {primaryNav.map((entry) => {
            const Icon = entry.icon
            const isActive = activeId === entry.id
            return (
              <button
                key={entry.id}
                className={`chesscom-nav-item ${isActive ? 'nav-item-active' : ''}`}
                onClick={() => navigate(entry.path)}
              >
                <span className="nav-icon-wrap"><Icon size={20} /></span>
                <span className="nav-item-label">{entry.label}</span>
                {entry.id === 'friends' && pendingRequests > 0 && (
                  <span className="nav-item-badge">{pendingRequests}</span>
                )}
              </button>
            )
          })}

          <div className="nav-more-anchor">
            <button
              className={`chesscom-nav-item ${moreMenuOpen ? 'nav-item-active' : ''}`}
              onClick={() => setMoreMenuOpen((v) => !v)}
            >
              <span className="nav-icon-wrap"><MoreHorizontal size={20} /></span>
              <span className="nav-item-label">More</span>
            </button>

            {moreMenuOpen && (
              <div className="more-flyout">
                {moreNav.map((entry) => {
                  const Icon = entry.icon
                  return (
                    <button
                      key={entry.id}
                      className="more-flyout-item"
                      onClick={() => { navigate(entry.path); setMoreMenuOpen(false) }}
                    >
                      <Icon size={17} />
                      <span>{entry.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </nav>

        <div className="chesscom-sidebar-bottom">
          <button className="sidebar-search-btn" onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50) }}>
            <Search size={17} />
            <span>Search</span>
          </button>

          <button className="sidebar-free-trial-btn" onClick={() => navigate('/premium')}>
            <Crown size={18} />
            <span>Free Trial</span>
          </button>

          <div className="sidebar-user-pill">
            <button
              className="user-profile-btn"
              onClick={() => { setProfileMenuOpen((v) => !v); setNotificationsOpen(false) }}
            >
              <span className="user-avatar-wrap">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="user-avatar-img" />
                ) : (
                  accountInitial
                )}
                <span className="online-indicator-dot" />
              </span>
              <span className="user-profile-details">
                <strong className="user-display-name">{profile?.display_name ?? 'Guest'}</strong>
                <small className="user-handle">{profile?.username ? `@${profile.username}` : 'Playing as Guest'}</small>
              </span>
              <ChevronRight size={14} className="user-chevron" />
            </button>

            {profileMenuOpen && (
              <div className="sidebar-user-flyout">
                <button onClick={() => { navigate('/profile'); setProfileMenuOpen(false) }}>
                  <UserRound size={16} /> Profile
                </button>
                <button onClick={() => { navigate('/settings'); setProfileMenuOpen(false) }}>
                  <Settings size={16} /> Settings
                </button>
                <button onClick={() => { navigate('/history'); setProfileMenuOpen(false) }}>
                  <History size={16} /> Archive
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-quick-links">
            <button className="quick-gear-btn" aria-label="Settings" onClick={() => navigate('/settings')}>
              <Settings size={17} />
            </button>
            <button className="quick-gear-btn" aria-label="Notifications" onClick={() => { setNotificationsOpen((v) => !v); refreshNotificationCount() }}>
              <Bell size={17} />
              {pendingRequests > 0 && <span className="notification-pip" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="chesscom-main-column">
        {/* Mobile Header Bar */}
        <header className="chesscom-mobile-header">
          <button className="mobile-menu-btn" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation menu">
            <Menu size={22} />
          </button>
          <div className="mobile-brand" onClick={() => navigate('/play')}>
            <img src="/chess-logo.png" alt="Chess.com" className="brand-pawn-logo-sm" />
            <span>chess<span className="brand-dot-com">.com</span></span>
          </div>
          <div className="mobile-header-actions">
            <button className="mobile-header-btn" onClick={() => navigate('/premium')}>
              <Crown size={18} />
            </button>
            <button className="mobile-header-btn" onClick={() => setNotificationsOpen((v) => !v)}>
              <Bell size={18} />
              {pendingRequests > 0 && <span className="notification-pip" />}
            </button>
          </div>
        </header>

        {/* Global Notifications Drawer if opened */}
        {notificationsOpen && (
          <div className="chesscom-modal-scrim" onClick={() => setNotificationsOpen(false)}>
            <div className="chesscom-modal notification-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Notifications</h3>
                <button onClick={() => setNotificationsOpen(false)}><X size={18} /></button>
              </div>
              <div className="modal-body">
                {pendingRequests > 0 ? (
                  <div className="pending-reqs-alert">
                    <Users size={20} />
                    <div>
                      <strong>{pendingRequests} pending friend request{pendingRequests > 1 ? 's' : ''}</strong>
                      <p>View your friends page to accept or decline.</p>
                    </div>
                    <button className="btn-chesscom-green" onClick={() => { navigate('/friends'); setNotificationsOpen(false) }}>
                      View
                    </button>
                  </div>
                ) : (
                  <div className="empty-notifications">
                    <p>No new notifications right now.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Search Modal */}
        {searchOpen && (
          <div className="chesscom-modal-scrim" onClick={() => setSearchOpen(false)}>
            <div className="chesscom-modal search-modal" onClick={(e) => e.stopPropagation()}>
              <div className="search-bar-top">
                <Search size={18} />
                <input
                  ref={searchInputRef}
                  placeholder="Search members, players, or topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <button onClick={() => setSearchOpen(false)}><X size={18} /></button>
              </div>
              <div className="search-modal-body">
                {searchQuery.trim().length < 2 ? (
                  <div className="search-quick-links">
                    <span className="search-heading">Quick Links</span>
                    <button onClick={() => { navigate('/play'); setSearchOpen(false) }}><Gamepad2 size={16} /> Play Online</button>
                    <button onClick={() => { navigate('/puzzles'); setSearchOpen(false) }}><Puzzle size={16} /> Daily Puzzle</button>
                    <button onClick={() => { navigate('/analysis'); setSearchOpen(false) }}><ChartNoAxesColumnIncreasing size={16} /> Game Review & Analysis</button>
                    <button onClick={() => { navigate('/opening-explorer'); setSearchOpen(false) }}><Swords size={16} /> Openings Explorer</button>
                  </div>
                ) : searchBusy ? (
                  <div className="search-status-text">Searching Chess.com players...</div>
                ) : searchResults.length > 0 ? (
                  <div className="search-results-list">
                    {searchResults.map((player) => (
                      <button
                        key={player.id}
                        className="search-result-row"
                        onClick={() => { navigate(`/profile/${encodeURIComponent(player.username)}`); setSearchOpen(false) }}
                      >
                        <span className="search-avatar">{player.display_name.slice(0, 1)}</span>
                        <div className="search-result-info">
                          <strong>{player.display_name}</strong>
                          <small>@{player.username}</small>
                        </div>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="search-status-text">No players found matching "{searchQuery}"</div>
                )}
              </div>
            </div>
          </div>
        )}

        <main className="chesscom-content-area">
          {guestError && (
            <div className="chesscom-guest-alert">
              <span>{guestError}</span>
            </div>
          )}
          {loading ? (
            <div className="chesscom-page-loader">
              <div className="loader-pawn">♞</div>
              <span>Loading Chess.com...</span>
            </div>
          ) : (
            renderPage()
          )}
        </main>
      </div>
    </div>
  )
}

export default App
