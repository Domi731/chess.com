import type { Square } from 'chess.js'
import type { BoardMove } from '../components/ChessBoard'

export type EngineLine = { multipv: number; depth: number; scoreCp: number | null; mate: number | null; pv: string[] }
export type EngineResult = { bestMove: string | null; lines: EngineLine[] }

class StockfishClient {
  private worker: Worker
  private readyPromise: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (reason: Error) => void
  private pending: { resolve: (result: EngineResult) => void; reject: (reason: Error) => void; lines: Map<number, EngineLine> } | null = null

  constructor() {
    this.readyPromise = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject })
    this.worker = new Worker('/engine/stockfish-19-lite-single.js', { name: 'Knight Club Stockfish' })
    this.worker.onmessage = (event: MessageEvent<string>) => this.handleMessage(String(event.data))
    this.worker.onerror = () => this.rejectReady(new Error('Stockfish konnte nicht geladen werden. Prüfe die Engine-Dateien und starte die App erneut.'))
    this.worker.postMessage('uci')
    window.setTimeout(() => this.rejectReady(new Error('Stockfish antwortet nicht.')), 20_000)
  }

  private handleMessage(line: string) {
    if (line === 'uciok') {
      this.worker.postMessage('isready')
      return
    }
    if (line === 'readyok') {
      this.resolveReady()
      return
    }
    const pending = this.pending
    if (!pending) return
    if (line.startsWith('info ')) {
      const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0)
      const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1)
      const cpMatch = line.match(/\bscore cp (-?\d+)/)
      const mateMatch = line.match(/\bscore mate (-?\d+)/)
      const pv = line.match(/\bpv (.+)$/)?.[1]?.trim().split(/\s+/) ?? []
      if (depth && pv.length) pending.lines.set(multipv, { multipv, depth, scoreCp: cpMatch ? Number(cpMatch[1]) : null, mate: mateMatch ? Number(mateMatch[1]) : null, pv })
    }
    if (line.startsWith('bestmove ')) {
      const bestMove = line.split(/\s+/)[1]
      const lines = [...pending.lines.values()].sort((a, b) => a.multipv - b.multipv)
      this.pending = null
      pending.resolve({ bestMove: bestMove && bestMove !== '(none)' ? bestMove : null, lines })
    }
  }

  async analyze(fen: string, depth: number, options: { skill?: number; multipv?: number } = {}) {
    await this.readyPromise
    if (this.pending) {
      this.worker.postMessage('stop')
      this.pending.reject(new Error('Die vorherige Analyse wurde abgebrochen.'))
      this.pending = null
    }
    const skill = Math.max(0, Math.min(20, options.skill ?? 20))
    const multipv = Math.max(1, Math.min(4, options.multipv ?? 1))
    return new Promise<EngineResult>((resolve, reject) => {
      this.pending = { resolve, reject, lines: new Map() }
      this.worker.postMessage(`setoption name Skill Level value ${skill}`)
      this.worker.postMessage(`setoption name MultiPV value ${multipv}`)
      this.worker.postMessage(`position fen ${fen}`)
      this.worker.postMessage(`go depth ${Math.max(1, Math.min(20, depth))}`)
      window.setTimeout(() => {
        if (!this.pending) return
        this.worker.postMessage('stop')
        this.pending.reject(new Error('Die Analyse hat zu lange gedauert.'))
        this.pending = null
      }, 60_000)
    })
  }

  terminate() {
    if (this.pending) this.pending.reject(new Error('Stockfish wurde beendet.'))
    this.pending = null
    this.worker.terminate()
  }
}

let singleton: StockfishClient | null = null
let hintSingleton: StockfishClient | null = null

export function analyzePosition(fen: string, depth = 13, options: { skill?: number; multipv?: number } = {}) {
  singleton ??= new StockfishClient()
  return singleton.analyze(fen, depth, options)
}

export function analyzeHint(fen: string, depth = 8) {
  hintSingleton ??= new StockfishClient()
  return hintSingleton.analyze(fen, depth, { skill: 20, multipv: 1 })
}

export function stopStockfish() {
  singleton?.terminate()
  singleton = null
  hintSingleton?.terminate()
  hintSingleton = null
}

export function parseUciMove(uci: string): BoardMove | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null
  const promotion = uci.length === 5 ? uci[4] as BoardMove['promotion'] : undefined
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, ...(promotion ? { promotion } : {}) }
}
