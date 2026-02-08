-- Karera: Announce Winner + Settle Bets
--
-- Creates an RPC function:
--   public.announce_karera_winner(p_race_id uuid, p_first int, p_second int, p_third int, p_fourth int, p_odds jsonb)
--
-- The function:
-- - Requires the caller to be authenticated AND an admin (profiles.role = 'admin')
-- - Marks the race as finished
-- - Settles pending karera_bets for supported bet types:
--   - Single-race: win, place, forecast, trifecta, quartet
--   - Parley/program (multi-leg): daily_double, daily_double_plus_one, pick_4, pick_5, pick_6, wta
--   Multi-leg tickets are settled once *all* legs are finished (including the race being announced).
-- - Credits winners into profiles.balance and inserts transactions(type='win')
-- - Writes an admin_logs audit entry
--
-- NOTE:
-- - "odds" are treated as a multiplier applied to the stake PER winning combination.
-- - For bets with multiple combos (multiple horses / permutations), only winning combos are paid.
-- - "place" pays for horses in the provided place list: 1st, 2nd, and (if provided) 3rd.

-- Schema:
-- Store the final finish order + odds on the race row so users can see "previous race" results in the lobby.
alter table public.karera_races
  add column if not exists result jsonb;

-- Promo schema:
-- Store per-bet promo % (stake bonus) so payouts can be computed with the boosted stake
-- while the user still pays the original amount.
alter table public.karera_bets
  add column if not exists promo_percent numeric not null default 0;

alter table public.karera_bets
  add column if not exists promo_text text;

-- Auto-apply promo settings to every new karera_bets insert (best-effort).
-- Reads from app_settings keys:
--   karera_promo_enabled (true/false)
--   karera_promo_percent (number, e.g. 10)
--   karera_promo_banner_text (optional template)
create or replace function public.karera_bets_set_promo_defaults()
returns trigger
language plpgsql
as $$
declare
  v_enabled_raw text;
  v_percent_raw text;
  v_enabled boolean := false;
  v_percent numeric := 0;
  v_text text := null;
begin
  begin
    select s.value into v_enabled_raw from public.app_settings s where s.key = 'karera_promo_enabled' limit 1;
    select s.value into v_percent_raw from public.app_settings s where s.key = 'karera_promo_percent' limit 1;
    select s.value into v_text from public.app_settings s where s.key = 'karera_promo_banner_text' limit 1;

    v_enabled := lower(coalesce(trim(v_enabled_raw), '')) in ('true', '1', 'yes', 'on');
    v_percent := nullif(trim(coalesce(v_percent_raw, '')), '')::numeric;
  exception when others then
    v_enabled := false;
    v_percent := 0;
    v_text := null;
  end;

  if v_enabled and v_percent is not null and v_percent > 0 then
    new.promo_percent := v_percent;
    new.promo_text := coalesce(v_text, '');
  else
    new.promo_percent := 0;
    new.promo_text := null;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'karera_bets_set_promo_defaults_trg'
  ) then
    create trigger karera_bets_set_promo_defaults_trg
      before insert on public.karera_bets
      for each row
      execute function public.karera_bets_set_promo_defaults();
  end if;
end $$;

