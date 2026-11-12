import type { Square, PieceSymbol } from 'chess.js'
import { Chess } from 'chess.js'
import { parseUciMove, type EngineLine } from './stockfish'
import type { BoardMove } from '../components/ChessBoard'

export type BotLevel = {
  id: string
  label: string
  name: string
  avatar: string
  rating: number
  depth: number
  skill: number
  blunderRate: number
  description: string
  isLowDifficulty: boolean
}

export const BOT_LEVELS: BotLevel[] = [
  {
    id: 'jimmy-100',
    label: 'Anfänger',
    name: 'Jimmy',
    avatar: '🐣',
    rating: 100,
    depth: 1,
    skill: 0,
    blunderRate: 0.75,
    description: 'Macht viele Fehler und übersieht Figuren. Perfekt für die ersten Schritte!',
    isLowDifficulty: true,
  },
  {
    id: 'martin-250',
    label: 'Schüler',
    name: 'Martin',
    avatar: '👦',
    rating: 250,
    depth: 1,
    skill: 0,
    blunderRate: 0.60,
    description: 'Spielt einfache Züge, vergisst aber oft die Verteidigung seiner Figuren.',
    isLowDifficulty: true,
  },
  {
    id: 'elena-400',
    label: 'Einsteiger',
    name: 'Elena',
    avatar: '👧',
    rating: 400,
    depth: 2,
    skill: 0,
    blunderRate: 0.45,
    description: 'Kennt die Grundregeln, patzt aber regelmäßig und lässt Chancen aus.',
    isLowDifficulty: true,
  },
  {
    id: 'max-600',
    label: 'Freizeit',
    name: 'Max',
    avatar: '🧢',
    rating: 600,
    depth: 3,
    skill: 0,
    blunderRate: 0.32,
    description: 'Entwickelt Figuren nach vorne, stolpert jedoch bei gegnerischen Taktiken.',
    isLowDifficulty: true,
  },
  {
    id: 'sofia-800',
    label: 'Klub-Neuling',
    name: 'Sofia',
    avatar: '👓',
    rating: 800,
    depth: 4,
    skill: 1,
    blunderRate: 0.20,
    description: 'Greift gerne an, übersieht aber manchmal Konter und Freibauern.',
    isLowDifficulty: true,
  },
  {
    id: 'lukas-1000',
    label: 'Vereinsspieler',
    name: 'Lukas',
    avatar: '♟️',
    rating: 1000,
    depth: 5,
    skill: 3,
    blunderRate: 0.10,
    description: 'Solide Grundzüge, lässt sich mit aufmerksamem Spiel und Taktik schlagen.',
    isLowDifficulty: true,
  },
  {
    id: 'david-1200',
    label: 'Fortgeschritten',
    name: 'David',
    avatar: '♞',
    rating: 1200,
    depth: 7,
    skill: 6,
    blunderRate: 0.04,
    description: 'Spielt überlegt, vermeidet grobe Patzer und bestraft unvorsichtiges Spiel.',
    isLowDifficulty: false,
  },
  {
    id: 'nora-1400',
    label: 'Taktikerin',
    name: 'Nora',
    avatar: '♝',
    rating: 1400,
    depth: 9,
    skill: 9,
    blunderRate: 0.00,
    description: 'Bestraft Fehler konsequent und sucht aktiv nach taktischen Kombinationen.',
    isLowDifficulty: false,
  },
  {
    id: 'viktor-1600',
    label: 'Stratege',
    name: 'Viktor',
    avatar: '♜',
    rating: 1600,
    depth: 11,
    skill: 12,
    blunderRate: 0.00,
    description: 'Erfahrener Vereinsspieler mit planvollem Stellungsspiel und guter Technik.',
    isLowDifficulty: false,
  },
  {
    id: 'alexander-1800',
    label: 'Experte',
    name: 'Alexander',
    avatar: '♛',
    rating: 1800,
    depth: 13,
    skill: 15,
    blunderRate: 0.00,
    description: 'Starke Eröffnungskenntnisse, scharfe Varianten und präzise Endspiele.',
    isLowDifficulty: false,
  },
  {
    id: 'magnus-2000',
    label: 'Meister',
    name: 'Magnus-Bot',
    avatar: '♚',
    rating: 2000,
    depth: 15,
    skill: 18,
    blunderRate: 0.00,
    description: 'Meisterhaftes Positionsspiel, erstickt gegnerische Pläne im Keim.',
    isLowDifficulty: false,
  },
  {
    id: 'gm-2200',
    label: 'Großmeister',
    name: 'GM Bot',
    avatar: '🏆',
    rating: 2200,
    depth: 16,
    skill: 19,
    blunderRate: 0.00,
    description: 'Extrem stark und präzise, verzeiht so gut wie keine Ungenauigkeit.',
    isLowDifficulty: false,
  },
  {
    id: 'stockfish-2400',
    label: 'Stockfish Max',
    name: 'Stockfish 19',
    avatar: '🤖',
    rating: 2400,
    depth: 18,
    skill: 20,
    blunderRate: 0.00,
    description: 'Volle Rechenleistung von Stockfish 19. Für maximale Herausforderung!',
    isLowDifficulty: false,
  },
]

