create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null default 'Schachfreund' check (char_length(display_name) between 1 and 40),
  avatar_url text,
  country text check (country is null or char_length(country) = 2),
  bio text not null default '' check (char_length(bio) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_ratings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_type text not null check (game_type in ('bullet', 'blitz', 'rapid', 'custom')),
  rating integer not null default 1200 check (rating between 100 and 4000),
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_type),
  check (games_played = wins + losses + draws)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  white_player_id uuid references public.profiles(id) on delete set null,
  black_player_id uuid references public.profiles(id) on delete set null,
  opponent_label text,
  game_mode text not null check (game_mode in ('local', 'computer', 'online')),
  game_type text not null check (game_type in ('bullet', 'blitz', 'rapid', 'custom')),
  time_control text not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'completed', 'aborted')),
  result text check (result is null or result in ('1-0', '0-1', '1/2-1/2', '*')),
  winner_id uuid references public.profiles(id) on delete set null,
  fen text not null,
  pgn text not null default '',
  san_moves text[] not null default '{}',
  white_seconds integer not null default 600 check (white_seconds >= 0),
  black_seconds integer not null default 600 check (black_seconds >= 0),
  increment_seconds integer not null default 0 check (increment_seconds between 0 and 60),
  turn_started_at timestamptz,
  invite_code text unique default encode(extensions.gen_random_bytes(16), 'hex'),
  is_public boolean not null default false,
  is_rated boolean not null default false,
  white_accuracy numeric(5,2) check (white_accuracy is null or white_accuracy between 0 and 100),
  black_accuracy numeric(5,2) check (black_accuracy is null or black_accuracy between 0 and 100),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create table if not exists public.matchmaking_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  game_type text not null check (game_type in ('bullet', 'blitz', 'rapid', 'custom')),
  time_control text not null,
  base_seconds integer not null check (base_seconds between 30 and 7200),
  increment_seconds integer not null check (increment_seconds between 0 and 60),
  rating integer not null default 1200,
  game_id uuid references public.games(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.puzzles (
  id text primary key,
  title text not null,
  fen text not null,
  solution_uci text[] not null,
  rating integer not null default 1200,
  themes text[] not null default '{}',
  source_url text,
  is_daily boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.puzzle_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  rating integer not null default 1500,
  attempts integer not null default 0,
  solved integer not null default 0,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  updated_at timestamptz not null default now(),
  check (solved <= attempts)
);

create table if not exists public.puzzle_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  puzzle_id text not null references public.puzzles(id) on delete cascade,
  solved boolean not null,
  moves_played text[] not null default '{}',
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id text not null,
  completed_at timestamptz,
  score integer not null default 0 check (score between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists games_owner_created_idx on public.games(owner_id, created_at desc);
create index if not exists games_white_created_idx on public.games(white_player_id, created_at desc);
create index if not exists games_black_created_idx on public.games(black_player_id, created_at desc);
create index if not exists games_status_idx on public.games(status, created_at desc);
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));
create unique index if not exists friendships_pair_idx on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_status_idx on public.friendships(addressee_id, status);
create index if not exists puzzle_attempts_user_created_idx on public.puzzle_attempts(user_id, created_at desc);
create index if not exists puzzle_attempts_puzzle_idx on public.puzzle_attempts(puzzle_id, solved);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_name text;
  candidate text;
begin
  base_name := regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, 'spieler'), '@', 1)), '[^A-Za-z0-9_]', '', 'g');
  if char_length(base_name) < 3 then base_name := 'spieler'; end if;
  candidate := lower(left(base_name, 24));
  while exists (select 1 from public.profiles p where p.username = candidate) loop
    candidate := left(lower(base_name), 17) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end loop;
  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, left(coalesce(new.raw_user_meta_data ->> 'display_name', base_name), 40))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.create_profile_for_user();

