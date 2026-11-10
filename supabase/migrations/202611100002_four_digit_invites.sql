-- Four-digit friend codes are unique only while an invitation is waiting.
-- Once a friend joins, the code becomes available for a later invitation.
alter table public.games drop constraint if exists games_invite_code_key;

update public.games
set status = 'aborted', completed_at = now(), updated_at = now()
where game_mode = 'online'
  and status = 'waiting'
  and invite_code is not null
  and invite_code !~ '^[0-9]{4}$';

create unique index if not exists games_waiting_invite_code_unique
  on public.games (invite_code)
  where invite_code is not null and status = 'waiting';

create or replace function public.create_game_invite(
  p_game_type text,
  p_time_control text,
  p_base_seconds integer,
  p_increment_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  game_row public.games;
  caller uuid := auth.uid();
  invite_code_value text;
  attempts integer := 0;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if p_game_type not in ('bullet', 'blitz', 'rapid', 'custom')
    or p_base_seconds not between 30 and 7200
    or p_increment_seconds not between 0 and 60 then
    raise exception 'invalid game settings';
  end if;

  loop
    invite_code_value := (1000 + floor(random() * 9000)::integer)::text;
    begin
      insert into public.games (
        owner_id, white_player_id, game_mode, game_type, time_control, status, fen,
        white_seconds, black_seconds, increment_seconds, is_rated, invite_code
      )
      values (
        caller, caller, 'online', p_game_type, p_time_control, 'waiting',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        p_base_seconds, p_base_seconds, p_increment_seconds, true, invite_code_value
      )
      returning * into game_row;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts >= 30 then
        raise exception 'Could not create a unique invite code. Please try again.';
      end if;
    end;
  end loop;

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
  if p_invite_code is null or p_invite_code !~ '^[0-9]{4}$' then
    raise exception 'Enter the four-digit invite code.';
  end if;

  update public.games
  set black_player_id = caller, status = 'active', started_at = now(), turn_started_at = now()
  where invite_code = p_invite_code and status = 'waiting' and white_player_id <> caller
  returning * into game_row;

  if game_row.id is null then raise exception 'Invite code not found or already used.'; end if;
  return jsonb_build_object('id', game_row.id, 'fen', game_row.fen, 'status', game_row.status);
end;
$$;
