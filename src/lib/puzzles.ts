export type PuzzleRecord = {
  id: string
  title: string
  fen: string
  solution_uci: string[]
  rating: number
  themes: string[]
  source_url: string | null
  is_daily: boolean
}

export const CURATED_PUZZLES: PuzzleRecord[] = [
  { id: 'mate-in-one-queen', title: 'Matt in einem Zug', fen: '6k1/5ppp/8/8/8/8/5PPP/4Q1K1 w - - 0 1', solution_uci: ['e1e8'], rating: 900, themes: ['Matt in 1', 'Damenmatt'], source_url: null, is_daily: true },
  { id: 'mate-in-one-back-rank', title: 'Die freie Linie', fen: '7k/5ppp/8/8/8/8/5PPP/1Q4K1 w - - 0 1', solution_uci: ['b1b8'], rating: 1100, themes: ['Matt in 1', 'Grundreihe'], source_url: null, is_daily: true },
  { id: 'mate-in-one-file', title: 'Matt auf der achten Reihe', fen: '7k/5ppp/8/8/8/8/5PPP/Q5K1 w - - 0 1', solution_uci: ['a1a8'], rating: 1000, themes: ['Matt in 1', 'Damenmatt'], source_url: null, is_daily: true },
  { id: 'mate-in-one-king-support', title: 'König und Dame', fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', solution_uci: ['g6g7'], rating: 1450, themes: ['Matt in 1', 'Königsunterstützung'], source_url: null, is_daily: true },
]
