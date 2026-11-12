import { Chess, type Color, type PieceSymbol } from 'chess.js'
import { analyzeHint, parseUciMove } from './stockfish'
import type { BoardMove } from '../components/ChessBoard'

export type BoardHint = {
  move: BoardMove
  san: string
  title: string
  explanation: string
  category: 'checkmate' | 'check' | 'capture' | 'defense' | 'castle' | 'development' | 'center' | 'tactic' | 'positional'
  scoreCp?: number | null
  mateIn?: number | null
}

const pieceGermanNames: Record<PieceSymbol, { name: string; accusative: string }> = {
  k: { name: 'König', accusative: 'den König' },
  q: { name: 'Dame', accusative: 'die Dame' },
  r: { name: 'Turm', accusative: 'den Turm' },
  b: { name: 'Läufer', accusative: 'den Läufer' },
  n: { name: 'Springer', accusative: 'den Springer' },
  p: { name: 'Bauer', accusative: 'einen Bauern' },
}

export async function computeHint(fen: string, playerColor: Color): Promise<BoardHint | null> {
  const chess = new Chess(fen)
  if (chess.isGameOver() || chess.turn() !== playerColor) return null

  try {
    const analysis = await analyzeHint(fen, 10)
    const bestMoveUci = analysis.bestMove ?? analysis.lines[0]?.pv[0]
    if (!bestMoveUci) return null

    const parsed = parseUciMove(bestMoveUci)
    if (!parsed) return null

    const testGame = new Chess(fen)
    let moveResult
    try {
      moveResult = testGame.move({
        from: parsed.from,
        to: parsed.to,
        ...(parsed.promotion ? { promotion: parsed.promotion } : {}),
      })
    } catch {
      return null
    }

    const isMate = testGame.isCheckmate()
    const isCheck = testGame.isCheck()
    const isCastle = moveResult.san === 'O-O' || moveResult.san === 'O-O-O'
    const captured = moveResult.captured
    const isCapture = Boolean(captured)
    const movePiece = moveResult.piece
    const moveCount = chess.history().length

    const bestLine = analysis.lines[0]
    const scoreCp = bestLine?.scoreCp ?? null
    const mateIn = bestLine?.mate ?? null

    let category: BoardHint['category'] = 'positional'
    let title = '🎯 Guter Entwicklungszug'
    let explanation = `Verbessert deine Figurenstellung und übt Druck auf die gegnerischen Linien aus.`

    if (isMate) {
      category = 'checkmate'
      title = '🏆 Schachmatt!'
      explanation = `Spiele ${moveResult.san} – setzt den gegnerischen König sofort schachmatt und gewinnt das Spiel!`
    } else if (mateIn && mateIn > 0) {
      category = 'checkmate'
      title = `🏆 Matt in ${mateIn} ${mateIn === 1 ? 'Zug' : 'Zügen'}!`
      explanation = `Spiele ${moveResult.san} – leitet ein unausweichliches Schachmatt ein!`
    } else if (isCapture) {
      category = 'capture'
      const capName = captured ? pieceGermanNames[captured].accusative : 'eine Figur'
      const capPoints = captured === 'q' ? '+9' : captured === 'r' ? '+5' : captured === 'b' || captured === 'n' ? '+3' : '+1'
      title = `⚔️ ${capName.toUpperCase()} schlagen (${capPoints})`
      explanation = `Schlägt ${capName} auf ${parsed.to}. Nutze den Materialvorteil!`
    } else if (isCheck) {
      category = 'check'
      title = '⚡ Schachgebot!'
      explanation = `Setzt den gegnerischen König mit ${moveResult.san} unter Druck und zwingt ihn zur Reaktion.`
    } else if (isCastle) {
      category = 'castle'
      title = '🛡️ Rochade (Königssicherheit)'
      explanation = 'Bringt deinen König aus der offenen Mitte in Sicherheit und aktiviert gleichzeitig deinen Turm!'
    } else if (['d4', 'e4', 'd5', 'e5'].includes(parsed.to) && movePiece === 'p') {
      category = 'center'
      title = '⭐ Zentrum besetzen'
      explanation = `Besetzt das wichtige Zentrumsfeld ${parsed.to} und sichert dir wertvollen Raum für Figuren.`
    } else if (moveCount <= 12 && (movePiece === 'n' || movePiece === 'b')) {
      category = 'development'
      title = '🌱 Figur entwickeln'
      explanation = `Bringt ${pieceGermanNames[movePiece].accusative} aktiv ins Spiel und bereitet die Rochade vor.`
    } else if (parsed.to.endsWith('7') || parsed.to.endsWith('8') || parsed.to.endsWith('2') || parsed.to.endsWith('1')) {
      if (movePiece === 'p') {
        category = 'tactic'
        title = '👑 Bauer vorrücken'
        explanation = `Rückt den Freibauern auf ${parsed.to} vor in Richtung Damen-Umwandlung!`
      }
    }

    return {
      move: parsed,
      san: moveResult.san,
      title,
      explanation,
      category,
      scoreCp,
      mateIn,
    }
  } catch {
    return null
  }
}