export function getBotLevelForRating(rating: number): BotLevel {
  const clamped = Math.max(100, Math.min(2400, Math.round(rating)))
  const exact = BOT_LEVELS.find((b) => b.rating === clamped)
  if (exact) return exact

  let closest = BOT_LEVELS[0]
  let minDiff = Math.abs(BOT_LEVELS[0].rating - clamped)
  for (const lvl of BOT_LEVELS) {
    const diff = Math.abs(lvl.rating - clamped)
    if (diff < minDiff) {
      minDiff = diff
      closest = lvl
    }
  }

  let depth = 1
  if (clamped <= 300) depth = 1
  else if (clamped <= 600) depth = 2
  else if (clamped <= 800) depth = 3
  else if (clamped <= 1000) depth = 5
  else if (clamped <= 1200) depth = 7
  else if (clamped <= 1400) depth = 9
  else if (clamped <= 1600) depth = 11
  else if (clamped <= 1800) depth = 13
  else if (clamped <= 2000) depth = 15
  else if (clamped <= 2200) depth = 16
  else depth = 18

  let skill = 0
  if (clamped <= 800) skill = 0
  else if (clamped <= 1000) skill = Math.round(((clamped - 800) / 200) * 3)
  else if (clamped <= 1400) skill = 3 + Math.round(((clamped - 1000) / 400) * 6)
  else if (clamped <= 2000) skill = 9 + Math.round(((clamped - 1400) / 600) * 9)
  else skill = 18 + Math.round(((clamped - 2000) / 400) * 2)

  let blunderRate = 0
  if (clamped <= 150) blunderRate = 0.75
  else if (clamped <= 300) blunderRate = 0.60
  else if (clamped <= 500) blunderRate = 0.45
  else if (clamped <= 750) blunderRate = 0.30
  else if (clamped <= 1000) blunderRate = 0.15
  else if (clamped <= 1300) blunderRate = 0.05
  else blunderRate = 0

  return {
    id: `custom-${clamped}`,
    label: `${closest.label}`,
    name: closest.name,
    avatar: closest.avatar,
    rating: clamped,
    depth,
    skill,
    blunderRate,
    description: closest.description,
    isLowDifficulty: clamped <= 1000,
  }
}

export function chooseBotMove(
  fen: string,
  lines: EngineLine[],
  botLevel: BotLevel,
  style: 'balanced' | 'tactical' | 'positional' = 'balanced'
): BoardMove | null {
  const chess = new Chess(fen)
  const legalMoves = chess.moves({ verbose: true })
  if (!legalMoves.length) return null

  // Check if bot blunders based on rating / blunderRate
  const shouldBlunder = Math.random() < botLevel.blunderRate

  if (shouldBlunder) {
    // Beginner move selection:
    // Avoid instant checkmate against the bot if alternatives exist
    const nonSuicideMoves = legalMoves.filter((m) => {
      const copy = new Chess(fen)
      try {
        copy.move(m)
        return !copy.isCheckmate()
      } catch {
        return true
      }
    })
    const pool = nonSuicideMoves.length > 0 ? nonSuicideMoves : legalMoves

    if (botLevel.rating <= 400) {
      // 100 - 400 Elo: Pick a random move among legal moves (hangs pieces, edge moves, etc.)
      const picked = pool[Math.floor(Math.random() * pool.length)]
      return {
        from: picked.from as Square,
        to: picked.to as Square,
        ...(picked.promotion ? { promotion: picked.promotion as PieceSymbol } : {}),
      }
    }

    // 401 - 1000 Elo: Choose a suboptimal engine line if available, otherwise random move
    if (lines.length > 1) {
      const idx = 1 + Math.floor(Math.random() * (lines.length - 1))
      const weaker = lines[idx]
      if (weaker?.pv[0]) {
        const uci = parseUciMove(weaker.pv[0])
        if (uci) return uci
      }
    }
    const picked = pool[Math.floor(Math.random() * pool.length)]
    return {
      from: picked.from as Square,
      to: picked.to as Square,
      ...(picked.promotion ? { promotion: picked.promotion as PieceSymbol } : {}),
    }
  }

  // Normal engine-guided move selection
  const options = lines.flatMap((line) => {
    const move = line.pv[0] ? parseUciMove(line.pv[0]) : null
    if (!move) return []
    const copy = new Chess(fen)
    try {
      const applied = copy.move(move)
      return [{
        move,
        score: line.scoreCp ?? (line.mate ? (line.mate > 0 ? 100_000 : -100_000) : 0),
        capture: applied.isCapture(),
        check: copy.isCheck(),
        mate: copy.isCheckmate(),
        center: ['d4', 'e4', 'd5', 'e5'].includes(move.to),
      }]
    } catch {
      return []
    }
  })

  if (!options.length) {
    const first = legalMoves[0]
    return {
      from: first.from as Square,
      to: first.to as Square,
      ...(first.promotion ? { promotion: first.promotion as PieceSymbol } : {}),
    }
  }

  const bestScore = Math.max(...options.map((option) => option.score))
  const close = options.filter((option) => option.score >= bestScore - 75)
  const selected = style === 'tactical'
    ? [...close].sort((a, b) => Number(b.mate) - Number(a.mate) || Number(b.check) - Number(a.check) || Number(b.capture) - Number(a.capture))[0]
    : style === 'positional'
      ? [...close].sort((a, b) => Number(b.center) - Number(a.center) || Number(a.capture) - Number(b.capture))[0]
      : options.sort((a, b) => b.score - a.score)[0]

  return selected?.move ?? options[0].move
}
