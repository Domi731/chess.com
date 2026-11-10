import { createClient } from 'npm:@supabase/supabase-js@2'
import { Chess } from 'npm:chess.js@1.4.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function readProjectKeySet(variable: string) {
  const value = Deno.env.get(variable)
  if (!value) return null
  try {
    const keys = JSON.parse(value) as Record<string, string>
    return keys.default ?? Object.values(keys).find((key) => typeof key === 'string') ?? null
  } catch {
    return value
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' })

  const url = Deno.env.get('SUPABASE_URL')
  const publishableKey = readProjectKeySet('SUPABASE_PUBLISHABLE_KEYS')
    ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    ?? Deno.env.get('SUPABASE_ANON_KEY')
  const adminKey = readProjectKeySet('SUPABASE_SECRET_KEYS')
    ?? Deno.env.get('SUPABASE_SECRET_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !publishableKey || !adminKey || !authorization) return respond(503, { error: 'Server configuration or guest session is missing.' })

  const authClient = createClient(url, publishableKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user }, error: userError } = await authClient.auth.getUser()
  if (userError || !user) return respond(401, { error: 'A valid guest session is required.' })

  let body: { game_id?: string; expected_ply?: number; claim_timeout?: boolean; move?: { from?: string; to?: string; promotion?: string } }
  try { body = await request.json() } catch { return respond(400, { error: 'Invalid JSON body.' }) }
  if (!body.game_id || !Number.isInteger(body.expected_ply) || (!body.claim_timeout && (!body.move?.from || !body.move?.to))) {
    return respond(400, { error: 'game_id, expected_ply and a move are required.' })
  }

  const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: record, error: gameError } = await admin.from('games').select('*').eq('id', body.game_id).maybeSingle()
  if (gameError || !record) return respond(404, { error: 'Game not found.' })
  if (record.status !== 'active') return respond(409, { error: 'This game is no longer active.' })
  if (![record.white_player_id, record.black_player_id].includes(user.id)) return respond(403, { error: 'You are not a player in this game.' })
  if ((record.san_moves?.length ?? 0) !== body.expected_ply) return respond(409, { error: 'The board changed. Refresh the game before moving.' })

  const game = new Chess(record.fen)
  const movingColor = game.turn()
  const currentPlayer = movingColor === 'w' ? record.white_player_id : record.black_player_id
  if (currentPlayer !== user.id) return respond(403, { error: 'It is the other player’s turn.' })

  const now = Date.now()
  const startedAt = record.turn_started_at ?? record.started_at
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const remaining = movingColor === 'w' ? record.white_seconds - elapsed : record.black_seconds - elapsed
  if (body.claim_timeout) {
    if (remaining > 0) return respond(409, { error: 'The active clock has not run out yet.' })
    const winnerId = movingColor === 'w' ? record.black_player_id : record.white_player_id
    const { data: timedOut, error: timeoutError } = await admin.from('games').update({
      status: 'completed', result: movingColor === 'w' ? '0-1' : '1-0', winner_id: winnerId,
      completed_at: new Date(now).toISOString(), [movingColor === 'w' ? 'white_seconds' : 'black_seconds']: 0,
    }).eq('id', record.id).eq('fen', record.fen).eq('status', 'active').select('*').maybeSingle()
    if (timeoutError) return respond(500, { error: 'The timeout could not be recorded.' })
    if (!timedOut) return respond(409, { error: 'The game changed. Refresh the board.' })
    return respond(200, { game: timedOut, result: timedOut.result })
  }
  if (remaining <= 0) {
    const result = movingColor === 'w' ? '0-1' : '1-0'
    const winnerId = movingColor === 'w' ? record.black_player_id : record.white_player_id
    const { data: timedOut } = await admin.from('games').update({
      status: 'completed', result, winner_id: winnerId, completed_at: new Date(now).toISOString(),
      [movingColor === 'w' ? 'white_seconds' : 'black_seconds']: 0,
    }).eq('id', record.id).eq('fen', record.fen).eq('status', 'active').select('id').maybeSingle()
    if (!timedOut) return respond(409, { error: 'The game changed. Refresh the board.' })
    return respond(409, { error: 'Your clock ran out.', result })
  }

  let played
  try {
    played = game.move({ from: body.move.from, to: body.move.to, ...(body.move.promotion ? { promotion: body.move.promotion } : {}) })
  } catch {
    return respond(400, { error: 'That move is not legal.' })
  }

  const result = game.isCheckmate() ? (movingColor === 'w' ? '1-0' : '0-1') : game.isDraw() ? '1/2-1/2' : null
  const winnerId = result === '1-0' ? record.white_player_id : result === '0-1' ? record.black_player_id : null
  const nextClock = remaining + record.increment_seconds
  const update = {
    fen: game.fen(),
    pgn: game.pgn(),
    san_moves: game.history(),
    white_seconds: movingColor === 'w' ? nextClock : record.white_seconds,
    black_seconds: movingColor === 'b' ? nextClock : record.black_seconds,
    turn_started_at: new Date(now).toISOString(),
    status: result ? 'completed' : 'active',
    result,
    winner_id: winnerId,
    completed_at: result ? new Date(now).toISOString() : null,
  }
  const { data: updated, error: updateError } = await admin.from('games').update(update)
    .eq('id', record.id).eq('fen', record.fen).eq('status', 'active').select('*').maybeSingle()
  if (updateError) return respond(500, { error: 'The move could not be saved.' })
  if (!updated) return respond(409, { error: 'The game changed. Refresh the board.' })
  return respond(200, { game: updated, san: played.san })
})