create or replace function public.apply_game_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  white_before integer;
  black_before integer;
  white_games integer;
  black_games integer;
  white_score numeric;
  white_expected numeric;
  white_delta integer;
  black_delta integer;
  white_k integer;
  black_k integer;
begin
  if new.status <> 'completed' or old.status = 'completed' or not new.is_rated
     or new.white_player_id is null or new.black_player_id is null then
    return new;
  end if;

  select rating, games_played into white_before, white_games from public.player_ratings where user_id = new.white_player_id and game_type = new.game_type;
  select rating, games_played into black_before, black_games from public.player_ratings where user_id = new.black_player_id and game_type = new.game_type;
  white_before := coalesce(white_before, 1200);
  black_before := coalesce(black_before, 1200);
  white_games := coalesce(white_games, 0);
  black_games := coalesce(black_games, 0);
  white_score := case when new.result = '1-0' then 1 when new.result = '0-1' then 0 else 0.5 end;
  white_expected := 1 / (1 + power(10::numeric, (black_before - white_before)::numeric / 400));
  white_k := case when white_games < 30 then 40 else 24 end;
  black_k := case when black_games < 30 then 40 else 24 end;
  white_delta := round(white_k * (white_score - white_expected));
  black_delta := round(black_k * ((1 - white_score) - (1 - white_expected)));

  insert into public.player_ratings (user_id, game_type, rating, games_played, wins, losses, draws)
  values (new.white_player_id, new.game_type, greatest(100, white_before + white_delta), 1,
    case when white_score = 1 then 1 else 0 end,
    case when white_score = 0 then 1 else 0 end,
    case when white_score = 0.5 then 1 else 0 end)
  on conflict (user_id, game_type) do update set
    rating = greatest(100, excluded.rating),
    games_played = public.player_ratings.games_played + 1,
    wins = public.player_ratings.wins + excluded.wins,
    losses = public.player_ratings.losses + excluded.losses,
    draws = public.player_ratings.draws + excluded.draws,
    updated_at = now();

  insert into public.player_ratings (user_id, game_type, rating, games_played, wins, losses, draws)
  values (new.black_player_id, new.game_type, greatest(100, black_before + black_delta), 1,
    case when white_score = 0 then 1 else 0 end,
    case when white_score = 1 then 1 else 0 end,
    case when white_score = 0.5 then 1 else 0 end)
  on conflict (user_id, game_type) do update set
    rating = greatest(100, excluded.rating),
    games_played = public.player_ratings.games_played + 1,
    wins = public.player_ratings.wins + excluded.wins,
    losses = public.player_ratings.losses + excluded.losses,
    draws = public.player_ratings.draws + excluded.draws,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists games_update_rating on public.games;
create trigger games_update_rating
after update of status on public.games
for each row execute function public.apply_game_rating();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists games_touch_updated_at on public.games;
create trigger games_touch_updated_at before update on public.games for each row execute function public.touch_updated_at();
drop trigger if exists friendships_touch_updated_at on public.friendships;
create trigger friendships_touch_updated_at before update on public.friendships for each row execute function public.touch_updated_at();
drop trigger if exists lessons_touch_updated_at on public.lesson_progress;
create trigger lessons_touch_updated_at before update on public.lesson_progress for each row execute function public.touch_updated_at();

