import { requireSupabase } from './supabase'
import { CURATED_PUZZLES, type PuzzleRecord } from './puzzles'
import type { FriendRow, GameCategory, PlayerProfile, PlayerRating, SavedGame } from './types'

export async function loadPlayerRatings(userId: string): Promise<PlayerRating[]> {
  const { data, error } = await requireSupabase().from('player_ratings').select('*').eq('user_id', userId).order('game_type')
  if (error) throw error
  return (data ?? []) as PlayerRating[]
}

export async function loadGames(userId: string, limit = 100): Promise<SavedGame[]> {
  const { data, error } = await requireSupabase().from('games').select('*')
    .or(`owner_id.eq.${userId},white_player_id.eq.${userId},black_player_id.eq.${userId}`)
    .eq('status', 'completed').order('completed_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as SavedGame[]
}

export async function saveCompletedGame(input: {
  userId: string
  mode: 'local' | 'computer'
  gameType: GameCategory
  timeControl: string
  result: string
  fen: string
  pgn: string
  moves: string[]
  humanColor: 'w' | 'b'
  opponent: string
}) {
  const winnerIsHuman = input.result === (input.humanColor === 'w' ? '1-0' : '0-1')
  const { error } = await requireSupabase().from('games').insert({
    owner_id: input.userId,
    white_player_id: input.mode === 'local' || input.mode === 'computer' && input.humanColor === 'w' ? input.userId : null,
    black_player_id: input.mode === 'computer' && input.humanColor === 'b' ? input.userId : null,
    opponent_label: input.opponent,
    game_mode: input.mode,
    game_type: input.gameType,
    time_control: input.timeControl,
    status: 'completed',
    result: input.result,
    winner_id: input.mode === 'computer' && winnerIsHuman ? input.userId : null,
    fen: input.fen,
    pgn: input.pgn,
    san_moves: input.moves,
    is_rated: false,
    completed_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function saveGameAccuracy(gameId: string, userId: string, whiteAccuracy: number, blackAccuracy: number) {
  const { data, error } = await requireSupabase().from('games').update({ white_accuracy: whiteAccuracy, black_accuracy: blackAccuracy })
    .eq('id', gameId).eq('owner_id', userId).eq('status', 'completed').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Für diese Partie kannst du die Genauigkeit nicht speichern.')
}

export async function loadLeaderboard(gameType: GameCategory, limit = 50) {
  const { data, error } = await requireSupabase().from('player_ratings')
    .select('user_id, game_type, rating, games_played, wins, losses, draws, updated_at, profiles(username, display_name, avatar_url)')
    .eq('game_type', gameType).order('rating', { ascending: false }).limit(limit)
  if (error) throw error
  return data ?? []
}

export async function searchProfiles(query: string): Promise<PlayerProfile[]> {
  const clean = query.trim().replace(/[,%()]/g, '')
  if (clean.length < 2) return []
  const { data, error } = await requireSupabase().from('profiles').select('*').ilike('username', `%${clean}%`).limit(12)
  if (error) throw error
  return (data ?? []) as PlayerProfile[]
}

export async function loadFriendships(userId: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('friendships').select('*')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`).order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as FriendRow[]
  const otherIds = [...new Set(rows.map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id))]
  if (!otherIds.length) return rows.map((row) => ({ ...row, counterpart: null as PlayerProfile | null }))
  const profilesResult = await client.from('profiles').select('*').in('id', otherIds)
  if (profilesResult.error) throw profilesResult.error
  const profiles = new Map((profilesResult.data as PlayerProfile[]).map((profile) => [profile.id, profile]))
  return rows.map((row) => ({ ...row, counterpart: profiles.get(row.requester_id === userId ? row.addressee_id : row.requester_id) ?? null }))
}

export async function sendFriendRequest(userId: string, username: string) {
  const client = requireSupabase()
  const { data: target, error: searchError } = await client.from('profiles').select('id, username').ilike('username', username).maybeSingle()
  if (searchError) throw searchError
  if (!target) throw new Error('Dieser Benutzername wurde nicht gefunden.')
  if (target.id === userId) throw new Error('Du kannst dir selbst keine Anfrage senden.')
  const { error } = await client.from('friendships').insert({ requester_id: userId, addressee_id: target.id, status: 'pending' })
  if (error?.code === '23505') throw new Error('Eine Anfrage oder Freundschaft besteht bereits.')
  if (error) throw error
}

export async function respondToFriendRequest(id: string, status: 'accepted' | 'declined') {
  const { error } = await requireSupabase().from('friendships').update({ status }).eq('id', id)
  if (error) throw error
}

export async function removeFriendship(id: string) {
  const { error } = await requireSupabase().from('friendships').delete().eq('id', id)
  if (error) throw error
}

export async function loadPuzzles(): Promise<PuzzleRecord[]> {
  const { data, error } = await requireSupabase().from('puzzles').select('*').order('rating')
  if (error) throw error
  return (data ?? []) as PuzzleRecord[]
}

export async function loadPuzzleStats(userId: string) {
  const { data, error } = await requireSupabase().from('puzzle_stats').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}

export async function recordPuzzleAttempt(puzzle: PuzzleRecord, moves: string[], durationSeconds: number) {
  const { data, error } = await requireSupabase().rpc('record_puzzle_attempt', {
    p_puzzle_id: puzzle.id,
    p_moves: moves,
    p_duration_seconds: durationSeconds,
  })
  if (error) throw error
  return data as { solved: boolean; rating: number; attempts: number; solved_count: number; current_streak: number; best_streak: number }
}

export async function loadLessonProgress(userId: string) {
  const { data, error } = await requireSupabase().from('lesson_progress').select('*').eq('user_id', userId)
  if (error) throw error
  return data ?? []
}

export async function saveLessonProgress(userId: string, lessonId: string, score: number) {
  const { error } = await requireSupabase().from('lesson_progress').upsert({
    user_id: userId,
    lesson_id: lessonId,
    score,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

export function dailyPuzzleIndex(date = new Date()) {
  const utcDay = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000)
  return utcDay % CURATED_PUZZLES.length
}
