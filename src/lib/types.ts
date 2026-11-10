export type GameCategory = 'bullet' | 'blitz' | 'rapid' | 'custom'
export type GameMode = 'local' | 'computer' | 'online'
export type GameStatus = 'waiting' | 'active' | 'completed' | 'aborted'

export type PlayerProfile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  country: string | null
  bio: string | null
  created_at: string
}

export type PlayerRating = {
  user_id: string
  game_type: GameCategory
  rating: number
  games_played: number
  wins: number
  losses: number
  draws: number
  updated_at: string
}

export type SavedGame = {
  id: string
  owner_id: string
  white_player_id: string | null
  black_player_id: string | null
  game_mode: GameMode
  game_type: GameCategory
  time_control: string
  status: GameStatus
  result: string | null
  winner_id: string | null
  opponent_label?: string | null
  fen: string
  pgn: string
  san_moves: string[]
  is_rated: boolean
  white_accuracy: number | null
  black_accuracy: number | null
  created_at: string
  completed_at: string | null
}

export type FriendRow = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  requester?: PlayerProfile
  addressee?: PlayerProfile
}

export type TimeControl = {
  id: string
  category: GameCategory
  label: string
  baseSeconds: number
  incrementSeconds: number
}

export const TIME_CONTROLS: TimeControl[] = [
  { id: 'bullet-1-0', category: 'bullet', label: '1 + 0', baseSeconds: 60, incrementSeconds: 0 },
  { id: 'bullet-2-1', category: 'bullet', label: '2 + 1', baseSeconds: 120, incrementSeconds: 1 },
  { id: 'blitz-3-0', category: 'blitz', label: '3 + 0', baseSeconds: 180, incrementSeconds: 0 },
  { id: 'blitz-3-2', category: 'blitz', label: '3 + 2', baseSeconds: 180, incrementSeconds: 2 },
  { id: 'blitz-5-0', category: 'blitz', label: '5 + 0', baseSeconds: 300, incrementSeconds: 0 },
  { id: 'rapid-10-0', category: 'rapid', label: '10 + 0', baseSeconds: 600, incrementSeconds: 0 },
  { id: 'rapid-15-10', category: 'rapid', label: '15 + 10', baseSeconds: 900, incrementSeconds: 10 },
  { id: 'rapid-30-0', category: 'rapid', label: '30 + 0', baseSeconds: 1800, incrementSeconds: 0 },
]