create or replace function public.create_game_invite(p_game_type text, p_time_control text, p_base_seconds integer, p_increment_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  game_row public.games;
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'authentication required'; end if;
  if p_game_type not in ('bullet', 'blitz', 'rapid', 'custom') or p_base_seconds not between 30 and 7200 or p_increment_seconds not between 0 and 60 then
    raise exception 'invalid game settings';
  end if;
  insert into public.games (owner_id, white_player_id, game_mode, game_type, time_control, status, fen,
    white_seconds, black_seconds, increment_seconds, is_rated)
  values (caller, caller, 'online', p_game_type, p_time_control, 'waiting',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', p_base_seconds, p_base_seconds, p_increment_seconds, true)
  returning * into game_row;
  return jsonb_build_object('id', game_row.id, 'invite_code', game_row.invite_code, 'status', game_row.status);
end;
$$;

create or replace function public.join_game_invite(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  game_row public.games;
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'authentication required'; end if;
  update public.games set black_player_id = caller, status = 'active', started_at = now(), turn_started_at = now()
  where invite_code = lower(p_invite_code) and status = 'waiting' and white_player_id <> caller
  returning * into game_row;
  if game_row.id is null then raise exception 'invite not found or already used'; end if;
  return jsonb_build_object('id', game_row.id, 'fen', game_row.fen, 'status', game_row.status);
end;
$$;

create or replace function public.join_matchmaking(p_game_type text, p_time_control text, p_base_seconds integer,
  p_increment_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  opponent public.matchmaking_queue;
  game_row public.games;
  white_id uuid;
  black_id uuid;
  actual_rating integer;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if p_game_type not in ('bullet', 'blitz', 'rapid', 'custom') or p_base_seconds not between 30 and 7200 or p_increment_seconds not between 0 and 60 then
    raise exception 'invalid game settings';
  end if;
  select coalesce((select rating from public.player_ratings where user_id = caller and game_type = p_game_type), 1200)
    into actual_rating;
  delete from public.matchmaking_queue where user_id = caller;
  select * into opponent from public.matchmaking_queue q
    where q.user_id <> caller and q.game_id is null and q.game_type = p_game_type
      and q.time_control = p_time_control and abs(q.rating - actual_rating) <= 250
    order by q.created_at for update skip locked limit 1;
  if opponent.user_id is not null then
    if random() < 0.5 then white_id := caller; black_id := opponent.user_id; else white_id := opponent.user_id; black_id := caller; end if;
    insert into public.games (owner_id, white_player_id, black_player_id, game_mode, game_type, time_control, status, fen,
      white_seconds, black_seconds, increment_seconds, turn_started_at, started_at, is_rated, is_public, invite_code)
    values (white_id, white_id, black_id, 'online', p_game_type, p_time_control, 'active',
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', p_base_seconds, p_base_seconds,
      p_increment_seconds, now(), now(), true, true, null)
    returning * into game_row;
    update public.matchmaking_queue set game_id = game_row.id where user_id = opponent.user_id;
    return jsonb_build_object('waiting', false, 'game_id', game_row.id);
  end if;
  insert into public.matchmaking_queue (user_id, game_type, time_control, base_seconds, increment_seconds, rating)
  values (caller, p_game_type, p_time_control, p_base_seconds, p_increment_seconds, actual_rating);
  return jsonb_build_object('waiting', true, 'game_id', null);
end;
$$;

create or replace function public.get_matchmaking_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  queue_row public.matchmaking_queue;
begin
  select * into queue_row from public.matchmaking_queue where user_id = auth.uid();
  if not found then return null; end if;
  if queue_row.game_id is not null then
    delete from public.matchmaking_queue where user_id = auth.uid();
    return jsonb_build_object('waiting', false, 'game_id', queue_row.game_id);
  end if;
  return jsonb_build_object('waiting', true, 'game_id', null);
end;
$$;

create or replace function public.cancel_matchmaking()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.matchmaking_queue where user_id = auth.uid() and game_id is null;
$$;

create or replace function public.record_puzzle_attempt(p_puzzle_id text, p_moves text[], p_duration_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  expected text[];
  is_solved boolean;
  stats_row public.puzzle_stats;
begin
  if caller is null then raise exception 'authentication required'; end if;
  select solution_uci into expected from public.puzzles where id = p_puzzle_id;
  if expected is null then raise exception 'puzzle not found'; end if;
  is_solved := coalesce(p_moves, '{}'::text[]) = expected;
  insert into public.puzzle_attempts (user_id, puzzle_id, solved, moves_played, duration_seconds)
    values (caller, p_puzzle_id, is_solved, coalesce(p_moves, '{}'), greatest(0, p_duration_seconds));
  insert into public.puzzle_stats (user_id) values (caller) on conflict (user_id) do nothing;
  update public.puzzle_stats set
    attempts = attempts + 1,
    solved = public.puzzle_stats.solved + case when is_solved then 1 else 0 end,
    current_streak = case when is_solved then public.puzzle_stats.current_streak + 1 else 0 end,
    best_streak = greatest(public.puzzle_stats.best_streak, case when is_solved then public.puzzle_stats.current_streak + 1 else public.puzzle_stats.current_streak end),
    rating = greatest(100, public.puzzle_stats.rating + case when is_solved then 8 else -5 end),
    updated_at = now()
  where user_id = caller returning * into stats_row;
  return jsonb_build_object('solved', is_solved, 'rating', stats_row.rating, 'attempts', stats_row.attempts,
    'solved_count', stats_row.solved, 'current_streak', stats_row.current_streak, 'best_streak', stats_row.best_streak);
end;
$$;

alter table public.profiles enable row level security;
alter table public.player_ratings enable row level security;
alter table public.games enable row level security;
alter table public.friendships enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.puzzles enable row level security;
alter table public.puzzle_stats enable row level security;
alter table public.puzzle_attempts enable row level security;
alter table public.lesson_progress enable row level security;

drop policy if exists "profiles are public to read" on public.profiles;
create policy "profiles are public to read" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "ratings are public to read" on public.player_ratings;
create policy "ratings are public to read" on public.player_ratings for select to anon, authenticated using (true);

drop policy if exists "participants read games" on public.games;
create policy "participants read games" on public.games for select to authenticated
  using ((select auth.uid()) = owner_id or (select auth.uid()) = white_player_id or (select auth.uid()) = black_player_id);
drop policy if exists "public live games are readable" on public.games;
create policy "public live games are readable" on public.games for select to anon, authenticated
  using (is_public and status in ('active', 'completed'));
drop policy if exists "owner saves completed local games" on public.games;
create policy "owner saves completed local games" on public.games for insert to authenticated
  with check ((select auth.uid()) = owner_id and game_mode in ('local', 'computer') and status = 'completed' and not is_rated);
drop policy if exists "owner saves game accuracy" on public.games;
create policy "owner saves game accuracy" on public.games for update to authenticated
  using ((select auth.uid()) = owner_id and status = 'completed')
  with check ((select auth.uid()) = owner_id and status = 'completed');

drop policy if exists "friend participants read" on public.friendships;
create policy "friend participants read" on public.friendships for select to authenticated
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);
drop policy if exists "users send friend requests" on public.friendships;
create policy "users send friend requests" on public.friendships for insert to authenticated
  with check ((select auth.uid()) = requester_id and status = 'pending');
drop policy if exists "recipients respond to requests" on public.friendships;
create policy "recipients respond to requests" on public.friendships for update to authenticated
  using ((select auth.uid()) = addressee_id and status = 'pending')
  with check ((select auth.uid()) = addressee_id and status in ('accepted', 'declined'));
drop policy if exists "participants remove friendship" on public.friendships;
create policy "participants remove friendship" on public.friendships for delete to authenticated
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

drop policy if exists "queue owner reads own status" on public.matchmaking_queue;
create policy "queue owner reads own status" on public.matchmaking_queue for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "puzzles are readable" on public.puzzles;
create policy "puzzles are readable" on public.puzzles for select to anon, authenticated using (true);
drop policy if exists "users read own puzzle stats" on public.puzzle_stats;
create policy "users read own puzzle stats" on public.puzzle_stats for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "users read own puzzle attempts" on public.puzzle_attempts;
create policy "users read own puzzle attempts" on public.puzzle_attempts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "users record own puzzle attempts" on public.puzzle_attempts;
create policy "users record own puzzle attempts" on public.puzzle_attempts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "users read own lesson progress" on public.lesson_progress;
create policy "users read own lesson progress" on public.lesson_progress for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "users manage own lesson progress" on public.lesson_progress;
create policy "users manage own lesson progress" on public.lesson_progress for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.profiles, public.player_ratings, public.games, public.friendships,
  public.matchmaking_queue, public.puzzles, public.puzzle_stats, public.puzzle_attempts,
  public.lesson_progress from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username, display_name, country, bio, avatar_url, updated_at) on public.profiles to authenticated;
grant select on public.player_ratings to anon, authenticated;
grant select on public.games to anon, authenticated;
grant insert on public.games to authenticated;
grant update (white_accuracy, black_accuracy) on public.games to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select on public.matchmaking_queue to authenticated;
grant select on public.puzzles to anon, authenticated;
grant select on public.puzzle_stats, public.puzzle_attempts to authenticated;
grant select, insert, update, delete on public.lesson_progress to authenticated;

revoke execute on function public.create_game_invite(text, text, integer, integer) from public, anon;
grant execute on function public.create_game_invite(text, text, integer, integer) to authenticated;
revoke execute on function public.join_game_invite(text) from public, anon;
grant execute on function public.join_game_invite(text) to authenticated;
revoke execute on function public.join_matchmaking(text, text, integer, integer) from public, anon;
grant execute on function public.join_matchmaking(text, text, integer, integer) to authenticated;
revoke execute on function public.get_matchmaking_status() from public, anon;
grant execute on function public.get_matchmaking_status() to authenticated;
revoke execute on function public.cancel_matchmaking() from public, anon;
grant execute on function public.cancel_matchmaking() to authenticated;
revoke execute on function public.record_puzzle_attempt(text, text[], integer) from public, anon;
grant execute on function public.record_puzzle_attempt(text, text[], integer) to authenticated;

insert into public.puzzles (id, title, fen, solution_uci, rating, themes, source_url, is_daily)
values
  ('mate-in-one-queen', 'Matt in einem Zug', '6k1/5ppp/8/8/8/8/5PPP/4Q1K1 w - - 0 1', array['e1e8'], 900, array['mateIn1', 'queen'], null, true),
  ('mate-in-one-back-rank', 'Die freie Linie', '7k/5ppp/8/8/8/8/5PPP/1Q4K1 w - - 0 1', array['b1b8'], 1100, array['mateIn1', 'backRank'], null, true),
  ('mate-in-one-file', 'Matt auf der achten Reihe', '7k/5ppp/8/8/8/8/5PPP/Q5K1 w - - 0 1', array['a1a8'], 1000, array['mateIn1', 'queen'], null, true),
  ('mate-in-one-king-support', 'König und Dame', '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', array['g6g7'], 1450, array['mateIn1', 'kingSupport'], null, true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games') then
    alter publication supabase_realtime add table public.games;
  end if;
end;
$$;

drop policy if exists "signed in users can see game events" on realtime.messages;
create policy "participants can see game events" on realtime.messages for select to authenticated
  using (extension = 'broadcast' and exists (
    select 1 from public.games g where realtime.topic() = 'game:' || g.id::text
      and ((select auth.uid()) = g.owner_id or (select auth.uid()) = g.white_player_id or (select auth.uid()) = g.black_player_id)
  ));
drop policy if exists "signed in users can publish presence" on realtime.messages;
create policy "signed in users can publish presence" on realtime.messages for insert to authenticated
  with check (extension = 'presence' and realtime.topic() = 'online-users');
drop policy if exists "signed in users can read presence" on realtime.messages;
create policy "signed in users can read presence" on realtime.messages for select to authenticated
  using (extension = 'presence' and realtime.topic() = 'online-users');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public" on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
drop policy if exists "users upload their avatar" on storage.objects;
create policy "users upload their avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "users update their avatar" on storage.objects;
create policy "users update their avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
