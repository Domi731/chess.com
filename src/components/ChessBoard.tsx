import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import type { DragEvent } from 'react'

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const names: Record<PieceSymbol, string> = { k: 'König', q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer', p: 'Bauer' }

export type BoardMove = { from: Square; to: Square; promotion?: PieceSymbol }

type PieceMotion = {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  deltaRow: number
  deltaCol: number
  color: Color
  type: PieceSymbol
  arrived: boolean
  id: number
}

type Props = {
  fen: string
  onMove: (move: BoardMove) => void | Promise<void>
  interactive?: boolean
  orientation?: Color
  lastMove?: { from: Square; to: Square } | null
  hintMove?: { from: Square; to: Square } | null
  showHintArrow?: boolean
  theme?: 'green' | 'blue' | 'wood' | 'mono'
  pieceSet?: 'classic' | 'contrast' | 'minimal'
  coordinates?: boolean
  className?: string
}

export function playBoardSound(type: 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'game-start' | 'game-end', enabled = readBoardPreferences().sound) {
  if (enabled !== true) return
  try {
    const file = type === 'move' ? 'move-self'
      : type === 'capture' ? 'capture'
      : type === 'check' ? 'move-check'
      : type === 'castle' ? 'castle'
      : type === 'promote' ? 'promote'
      : type === 'game-start' ? 'game-start'
      : 'game-end'
    const audio = new Audio(`/sounds/${file}.mp3`)
    audio.volume = 0.7
    audio.play().catch(() => {})
  } catch {
    /* Audio optional */
  }
}

function readBoardPreferences() {
  try { return JSON.parse(localStorage.getItem('knight-club-preferences') ?? '{}') as { boardTheme?: Props['theme']; pieceSet?: Props['pieceSet']; coordinates?: boolean; sound?: boolean } }
  catch { return {} }
}

export default function ChessBoard({
  fen,
  onMove,
  interactive = true,
  orientation = 'w',
  lastMove,
  hintMove,
  showHintArrow = true,
  theme,
  pieceSet,
  coordinates,
  className = '',
}: Props) {
  const game = useMemo(() => new Chess(fen), [fen])
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [pieceMotion, setPieceMotion] = useState<PieceMotion | null>(null)
  const [preferences, setPreferences] = useState(readBoardPreferences)
  const previousFen = useRef(fen)
  const motionId = useRef(0)
  const activeTheme = theme ?? preferences.boardTheme ?? 'green'
  const activePieceSet = pieceSet ?? preferences.pieceSet ?? 'classic'
  const showCoordinates = coordinates ?? preferences.coordinates ?? true
  const legal = useMemo(() => new Set(selected ? game.moves({ square: selected, verbose: true }).map((move) => move.to) : []), [game, selected])
  const board = game.board()
  const checkedKing = game.isCheck() ? board.flatMap((rank, row) => rank.map((piece, col) => piece?.type === 'k' && piece.color === game.turn() ? `${files[col]}${8 - row}` as Square : null)).flat().find(Boolean) : null
  const checkSquare = checkedKing ?? null

  useLayoutEffect(() => {
    const oldFen = previousFen.current
    previousFen.current = fen
    if (oldFen === fen) return

    if (game.isGameOver()) {
      playBoardSound('game-end')
    } else if (game.isCheck()) {
      playBoardSound('check')
    }

    if (!lastMove) { setPieceMotion(null); return }

    const previousGame = new Chess(oldFen)
    const movedPiece = previousGame.get(lastMove.from)
    const arrivedPiece = game.get(lastMove.to)
    if (!movedPiece || !arrivedPiece || movedPiece.color !== arrivedPiece.color || game.get(lastMove.from)) {
      setPieceMotion(null)
      return
    }

    const coordinatesFor = (square: Square) => {
      const file = square.charCodeAt(0) - 97
      const rank = Number(square[1])
      return orientation === 'w'
        ? { row: 8 - rank, col: file }
        : { row: rank - 1, col: 7 - file }
    }
    const from = coordinatesFor(lastMove.from)
    const to = coordinatesFor(lastMove.to)
    const id = ++motionId.current
    setPieceMotion({
      fromRow: from.row,
      fromCol: from.col,
      toRow: to.row,
      toCol: to.col,
      deltaRow: to.row - from.row,
      deltaCol: to.col - from.col,
      color: movedPiece.color,
      type: movedPiece.type,
      arrived: false,
      id,
    })

    const frame = window.requestAnimationFrame(() => {
      setPieceMotion((current) => current?.id === id ? { ...current, arrived: true } : current)
    })
    const timeout = window.setTimeout(() => {
      setPieceMotion((current) => current?.id === id ? null : current)
    }, 1_050)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [fen, game, lastMove, orientation])

  useEffect(() => { setSelected(null); setPromotion(null) }, [fen])
  useEffect(() => {
    const refresh = () => setPreferences(readBoardPreferences())
    window.addEventListener('knight-club-preferences', refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('knight-club-preferences', refresh); window.removeEventListener('storage', refresh) }
  }, [])

  function chooseSquare(square: Square) {
    if (!interactive || game.isGameOver() || promotion) return
    if (selected && legal.has(square)) {
      attemptMove(selected, square)
      return
    }
    const piece = game.get(square)
    setSelected(piece?.color === game.turn() ? square : null)
  }

  function attemptMove(from: Square, to: Square, promote?: PieceSymbol) {
    const piece = game.get(from)
    if (!promote && piece?.type === 'p' && (to.endsWith('8') || to.endsWith('1'))) {
      setPromotion({ from, to })
      return
    }
    const target = game.get(to)
    const isCapture = Boolean(target) || (piece?.type === 'p' && from[0] !== to[0])
    const isCastle = piece?.type === 'k' && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2
    const isPromote = Boolean(promote)

    if (isPromote) playBoardSound('promote')
    else if (isCastle) playBoardSound('castle')
    else if (isCapture) playBoardSound('capture')
    else playBoardSound('move')

    void onMove({ from, to, ...(promote ? { promotion: promote } : {}) })
    setSelected(null)
    setPromotion(null)
  }

  function onDragStart(event: DragEvent<HTMLDivElement>, square: Square) {
    const piece = game.get(square)
    if (!interactive || game.isGameOver() || !piece || piece.color !== game.turn()) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData('text/plain', square)
    event.dataTransfer.effectAllowed = 'move'
    setSelected(square)
  }

  return (
    <div className={`board-wrap piece-set-${activePieceSet} ${className}`}>
      <div className={`chessboard board-theme-${activeTheme}`} role="grid" aria-label="Chessboard">
        {Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) => {
          const fileIndex = orientation === 'w' ? col : 7 - col
          const rank = orientation === 'w' ? 8 - row : row + 1
          const square = `${files[fileIndex]}${rank}` as Square
          const piece = game.get(square)
          const isLight = (fileIndex + rank) % 2 === 0
          const isLastMove = lastMove?.from === square || lastMove?.to === square
          const isSelected = selected === square
          const canMove = legal.has(square)
          const inCheck = checkSquare === square
          const isHintFrom = hintMove?.from === square
          const isHintTo = hintMove?.to === square
          return (
            <div
              role="gridcell"
              key={square}
              className={`square ${isLight ? 'square-light' : 'square-dark'} ${isLastMove ? 'square-last-move' : ''} ${isSelected ? 'square-selected' : ''} ${inCheck ? 'square-check' : ''} ${isHintFrom ? 'square-hint-from' : ''} ${isHintTo ? 'square-hint-to' : ''}`}
              aria-label={`${square}${piece ? `, ${piece.color === 'w' ? 'white' : 'black'} ${names[piece.type]}` : ''}${canMove ? ', legal move' : ''}`}
              onClick={() => chooseSquare(square)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const from = event.dataTransfer.getData('text/plain') as Square
                if (from && legal.has(square) && interactive) attemptMove(from, square)
                else setSelected(null)
              }}
            >
              {showCoordinates && col === 0 && (
                <span className={`coordinate rank-coordinate ${isLight ? 'coordinate-dark' : 'coordinate-light'}`}>
                  {rank}
                </span>
              )}
              {showCoordinates && row === 7 && (
                <span className={`coordinate file-coordinate ${isLight ? 'coordinate-dark' : 'coordinate-light'}`}>
                  {files[fileIndex]}
                </span>
              )}

              {canMove && <span className={`move-hint ${piece ? 'move-hint-capture' : 'move-hint-dot'}`} />}

              {piece && !(pieceMotion && pieceMotion.toCol === col && pieceMotion.toRow === row) && (
                <div
                  className="piece-container"
                  draggable={interactive && piece.color === game.turn()}
                  onDragStart={(event) => onDragStart(event, square)}
                >
                  <img
                    src={`/pieces/neo/${piece.color}${piece.type}.png`}
                    alt={`${piece.color === 'w' ? 'White' : 'Black'} ${names[piece.type]}`}
                    className="piece-image"
                    draggable={false}
                  />
                </div>
              )}
            </div>
          )
        }))}

        {pieceMotion && (
          <div
            aria-hidden="true"
            className={`piece-motion ${pieceMotion.arrived ? 'piece-motion-arrived' : ''}`}
            style={{
              '--piece-x': `${pieceMotion.fromCol * 12.5}%`,
              '--piece-y': `${pieceMotion.fromRow * 12.5}%`,
              '--piece-dx': `${pieceMotion.deltaCol * 100}%`,
              '--piece-dy': `${pieceMotion.deltaRow * 100}%`,
            } as CSSProperties}
          >
            <img
              src={`/pieces/neo/${pieceMotion.color}${pieceMotion.type}.png`}
              alt=""
              className="piece-image"
              draggable={false}
            />
          </div>
        )}

        {hintMove && showHintArrow && (() => {
          const coordinatesFor = (square: Square) => {
            const file = square.charCodeAt(0) - 97
            const rank = Number(square[1])
            return orientation === 'w'
              ? { row: 8 - rank, col: file }
              : { row: rank - 1, col: 7 - file }
          }
          const from = coordinatesFor(hintMove.from)
          const to = coordinatesFor(hintMove.to)
          const x1 = (from.col + 0.5) * 12.5
          const y1 = (from.row + 0.5) * 12.5
          const x2 = (to.col + 0.5) * 12.5
          const y2 = (to.row + 0.5) * 12.5
          const dx = x2 - x1
          const dy = y2 - y1
          const dist = Math.hypot(dx, dy)
          const shorten = Math.min(2.5, dist * 0.22)
          const endX = x2 - (dx / (dist || 1)) * shorten
          const endY = y2 - (dy / (dist || 1)) * shorten

          return (
            <svg className="board-arrow-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <marker id="hint-arrow-head" markerWidth="4" markerHeight="4" refX="2.6" refY="2" orient="auto">
                  <polygon points="0 0.5, 3.8 2, 0 3.5" fill="#16a34a" />
                </marker>
              </defs>
              <line
                x1={x1}
                y1={y1}
                x2={endX}
                y2={endY}
                stroke="#22c55e"
                strokeWidth="2.4"
                strokeLinecap="round"
                markerEnd="url(#hint-arrow-head)"
                opacity="0.88"
              />
            </svg>
          )
        })()}
      </div>

      {promotion && (
        <div className="promotion-scrim" role="dialog" aria-modal="true" aria-label="Pawn Promotion">
          <div className="promotion-dialog">
            <span className="promotion-title">Select Promotion</span>
            <div className="promotion-choices">
              {(['q', 'n', 'r', 'b'] as PieceSymbol[]).map((p) => (
                <button
                  key={p}
                  className="promotion-btn"
                  aria-label={names[p]}
                  onClick={() => attemptMove(promotion.from, promotion.to, p)}
                >
                  <img
                    src={`/pieces/neo/${game.turn()}${p}.png`}
                    alt={names[p]}
                    className="promotion-piece-img"
                  />
                </button>
              ))}
            </div>
            <button className="promotion-cancel" onClick={() => setPromotion(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
