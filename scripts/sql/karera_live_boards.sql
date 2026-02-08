-- Karera: Live Board Snapshots (Pays Matrix / Vision Data)
--
-- Stores the latest "live board" JSON blobs per race so users can see
-- DD/Forecast pays matrices without relying on an external edge function.
--
-- `data` is a jsonb object with keys (backward compatible):
-- - data.daily_double: latest DD pays matrix snapshot (or NULL)
-- - data.forecast: latest Forecast pays matrix snapshot (or NULL)
-- - data.pick_4: latest Pick 4 program board snapshot (or NULL)
-- - data.pick_5: latest Pick 5 program board snapshot (or NULL)
-- - data.pick_6: latest Pick 6 program board snapshot (or NULL)
-- - data.wta: latest WTA (Winner Take All) program board snapshot (or NULL)
-- Legacy installs may still have `data` stored as a single board object; the UI
-- treats that as `daily_double`.
--
-- Used by:
-- - Admin Event Console: AI Vision "Apply to Race" upserts to `public.karera_live_boards`
-- - User Karera race page: subscribes to realtime changes on `public.karera_live_boards`

create table if not exists public.karera_live_boards (
  race_id uuid primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'karera_live_boards_race_id_fkey'
  ) then
    alter table public.karera_live_boards
      add constraint karera_live_boards_race_id_fkey
      foreign key (race_id) references public.karera_races(id)
      on delete cascade;
  end if;
end $$;

create index if not exists karera_live_boards_updated_at_idx
  on public.karera_live_boards (updated_at desc);

-- --- RLS ---
alter table public.karera_live_boards enable row level security;

-- Read: all authenticated users
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'karera_live_boards' and policyname = 'karera_live_boards_read'
  ) then
    create policy karera_live_boards_read
      on public.karera_live_boards
      for select
      to authenticated
      using (true);
  end if;
end $$;

-- Write: admins only (profiles.role='admin')
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'karera_live_boards' and policyname = 'karera_live_boards_admin_write'
  ) then
    create policy karera_live_boards_admin_write
      on public.karera_live_boards
      for all
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

-- Realtime: best-effort add table to publication (required for postgres_changes)
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.karera_live_boards';
  exception when duplicate_object then
    -- already added
    null;
  when others then
    -- ignore if the DB role can't alter publication; enable via Supabase UI if needed
    null;
  end;
end $$;
