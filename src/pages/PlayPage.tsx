import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import {
  Award, Bot, ChevronDown, Clock3, Copy, Cpu, Flag, Globe,
  MessageSquare, Play, RotateCcw, Search, Sparkles, Swords,
  Users, Zap,
} from 'lucide-react'
import ChessBoard, { playBoardSound, type BoardMove } from '../components/ChessBoard'
import { useAuth } from '../contexts/AuthContext'
import { requireSupabase, supabase, supabaseConfigured } from '../lib/supabase'
import { analyzePosition, parseUciMove } from '../lib/stockfish'
import { getBotLevelForRating, chooseBotMove } from '../lib/botLevels'
import { saveCompletedGame } from '../lib/data'
import { TIME_CONTROLS, type TimeControl } from '../lib/types'

type PlayMode = 'local' | 'computer' | 'online'
type OnlineGame = {
  id: string
  owner_id: string
  white_player_id: string | null
  black_player_id: string | null
  game_mode: PlayMode
  game_type: TimeControl['category']
  time_control: string
  status: 'waiting' | 'active' | 'completed' | 'aborted'
  result: string | null
  winner_id: string | null
  fen: string
  pgn: string
  san_moves: string[]
  white_seconds: number
  black_seconds: number
  increment_seconds: number
  turn_started_at: string | null
  invite_code: string | null
}

const OPPONENT_MOVE_DELAY_MS = 750

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

const styles = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'tactical', label: 'Aggressive' },
  { id: 'positional', label: 'Solid' },
] as const
type BotStyle = typeof styles[number]['id']

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds)
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

// Calculate captured pieces & material difference
const pieceValues: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const initialPieceCounts: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }

function calculateMaterial(fen: string) {
  const currentBoard = new Chess(fen).board()
  const currentWhite: Record<PieceSymbol, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }
  const currentBlack: Record<PieceSymbol, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }

  for (const row of currentBoard) {
    for (const sq of row) {
      if (sq) {
        if (sq.color === 'w') currentWhite[sq.type]++
        else currentBlack[sq.type]++
      }
    }
  }

  const whiteCaptured: PieceSymbol[] = []
  const blackCaptured: PieceSymbol[] = []
  let whiteMaterial = 0
  let blackMaterial = 0

  for (const type of ['q', 'r', 'b', 'n', 'p'] as PieceSymbol[]) {
    const missingWhite = initialPieceCounts[type] - currentWhite[type]
    for (let i = 0; i < missingWhite; i++) blackCaptured.push(type) // Black captured these white pieces
    whiteMaterial += currentWhite[type] * pieceValues[type]

    const missingBlack = initialPieceCounts[type] - currentBlack[type]
    for (let i = 0; i < missingBlack; i++) whiteCaptured.push(type) // White captured these black pieces
    blackMaterial += currentBlack[type] * pieceValues[type]
  }

  const diff = whiteMaterial - blackMaterial
  return {
    whiteCaptured, // pieces captured by white
    blackCaptured, // pieces captured by black
    whiteAdvantage: diff > 0 ? diff : 0,
    blackAdvantage: diff < 0 ? Math.abs(diff) : 0,
  }
}

type Props = {
  initialMode?: string
  onSaved: () => void
  onAnalyze?: (game: any) => void
}