create or replace function public.announce_karera_winner(
  p_race_id uuid,
  p_first integer,
  p_second integer default null,
  p_third integer default null,
  p_fourth integer default null,
  p_odds jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_is_admin boolean;
  v_race public.karera_races%rowtype;

  v_win_odds numeric;
  v_place_odds numeric;
  v_forecast_odds numeric;
  v_trifecta_odds numeric;
  v_quartet_odds numeric;
  v_daily_double_odds numeric;
  v_daily_double_plus_one_odds numeric;
  v_pick_4_odds numeric;
  v_pick_5_odds numeric;
  v_pick_6_odds numeric;
  v_wta_odds numeric;

  v_place_winners int[];
  v_now timestamptz := now();

  v_settled_single int := 0;
  v_won_single int := 0;
  v_lost_single int := 0;
  v_payout_total_single numeric := 0;

  v_settled_multi int := 0;
  v_won_multi int := 0;
  v_lost_multi int := 0;
  v_payout_total_multi numeric := 0;

  v_settled int := 0;
  v_won int := 0;
  v_lost int := 0;
  v_payout_total numeric := 0;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists(
    select 1 from public.profiles p
    where p.id = v_admin_id
      and p.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Forbidden';
  end if;

  if p_race_id is null then
    raise exception 'Missing race id';
  end if;

  if p_first is null or p_first <= 0 then
    raise exception 'Missing 1st place';
  end if;

  if p_second is not null and p_second = p_first then
    raise exception '2nd place must be different from 1st place';
  end if;
  if p_third is not null and (p_third = p_first or p_third = p_second) then
    raise exception '3rd place must be unique';
  end if;
  if p_fourth is not null and (p_fourth = p_first or p_fourth = p_second or p_fourth = p_third) then
    raise exception '4th place must be unique';
  end if;

  -- Parse odds (cast errors bubble up and are shown to the caller)
  v_win_odds := nullif(trim(coalesce(p_odds->>'win', '')), '')::numeric;
  v_place_odds := nullif(trim(coalesce(p_odds->>'place', '')), '')::numeric;
  v_forecast_odds := nullif(trim(coalesce(p_odds->>'forecast', '')), '')::numeric;
  v_trifecta_odds := nullif(trim(coalesce(p_odds->>'trifecta', '')), '')::numeric;
  v_quartet_odds := nullif(trim(coalesce(p_odds->>'quartet', '')), '')::numeric;
  v_daily_double_odds := nullif(trim(coalesce(p_odds->>'daily_double', '')), '')::numeric;
  v_daily_double_plus_one_odds := nullif(trim(coalesce(p_odds->>'daily_double_plus_one', '')), '')::numeric;
  v_pick_4_odds := nullif(trim(coalesce(p_odds->>'pick_4', '')), '')::numeric;
  v_pick_5_odds := nullif(trim(coalesce(p_odds->>'pick_5', '')), '')::numeric;
  v_pick_6_odds := nullif(trim(coalesce(p_odds->>'pick_6', '')), '')::numeric;
  v_wta_odds := nullif(trim(coalesce(p_odds->>'wta', p_odds->>'winner_take_all', '')), '')::numeric;

  -- Lock race row for the duration of settlement
  select * into v_race
  from public.karera_races r
  where r.id = p_race_id
  for update;

  if not found then
    raise exception 'Race not found';
  end if;

  if v_race.status in ('finished', 'cancelled') then
    raise exception 'Race already ended (%)', v_race.status;
  end if;

  -- Require odds for any bet types that actually have pending bets
  if exists(select 1 from public.karera_bets b where b.race_id = p_race_id and (b.status is null or b.status = 'pending') and b.bet_type = 'win') then
    if v_win_odds is null or v_win_odds <= 0 then
      raise exception 'Missing WIN odds';
    end if;
  end if;

  if exists(select 1 from public.karera_bets b where b.race_id = p_race_id and (b.status is null or b.status = 'pending') and b.bet_type = 'place') then
    if p_second is null then
      raise exception 'Missing 2nd place (required for PLACE bets)';
    end if;
    if v_place_odds is null or v_place_odds <= 0 then
      raise exception 'Missing PLACE odds';
    end if;
  end if;

  if exists(select 1 from public.karera_bets b where b.race_id = p_race_id and (b.status is null or b.status = 'pending') and b.bet_type = 'forecast') then
    if p_second is null then
      raise exception 'Missing 2nd place (required for FORECAST bets)';
    end if;
    if v_forecast_odds is null or v_forecast_odds <= 0 then
      raise exception 'Missing FORECAST odds';
    end if;
  end if;

  if exists(select 1 from public.karera_bets b where b.race_id = p_race_id and (b.status is null or b.status = 'pending') and b.bet_type = 'trifecta') then
    if p_second is null or p_third is null then
      raise exception 'Missing 2nd/3rd place (required for TRIFECTA bets)';
    end if;
    if v_trifecta_odds is null or v_trifecta_odds <= 0 then
      raise exception 'Missing TRIFECTA odds';
    end if;
  end if;

  if exists(select 1 from public.karera_bets b where b.race_id = p_race_id and (b.status is null or b.status = 'pending') and b.bet_type = 'quartet') then
    if p_second is null or p_third is null or p_fourth is null then
      raise exception 'Missing 2nd/3rd/4th place (required for QUARTET bets)';
    end if;
    if v_quartet_odds is null or v_quartet_odds <= 0 then
      raise exception 'Missing QUARTET odds';
    end if;
  end if;

  -- Require odds for multi-leg tickets that become fully-resolved by finishing this race.
  -- We only require odds when *all other legs* (besides the race being announced) already have results.
  if exists(
    select 1
    from public.karera_bets b
    where (b.status is null or b.status = 'pending')
      and b.bet_type = 'daily_double'
      and jsonb_typeof(b.combinations->'legs') = 'array'
      and jsonb_array_length(b.combinations->'legs') >= 2
      and exists (
        select 1 from jsonb_array_elements(b.combinations->'legs') leg
        where leg->>'race_id' = p_race_id::text
      )
      and not exists (
        select 1
        from jsonb_array_elements(b.combinations->'legs') leg
        left join public.karera_races r2 on r2.id::text = leg->>'race_id'
        where (leg->>'race_id') <> p_race_id::text
          and (
            r2.id is null
            or r2.status <> 'finished'
            or r2.result is null
            or nullif(trim(coalesce(r2.result->'finish_order'->>'first', '')), '') is null
          )
      )
  ) then
    if v_daily_double_odds is null or v_daily_double_odds <= 0 then
      raise exception 'Missing DAILY DOUBLE odds';
    end if;
  end if;

  if exists(
    select 1
    from public.karera_bets b
    where (b.status is null or b.status = 'pending')
      and b.bet_type = 'daily_double_plus_one'
      and jsonb_typeof(b.combinations->'legs') = 'array'
      and jsonb_array_length(b.combinations->'legs') >= 3
      and exists (
        select 1 from jsonb_array_elements(b.combinations->'legs') leg
        where leg->>'race_id' = p_race_id::text
      )
      and not exists (
        select 1
        from jsonb_array_elements(b.combinations->'legs') leg
        left join public.karera_races r2 on r2.id::text = leg->>'race_id'
        where (leg->>'race_id') <> p_race_id::text
          and (
            r2.id is null
            or r2.status <> 'finished'
            or r2.result is null
            or nullif(trim(coalesce(r2.result->'finish_order'->>'first', '')), '') is null
          )
      )
  ) then
    if v_daily_double_plus_one_odds is null or v_daily_double_plus_one_odds <= 0 then
      raise exception 'Missing DAILY DOUBLE +1 odds';
    end if;
  end if;

  if exists(
    select 1
    from public.karera_bets b
    where (b.status is null or b.status = 'pending')
      and b.bet_type = 'pick_4'
      and jsonb_typeof(b.combinations->'legs') = 'array'
      and jsonb_array_length(b.combinations->'legs') >= 4
      and exists (
        select 1 from jsonb_array_elements(b.combinations->'legs') leg
        where leg->>'race_id' = p_race_id::text
      )
      and not exists (
        select 1
        from jsonb_array_elements(b.combinations->'legs') leg
        left join public.karera_races r2 on r2.id::text = leg->>'race_id'
        where (leg->>'race_id') <> p_race_id::text
          and (
            r2.id is null
            or r2.status <> 'finished'
            or r2.result is null
            or nullif(trim(coalesce(r2.result->'finish_order'->>'first', '')), '') is null
          )
      )
  ) then
    if v_pick_4_odds is null or v_pick_4_odds <= 0 then
      raise exception 'Missing PICK 4 odds';
    end if;
  end if;

  if exists(
    select 1
    from public.karera_bets b
    where (b.status is null or b.status = 'pending')
      and b.bet_type = 'pick_5'
      and jsonb_typeof(b.combinations->'legs') = 'array'
      and jsonb_array_length(b.combinations->'legs') >= 5
      and exists (
        select 1 from jsonb_array_elements(b.combinations->'legs') leg
        where leg->>'race_id' = p_race_id::text
      )
      and not exists (
        select 1
        from jsonb_array_elements(b.combinations->'legs') leg
        left join public.karera_races r2 on r2.id::text = leg->>'race_id'
        where (leg->>'race_id') <> p_race_id::text
          and (
            r2.id is null
            or r2.status <> 'finished'
            or r2.result is null
            or nullif(trim(coalesce(r2.result->'finish_order'->>'first', '')), '') is null
          )
      )
  ) then
    if v_pick_5_odds is null or v_pick_5_odds <= 0 then
      raise exception 'Missing PICK 5 odds';
    end if;
  end if;

  if exists(
    select 1
    from public.karera_bets b
    where (b.status is null or b.status = 'pending')
      and b.bet_type = 'pick_6'
      and jsonb_typeof(b.combinations->'legs') = 'array'
      and jsonb_array_length(b.combinations->'legs') >= 6
      and exists (
        select 1 from jsonb_array_elements(b.combinations->'legs') leg
        where leg->>'race_id' = p_race_id::text
      )
      and not exists (
        select 1
        from jsonb_array_elements(b.combinations->'legs') leg
        left join public.karera_races r2 on r2.id::text = leg->>'race_id'
        where (leg->>'race_id') <> p_race_id::text
          and (
            r2.id is null
            or r2.status <> 'finished'
            or r2.result is null
            or nullif(trim(coalesce(r2.result->'finish_order'->>'first', '')), '') is null
          )
      )
  ) then
    if v_pick_6_odds is null or v_pick_6_odds <= 0 then
      raise exception 'Missing PICK 6 odds';
    end if;
  end if;

  if exists(
    select 1
    from public.karera_bets b
    where (b.status is null or b.status = 'pending')
      and b.bet_type in ('wta', 'winner_take_all')
      and jsonb_typeof(b.combinations->'legs') = 'array'
      and jsonb_array_length(b.combinations->'legs') >= 2
      and exists (
        select 1 from jsonb_array_elements(b.combinations->'legs') leg
        where leg->>'race_id' = p_race_id::text
      )
      and not exists (
        select 1
        from jsonb_array_elements(b.combinations->'legs') leg
        left join public.karera_races r2 on r2.id::text = leg->>'race_id'
        where (leg->>'race_id') <> p_race_id::text
          and (
            r2.id is null
            or r2.status <> 'finished'
            or r2.result is null
            or nullif(trim(coalesce(r2.result->'finish_order'->>'first', '')), '') is null
          )
      )
  ) then
    if v_wta_odds is null or v_wta_odds <= 0 then
      raise exception 'Missing WTA odds';
    end if;
  end if;

  v_place_winners := array_remove(array[p_first, p_second, p_third], null);

  with pending as (
    select
      b.id,
      b.user_id,
      b.bet_type,
      b.amount,
      coalesce(b.promo_percent, 0) as promo_percent,
      b.combinations
    from public.karera_bets b
    where b.race_id = p_race_id
      and (b.status is null or b.status = 'pending')
      and b.bet_type in ('win', 'place', 'forecast', 'trifecta', 'quartet')
  ),
  extracted as (
    select
      p.*,
      coalesce((
        select array_agg(distinct (x::int) order by (x::int))
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(p.combinations->'horses') = 'array' then p.combinations->'horses'
            else '[]'::jsonb
          end
        ) x
        where x ~ '^[0-9]+$' and x::int > 0
      ), '{}'::int[]) as horses,
      coalesce((
        select array_agg(distinct (x::int) order by (x::int))
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(p.combinations->'positions'->0) = 'array' then p.combinations->'positions'->0
            else '[]'::jsonb
          end
        ) x
        where x ~ '^[0-9]+$' and x::int > 0
      ), '{}'::int[]) as pos1,
      coalesce((
        select array_agg(distinct (x::int) order by (x::int))
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(p.combinations->'positions'->1) = 'array' then p.combinations->'positions'->1
            else '[]'::jsonb
          end
        ) x
        where x ~ '^[0-9]+$' and x::int > 0
      ), '{}'::int[]) as pos2,
      coalesce((
        select array_agg(distinct (x::int) order by (x::int))
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(p.combinations->'positions'->2) = 'array' then p.combinations->'positions'->2
            else '[]'::jsonb
          end
        ) x
        where x ~ '^[0-9]+$' and x::int > 0
      ), '{}'::int[]) as pos3,
      coalesce((
        select array_agg(distinct (x::int) order by (x::int))
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(p.combinations->'positions'->3) = 'array' then p.combinations->'positions'->3
            else '[]'::jsonb
          end
        ) x
        where x ~ '^[0-9]+$' and x::int > 0
      ), '{}'::int[]) as pos4
    from pending p
  ),
  computed as (
    select
      e.*,
      case
        when e.bet_type in ('win', 'place') then cardinality(e.horses)
        when e.bet_type = 'forecast' then (
          select count(*)
          from unnest(e.pos1) a
          cross join unnest(e.pos2) b
          where a <> b
        )
        when e.bet_type = 'trifecta' then (
          select count(*)
          from unnest(e.pos1) a
          cross join unnest(e.pos2) b
          cross join unnest(e.pos3) c
          where a <> b and a <> c and b <> c
        )
        when e.bet_type = 'quartet' then (
          select count(*)
          from unnest(e.pos1) a
          cross join unnest(e.pos2) b
          cross join unnest(e.pos3) c
          cross join unnest(e.pos4) d
          where a <> b and a <> c and a <> d
            and b <> c and b <> d
            and c <> d
        )
        else 0
      end as combos_count,
      case
        when e.bet_type = 'win' then case when p_first = any(e.horses) then 1 else 0 end
        when e.bet_type = 'place' then (
          select count(*) from unnest(e.horses) h where h = any(v_place_winners)
        )
        when e.bet_type = 'forecast' then case when p_first = any(e.pos1) and p_second = any(e.pos2) and p_first <> p_second then 1 else 0 end
        when e.bet_type = 'trifecta' then case when p_first = any(e.pos1) and p_second = any(e.pos2) and p_third = any(e.pos3)
          and p_first <> p_second and p_first <> p_third and p_second <> p_third
          then 1 else 0 end
        when e.bet_type = 'quartet' then case when p_first = any(e.pos1) and p_second = any(e.pos2) and p_third = any(e.pos3) and p_fourth = any(e.pos4)
          and p_first <> p_second and p_first <> p_third and p_first <> p_fourth
          and p_second <> p_third and p_second <> p_fourth
          and p_third <> p_fourth
          then 1 else 0 end
        else 0
      end as win_count,
      case
        when e.bet_type = 'win' then v_win_odds
        when e.bet_type = 'place' then v_place_odds
        when e.bet_type = 'forecast' then v_forecast_odds
        when e.bet_type = 'trifecta' then v_trifecta_odds
        when e.bet_type = 'quartet' then v_quartet_odds
        else null
      end as odds_value
    from extracted e
  ),
  payouts as (
    select
      c.id,
      c.user_id,
      c.bet_type,
      c.amount,
      c.combos_count,
      c.win_count,
      c.odds_value,
      case
        when c.win_count > 0
          and c.combos_count > 0
          and c.odds_value is not null
          and c.odds_value > 0
          then round(((c.amount * (1 + (greatest(coalesce(c.promo_percent, 0), 0) / 100.0))) / c.combos_count) * c.odds_value * c.win_count, 2)
        else 0
      end as payout_amount
    from computed c
  ),
  updated_bets as (
    update public.karera_bets b
    set status = case when p.payout_amount > 0 then 'won' else 'lost' end,
        payout = p.payout_amount
    from payouts p
    where b.id = p.id
    returning b.id, p.user_id, p.payout_amount
  ),
  user_totals as (
    select user_id, sum(payout_amount) as total_payout
    from updated_bets
    where payout_amount > 0 and user_id is not null
    group by user_id
  ),
  updated_profiles as (
    update public.profiles pr
    set balance = coalesce(pr.balance, 0) + ut.total_payout
    from user_totals ut
    where pr.id = ut.user_id
    returning pr.id
  ),
  inserted_transactions as (
    insert into public.transactions (sender_id, receiver_id, amount, type, created_at)
    select null::uuid, ub.user_id, ub.payout_amount, 'win'::public.transaction_type, v_now
    from updated_bets ub
    where ub.payout_amount > 0 and ub.user_id is not null
    returning id
  )
  select
    count(*)::int as settled,
    coalesce(sum(case when payout_amount > 0 then 1 else 0 end), 0)::int as won,
    coalesce(sum(case when payout_amount <= 0 then 1 else 0 end), 0)::int as lost,
    coalesce(sum(case when payout_amount > 0 then payout_amount else 0 end), 0)::numeric as payout_total
  into v_settled_single, v_won_single, v_lost_single, v_payout_total_single
  from updated_bets;

  -- Settle parley/program bets that become fully-resolved by finishing this race.
  with pending_multi as (
    select
      b.id,
      b.user_id,
      b.bet_type,
      b.amount,
      coalesce(b.promo_percent, 0) as promo_percent,
      b.combinations
    from public.karera_bets b
    where (b.status is null or b.status = 'pending')
      and b.bet_type in ('daily_double', 'daily_double_plus_one', 'pick_4', 'pick_5', 'pick_6', 'wta', 'winner_take_all')
      and jsonb_typeof(b.combinations->'legs') = 'array'
      and jsonb_array_length(b.combinations->'legs') > 0
      and exists (
        select 1 from jsonb_array_elements(b.combinations->'legs') leg
        where leg->>'race_id' = p_race_id::text
      )
      and not exists (
        select 1
        from jsonb_array_elements(b.combinations->'legs') leg
        left join public.karera_races r2 on r2.id::text = leg->>'race_id'
        where (leg->>'race_id') <> p_race_id::text
          and (
            r2.id is null
            or r2.status <> 'finished'
            or r2.result is null
            or nullif(trim(coalesce(r2.result->'finish_order'->>'first', '')), '') is null
          )
      )
  ),
  legs as (
    select
      p.*,
      l.ord,
      l.leg,
      l.leg->>'race_id' as leg_race_id_text,
      coalesce((
        select array_agg(distinct (x::int) order by (x::int))
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(l.leg->'horses') = 'array' then l.leg->'horses'
            else '[]'::jsonb
          end
        ) x
        where x ~ '^[0-9]+$' and x::int > 0
      ), '{}'::int[]) as leg_horses
    from pending_multi p
    cross join lateral jsonb_array_elements(p.combinations->'legs') with ordinality as l(leg, ord)
  ),
  leg_eval as (
    select
      l.id,
      l.user_id,
      l.bet_type,
      l.amount,
      l.promo_percent,
      l.ord,
      l.leg_race_id_text,
      l.leg_horses,
      cardinality(l.leg_horses) as leg_count,
      case
        when l.leg_race_id_text = p_race_id::text then true
        else coalesce(r.status = 'finished', false)
      end as leg_finished,
      case
        when l.leg_race_id_text = p_race_id::text then p_first
        else (
          case
            when nullif(trim(coalesce(r.result->'finish_order'->>'first', '')), '') ~ '^[0-9]+$'
              then (r.result->'finish_order'->>'first')::int
            else null
          end
        )
      end as leg_winner
    from legs l
    left join public.karera_races r
      on r.id::text = l.leg_race_id_text
  ),
  computed_multi as (
    select
      e.id,
      e.user_id,
      e.bet_type,
      e.amount,
      e.promo_percent,
      case
        when min(e.leg_count) = 0 then 0
        else round(exp(sum(ln(nullif(e.leg_count, 0)::numeric))))::int
      end as combos_count,
      case
        when min(case when e.leg_finished and e.leg_winner is not null and e.leg_winner = any(e.leg_horses) then 1 else 0 end) = 1 then 1
        else 0
      end as win_count,
      case
        when e.bet_type = 'daily_double' then v_daily_double_odds
        when e.bet_type = 'daily_double_plus_one' then v_daily_double_plus_one_odds
        when e.bet_type = 'pick_4' then v_pick_4_odds
        when e.bet_type = 'pick_5' then v_pick_5_odds
        when e.bet_type = 'pick_6' then v_pick_6_odds
        when e.bet_type in ('wta', 'winner_take_all') then v_wta_odds
        else null
      end as odds_value
    from leg_eval e
    group by e.id, e.user_id, e.bet_type, e.amount, e.promo_percent
  ),
  payouts_multi as (
    select
      c.id,
      c.user_id,
      c.bet_type,
      c.amount,
      c.combos_count,
      c.win_count,
      c.odds_value,
      case
        when c.win_count > 0
          and c.combos_count > 0
          and c.odds_value is not null
          and c.odds_value > 0
          then round(((c.amount * (1 + (greatest(coalesce(c.promo_percent, 0), 0) / 100.0))) / c.combos_count) * c.odds_value, 2)
        else 0
      end as payout_amount
    from computed_multi c
  ),
  updated_bets_multi as (
    update public.karera_bets b
    set status = case when p.payout_amount > 0 then 'won' else 'lost' end,
        payout = p.payout_amount
    from payouts_multi p
    where b.id = p.id
    returning b.id, p.user_id, p.payout_amount
  ),
  user_totals_multi as (
    select user_id, sum(payout_amount) as total_payout
    from updated_bets_multi
    where payout_amount > 0 and user_id is not null
    group by user_id
  ),
  updated_profiles_multi as (
    update public.profiles pr
    set balance = coalesce(pr.balance, 0) + ut.total_payout
    from user_totals_multi ut
    where pr.id = ut.user_id
    returning pr.id
  ),
  inserted_transactions_multi as (
    insert into public.transactions (sender_id, receiver_id, amount, type, created_at)
    select null::uuid, ub.user_id, ub.payout_amount, 'win'::public.transaction_type, v_now
    from updated_bets_multi ub
    where ub.payout_amount > 0 and ub.user_id is not null
    returning id
  )
  select
    count(*)::int as settled,
    coalesce(sum(case when payout_amount > 0 then 1 else 0 end), 0)::int as won,
    coalesce(sum(case when payout_amount <= 0 then 1 else 0 end), 0)::int as lost,
    coalesce(sum(case when payout_amount > 0 then payout_amount else 0 end), 0)::numeric as payout_total
  into v_settled_multi, v_won_multi, v_lost_multi, v_payout_total_multi
  from updated_bets_multi;

  v_settled := v_settled_single + v_settled_multi;
  v_won := v_won_single + v_won_multi;
  v_lost := v_lost_single + v_lost_multi;
  v_payout_total := coalesce(v_payout_total_single, 0) + coalesce(v_payout_total_multi, 0);

  -- End the race + persist result (for user-facing "previous race" display)
  update public.karera_races
  set status = 'finished',
      updated_at = v_now,
      result = jsonb_build_object(
        'announced_by', v_admin_id,
        'announced_at', v_now,
        'finish_order', jsonb_build_object('first', p_first, 'second', p_second, 'third', p_third, 'fourth', p_fourth),
        'odds', p_odds,
        'settled', v_settled,
        'won', v_won,
        'lost', v_lost,
        'payout_total', v_payout_total
      )
  where id = p_race_id;

  -- Audit log (best-effort)
  begin
    insert into public.admin_logs (admin_id, action_type, target_id, target_name, details)
    values (
      v_admin_id,
      'KARERA_ANNOUNCE_WINNER',
      p_race_id,
      v_race.name,
      jsonb_build_object(
        'race_id', p_race_id,
        'finish_order', jsonb_build_object('first', p_first, 'second', p_second, 'third', p_third, 'fourth', p_fourth),
        'odds', p_odds,
        'settled', v_settled,
        'won', v_won,
        'lost', v_lost,
        'payout_total', v_payout_total
      )
    );
  exception when others then
    -- do not fail settlement if audit log fails
    null;
  end;

  return jsonb_build_object(
    'success', true,
    'race_id', p_race_id,
    'status', 'finished',
    'settled', v_settled,
    'won', v_won,
    'lost', v_lost,
    'payout_total', v_payout_total
  );
end;
$$;

revoke all on function public.announce_karera_winner(uuid, integer, integer, integer, integer, jsonb) from public;
grant execute on function public.announce_karera_winner(uuid, integer, integer, integer, integer, jsonb) to authenticated;
