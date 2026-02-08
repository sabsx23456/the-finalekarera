-- Karera: Tournament Days (Banner + Grouping)
--
-- This script:
-- 1) Creates `public.karera_tournaments`
-- 2) Adds `public.karera_races.tournament_id` (uuid) to group races by tournament/day
-- 3) Adds a FK + indexes
-- 4) Enables basic RLS policies:
--    - authenticated users can read tournaments
--    - only admins (profiles.role='admin') can write

create table if not exists public.karera_tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tournament_date date not null default current_date,
  banner_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'karera_tournaments_status_check'
  ) then
    alter table public.karera_tournaments
      add constraint karera_tournaments_status_check
      check (status in ('active', 'upcoming', 'ended', 'hidden'));
  end if;
end $$;

create index if not exists karera_tournaments_date_idx
  on public.karera_tournaments (tournament_date desc);

create index if not exists karera_tournaments_status_idx
  on public.karera_tournaments (status);

alter table public.karera_races
  add column if not exists tournament_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'karera_races_tournament_id_fkey'
  ) then
    alter table public.karera_races
      add constraint karera_races_tournament_id_fkey
      foreign key (tournament_id) references public.karera_tournaments(id)
      on delete restrict;
  end if;
end $$;

create index if not exists karera_races_tournament_id_idx
  on public.karera_races (tournament_id);

-- --- RLS ---
alter table public.karera_tournaments enable row level security;

-- Read: all authenticated users
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'karera_tournaments' and policyname = 'karera_tournaments_read'
  ) then
    create policy karera_tournaments_read
      on public.karera_tournaments
      for select
      to authenticated
      using (true);
  end if;
end $$;

-- Write: admins only
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'karera_tournaments' and policyname = 'karera_tournaments_admin_insert'
  ) then
    create policy karera_tournaments_admin_insert
      on public.karera_tournaments
      for insert
      to authenticated
      with check (
        exists(
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'karera_tournaments' and policyname = 'karera_tournaments_admin_update'
  ) then
    create policy karera_tournaments_admin_update
      on public.karera_tournaments
      for update
      to authenticated
      using (
        exists(
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      )
      with check (
        exists(
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'karera_tournaments' and policyname = 'karera_tournaments_admin_delete'
  ) then
    create policy karera_tournaments_admin_delete
      on public.karera_tournaments
      for delete
      to authenticated
      using (
        exists(
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end $$;