export default function PlayPage({ initialMode, onSaved, onAnalyze }: Props) {
  const { user, profile, guestError } = useAuth()
  const [mode, setMode] = useState<PlayMode>(() => initialMode === 'local' || initialMode === 'online' || initialMode === 'computer'
    ? initialMode
    : new URLSearchParams(window.location.search).has('invite') ? 'online' : 'computer')
  const [control, setControl] = useState<TimeControl>(TIME_CONTROLS[3]) // 10 min Rapid
  const [timeSelectorOpen, setTimeSelectorOpen] = useState(false)
  const [fen, setFen] = useState(() => new Chess().fen())
  const [orientation, setOrientation] = useState<Color>('w')
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [clocks, setClocks] = useState({ w: TIME_CONTROLS[3].baseSeconds, b: TIME_CONTROLS[3].baseSeconds })
  const [started, setStarted] = useState(false)
  const [flagged, setFlagged] = useState<Color | null>(null)
  const [humanColor, setHumanColor] = useState<Color>('w')
  const [botLevel, setBotLevel] = useState(() => getBotLevelForRating(1400))
  const [botStyle, setBotStyle] = useState<BotStyle>('balanced')
  const [thinking, setThinking] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [onlineGame, setOnlineGame] = useState<OnlineGame | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<'play' | 'moves' | 'chat'>('play')
  const [showResignConfirm, setShowResignConfirm] = useState(false)
  const [gameResultDismissed, setGameResultDismissed] = useState(false)
  const [resignedBy, setResignedBy] = useState<Color | null>(null)

  const gameRef = useRef(new Chess())
  const onlineGameRef = useRef<OnlineGame | null>(null)
  const incomingMoveTimer = useRef<number | null>(null)
  const engineRequestId = useRef(0)
  const processedInviteCode = useRef('')
  const clockRef = useRef(clocks)
  const clockHistory = useRef<{ w: number; b: number }[]>([])
  const savedGame = useRef(false)
  const movesScrollRef = useRef<HTMLDivElement>(null)

  const game = gameRef.current
  const moves = game.history()
  const inviteCodeFromUrl = new URLSearchParams(window.location.search).get('invite')?.trim() ?? ''
  const boardIsOnline = mode === 'online' && onlineGame?.status === 'active'
  const isCheckmate = game.isCheckmate()
  const isStalemate = game.isStalemate()
  const isDraw = game.isDraw() || onlineGame?.result === '1/2-1/2'
  const isOver = Boolean(flagged) || Boolean(resignedBy) || isCheckmate || isDraw || onlineGame?.status === 'completed'
  const onlineTurn = boardIsOnline && user?.id === (game.turn() === 'w' ? onlineGame?.white_player_id : onlineGame?.black_player_id)
  const interactive = !isOver && !thinking && !busy && (mode !== 'online' || onlineTurn) && (mode !== 'computer' || game.turn() === humanColor)

  const materialInfo = useMemo(() => calculateMaterial(fen), [fen])

  function updateClock(next: { w: number; b: number }) {
    clockRef.current = next
    setClocks(next)
  }

  function guestAuthFeedback() {
    if (guestError) {
      if (guestError.toLowerCase().includes('anonymous sign-ins are disabled') || guestError.toLowerCase().includes('anonymous')) {
        return 'Anonyme Anmeldungen sind im Supabase-Projekt deaktiviert. Aktiviere sie unter Authentication → Sign In / Providers → Anonymous Sign-Ins und lade die App neu.'
      }
      return `Gastverbindung fehlgeschlagen: ${guestError}`
    }
    if (!supabaseConfigured) return 'Supabase fehlt: Setze VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY und starte die App neu.'
    return 'Der Gastzugang ist noch nicht verfügbar. Aktiviere in Supabase unter Authentication → Sign In / Providers die anonymen Anmeldungen und lade die App neu.'
  }

  function resetGame(nextMode = mode, nextControl = control) {
    engineRequestId.current += 1
    if (incomingMoveTimer.current !== null) window.clearTimeout(incomingMoveTimer.current)
    incomingMoveTimer.current = null
    const fresh = new Chess()
    gameRef.current = fresh
    setMode(nextMode)
    setControl(nextControl)
    setFen(fresh.fen())
    setLastMove(null)
    setFlagged(null)
    setResignedBy(null)
    setGameResultDismissed(false)
    setShowResignConfirm(false)
    setStarted(false)
    setThinking(false)
    setFeedback('')
    onlineGameRef.current = null
    setOnlineGame(null)
    setInviteCode('')
    savedGame.current = false
    clockHistory.current = []
    updateClock({ w: nextControl.baseSeconds, b: nextControl.baseSeconds })
    setActiveTab('moves')
    playBoardSound('game-start')
  }

  function startComputerGame(color: Color = humanColor, nextControl = control) {
    setHumanColor(color)
    setOrientation(color)
    resetGame('computer', nextControl)
    if (color === 'b') {
      window.setTimeout(() => { void makeEngineMove(new Chess().fen()) }, 300)
    }
  }

  function restartCurrentGame(nextControl = control) {
    if (mode === 'computer') startComputerGame(humanColor, nextControl)
    else resetGame(mode, nextControl)
  }

  // Auto-scroll moves list to bottom
  useEffect(() => {
    if (movesScrollRef.current) {
      movesScrollRef.current.scrollTop = movesScrollRef.current.scrollHeight
    }
  }, [moves.length])

  // Timer loop
  useEffect(() => {
    if (!started || isOver) return
    const side = game.turn()
    const timer = window.setInterval(() => {
      const next = { ...clockRef.current, [side]: Math.max(0, clockRef.current[side] - 1) }
      updateClock(next)
      if (next[side] === 0 && mode !== 'online') {
        setFlagged(side)
        playBoardSound('game-end')
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [started, isOver, mode, fen])

  // Online game subscription & moves
  useEffect(() => {
    const client = supabase
    if (!onlineGame?.id || !client) return
    const channel = client.channel(`game:${onlineGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${onlineGame.id}` }, (payload) => {
        const updated = payload.new as OnlineGame
        const current = onlineGameRef.current
        const previousPly = current?.id === updated.id ? current.san_moves.length : 0
        const nextPly = updated.san_moves.length
        const nextTurn = new Chess(updated.fen).turn()
        const moverId = nextTurn === 'w' ? updated.black_player_id : updated.white_player_id
        if (current?.id === updated.id && nextPly > previousPly && moverId !== user?.id) {
          if (incomingMoveTimer.current !== null) window.clearTimeout(incomingMoveTimer.current)
          incomingMoveTimer.current = window.setTimeout(() => {
            const latest = onlineGameRef.current
            if (latest?.id === updated.id && latest.san_moves.length < nextPly) applyOnlineGame(updated)
            incomingMoveTimer.current = null
          }, OPPONENT_MOVE_DELAY_MS)
          return
        }
        applyOnlineGame(updated)
      }).subscribe()
    return () => {
      if (incomingMoveTimer.current !== null) window.clearTimeout(incomingMoveTimer.current)
      incomingMoveTimer.current = null
      void client.removeChannel(channel)
    }
  }, [onlineGame?.id, user?.id])

  function applyOnlineGame(row: OnlineGame) {
    setFlagged(null)
    if (row.status !== 'waiting') setInviteCode('')
    onlineGameRef.current = row
    setOnlineGame(row)
    if (user) setOrientation(row.white_player_id === user.id ? 'w' : 'b')
    const replay = new Chess()
    try {
      if (row.pgn) replay.loadPgn(row.pgn)
      if (replay.fen() !== row.fen) replay.load(row.fen)
    } catch { replay.load(row.fen) }
    gameRef.current = replay
    setFen(row.fen)
    const replayMoves = replay.history({ verbose: true })
    const finalMove = replayMoves.at(-1)
    setLastMove(finalMove ? { from: finalMove.from, to: finalMove.to } : null)
    const elapsed = row.status === 'active' && row.turn_started_at ? Math.floor((Date.now() - Date.parse(row.turn_started_at)) / 1000) : 0
    const side = gameRef.current.turn()
    updateClock({ w: Math.max(0, row.white_seconds - (side === 'w' ? elapsed : 0)), b: Math.max(0, row.black_seconds - (side === 'b' ? elapsed : 0)) })
    setStarted(row.status === 'active')
    setActiveTab('moves')
  }

  async function loadOnlineGame(id: string) {
    const { data, error } = await requireSupabase().from('games').select('*').eq('id', id).single()
    if (error) { setFeedback(error.message); return }
    const row = data as OnlineGame
    const predefinedControl = TIME_CONTROLS.find((option) => option.label === row.time_control)
    setControl(predefinedControl ?? TIME_CONTROLS[3])
    setMode('online')
    setSearching(false)
    applyOnlineGame(row)
  }

  useEffect(() => {
    if (!inviteCodeFromUrl || !user || processedInviteCode.current === inviteCodeFromUrl) return
    processedInviteCode.current = inviteCodeFromUrl
    let active = true
    setMode('online')
    setBusy(true)
    setFeedback('Einladung wird geöffnet …')
    const joinInvite = async () => {
      try {
        const { data, error } = await requireSupabase().rpc('join_game_invite', { p_invite_code: inviteCodeFromUrl })
        if (error) throw error
        const invite = data as { id?: string }
        if (!invite?.id) throw new Error('Der Einladungslink enthält keine gültige Partie.')
        if (!active) return
        setInviteCode(inviteCodeFromUrl)
        setFeedback('')
        await loadOnlineGame(invite.id)
      } catch (caught) {
        if (active) setFeedback(caught instanceof Error ? caught.message : 'Die Einladung konnte nicht geöffnet werden.')
      } finally {
        if (active) setBusy(false)
      }
    }
    void joinInvite()
    return () => { active = false }
  }, [inviteCodeFromUrl, user?.id])

  useEffect(() => {
    const client = supabase
    if (!searching || mode !== 'online' || !user || !client) return
    let active = true
    let requestInFlight = false
    const checkMatch = async () => {
      if (requestInFlight) return
      requestInFlight = true
      try {
        const { data, error } = await client.rpc('get_matchmaking_status')
        if (error) throw error
        if (!active) return
        const status = data as { waiting?: boolean; game_id?: string | null } | null
        if (status?.game_id) {
          setSearching(false)
          await loadOnlineGame(status.game_id)
        } else if (!status?.waiting) {
          setSearching(false)
          setFeedback('Die Gegnersuche wurde beendet. Starte eine neue Suche.')
        }
      } catch (caught) {
        if (active) {
          setSearching(false)
          setFeedback(caught instanceof Error ? `Gegnersuche fehlgeschlagen: ${caught.message}` : 'Gegnersuche fehlgeschlagen.')
          void client.rpc('cancel_matchmaking')
        }
      } finally {
        requestInFlight = false
      }
    }
    void checkMatch()
    const poller = window.setInterval(() => { void checkMatch() }, 1_500)
    return () => {
      active = false
      window.clearInterval(poller)
      void client.rpc('cancel_matchmaking')
    }
  }, [searching, mode, user?.id])

  async function persistGame(result: string) {
    if (savedGame.current) return
    savedGame.current = true
    if (!user) return
    try {
      await saveCompletedGame({
        userId: user.id,
        mode: mode === 'computer' ? 'computer' : 'local',
        gameType: control.category,
        timeControl: control.label,
        result,
        fen: gameRef.current.fen(),
        pgn: gameRef.current.pgn(),
        moves: gameRef.current.history(),
        humanColor: mode === 'computer' ? humanColor : 'w',
        opponent: mode === 'computer' ? `Stockfish (${botLevel.rating})` : 'Local Game',
      })
      onSaved()
    } catch {}
  }

  function handleGameOver(current: Chess) {
    let result: string | null = null
    if (current.isCheckmate()) {
      result = current.turn() === 'w' ? '0-1' : '1-0'
    } else if (current.isDraw()) {
      result = '1/2-1/2'
    }
    if (result) {
      void persistGame(result)
    }
  }

  async function makeMove(move: BoardMove) {
    setFeedback('')
    if (mode === 'online' && onlineGame) {
      setBusy(true)
      try {
        const { data, error } = await requireSupabase().functions.invoke('make-move', {
          body: { game_id: onlineGame.id, expected_ply: onlineGame.san_moves.length, move },
        })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        if (data?.game) applyOnlineGame(data.game as OnlineGame)
      } catch (caught) {
        setFeedback(caught instanceof Error ? caught.message : 'Could not make move.')
      } finally { setBusy(false) }
      return
    }

    const current = gameRef.current
    const movingSide = current.turn()
    clockHistory.current.push(clockRef.current)
    try {
      current.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) })
    } catch {
      clockHistory.current.pop()
      return
    }

    const next = { ...clockRef.current, [movingSide]: clockRef.current[movingSide] + control.incrementSeconds }
    updateClock(next)
    setFen(current.fen())
    setLastMove({ from: move.from, to: move.to })
    setStarted(true)
    handleGameOver(current)

    if (mode === 'computer' && !current.isGameOver() && current.turn() !== humanColor) {
      void makeEngineMove(current.fen())
    }
  }

  async function makeEngineMove(position: string) {
    const requestId = ++engineRequestId.current
    setThinking(true)
    try {
      const analysis = await analyzePosition(position, botLevel.depth, { skill: botLevel.skill, multipv: 3 })
      if (engineRequestId.current !== requestId || gameRef.current.fen() !== position) return
      const selectedMove = chooseBotMove(position, analysis.lines, botLevel, botStyle) ?? parseUciMove(analysis.bestMove ?? '')
      if (!selectedMove) throw new Error('Stockfish produced no move.')
      await wait(OPPONENT_MOVE_DELAY_MS)
      if (engineRequestId.current !== requestId || gameRef.current.fen() !== position) return

      const current = gameRef.current
      const movingSide = current.turn()
      const target = current.get(selectedMove.to)
      const isCapture = Boolean(target)
      const isCastle = current.get(selectedMove.from)?.type === 'k' && Math.abs(selectedMove.from.charCodeAt(0) - selectedMove.to.charCodeAt(0)) === 2

      clockHistory.current.push(clockRef.current)
      current.move({ from: selectedMove.from, to: selectedMove.to, ...(selectedMove.promotion ? { promotion: selectedMove.promotion } : {}) })
      updateClock({ ...clockRef.current, [movingSide]: clockRef.current[movingSide] + control.incrementSeconds })

      if (isCastle) playBoardSound('castle')
      else if (isCapture) playBoardSound('capture')
      else playBoardSound('move')

      setFen(current.fen())
      setLastMove({ from: selectedMove.from, to: selectedMove.to })
      setStarted(true)
      handleGameOver(current)
    } catch {
      /* Engine computation error handled silently */
    } finally {
      setThinking(false)
    }
  }

  function handleResign() {
    setShowResignConfirm(false)
    const resigning = mode === 'computer' ? humanColor : game.turn()
    setResignedBy(resigning)
    const result = resigning === 'w' ? '0-1' : '1-0'
    playBoardSound('game-end')
    void persistGame(result)
  }

  async function createInvite() {
    if (!user) { setFeedback(guestAuthFeedback()); return }
    setBusy(true)
    try {
      const { data, error } = await requireSupabase().rpc('create_game_invite', {
        p_game_type: control.category,
        p_time_control: control.label,
        p_base_seconds: control.baseSeconds,
        p_increment_seconds: control.incrementSeconds,
      })
      if (error) throw error
      const invite = data as { id: string; invite_code: string }
      setInviteCode(invite.invite_code)
      await loadOnlineGame(invite.id)
      setActiveTab('play')
    } catch (e: any) { setFeedback(e.message) }
    finally { setBusy(false) }
  }

  async function joinFriendGame() {
    const code = joinCode.trim()
    if (!/^\d{4,8}$/.test(code)) {
      setFeedback('Gib den 4- bis 8-stelligen Zahlencode ein.')
      return
    }
    if (!user) {
      setFeedback(guestAuthFeedback())
      return
    }

    setBusy(true)
    setFeedback('')
    try {
      const { data, error } = await requireSupabase().rpc('join_game_invite', { p_invite_code: code })
      if (error) throw error
      const invite = data as { id?: string }
      if (!invite?.id) throw new Error('Für diesen Code wurde keine offene Partie gefunden.')
      setJoinCode('')
      setMode('online')
      await loadOnlineGame(invite.id)
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Der Freundescode konnte nicht geöffnet werden.')
    } finally {
      setBusy(false)
    }
  }

  async function findMatch() {
    if (!user) { setFeedback(guestAuthFeedback()); return }
    setBusy(true)
    try {
      const { data, error } = await requireSupabase().rpc('join_matchmaking', {
        p_game_type: control.category,
        p_time_control: control.label,
        p_base_seconds: control.baseSeconds,
        p_increment_seconds: control.incrementSeconds,
      })
      if (error) throw error
      const result = data as { waiting: boolean; game_id: string | null }
      if (result.game_id) await loadOnlineGame(result.game_id)
      else setSearching(true)
    } catch (e: any) { setFeedback(e?.message ?? 'Gegnersuche fehlgeschlagen.'); setSearching(false) }
    finally { setBusy(false) }
  }

  async function cancelMatchmaking() {
    try {
      if (supabase) {
        const { error } = await supabase.rpc('cancel_matchmaking')
        if (error) throw error
      }
      setSearching(false)
      setFeedback('Gegnersuche abgebrochen.')
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Die Suche konnte nicht abgebrochen werden.')
    }
  }

  const movePairs = useMemo(() => {
    const rows: { no: number; white: string; black?: string }[] = []
    for (let i = 0; i < moves.length; i += 2) {
      rows.push({ no: Math.floor(i / 2) + 1, white: moves[i], black: moves[i + 1] })
    }
    return rows
  }, [fen, moves.length])

  const topColor: Color = orientation === 'w' ? 'b' : 'w'
  const bottomColor: Color = orientation

  const topName = mode === 'computer'
    ? `${botLevel.name}`
    : mode === 'online'
      ? 'Opponent'
      : topColor === 'w' ? 'White' : 'Black'

  const topRating = mode === 'computer' ? botLevel.rating : 1200
  const bottomName = profile?.display_name ?? 'You'
  const bottomRating = 1200

  const topClock = clocks[topColor]
  const bottomClock = clocks[bottomColor]
  const topActive = started && !isOver && game.turn() === topColor
  const bottomActive = started && !isOver && game.turn() === bottomColor

  const topAdvantage = topColor === 'w' ? materialInfo.whiteAdvantage : materialInfo.blackAdvantage
  const bottomAdvantage = bottomColor === 'w' ? materialInfo.whiteAdvantage : materialInfo.blackAdvantage
  const topCaptured = topColor === 'w' ? materialInfo.whiteCaptured : materialInfo.blackCaptured
  const bottomCaptured = bottomColor === 'w' ? materialInfo.whiteCaptured : materialInfo.blackCaptured

  const losingColor: Color | null = flagged ?? resignedBy ?? (isCheckmate ? game.turn() : null)
  const localWinnerColor: Color | null = losingColor ? (losingColor === 'w' ? 'b' : 'w') : null
  const onlineWinnerColor: Color | null = onlineGame?.winner_id
    ? onlineGame.winner_id === onlineGame.white_player_id ? 'w' : 'b'
    : null
  const winnerColor = onlineWinnerColor ?? localWinnerColor
  const winnerName = winnerColor === 'w' ? 'Weiß' : winnerColor === 'b' ? 'Schwarz' : null
  const playerLost = Boolean(winnerColor && (
    (mode === 'computer' && winnerColor !== humanColor)
    || (mode === 'online' && Boolean(user && onlineGame?.winner_id && onlineGame.winner_id !== user.id))
  ))
  const resultTone = isDraw ? 'draw' : playerLost ? 'defeat' : 'victory'
  const resultTitle = isStalemate
    ? 'Patt'
    : isDraw
      ? 'Remis'
      : isCheckmate
        ? playerLost ? 'Schachmatt – verloren' : 'Schachmatt'
        : playerLost ? 'Verloren' : winnerColor ? 'Gewonnen' : 'Partie beendet'
  const resultDescription = isStalemate
    ? 'Keine legalen Züge mehr, aber der König steht nicht im Schach. Die Partie endet remis.'
    : isDraw
      ? 'Die Partie endet unentschieden.'
      : isCheckmate
        ? playerLost ? `${winnerName ?? 'Der Gegner'} gewinnt durch Schachmatt.` : mode === 'local' ? `${winnerName ?? 'Der Gegner'} setzt matt.` : 'Du gewinnst durch Schachmatt.'
        : flagged
          ? playerLost ? 'Deine Zeit ist abgelaufen.' : `Die Zeit von ${losingColor === 'w' ? 'Weiß' : 'Schwarz'} ist abgelaufen.`
          : resignedBy
            ? playerLost ? 'Du hast aufgegeben.' : `${losingColor === 'w' ? 'Weiß' : 'Schwarz'} hat aufgegeben.`
            : winnerName ? `${winnerName} gewinnt die Partie.` : 'Die Partie ist beendet.'

  // Game over state banner description
  let gameOverTitle = ''
  let gameOverSubtitle = ''
  if (isOver) {
    if (resignedBy) {
      gameOverTitle = `${resignedBy === 'w' ? 'Black' : 'White'} Won`
      gameOverSubtitle = `by resignation`
    } else if (flagged) {
      gameOverTitle = `${flagged === 'w' ? 'Black' : 'White'} Won`
      gameOverSubtitle = `on time`
    } else if (isCheckmate) {
      gameOverTitle = `${game.turn() === 'w' ? 'Black' : 'White'} Won`
      gameOverSubtitle = `by checkmate`
    } else if (isDraw) {
      gameOverTitle = 'Draw'
      gameOverSubtitle = 'by stalemate / repetition'
    } else {
      gameOverTitle = 'Game Completed'
    }
  }

  return (
    <div className="chesscom-play-arena">
      {isOver && !gameResultDismissed && (
        <div className="game-result-overlay">
          <section className={`game-result-dialog game-result-${resultTone}`} role="dialog" aria-modal="true" aria-labelledby="game-result-title" aria-describedby="game-result-description">
            <div className="game-result-icon">
              {resultTone === 'draw' ? <Swords size={30} /> : resultTone === 'defeat' ? <Flag size={30} /> : <Award size={30} />}
            </div>
            <span className="game-result-kicker">PARTIE BEENDET</span>
            <h2 id="game-result-title">{resultTitle}</h2>
            <p id="game-result-description">{resultDescription}</p>
            <div className="game-result-actions">
              <button className="btn-chesscom-green" onClick={() => restartCurrentGame()}>
                <RotateCcw size={16} /> Nochmal spielen
              </button>
              <button className="btn-chesscom-secondary" onClick={() => { setGameResultDismissed(true); setActiveTab('moves') }}>
                Züge ansehen
              </button>
            </div>
          </section>
        </div>
      )}
      {/* LEFT / CENTER: THE BOARD CONTAINER */}
      <div className="board-column">
        {/* Top Player Bar */}
        <div className="player-bar top-player-bar">
          <div className="player-bar-left">
            <div className={`player-avatar-box ${mode === 'computer' ? 'bot-avatar' : ''}`}>
              {mode === 'computer' ? (
                <Bot size={22} />
              ) : (
                <span className="avatar-initial">{topName.slice(0, 1)}</span>
              )}
            </div>
            <div className="player-meta">
              <div className="player-name-row">
                <strong className="player-name">{topName}</strong>
                {mode === 'computer' && <span className="bot-tag">BOT</span>}
                <span className="player-rating">({topRating})</span>
              </div>
              <div className="player-captures-row">
                <div className="captured-pieces">
                  {topCaptured.map((p, i) => (
                    <img key={i} src={`/pieces/neo/${orientation === 'w' ? 'b' : 'w'}${p}.png`} alt="" className="mini-piece" />
                  ))}
                </div>
                {topAdvantage > 0 && <span className="material-adv">+{topAdvantage}</span>}
              </div>
            </div>
          </div>

          <div className={`digital-clock ${topActive ? 'clock-active' : ''} ${topClock < 20 && topActive ? 'clock-low-time' : ''}`}>
            {formatClock(topClock)}
          </div>
        </div>

        {/* Board Component */}
        <div className="board-center-wrapper">
          <ChessBoard
            fen={fen}
            onMove={makeMove}
            interactive={interactive}
            orientation={orientation}
            lastMove={lastMove}
          />
        </div>

        {/* Bottom Player Bar */}
        <div className="player-bar bottom-player-bar">
          <div className="player-bar-left">
            <div className="player-avatar-box user-avatar">
              <span className="avatar-initial">{bottomName.slice(0, 1).toUpperCase()}</span>
            </div>
            <div className="player-meta">
              <div className="player-name-row">
                <strong className="player-name">{bottomName}</strong>
                <span className="player-rating">({bottomRating})</span>
              </div>
              <div className="player-captures-row">
                <div className="captured-pieces">
                  {bottomCaptured.map((p, i) => (
                    <img key={i} src={`/pieces/neo/${orientation === 'w' ? 'w' : 'b'}${p}.png`} alt="" className="mini-piece" />
                  ))}
                </div>
                {bottomAdvantage > 0 && <span className="material-adv">+{bottomAdvantage}</span>}
              </div>
            </div>
          </div>

          <div className={`digital-clock ${bottomActive ? 'clock-active' : ''} ${bottomClock < 20 && bottomActive ? 'clock-low-time' : ''}`}>
            {formatClock(bottomClock)}
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR: CHESS.COM GAME CONTROLS & MOVES */}
      <div className="play-sidebar">
        {/* Navigation Tabs */}
        <div className="play-sidebar-tabs">
          <button
            className={`sidebar-tab ${activeTab === 'play' ? 'sidebar-tab-active' : ''}`}
            onClick={() => setActiveTab('play')}
          >
            <Zap size={18} />
            <span>New Game</span>
          </button>
          <button
            className={`sidebar-tab ${activeTab === 'moves' ? 'sidebar-tab-active' : ''}`}
            onClick={() => setActiveTab('moves')}
          >
            <Swords size={18} />
            <span>Moves</span>
          </button>
          <button
            className={`sidebar-tab ${activeTab === 'chat' ? 'sidebar-tab-active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={18} />
            <span>Chat</span>
          </button>
        </div>

        {/* Tab 1: Play / Game Setup */}
        {activeTab === 'play' && (
          <div className="play-tab-content">
            {/* Time Control Card */}
            <div className="time-selector-card">
              <button className="time-selector-btn" onClick={() => setTimeSelectorOpen((v) => !v)}>
                <div className="time-btn-left">
                  <Clock3 size={20} className="time-clock-icon" />
                  <div className="time-btn-text">
                    <strong>{control.label}</strong>
                    <small>{control.category.toUpperCase()}</small>
                  </div>
                </div>
                <ChevronDown size={18} className={`chevron-flip ${timeSelectorOpen ? 'chevron-open' : ''}`} />
              </button>

              {timeSelectorOpen && (
                <div className="time-presets-grid">
                  {TIME_CONTROLS.map((tc) => (
                    <button
                      key={tc.id}
                      className={`time-preset-pill ${control.id === tc.id ? 'preset-pill-active' : ''}`}
                      onClick={() => { setControl(tc); setTimeSelectorOpen(false) }}
                    >
                      <strong>{tc.label}</strong>
                      <small>{tc.category}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Opponent Mode Selector */}
            <div className="opponent-mode-section">
              <span className="sidebar-section-title">Opponent</span>
              <div className="opponent-mode-grid">
                <button
                  className={`opponent-card ${mode === 'computer' ? 'opponent-card-active' : ''}`}
                  onClick={() => setMode('computer')}
                >
                  <Cpu size={20} />
                  <span>vs Computer</span>
                </button>
                <button
                  className={`opponent-card ${mode === 'online' ? 'opponent-card-active' : ''}`}
                  onClick={() => setMode('online')}
                >
                  <Globe size={20} />
                  <span>Online / Friends</span>
                </button>
                <button
                  className={`opponent-card ${mode === 'local' ? 'opponent-card-active' : ''}`}
                  onClick={() => setMode('local')}
                >
                  <Users size={20} />
                  <span>Pass & Play</span>
                </button>
              </div>
            </div>

            {/* Computer Options */}
            {mode === 'computer' && (
              <div className="bot-config-card">
                <div className="bot-level-slider">
                  <div className="bot-level-header">
                    <span>Bot-Stärke</span>
                    <strong>{botLevel.label} · {botLevel.rating} Elo</strong>
                  </div>
                  <input
                    className="bot-elo-range"
                    aria-label="Bot-Stärke in Elo"
                    type="range"
                    min="100"
                    max="2400"
                    step="100"
                    value={botLevel.rating}
                    onChange={(event) => setBotLevel(getBotLevelForRating(Number(event.target.value)))}
                  />
                  <div className="bot-elo-range-labels"><span>100 Elo</span><span>2400 Elo</span></div>
                  <p className="bot-level-description">{botLevel.description}</p>
                  {botLevel.isLowDifficulty && (
                    <div className="bot-tips-notice" role="note">
                      <strong>💡 Tipp für deinen Zug</strong>
                      <span>Prüfe zuerst, ob dein König bedroht ist. Dann suche nach Figuren, die du schlagen kannst, und achte darauf, keine eigene Figur ungedeckt stehen zu lassen.</span>
                    </div>
                  )}
                </div>

                <div className="bot-style-chooser">
                  <span>Style:</span>
                  <div className="color-btn-group">
                    {styles.map((s) => (
                      <button
                        key={s.id}
                        className={`level-btn ${botStyle === s.id ? 'level-btn-active' : ''}`}
                        onClick={() => setBotStyle(s.id)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bot-color-chooser">
                  <span>I Play as:</span>
                  <div className="color-btn-group">
                    <button
                      className={`color-btn ${humanColor === 'w' ? 'color-btn-active' : ''}`}
                      onClick={() => setHumanColor('w')}
                    >
                      <img src="/pieces/neo/wk.png" alt="White" />
                      White
                    </button>
                    <button
                      className={`color-btn ${humanColor === 'b' ? 'color-btn-active' : ''}`}
                      onClick={() => setHumanColor('b')}
                    >
                      <img src="/pieces/neo/bk.png" alt="Black" />
                      Black
                    </button>
                  </div>
                </div>
              </div>
            )}

            {feedback && <div className="feedback-banner">{feedback}</div>}

            {/* Online Options */}
            {mode === 'online' && (
              <div className="online-lobby-card">
                {searching ? (
                  <button className="btn-chesscom-secondary" onClick={() => void cancelMatchmaking()} disabled={busy}>
                    <Search size={16} /> Gegnersuche abbrechen
                  </button>
                ) : (
                  <button className="btn-chesscom-secondary" onClick={() => void findMatch()} disabled={busy}>
                    <Search size={16} /> Zufälligen Gegner finden
                  </button>
                )}

                <div className="online-or-divider"><span>ODER</span></div>

                <form className="friend-code-entry" onSubmit={(event) => { event.preventDefault(); void joinFriendGame() }}>
                  <label htmlFor="friend-game-code">Freundescode eingeben (4–8 Ziffern)</label>
                  <div className="friend-code-controls">
                    <input
                      id="friend-game-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{4,8}"
                      maxLength={8}
                      placeholder="123456"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                      aria-label="Freundescode mit vier bis acht Ziffern"
                    />
                    <button className="btn-chesscom-secondary" type="submit" disabled={busy || joinCode.length < 4 || joinCode.length > 8}>
                      Beitreten
                    </button>
                  </div>
                </form>

                <button className="btn-chesscom-secondary" onClick={() => void createInvite()} disabled={busy}>
                  <Users size={16} />
                  Code erstellen
                </button>

                {inviteCode && (
                  <div className="invite-box">
                    <span>Dein Freundescode</span>
                    <strong className="friend-invite-code">{inviteCode}</strong>
                    <span>Oder teile diesen Direktlink:</span>
                    <code>{`${window.location.origin}/play?invite=${inviteCode}`}</code>
                    <button onClick={() => void navigator.clipboard.writeText(inviteCode)}>
                      <Copy size={14} /> Code kopieren
                    </button>
                    <button onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/play?invite=${inviteCode}`)}>
                      <Copy size={14} /> Link kopieren
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* THE BIG GREEN CHESS.COM "PLAY" BUTTON */}
            <div className="big-play-btn-wrap">
              <button
                className="btn-chesscom-green-big"
                disabled={busy || searching}
                onClick={() => {
                  if (mode === 'computer') startComputerGame(humanColor, control)
                  else if (mode === 'online') void findMatch()
                  else resetGame('local', control)
                }}
              >
                <Play size={24} fill="currentColor" />
                <span>PLAY</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Moves Notation & Live Game */}
        {activeTab === 'moves' && (
          <div className="moves-tab-content">
            <div className="game-status-header">
              <div className="status-kicker">
                <Clock3 size={14} />
                <span>{control.label} • {mode === 'computer' ? 'vs Computer' : mode === 'online' ? 'Online' : 'Local'}</span>
              </div>
              {thinking && <span className="thinking-indicator">Engine thinking...</span>}
            </div>

            {/* Game Over Banner */}
            {isOver && (
              <div className="game-over-card">
                <div className="game-over-headline">
                  <Award size={28} className="trophy-gold" />
                  <div>
                    <h3>{gameOverTitle}</h3>
                    <p>{gameOverSubtitle}</p>
                  </div>
                </div>

                <div className="game-over-actions">
                  <button
                    className="btn-chesscom-green"
                    onClick={() => {
                      if (onAnalyze) onAnalyze({ pgn: game.pgn() })
                    }}
                  >
                    <Sparkles size={18} />
                    Game Review
                  </button>
                  <button className="btn-chesscom-secondary" onClick={() => restartCurrentGame()}>
                    <RotateCcw size={16} />
                    Rematch
                  </button>
                </div>
              </div>
            )}

            {/* Move Notation Table */}
            <div className="move-list-table" ref={movesScrollRef}>
              {movePairs.length > 0 ? (
                movePairs.map((pair) => (
                  <div key={pair.no} className="notation-row">
                    <span className="move-num">{pair.no}.</span>
                    <span className="move-san white-san">{pair.white}</span>
                    <span className="move-san black-san">{pair.black ?? ''}</span>
                  </div>
                ))
              ) : (
                <div className="empty-moves-placeholder">
                  <Swords size={28} />
                  <span>No moves played yet.</span>
                  <small>Make a move on the board to begin.</small>
                </div>
              )}
            </div>

            {/* Resign confirmation popup */}
            {showResignConfirm && (
              <div className="resign-confirm-bar">
                <span>Are you sure you want to resign?</span>
                <div className="confirm-buttons">
                  <button className="confirm-yes" onClick={handleResign}>Yes, Resign</button>
                  <button className="confirm-cancel" onClick={() => setShowResignConfirm(false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Bottom In-Game Toolbar */}
            <div className="in-game-toolbar">
              <button
                className="game-tool-btn"
                title="Flip Board"
                onClick={() => setOrientation((s) => s === 'w' ? 'b' : 'w')}
              >
                <RotateCcw size={17} />
              </button>

              <button
                className="game-tool-btn tool-resign"
                title="Resign"
                disabled={isOver || !started}
                onClick={() => setShowResignConfirm((v) => !v)}
              >
                <Flag size={17} />
              </button>

              <button
                className="game-tool-btn"
                title="New Game"
                onClick={() => setActiveTab('play')}
              >
                <Zap size={17} />
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Chat */}
        {activeTab === 'chat' && (
          <div className="chat-tab-content">
            <div className="chat-empty-state">
              <MessageSquare size={32} />
              <strong>Chat with your opponent</strong>
              <p>Keep conversation friendly and sporting.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
